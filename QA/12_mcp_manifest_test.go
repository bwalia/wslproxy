package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"testing"
)

// MCP Manifest Integration Test
// Validates that the /mcp/manifest endpoint returns a valid MCP manifest
// conforming to the Model Context Protocol specification.

func getMcpBaseURL() string {
	targetHost := os.Getenv("TARGET_HOST")
	if len(targetHost) != 0 {
		return targetHost
	}
	return os.Getenv("API_BASE_URL")
}

func getMcpApiKey() string {
	return os.Getenv("MCP_API_KEY")
}

func TestMcpManifest(t *testing.T) {
	baseURL := getMcpBaseURL()
	if baseURL == "" {
		t.Skip("TARGET_HOST or API_BASE_URL not set, skipping MCP integration test")
	}

	manifestURL := baseURL + "/mcp/manifest"
	t.Logf("Testing MCP manifest at: %s", manifestURL)

	client := &http.Client{}
	req, err := http.NewRequest("GET", manifestURL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	// Add MCP API key if configured
	apiKey := getMcpApiKey()
	if apiKey != "" {
		req.Header.Set("X-MCP-API-Key", apiKey)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}
	defer res.Body.Close()

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	// Check status code
	if res.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", res.StatusCode, string(body))
		return
	}

	// Check content type
	contentType := res.Header.Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Expected Content-Type application/json, got %s", contentType)
	}

	// Check MCP headers
	mcpServer := res.Header.Get("X-MCP-Server")
	if mcpServer != "wslproxy" {
		t.Errorf("Expected X-MCP-Server header 'wslproxy', got '%s'", mcpServer)
	}

	mcpVersion := res.Header.Get("X-MCP-Version")
	if mcpVersion == "" {
		t.Error("Missing X-MCP-Version header")
	}

	// Parse JSON response
	var manifest map[string]interface{}
	err = json.Unmarshal(body, &manifest)
	if err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Validate JSON-RPC version
	jsonrpc, ok := manifest["jsonrpc"]
	if !ok || jsonrpc != "2.0" {
		t.Errorf("Expected jsonrpc '2.0', got '%v'", jsonrpc)
	}

	// Validate result object
	result, ok := manifest["result"].(map[string]interface{})
	if !ok {
		t.Fatal("Missing or invalid 'result' object in manifest")
	}

	// Validate protocol version
	protocolVersion, ok := result["protocolVersion"]
	if !ok || protocolVersion == "" {
		t.Error("Missing protocolVersion in manifest result")
	} else {
		t.Logf("MCP Protocol Version: %s", protocolVersion)
	}

	// Validate server info
	serverInfo, ok := result["serverInfo"].(map[string]interface{})
	if !ok {
		t.Fatal("Missing or invalid 'serverInfo' in manifest result")
	}

	serverName, ok := serverInfo["name"]
	if !ok || serverName == "" {
		t.Error("Missing server name in serverInfo")
	} else {
		t.Logf("MCP Server Name: %s", serverName)
	}

	serverVersion, ok := serverInfo["version"]
	if !ok || serverVersion == "" {
		t.Error("Missing server version in serverInfo")
	} else {
		t.Logf("MCP Server Version: %s", serverVersion)
	}

	// Validate capabilities
	capabilities, ok := result["capabilities"].(map[string]interface{})
	if !ok {
		t.Fatal("Missing or invalid 'capabilities' in manifest result")
	}

	resources, ok := capabilities["resources"].(map[string]interface{})
	if !ok {
		t.Error("Missing 'resources' capability in manifest")
	} else {
		t.Logf("Resources capability present: subscribe=%v, listChanged=%v",
			resources["subscribe"], resources["listChanged"])
	}

	// Validate instructions field exists
	instructions, ok := result["instructions"]
	if !ok || instructions == "" {
		t.Error("Missing 'instructions' in manifest result")
	}

	t.Log("MCP manifest validation passed")
	fmt.Printf("MCP Manifest: server=%s, version=%s, protocol=%s\n",
		serverName, serverVersion, protocolVersion)
}

