package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client is an HTTP client for the WSLProxy MCP server.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// Option configures optional Client settings.
type Option func(*Client)

// WithTimeout sets the HTTP client timeout.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) {
		c.httpClient.Timeout = d
	}
}

// WithHTTPClient replaces the default HTTP client.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) {
		c.httpClient = hc
	}
}

// NewClient creates an MCP client for the given base URL and API key.
func NewClient(baseURL, apiKey string, opts ...Option) *Client {
	c := &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// doRequest executes an HTTP request with auth headers and context.
func (c *Client) doRequest(ctx context.Context, method, path string, body io.Reader) (*http.Response, error) {
	u := c.baseURL + path

	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return nil, fmt.Errorf("mcp: creating request: %w", err)
	}

	if c.apiKey != "" {
		req.Header.Set("X-MCP-API-Key", c.apiKey)
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mcp: executing request: %w", err)
	}
	return resp, nil
}

// decodeResponse reads the response body and decodes JSON into dst.
// It returns an *MCPError for non-2xx status codes.
func (c *Client) decodeResponse(resp *http.Response, dst interface{}) error {
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return parseErrorResponse(resp)
	}

	if dst == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(dst); err != nil {
		return fmt.Errorf("mcp: decoding response: %w", err)
	}
	return nil
}

// parseErrorResponse reads the body of a failed HTTP response and returns an *MCPError.
func parseErrorResponse(resp *http.Response) *MCPError {
	mcpErr := &MCPError{StatusCode: resp.StatusCode}

	body, err := io.ReadAll(resp.Body)
	if err != nil || len(body) == 0 {
		mcpErr.Message = http.StatusText(resp.StatusCode)
		return mcpErr
	}

	// Try to unmarshal a structured error.
	if err := json.Unmarshal(body, mcpErr); err != nil || mcpErr.Message == "" {
		mcpErr.Message = strings.TrimSpace(string(body))
	}
	return mcpErr
}

// GetManifest returns the MCP server manifest.
func (c *Client) GetManifest(ctx context.Context) (*Manifest, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/mcp/manifest", nil)
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := c.decodeResponse(resp, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// GetCapabilities returns the server capabilities.
func (c *Client) GetCapabilities(ctx context.Context) (*Capabilities, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/mcp/capabilities", nil)
	if err != nil {
		return nil, err
	}
	var cap Capabilities
	if err := c.decodeResponse(resp, &cap); err != nil {
		return nil, err
	}
	return &cap, nil
}

// ListResources returns summaries of all resources.
func (c *Client) ListResources(ctx context.Context) ([]ResourceSummary, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/mcp/resources", nil)
	if err != nil {
		return nil, err
	}
	var rs []ResourceSummary
	if err := c.decodeResponse(resp, &rs); err != nil {
		return nil, err
	}
	return rs, nil
}

// GetResource fetches a single resource by ID, with optional query parameters.
func (c *Client) GetResource(ctx context.Context, id string, params map[string]string) (*Resource, error) {
	path := "/mcp/resources/" + url.PathEscape(id)
	if len(params) > 0 {
		q := url.Values{}
		for k, v := range params {
			q.Set(k, v)
		}
		path += "?" + q.Encode()
	}

	resp, err := c.doRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	var r Resource
	if err := c.decodeResponse(resp, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

// ListTools returns descriptions of available tools.
func (c *Client) ListTools(ctx context.Context) ([]Tool, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/mcp/tools", nil)
	if err != nil {
		return nil, err
	}
	var tools []Tool
	if err := c.decodeResponse(resp, &tools); err != nil {
		return nil, err
	}
	return tools, nil
}

// ExecuteTool runs a named tool with the given input.
func (c *Client) ExecuteTool(ctx context.Context, name string, input map[string]interface{}) (*ToolResult, error) {
	var body io.Reader
	if input != nil {
		b, err := json.Marshal(input)
		if err != nil {
			return nil, fmt.Errorf("mcp: marshaling tool input: %w", err)
		}
		body = bytes.NewReader(b)
	}

	resp, err := c.doRequest(ctx, http.MethodPost, "/mcp/tools/"+url.PathEscape(name), body)
	if err != nil {
		return nil, err
	}
	var tr ToolResult
	if err := c.decodeResponse(resp, &tr); err != nil {
		return nil, err
	}
	return &tr, nil
}

// ListSchemas returns summaries of all schemas.
func (c *Client) ListSchemas(ctx context.Context) ([]SchemaSummary, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/mcp/schemas", nil)
	if err != nil {
		return nil, err
	}
	var ss []SchemaSummary
	if err := c.decodeResponse(resp, &ss); err != nil {
		return nil, err
	}
	return ss, nil
}

// GetSchema fetches a schema by name.
func (c *Client) GetSchema(ctx context.Context, name string) (*Schema, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/mcp/schemas/"+url.PathEscape(name), nil)
	if err != nil {
		return nil, err
	}
	var s Schema
	if err := c.decodeResponse(resp, &s); err != nil {
		return nil, err
	}
	return &s, nil
}
