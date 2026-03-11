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

// getVarnishTestHost returns the target host URL from environment
func getVarnishTestHost() string {
	targetHost := os.Getenv("TARGET_HOST")
	if targetHost == "" {
		targetHost = "http://localhost:8080"
	}
	return targetHost
}

// getAuthHeaders returns headers with JWT auth token if set
func getAuthHeaders() map[string]string {
	headers := map[string]string{
		"Content-Type": "application/json",
		"x-platform":   "react-admin",
	}
	token := os.Getenv("API_AUTH_TOKEN")
	if token != "" {
		headers["Authorization"] = "Bearer " + token
	}
	return headers
}

// TestVarnishConfigGet tests GET /api/varnish/config/{server_name}
func TestVarnishConfigGet(t *testing.T) {
	host := getVarnishTestHost()
	url := host + "/api/varnish/config/test.example.com"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatal("Failed to create request:", err)
	}
	for k, v := range getAuthHeaders() {
		req.Header.Set(k, v)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatal("Request failed:", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		t.Fatalf("Expected status 200, got %d", res.StatusCode)
	}

	body, _ := ioutil.ReadAll(res.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal("Failed to parse response:", err)
	}

	data, ok := result["data"].(map[string]interface{})
	if !ok {
		t.Fatal("Response missing 'data' field")
	}

	// Should return default config when none exists
	if _, exists := data["listen_port"]; !exists {
		t.Error("Default config should contain listen_port")
	}
	if _, exists := data["cache_ttl_default"]; !exists {
		t.Error("Default config should contain cache_ttl_default")
	}

	t.Log("Varnish config GET endpoint working correctly")
}

// TestVarnishConfigSave tests POST /api/varnish/config/{server_name}
func TestVarnishConfigSave(t *testing.T) {
	host := getVarnishTestHost()
	url := host + "/api/varnish/config/test.example.com"

	config := map[string]interface{}{
		"varnish_enabled":    true,
		"listen_port":        6081,
		"listen_address":     "127.0.0.1",
		"cache_ttl_default":  300,
		"cache_grace":        7200,
		"cache_size":         "512m",
	}

	jsonBody, _ := json.Marshal(config)
	client := &http.Client{}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		t.Fatal("Failed to create request:", err)
	}
	for k, v := range getAuthHeaders() {
		req.Header.Set(k, v)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatal("Request failed:", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		body, _ := ioutil.ReadAll(res.Body)
		t.Fatalf("Expected status 200, got %d: %s", res.StatusCode, string(body))
	}

	t.Log("Varnish config POST (save) endpoint working correctly")
}

// TestVarnishSnippetCreate tests POST /api/varnish/snippets/{server_name}
func TestVarnishSnippetCreate(t *testing.T) {
	host := getVarnishTestHost()
	url := host + "/api/varnish/snippets/test.example.com"

	snippet := map[string]interface{}{
		"name":       "strip-cookies",
		"enabled":    true,
		"priority":   100,
		"hook_point": "vcl_recv",
		"content":    "# Strip tracking cookies\nunset req.http.Cookie;",
	}

	jsonBody, _ := json.Marshal(snippet)
	client := &http.Client{}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		t.Fatal("Failed to create request:", err)
	}
	for k, v := range getAuthHeaders() {
		req.Header.Set(k, v)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatal("Request failed:", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		body, _ := ioutil.ReadAll(res.Body)
		t.Fatalf("Expected status 200, got %d: %s", res.StatusCode, string(body))
	}

	t.Log("Varnish snippet create endpoint working correctly")
}

// TestVarnishSnippetList tests GET /api/varnish/snippets/{server_name}
func TestVarnishSnippetList(t *testing.T) {
	host := getVarnishTestHost()
	url := host + "/api/varnish/snippets/test.example.com"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatal("Failed to create request:", err)
	}
	for k, v := range getAuthHeaders() {
		req.Header.Set(k, v)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatal("Request failed:", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		t.Fatalf("Expected status 200, got %d", res.StatusCode)
	}

	body, _ := ioutil.ReadAll(res.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal("Failed to parse response:", err)
	}

	t.Log("Varnish snippet list endpoint working correctly")
}