func TestMcpCapabilities(t *testing.T) {
	baseURL := getMcpBaseURL()
	if baseURL == "" {
		t.Skip("TARGET_HOST or API_BASE_URL not set, skipping MCP integration test")
	}

	capabilitiesURL := baseURL + "/mcp/capabilities"
	t.Logf("Testing MCP capabilities at: %s", capabilitiesURL)

	client := &http.Client{}
	req, err := http.NewRequest("GET", capabilitiesURL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	apiKey := getMcpApiKey()
	if apiKey != "" {
		req.Header.Set("X-MCP-API-Key", apiKey)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}
	defer res.Body.Close()

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	if res.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", res.StatusCode, string(body))
		return
	}

	var capabilities map[string]interface{}
	err = json.Unmarshal(body, &capabilities)
	if err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Validate server name
	if _, ok := capabilities["server"]; !ok {
		t.Error("Missing 'server' field in capabilities response")
	}

	// Validate mode
	mode, ok := capabilities["mode"]
	if !ok {
		t.Error("Missing 'mode' field in capabilities response")
	} else {
		t.Logf("MCP mode: %s", mode)
	}

	// Validate capabilities object contains resources
	caps, ok := capabilities["capabilities"].(map[string]interface{})
	if !ok {
		t.Fatal("Missing 'capabilities' object")
	}

	resources, ok := caps["resources"].([]interface{})
	if !ok || len(resources) == 0 {
		t.Error("Expected non-empty resources array in capabilities")
	} else {
		t.Logf("Available resources: %d", len(resources))
		for _, r := range resources {
			res, ok := r.(map[string]interface{})
			if ok {
				t.Logf("  - %s: %s", res["id"], res["description"])
			}
		}
	}

	// Validate authentication info
	auth, ok := caps["authentication"].(map[string]interface{})
	if !ok {
		t.Error("Missing 'authentication' in capabilities")
	} else {
		t.Logf("Auth type: %s", auth["type"])
	}

	// Validate metadata has x-ai-agent flag
	metadata, ok := capabilities["metadata"].(map[string]interface{})
	if !ok {
		t.Error("Missing 'metadata' in capabilities")
	} else {
		if aiAgent, ok := metadata["x-ai-agent"]; !ok || aiAgent != true {
			t.Error("Expected x-ai-agent=true in metadata")
		}
		if mcpCompatible, ok := metadata["x-mcp-compatible"]; !ok || mcpCompatible != true {
			t.Error("Expected x-mcp-compatible=true in metadata")
		}
	}

	t.Log("MCP capabilities validation passed")
}

func TestMcpResourcesList(t *testing.T) {
	baseURL := getMcpBaseURL()
	if baseURL == "" {
		t.Skip("TARGET_HOST or API_BASE_URL not set, skipping MCP integration test")
	}

	resourcesURL := baseURL + "/mcp/resources"
	t.Logf("Testing MCP resources list at: %s", resourcesURL)

	client := &http.Client{}
	req, err := http.NewRequest("GET", resourcesURL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	apiKey := getMcpApiKey()
	if apiKey != "" {
		req.Header.Set("X-MCP-API-Key", apiKey)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}
	defer res.Body.Close()

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	if res.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", res.StatusCode, string(body))
		return
	}

	var response map[string]interface{}
	err = json.Unmarshal(body, &response)
	if err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Validate JSON-RPC format
	if jsonrpc, ok := response["jsonrpc"]; !ok || jsonrpc != "2.0" {
		t.Errorf("Expected jsonrpc '2.0', got '%v'", response["jsonrpc"])
	}

	result, ok := response["result"].(map[string]interface{})
	if !ok {
		t.Fatal("Missing 'result' in resources response")
	}

	resources, ok := result["resources"].([]interface{})
	if !ok || len(resources) == 0 {
		t.Fatal("Expected non-empty resources list")
	}

	// Validate expected resource IDs exist
	expectedResources := map[string]bool{
		"servers": false, "rules": false, "upstreams": false,
		"health": false, "metrics": false, "profiles": false,
		"ssl": false, "cache": false, "settings": false,
	}

	for _, r := range resources {
		res, ok := r.(map[string]interface{})
		if !ok {
			continue
		}

		// Validate resource has required MCP fields
		if _, ok := res["uri"]; !ok {
			t.Error("Resource missing 'uri' field")
		}
		if _, ok := res["name"]; !ok {
			t.Error("Resource missing 'name' field")
		}
		if _, ok := res["mimeType"]; !ok {
			t.Error("Resource missing 'mimeType' field")
		}

		// Check URI format
		uri, _ := res["uri"].(string)
		if uri != "" {
			// Extract resource ID from URI
			// URI format: wslproxy://resources/{id}
			for id := range expectedResources {
				if uri == "wslproxy://resources/"+id {
					expectedResources[id] = true
				}
			}
		}
	}

	// Verify all expected resources are present
	for id, found := range expectedResources {
		if !found {
			t.Errorf("Expected resource '%s' not found in resources list", id)
		}
	}

	t.Logf("Found %d resources in MCP resources list", len(resources))
	t.Log("MCP resources list validation passed")
}

