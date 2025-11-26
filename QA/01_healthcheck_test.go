package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strings"
	"testing"
)

var pingUrl string

func TestHealthCheck(t *testing.T) {
	targetHost := os.Getenv("TARGET_HOST")
	if len(targetHost) != 0 {
		pingUrl = targetHost + "/ping"
		fmt.Println(pingUrl)
	} else {
		pingUrl = os.Getenv("API_PING_URL")
		fmt.Println(pingUrl)
	}

	type pingResp struct {
		Redis_status_msg string `json:"redis_status_msg"`
		Pod_Uptime       string `json:"pod_uptime"`
		Node_Uptime      string `json:"node_uptime"`
		Storage_type     string `json:"storage_type"`
	}

	client := &http.Client{}
	req, err := http.NewRequest("GET", pingUrl, nil)
	if err != nil {
		t.Log(err)
	}
	res, err := client.Do(req)
	if false {
		fmt.Println(res)
	}

	body, err := ioutil.ReadAll(res.Body)
	if false {
		fmt.Println(string(body))
	}

	if !strings.Contains(string(body), "pong") {
		t.Error("Did not received Pong")
	} else {
		t.Log("Received response pong")
	}
	if res.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", res.StatusCode)
		return
	}
	// Check for critical missing env vars in backend only
	// Frontend env vars like VITE_JWT_SECURITY_PASSPHRASE may not be set in all environments
	type envVarsResponse struct {
		MendatoryEnvVarsBackend map[string]string `json:"mendatory_env_vars_backend"`
	}
	var envVarsData envVarsResponse
	json.Unmarshal(body, &envVarsData)

	backendMissing := false
	for key, value := range envVarsData.MendatoryEnvVarsBackend {
		if value == "Not Found" {
			t.Logf("Warning: Backend env var %s is Not Found", key)
			// Only fail for critical backend env vars
			if key == "NGINX_CONFIG_DIR" || key == "JWT_SECURITY_PASSPHRASE" {
				backendMissing = true
				t.Errorf("Critical backend env var %s is Not Found", key)
			}
		}
	}
	if !backendMissing {
		t.Log("All critical backend env vars found")
	}

	buff := bytes.NewBuffer(body)
	var jsonData pingResp
	err = json.NewDecoder(buff).Decode(&jsonData)
	if err != nil {
		t.Error("failed to decode json", err)
	} else {
		fmt.Println(jsonData.Redis_status_msg)
		fmt.Println(jsonData.Pod_Uptime)
		fmt.Println(jsonData.Node_Uptime)
	}
	// Check Redis status based on storage type
	// If storage_type is "disk", Redis is not used and "No Database Selected" is acceptable
	if jsonData.Storage_type == "redis" {
		if jsonData.Redis_status_msg != "OK" {
			t.Error("Redis status is not ok: " + jsonData.Redis_status_msg)
		} else {
			t.Log("Redis status is OK")
		}
	} else {
		// For disk storage, "No Database Selected" is the expected message
		if jsonData.Redis_status_msg != "No Database Selected" && jsonData.Redis_status_msg != "OK" {
			t.Error("Unexpected redis_status_msg for disk storage: " + jsonData.Redis_status_msg)
		} else {
			t.Log("Storage type is disk - Redis check skipped (expected: " + jsonData.Redis_status_msg + ")")
		}
	}
	if jsonData.Pod_Uptime == "" {
		t.Error("Missing pod uptime")
	}
	if jsonData.Node_Uptime == "" {
		t.Error("Missing node uptime")
	}	

}