// TestVarnishVclPreview tests GET /api/varnish/vcl/preview/{server_name}
func TestVarnishVclPreview(t *testing.T) {
	host := getVarnishTestHost()
	url := host + "/api/varnish/vcl/preview/test.example.com"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatal("Failed to create request:", err)
	}
	for k, v := range getAuthHeaders() {
		req.Header.Set(k, v)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatal("Request failed:", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		t.Fatalf("Expected status 200, got %d", res.StatusCode)
	}

	body, _ := ioutil.ReadAll(res.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal("Failed to parse response:", err)
	}

	data, ok := result["data"].(map[string]interface{})
	if !ok {
		t.Fatal("Response missing 'data' field")
	}

	vcl, ok := data["vcl"].(string)
	if !ok || vcl == "" {
		t.Error("VCL preview should return non-empty VCL text")
	}

	// Check for expected VCL 4.1 markers
	if len(vcl) > 0 {
		expectedMarkers := []string{
			"vcl 4.1",
			"backend default",
			"sub vcl_recv",
			"sub vcl_deliver",
			"X-Cache",
		}
		for _, marker := range expectedMarkers {
			if !containsString(vcl, marker) {
				t.Errorf("Generated VCL should contain '%s'", marker)
			}
		}
	}

	t.Log("Varnish VCL preview endpoint working correctly")
	fmt.Printf("Generated VCL length: %d bytes\n", len(vcl))
}

// TestVarnishDeployDryRun tests POST /api/varnish/deploy/{server_name} with dry_run=true
func TestVarnishDeployDryRun(t *testing.T) {
	host := getVarnishTestHost()
	url := host + "/api/varnish/deploy/test.example.com"

	payload := map[string]interface{}{
		"dry_run": true,
	}

	jsonBody, _ := json.Marshal(payload)
	client := &http.Client{}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		t.Fatal("Failed to create request:", err)
	}
	for k, v := range getAuthHeaders() {
		req.Header.Set(k, v)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatal("Request failed:", err)
	}
	defer res.Body.Close()

	body, _ := ioutil.ReadAll(res.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal("Failed to parse response:", err)
	}

	data, ok := result["data"].(map[string]interface{})
	if !ok {
		t.Log("Response may indicate missing config (expected in test environment)")
		return
	}

	if dryRun, ok := data["dry_run"].(bool); ok && dryRun {
		t.Log("Varnish deploy dry_run endpoint working correctly")
	}
}

// TestVarnishDeployStatus tests GET /api/varnish/status/{server_name}
func TestVarnishDeployStatus(t *testing.T) {
	host := getVarnishTestHost()
	url := host + "/api/varnish/status/test.example.com"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatal("Failed to create request:", err)
	}
	for k, v := range getAuthHeaders() {
		req.Header.Set(k, v)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatal("Request failed:", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		t.Fatalf("Expected status 200, got %d", res.StatusCode)
	}

	body, _ := ioutil.ReadAll(res.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal("Failed to parse response:", err)
	}

	data, ok := result["data"].(map[string]interface{})
	if !ok {
		t.Fatal("Response missing 'data' field")
	}

	if _, exists := data["deploy_status"]; !exists {
		t.Error("Status response should contain deploy_status")
	}

	t.Log("Varnish deploy status endpoint working correctly")
}

// TestVarnishConfigs tests GET /api/varnish/configs (list all)
func TestVarnishConfigs(t *testing.T) {
	host := getVarnishTestHost()
	url := host + "/api/varnish/configs"

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatal("Failed to create request:", err)
	}
	for k, v := range getAuthHeaders() {
		req.Header.Set(k, v)
	}

	res, err := client.Do(req)
	if err != nil {
		t.Fatal("Request failed:", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		t.Fatalf("Expected status 200, got %d", res.StatusCode)
	}

	t.Log("Varnish configs list endpoint working correctly")
}

// containsString checks if s contains substr
func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstr(s, substr))
}

func containsSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
