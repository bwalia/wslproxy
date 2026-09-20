package api

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	BaseURL    string
	Token      string
	MCPAPIKey  string
	ProfileID  string
	HTTPClient *http.Client
	UserAgent  string
}

type APIError struct {
	Status  int
	Body    string
	Message string
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("api %d: %s", e.Status, e.Message)
	}
	if e.Body != "" {
		return fmt.Sprintf("api %d: %s", e.Status, truncate(e.Body, 200))
	}
	return fmt.Sprintf("api %d", e.Status)
}

func NewClient(baseURL, token, profileID string, insecure bool) *Client {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	tr := http.DefaultTransport.(*http.Transport).Clone()
	if insecure {
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec
	}
	return &Client{
		BaseURL:   baseURL,
		Token:     token,
		ProfileID: profileID,
		HTTPClient: &http.Client{
			Timeout:   60 * time.Second,
			Transport: tr,
		},
		UserAgent: "wslproxy-cli/dev",
	}
}

func (c *Client) SetMCPAPIKey(key string) { c.MCPAPIKey = key }

func (c *Client) url(path string, query url.Values) string {
	u := c.BaseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	return u
}

func (c *Client) Do(method, path string, query url.Values, body any, mcp bool) ([]byte, int, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		// Match Admin UI encoding quirks for nginx config strings in JSON.
		s := string(b)
		s = strings.ReplaceAll(s, "&", `\u0026`)
		s = strings.ReplaceAll(s, "+", `\u002B`)
		s = strings.ReplaceAll(s, "=", `\u003D`)
		rdr = bytes.NewReader([]byte(s))
	}

	req, err := http.NewRequest(method, c.url(path, query), rdr)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", c.UserAgent)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if mcp && c.MCPAPIKey != "" {
		req.Header.Set("X-MCP-API-Key", c.MCPAPIKey)
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	req.Header.Set("x-platform", "wslproxy-cli")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return raw, resp.StatusCode, &APIError{Status: resp.StatusCode, Body: string(raw), Message: "unauthorized"}
	}
	if resp.StatusCode >= 400 {
		msg := extractErrorMessage(raw)
		return raw, resp.StatusCode, &APIError{Status: resp.StatusCode, Body: string(raw), Message: msg}
	}
	return raw, resp.StatusCode, nil
}

func (c *Client) Get(path string, query url.Values) ([]byte, error) {
	raw, _, err := c.Do(http.MethodGet, path, query, nil, false)
	return raw, err
}

func (c *Client) GetMCP(path string, query url.Values) ([]byte, error) {
	raw, _, err := c.Do(http.MethodGet, path, query, nil, true)
	return raw, err
}

func (c *Client) Post(path string, body any) ([]byte, error) {
	raw, _, err := c.Do(http.MethodPost, path, nil, body, false)
	return raw, err
}

func (c *Client) Put(path string, body any) ([]byte, error) {
	raw, _, err := c.Do(http.MethodPut, path, nil, body, false)
	return raw, err
}

func (c *Client) Delete(path string, query url.Values) ([]byte, error) {
	raw, _, err := c.Do(http.MethodDelete, path, query, nil, false)
	return raw, err
}

func (c *Client) PostMCP(path string, body any) ([]byte, error) {
	raw, _, err := c.Do(http.MethodPost, path, nil, body, true)
	return raw, err
}

