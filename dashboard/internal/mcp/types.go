package mcp

import "fmt"

// Manifest describes the MCP server identity and high-level capabilities.
type Manifest struct {
	Name         string            `json:"name"`
	Version      string            `json:"version"`
	Description  string            `json:"description"`
	Capabilities []string          `json:"capabilities"`
	Meta         map[string]string `json:"meta,omitempty"`
}

// Capabilities enumerates the resources and tools the MCP server exposes.
type Capabilities struct {
	Resources []ResourceDeclaration `json:"resources"`
	Tools     []ToolDeclaration     `json:"tools"`
}

// ResourceDeclaration is a short descriptor returned in the capabilities list.
type ResourceDeclaration struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Category string `json:"category"`
}

// ToolDeclaration is a short descriptor returned in the capabilities list.
type ToolDeclaration struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	ReadOnlySafe bool   `json:"read_only_safe"`
}

// ResourceSummary is returned when listing all resources.
type ResourceSummary struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	URI      string `json:"uri"`
	Category string `json:"category,omitempty"`
}

// Resource is the full representation returned when fetching a single resource.
type Resource struct {
	Type          string                 `json:"type"`
	ID            string                 `json:"id"`
	Attributes    map[string]interface{} `json:"attributes"`
	Relationships map[string]interface{} `json:"relationships,omitempty"`
}

// Tool describes a server-side tool that can be executed.
type Tool struct {
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	ReadOnlySafe bool                   `json:"read_only_safe"`
	InputSchema  map[string]interface{} `json:"input_schema,omitempty"`
}

// ToolResult is the response from executing a tool.
type ToolResult struct {
	Success bool                   `json:"success"`
	Output  map[string]interface{} `json:"output,omitempty"`
	Error   string                 `json:"error,omitempty"`
}

// SchemaSummary is returned when listing schemas.
type SchemaSummary struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Version string `json:"version,omitempty"`
}

// Schema is the full representation of a named schema.
type Schema struct {
	Name       string                 `json:"name"`
	Type       string                 `json:"type"`
	Version    string                 `json:"version,omitempty"`
	Properties map[string]interface{} `json:"properties"`
}

// MCPError represents an error returned by the MCP server.
type MCPError struct {
	StatusCode int    `json:"-"`
	Message    string `json:"message"`
	Details    string `json:"details,omitempty"`
}

func (e *MCPError) Error() string {
	if e.Details != "" {
		return fmt.Sprintf("mcp: %d %s: %s", e.StatusCode, e.Message, e.Details)
	}
	return fmt.Sprintf("mcp: %d %s", e.StatusCode, e.Message)
}
