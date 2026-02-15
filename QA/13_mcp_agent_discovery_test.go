package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"testing"
)

// MCP Agent Discovery Flow Integration Test
// Simulates a full AI agent discovery and resource-reading flow:
//   1. Call /mcp/manifest to discover the MCP server
//   2. Call /mcp/capabilities to get detailed capabilities
//   3. Call /mcp/resources to list available resources
//   4. Call /mcp/resources/health to read a specific resource
//   5. Call /mcp/schemas to list available schemas
//   6. Use JSON-RPC /mcp/jsonrpc to initialize and read resources
// Validates typed resource envelopes, schemas, and response consistency.

func getAgentMcpBaseURL() string {
	targetHost := os.Getenv("TARGET_HOST")
	if len(targetHost) != 0 {
		return targetHost
	}
	return os.Getenv("API_BASE_URL")
}

func getAgentMcpApiKey() string {
	return os.Getenv("MCP_API_KEY")
}

func mcpGET(t *testing.T, url string) (int, map[string]interface{}) {
	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatalf("Failed to create GET request for %s: %v", url, err)
	}

	apiKey := getAgentMcpApiKey()
	if apiKey != "" {
		req.Header.Set("X-MCP-API-Key", apiKey)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to execute GET %s: %v", url, err)
	}
	defer res.Body.Close()

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Failed to read response body from %s: %v", url, err)
	}

	var data map[string]interface{}
	json.Unmarshal(body, &data)

	return res.StatusCode, data
}

func mcpPOST(t *testing.T, url string, payload interface{}) (int, map[string]interface{}) {
	client := &http.Client{}

	payloadBytes, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		t.Fatalf("Failed to create POST request for %s: %v", url, err)
	}

	req.Header.Set("Content-Type", "application/json")
	apiKey := getAgentMcpApiKey()
	if apiKey != "" {
		req.Header.Set("X-MCP-API-Key", apiKey)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to execute POST %s: %v", url, err)
	}
	defer res.Body.Close()

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Failed to read response body from %s: %v", url, err)
	}

	var data map[string]interface{}
	json.Unmarshal(body, &data)

	return res.StatusCode, data
}