// Login posts email/password and returns accessToken.
func (c *Client) Login(email, password string) (string, error) {
	raw, code, err := c.Do(http.MethodPost, "/api/user/login", nil, map[string]string{
		"email":    email,
		"password": password,
	}, false)
	if err != nil {
		return "", err
	}
	if code >= 400 {
		return "", &APIError{Status: code, Body: string(raw)}
	}
	var resp struct {
		Data struct {
			AccessToken string `json:"accessToken"`
		} `json:"data"`
		AccessToken string `json:"accessToken"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return "", fmt.Errorf("decode login: %w", err)
	}
	tok := resp.Data.AccessToken
	if tok == "" {
		tok = resp.AccessToken
	}
	if tok == "" {
		return "", fmt.Errorf("login response missing accessToken")
	}
	c.Token = tok
	return tok, nil
}

func (c *Client) Health() (map[string]any, int, time.Duration, error) {
	start := time.Now()
	for _, path := range []string{"/healthz", "/health"} {
		req, err := http.NewRequest(http.MethodGet, c.BaseURL+path, nil)
		if err != nil {
			continue
		}
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			continue
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		lat := time.Since(start)
		var m map[string]any
		_ = json.Unmarshal(raw, &m)
		if m == nil {
			m = map[string]any{"raw": string(raw)}
		}
		m["path"] = path
		m["latency_ms"] = lat.Milliseconds()
		return m, resp.StatusCode, lat, nil
	}
	return nil, 0, time.Since(start), fmt.Errorf("health endpoints unreachable")
}

func (c *Client) Ready() (map[string]any, int, error) {
	raw, code, err := c.Do(http.MethodGet, "/ready", nil, nil, false)
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	return m, code, err
}

func (c *Client) OpenRestyStatus() (json.RawMessage, error) {
	return c.Get("/api/openresty_status", nil)
}

// ListResources fetches a react-admin style list with large page size.
func (c *Client) ListResources(resource string) ([]json.RawMessage, error) {
	params := map[string]any{
		"pagination": map[string]any{"page": 1, "perPage": 10000},
		"sort":       map[string]any{"field": "id", "order": "ASC"},
		"filter":     map[string]any{"profile_id": c.ProfileID},
	}
	pb, _ := json.Marshal(params)
	q := url.Values{}
	q.Set("_format", "json")
	q.Set("params", string(pb))
	raw, err := c.Get("/api/"+resource, q)
	if err != nil {
		return nil, err
	}
	var wrap struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return nil, err
	}
	if len(wrap.Data) == 0 || string(wrap.Data) == "null" {
		return nil, nil
	}
	// data can be array or object
	if wrap.Data[0] == '[' {
		var items []json.RawMessage
		if err := json.Unmarshal(wrap.Data, &items); err != nil {
			return nil, err
		}
		return items, nil
	}
	return []json.RawMessage{wrap.Data}, nil
}

func resourcePath(resource, id string) string {
	// Keep ':' in host:example.com ids (PathEscape would break Lua routes).
	esc := url.PathEscape(id)
	esc = strings.ReplaceAll(esc, "%3A", ":")
	esc = strings.ReplaceAll(esc, "%3a", ":")
	return "/api/" + resource + "/" + esc
}

func (c *Client) GetResource(resource, id string) (json.RawMessage, error) {
	q := url.Values{}
	q.Set("_format", "json")
	q.Set("envprofile", c.ProfileID)
	raw, err := c.Get(resourcePath(resource, id), q)
	if err != nil {
		return nil, err
	}
	var wrap struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return nil, err
	}
	if len(wrap.Data) == 0 || string(wrap.Data) == "null" {
		return raw, nil
	}
	return wrap.Data, nil
}

func (c *Client) CreateResource(resource string, body any) (json.RawMessage, error) {
	return c.Post("/api/"+resource, body)
}

func (c *Client) UpdateResource(resource, id string, body any) (json.RawMessage, error) {
	return c.Put(resourcePath(resource, id), body)
}

func (c *Client) DeleteResource(resource, id string) error {
	q := url.Values{}
	q.Set("envProfile", c.ProfileID)
	_, err := c.Delete(resourcePath(resource, id), q)
	return err
}

func (c *Client) ResourceExists(resource, id string) (bool, json.RawMessage, error) {
	raw, err := c.GetResource(resource, id)
	if err != nil {
		if ae, ok := err.(*APIError); ok && (ae.Status == 404 || ae.Status == 400) {
			return false, nil, nil
		}
		// some endpoints return 200 with empty/error payload
		if ae, ok := err.(*APIError); ok && ae.Status >= 400 {
			return false, nil, nil
		}
		return false, nil, err
	}
	if len(raw) == 0 || string(raw) == "null" || string(raw) == "{}" {
		return false, nil, nil
	}
	var probe map[string]any
	if err := json.Unmarshal(raw, &probe); err == nil {
		if idv, ok := probe["id"]; ok && idv != nil && fmt.Sprint(idv) != "" {
			return true, raw, nil
		}
		// nested under data
	}
	return true, raw, nil
}

func extractErrorMessage(raw []byte) string {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return ""
	}
	for _, k := range []string{"message", "error", "msg"} {
		if v, ok := m[k]; ok {
			return fmt.Sprint(v)
		}
	}
	if d, ok := m["data"].(map[string]any); ok {
		if v, ok := d["message"]; ok {
			return fmt.Sprint(v)
		}
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ResourceID extracts id field from a JSON object.
func ResourceID(raw json.RawMessage) string {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return ""
	}
	if v, ok := m["id"]; ok && v != nil {
		return fmt.Sprint(v)
	}
	return ""
}

// PrettyJSON stable-ish pretty print.
func PrettyJSON(v any) ([]byte, error) {
	return json.MarshalIndent(v, "", "  ")
}