func TestMcpResourceHealth(t *testing.T) {
	baseURL := getMcpBaseURL()
	if baseURL == "" {
		t.Skip("TARGET_HOST or API_BASE_URL not set, skipping MCP integration test")
	}

	healthURL := baseURL + "/mcp/resources/health"
	t.Logf("Testing MCP health resource at: %s", healthURL)

	client := &http.Client{}
	req, err := http.NewRequest("GET", healthURL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	apiKey := getMcpApiKey()
	if apiKey != "" {
		req.Header.Set("X-MCP-API-Key", apiKey)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}
	defer res.Body.Close()

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	if res.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", res.StatusCode, string(body))
		return
	}

	var response map[string]interface{}
	err = json.Unmarshal(body, &response)
	if err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Validate JSON-RPC format
	result, ok := response["result"].(map[string]interface{})
	if !ok {
		t.Fatal("Missing 'result' in health response")
	}

	contents, ok := result["contents"].([]interface{})
	if !ok || len(contents) == 0 {
		t.Fatal("Missing 'contents' in health response result")
	}

	content := contents[0].(map[string]interface{})
	data, ok := content["data"].(map[string]interface{})
	if !ok {
		t.Fatal("Missing 'data' in health response content")
	}

	// Validate health data fields
	if status, ok := data["status"]; !ok || status != "healthy" {
		t.Errorf("Expected health status 'healthy', got '%v'", data["status"])
	}

	if _, ok := data["timestamp"]; !ok {
		t.Error("Missing 'timestamp' in health data")
	}

	if _, ok := data["datetime"]; !ok {
		t.Error("Missing 'datetime' in health data")
	}

	// Validate MCP info in health response
	mcpInfo, ok := data["mcp"].(map[string]interface{})
	if !ok {
		t.Error("Missing 'mcp' section in health data")
	} else {
		if mcpInfo["enabled"] != true {
			t.Error("Expected mcp.enabled=true in health data")
		}
		t.Logf("MCP mode from health: %s", mcpInfo["mode"])
	}

	t.Log("MCP health resource validation passed")
}

func TestMcpNotFoundResource(t *testing.T) {
	baseURL := getMcpBaseURL()
	if baseURL == "" {
		t.Skip("TARGET_HOST or API_BASE_URL not set, skipping MCP integration test")
	}

	notFoundURL := baseURL + "/mcp/resources/nonexistent"
	t.Logf("Testing MCP 404 for nonexistent resource at: %s", notFoundURL)

	client := &http.Client{}
	req, err := http.NewRequest("GET", notFoundURL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	apiKey := getMcpApiKey()
	if apiKey != "" {
		req.Header.Set("X-MCP-API-Key", apiKey)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", res.StatusCode)
	}

	body, _ := ioutil.ReadAll(res.Body)
	var response map[string]interface{}
	json.Unmarshal(body, &response)

	errorObj, ok := response["error"].(map[string]interface{})
	if !ok {
		t.Error("Expected error object in 404 response")
	} else {
		if errorObj["type"] != "resource_not_found" {
			t.Errorf("Expected error type 'resource_not_found', got '%v'", errorObj["type"])
		}
	}

	t.Log("MCP 404 validation passed")
}