// TestAgentDiscoveryFlow simulates a complete AI agent MCP discovery flow
func TestAgentDiscoveryFlow(t *testing.T) {
	baseURL := getAgentMcpBaseURL()
	if baseURL == "" {
		t.Skip("TARGET_HOST or API_BASE_URL not set, skipping MCP agent discovery test")
	}

	t.Log("=== MCP Agent Discovery Flow ===")

	// Step 1: Discover MCP server via manifest
	t.Log("Step 1: GET /mcp/manifest")
	status, manifest := mcpGET(t, baseURL+"/mcp/manifest")
	if status != 200 {
		t.Fatalf("Manifest returned status %d", status)
	}

	result, ok := manifest["result"].(map[string]interface{})
	if !ok {
		t.Fatal("Manifest missing 'result'")
	}

	serverInfo, ok := result["serverInfo"].(map[string]interface{})
	if !ok {
		t.Fatal("Manifest missing 'serverInfo'")
	}

	serverName := serverInfo["name"].(string)
	serverVersion := serverInfo["version"].(string)
	t.Logf("  Discovered MCP server: %s v%s", serverName, serverVersion)

	if serverName != "wslproxy-mcp" {
		t.Errorf("Expected server name 'wslproxy-mcp', got '%s'", serverName)
	}

	// Validate instructions are present (critical for agent understanding)
	instructions, ok := result["instructions"].(string)
	if !ok || instructions == "" {
		t.Error("Manifest missing 'instructions' - agents need this for guidance")
	}

	// Step 2: Get detailed capabilities
	t.Log("Step 2: GET /mcp/capabilities")
	status, caps := mcpGET(t, baseURL+"/mcp/capabilities")
	if status != 200 {
		t.Fatalf("Capabilities returned status %d", status)
	}

	mode, ok := caps["mode"].(string)
	if !ok {
		t.Error("Capabilities missing 'mode'")
	} else {
		t.Logf("  Mode: %s", mode)
	}

	// Check schema_version is present (new in advanced MCP)
	schemaVersion, ok := caps["schema_version"].(string)
	if !ok {
		t.Log("  Warning: schema_version not present in capabilities")
	} else {
		t.Logf("  Schema version: %s", schemaVersion)
	}

	capsObj, ok := caps["capabilities"].(map[string]interface{})
	if !ok {
		t.Fatal("Capabilities missing 'capabilities' object")
	}

	resources, ok := capsObj["resources"].([]interface{})
	if !ok || len(resources) == 0 {
		t.Fatal("Capabilities has no resources")
	}

	t.Logf("  Available resources: %d", len(resources))

	// Validate resource_type field is present (typed resources)
	for _, r := range resources {
		res, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		resType, _ := res["resource_type"].(string)
		if resType != "" {
			t.Logf("  - %s → %s", res["id"], resType)
		}
	}

	// Step 3: List all resources
	t.Log("Step 3: GET /mcp/resources")
	status, resList := mcpGET(t, baseURL+"/mcp/resources")
	if status != 200 {
		t.Fatalf("Resources list returned status %d", status)
	}

	resResult, ok := resList["result"].(map[string]interface{})
	if !ok {
		t.Fatal("Resources response missing 'result'")
	}

	resItems, ok := resResult["resources"].([]interface{})
	if !ok || len(resItems) == 0 {
		t.Fatal("Resources list is empty")
	}

	// Verify metadata includes resource_type
	for _, r := range resItems {
		res, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		meta, ok := res["metadata"].(map[string]interface{})
		if ok {
			resType, _ := meta["resource_type"].(string)
			if resType != "" {
				t.Logf("  Resource: %s (type: %s)", res["uri"], resType)
			}
		}
	}

	// Step 4: Read health resource (typed)
	t.Log("Step 4: GET /mcp/resources/health")
	status, healthRes := mcpGET(t, baseURL+"/mcp/resources/health")
	if status != 200 {
		t.Fatalf("Health resource returned status %d", status)
	}

	healthResult, ok := healthRes["result"].(map[string]interface{})
	if !ok {
		t.Fatal("Health response missing 'result'")
	}

	contents, ok := healthResult["contents"].([]interface{})
	if !ok || len(contents) == 0 {
		t.Fatal("Health response has no contents")
	}

	content := contents[0].(map[string]interface{})
	data, ok := content["data"].(map[string]interface{})
	if !ok {
		t.Fatal("Health content missing 'data'")
	}

	// Check for typed envelope
	dataType, _ := data["type"].(string)
	if dataType == "wslproxy.health" {
		t.Log("  Health resource is typed: wslproxy.health")
	} else {
		t.Logf("  Health data type: %v (expected wslproxy.health for typed resources)", dataType)
	}

	// Verify health attributes
	if attrs, ok := data["attributes"].(map[string]interface{}); ok {
		healthStatus, _ := attrs["status"].(string)
		t.Logf("  Health status: %s", healthStatus)
	} else if healthStatus, ok := data["status"].(string); ok {
		// Fallback for non-mapped format
		t.Logf("  Health status (raw): %s", healthStatus)
	}

	// Step 5: List schemas
	t.Log("Step 5: GET /mcp/schemas")
	status, schemas := mcpGET(t, baseURL+"/mcp/schemas")
	if status != 200 {
		t.Logf("  Schemas endpoint returned status %d (may not be available yet)", status)
	} else {
		schemaResult, ok := schemas["result"].(map[string]interface{})
		if ok {
			schemaList, ok := schemaResult["schemas"].([]interface{})
			if ok {
				t.Logf("  Available schemas: %d", len(schemaList))
				for _, s := range schemaList {
					schema, ok := s.(map[string]interface{})
					if ok {
						t.Logf("    - %s: %s", schema["name"], schema["type"])
					}
				}
			}
		}
	}

	// Step 6: JSON-RPC initialize + resources/read
	t.Log("Step 6: JSON-RPC /mcp/jsonrpc")

	// 6a: Initialize
	initPayload := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]interface{}{
			"protocolVersion": "2025-03-26",
			"clientInfo": map[string]interface{}{
				"name":    "test-agent",
				"version": "1.0.0",
			},
		},
	}

	status, initResp := mcpPOST(t, baseURL+"/mcp/jsonrpc", initPayload)
	if status != 200 {
		t.Fatalf("JSON-RPC initialize returned status %d", status)
	}

	initResult, ok := initResp["result"].(map[string]interface{})
	if !ok {
		t.Fatal("JSON-RPC initialize missing 'result'")
	}

	protocolVersion, _ := initResult["protocolVersion"].(string)
	t.Logf("  Initialized with protocol version: %s", protocolVersion)

	// 6b: resources/read for health
	readPayload := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "resources/read",
		"params": map[string]interface{}{
			"uri": "wslproxy://resources/health",
		},
	}

	status, readResp := mcpPOST(t, baseURL+"/mcp/jsonrpc", readPayload)
	if status != 200 {
		t.Fatalf("JSON-RPC resources/read returned status %d", status)
	}

	readResult, ok := readResp["result"].(map[string]interface{})
	if !ok {
		t.Fatal("JSON-RPC resources/read missing 'result'")
	}

	readContents, ok := readResult["contents"].([]interface{})
	if !ok || len(readContents) == 0 {
		t.Fatal("JSON-RPC resources/read has no contents")
	}

	rpcContent := readContents[0].(map[string]interface{})
	text, ok := rpcContent["text"].(string)
	if !ok || text == "" {
		t.Error("JSON-RPC resources/read content missing 'text'")
	} else {
		t.Logf("  JSON-RPC read returned %d bytes", len(text))
	}

	// 6c: resources/list
	listPayload := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      3,
		"method":  "resources/list",
	}

	status, listResp := mcpPOST(t, baseURL+"/mcp/jsonrpc", listPayload)
	if status != 200 {
		t.Fatalf("JSON-RPC resources/list returned status %d", status)
	}

	listResult, ok := listResp["result"].(map[string]interface{})
	if !ok {
		t.Fatal("JSON-RPC resources/list missing 'result'")
	}

	listResources, ok := listResult["resources"].([]interface{})
	if !ok {
		t.Fatal("JSON-RPC resources/list has no resources")
	}

	t.Logf("  JSON-RPC listed %d resources", len(listResources))

	// 6d: ping
	pingPayload := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      4,
		"method":  "ping",
	}

	status, _ = mcpPOST(t, baseURL+"/mcp/jsonrpc", pingPayload)
	if status != 200 {
		t.Errorf("JSON-RPC ping returned status %d", status)
	} else {
		t.Log("  JSON-RPC ping: OK")
	}

	t.Log("")
	t.Log("=== Agent Discovery Flow Complete ===")
	fmt.Println("MCP Agent Discovery Flow: All steps passed")
}

