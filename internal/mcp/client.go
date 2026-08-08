package mcp

import (
	"encoding/json"
	"fmt"

	"github.com/bwalia/wslproxy/internal/api"
)

type Client struct {
	API *api.Client
}

func New(apiClient *api.Client) *Client {
	return &Client{API: apiClient}
}

func (c *Client) Manifest() (json.RawMessage, error) {
	return c.API.GetMCP("/mcp/manifest", nil)
}

func (c *Client) Capabilities() (json.RawMessage, error) {
	return c.API.GetMCP("/mcp/capabilities", nil)
}

func (c *Client) Resources() (json.RawMessage, error) {
	return c.API.GetMCP("/mcp/resources", nil)
}

func (c *Client) Resource(id string) (json.RawMessage, error) {
	return c.API.GetMCP("/mcp/resources/"+id, nil)
}

func (c *Client) Tools() (json.RawMessage, error) {
	return c.API.GetMCP("/mcp/tools", nil)
}

func (c *Client) Tool(name string) (json.RawMessage, error) {
	return c.API.GetMCP("/mcp/tools/"+name, nil)
}

func (c *Client) Schemas() (json.RawMessage, error) {
	return c.API.GetMCP("/mcp/schemas", nil)
}

type JSONRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type JSONRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (c *Client) CallTool(name string, args map[string]any) (json.RawMessage, error) {
	if args == nil {
		args = map[string]any{}
	}
	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "tools/call",
		Params: map[string]any{
			"name":      name,
			"arguments": args,
		},
	}
	raw, err := c.API.PostMCP("/mcp/jsonrpc", req)
	if err != nil {
		return nil, err
	}
	var resp JSONRPCResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return raw, nil
	}
	if resp.Error != nil {
		return raw, fmt.Errorf("mcp jsonrpc: %s (code %d)", resp.Error.Message, resp.Error.Code)
	}
	if len(resp.Result) > 0 {
		return resp.Result, nil
	}
	return raw, nil
}

func (c *Client) ValidateConfig() (json.RawMessage, error) {
	return c.CallTool("validate_config", map[string]any{})
}