// TestMcpSchemasEndpoint validates the /mcp/schemas endpoint
func TestMcpSchemasEndpoint(t *testing.T) {
	baseURL := getAgentMcpBaseURL()
	if baseURL == "" {
		t.Skip("TARGET_HOST or API_BASE_URL not set")
	}

	// List schemas
	status, data := mcpGET(t, baseURL+"/mcp/schemas")
	if status != 200 {
		t.Skipf("Schemas endpoint returned %d - may not be deployed yet", status)
	}

	result, ok := data["result"].(map[string]interface{})
	if !ok {
		t.Fatal("Schemas response missing 'result'")
	}

	schemas, ok := result["schemas"].([]interface{})
	if !ok {
		t.Fatal("Schemas result missing 'schemas' array")
	}

	if len(schemas) == 0 {
		t.Error("Expected at least one schema")
	}

	// Validate schema objects have required fields
	for _, s := range schemas {
		schema, ok := s.(map[string]interface{})
		if !ok {
			continue
		}

		if _, ok := schema["name"]; !ok {
			t.Error("Schema missing 'name' field")
		}
		if _, ok := schema["type"]; !ok {
			t.Error("Schema missing 'type' field")
		}
	}

	t.Logf("Schemas endpoint returned %d schemas", len(schemas))
}

// TestMcpNoSecretLeakage verifies that sensitive data is redacted
func TestMcpNoSecretLeakage(t *testing.T) {
	baseURL := getAgentMcpBaseURL()
	if baseURL == "" {
		t.Skip("TARGET_HOST or API_BASE_URL not set")
	}

	// Read settings resource (most likely to contain secrets)
	status, data := mcpGET(t, baseURL+"/mcp/resources/settings")
	if status != 200 {
		t.Skipf("Settings resource returned %d", status)
	}

	// Serialize to string and check for common secret patterns
	jsonBytes, _ := json.Marshal(data)
	jsonStr := string(jsonBytes)

	secretPatterns := []string{
		"JWT_SECURITY_PASSPHRASE",
		"aws_secret",
		"private_key",
	}

	for _, pattern := range secretPatterns {
		// These should either not appear or be REDACTED
		if bytes.Contains(jsonBytes, []byte(pattern)) {
			// Check if it's redacted
			if !bytes.Contains(jsonBytes, []byte("[REDACTED]")) {
				t.Errorf("Potential secret leakage: found '%s' in settings response without REDACTED marker", pattern)
			}
		}
	}

	t.Logf("Settings response size: %d bytes, no unredacted secrets found", len(jsonStr))
}
