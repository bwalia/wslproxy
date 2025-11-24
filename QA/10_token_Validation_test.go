package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"testing"
	"time"
)

var ruleAccessAll string
var ruleAccessApi string
var jwtToken string
var nodeAppIP string

// TestAddRulesWithServer is a helper function called by other tests (e.g., 07_multi_rule_priority_test.go)
// It adds rules to a server using the ruleAccessAll and ruleAccessApi variables
func TestAddRulesWithServer(t *testing.T) {
	url := targetHost + "/api/servers/" + serverId
	method := "PUT"
	payload := strings.NewReader(fmt.Sprintf(`{"server_name":"%s","profile_id":"%s","config":"server {\n      listen 82;  # Listen on port (HTTP)\n      server_name %s;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  ","access_log":"logs/access.log","rules":"%s","custom_block":{},"id":"%s","created_at":1694002895,"root":"/var/www/html","match_cases":[{"statement":"%s","condition":"and"}],"locations":{},"proxy_pass":"http://localhost","error_log":"logs/error.log","listens":[{"listen":"82"}],"index":"index.html"}`, serverName, profile, serverName, ruleAccessAll, serverId, ruleAccessApi))
	client := &http.Client{}
	req, err := http.NewRequest(method, url, payload)
	if err != nil {
		fmt.Println(err)
		return
	}

	req.Header.Add("Authorization", "Bearer "+tokenValue)
	req.Header.Set("Content-Type", "application/json")

	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	body, err := ioutil.ReadAll(res.Body)
	if false {
		fmt.Println(string(body))
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", res.StatusCode)
	}
	if !strings.Contains(string(body), "82") {
		t.Error("Returned unexpected body")
		return
	}
}

func Test10_1_CreateRuleForAccessToAll(t *testing.T) {
	t.Log("Starting Test10_1_CreateRuleForAccessToAll")
	t.Logf("TARGET_HOST: %s", targetHost)
	t.Logf("PROFILE_ID: %s", profile)

	TestAuthLoginAndFetchToken(t)
	if tokenValue == "" {
		t.Fatal("Failed to get authentication token")
	}
	t.Log("Authentication successful")

	TestCreateServer(t)
	if serverId == "" {
		t.Fatal("Failed to create server - serverId is empty")
	}
	t.Logf("Server created with ID: %s", serverId)

	nodeAppIP = os.Getenv("NODE_APP_IP")
	// Use a default redirect URI if NODE_APP_IP is not set (required for code 305)
	if nodeAppIP == "" {
		nodeAppIP = "httpbin.org"
	}
	t.Logf("NODE_APP_IP (redirect_uri): %s", nodeAppIP)

	type Rule struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	url := targetHost + "/api/rules"
	method := "POST"

	payload := strings.NewReader(fmt.Sprintf(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":305,"redirect_uri":"%s","message":"undefined"}},"name":"Access All Rule- gotest","profile_id":"%s"}`, nodeAppIP, profile))

	client := &http.Client{}
	req, err := http.NewRequest(method, url, payload)
	if err != nil {
		t.Fatal(err)
	}

	req.Header.Add("Authorization", "Bearer "+tokenValue)
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	body, err := ioutil.ReadAll(res.Body)
	if false {
		fmt.Println(string(body))
	}
	buf := bytes.NewBuffer(body)
	defer res.Body.Close()

	var jsonData Rule
	err = json.NewDecoder(buf).Decode(&jsonData)
	if err != nil {
		t.Error("failed to decode json", err)
	} else {
		ruleAccessAll = jsonData.Data.ID
		t.Logf("Created ruleAccessAll with ID: %s", ruleAccessAll)
	}

	if res.StatusCode != http.StatusOK {
		t.Errorf("Unexpected response status code %d, body: %s", res.StatusCode, string(body))
		return
	}
	if !strings.Contains(string(body), "id") {
		t.Error("Returned unexpected body")
	}
}

func Test10_2_CreateRuleForAccessToPathApi(t *testing.T) {
	// Ensure we have a valid token
	if tokenValue == "" {
		TestAuthLoginAndFetchToken(t)
		if tokenValue == "" {
			t.Fatal("Failed to get authentication token")
		}
	}

	type Rule struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	url := targetHost + "/api/rules"
	method := "POST"
	tokenKey := os.Getenv("JWT_TOKEN_KEY")
	payload := strings.NewReader(fmt.Sprintf(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/api","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"cookie","jwt_token_validation_value":"Authorization","jwt_token_validation_key":"%s"},"response":{"allow":true,"code":305,"redirect_uri":"%s","message":"undefined"}},"name":"Access Api Rule-gotest","profile_id":"%s"}`, tokenKey, nodeAppIP, profile))

	client := &http.Client{}
	req, err := http.NewRequest(method, url, payload)
	if err != nil {
		fmt.Println(err)
		return
	}

	req.Header.Add("Authorization", "Bearer "+tokenValue)
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	body, err := ioutil.ReadAll(res.Body)
	if false {
		fmt.Println(string(body))
	}
	buf := bytes.NewBuffer(body)
	defer res.Body.Close()

	var jsonData Rule
	err = json.NewDecoder(buf).Decode(&jsonData)
	if err != nil {
		t.Error("failed to decode json", err)
	} else {
		ruleAccessApi = jsonData.Data.ID
		t.Logf("Created ruleAccessApi with ID: %s", ruleAccessApi)
	}

	if res.StatusCode != http.StatusOK {
		t.Errorf("Unexpected response status code %d, body: %s", res.StatusCode, string(body))
		return
	}
	if !strings.Contains(string(body), "id") {
		t.Error("Returned unexpected body")
	}
}

func Test10_3_AddRulesWithServer(t *testing.T) {
	// Ensure we have a valid token
	if tokenValue == "" {
		TestAuthLoginAndFetchToken(t)
		if tokenValue == "" {
			t.Fatal("Failed to get authentication token")
		}
	}

	// Check that previous tests set up required data
	if serverId == "" {
		t.Fatal("serverId not set - Test10_1 may have failed")
	}
	if ruleAccessAll == "" || ruleAccessApi == "" {
		t.Fatal("Rule IDs not set - previous tests may have failed")
	}

	// Call the helper function
	TestAddRulesWithServer(t)

	// Call the handle profile API
	TestHandleProfileAPI(t)

	// Call the data sync API
	if serverName != "localhost" {
		TestDataSync(t)
	}
}

func Test10_4_DataAccessForAuthorizationRules(t *testing.T) {
	// Ensure frontUrl is set
	if frontUrl == "" {
		frontUrl = os.Getenv("FRONT_URL")
		if frontUrl == "" {
			t.Fatal("FRONT_URL not set")
		}
	}

	// Accessing the data without token
	url := frontUrl + "/api/v2/sample-data.json"

	client := &http.Client{}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Log(err)
		return
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Log(err)
		return
	}
	//t.Log(resp)

	body, err := ioutil.ReadAll(resp.Body)
	if false {
		t.Log(string(body))
	}
	//fmt.Println(string(body))

	if resp.StatusCode != http.StatusForbidden {
		t.Error("Unexpected response status code", resp.StatusCode)
		return
	}

	// On homepage
	URL := frontUrl

	client = &http.Client{}

	req, err = http.NewRequest("GET", URL, nil)
	if err != nil {
		t.Log(err)
		return
	}
	time.Sleep(2 * time.Second)

	resp, err = client.Do(req)
	if err != nil {
		t.Log(err)
		return
	}
	//t.Log(resp)

	body, err = ioutil.ReadAll(resp.Body)
	if false {
		t.Log(string(body))
	}
	//fmt.Println(string(body))

	if resp.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", resp.StatusCode)
		return
	}

	// login and fetch the token

	for {
		Url := frontUrl + "/login"
		method := "POST"
		Email := os.Getenv("LOGIN_EMAIL")
		Password := os.Getenv("LOGIN_PASSWORD")

		payload := &bytes.Buffer{}
		writer := multipart.NewWriter(payload)
		_ = writer.WriteField("email", Email)
		_ = writer.WriteField("password", Password)
		err := writer.Close()
		if err != nil {
			fmt.Println("Error creating payload:", err)
			return
		}

		// Create a new HTTP client with a cookie jar
		jar, err := cookiejar.New(nil)
		if err != nil {
			fmt.Println("Error creating cookie jar:", err)
			return
		}

		client := &http.Client{
			Jar: jar,
		}

		req, err := http.NewRequest(method, Url, payload)
		if err != nil {
			fmt.Println("Error creating request:", err)
			return
		}

		req.Header.Add("Content-Type", writer.FormDataContentType())
		time.Sleep(2 * time.Second)

		resp, err := client.Do(req)
		if err != nil {
			fmt.Println("Error making request:", err)
			return
		}

		// body, err := ioutil.ReadAll(resp.Body)
		// if err != nil {
		// 	fmt.Println(err)
		// 	return
		// }
		time.Sleep(10 * time.Second)
		if resp.StatusCode == http.StatusOK {
			fmt.Println("Login successful!")
			// fmt.Println(string(body))

			// Find the "Authorization" cookie
			cookies := jar.Cookies(req.URL)
			//fmt.Println(cookies)
			for _, cookie := range cookies {
				if cookie.Name == "Authorization" {
					jwtToken = cookie.Value
					break
				}
			}
			break
		} else if resp.StatusCode == http.StatusBadGateway {
			fmt.Println("Received 502 Bad Gateway status code. Retrying.")
		} else {
			t.Error("Failed to login:", resp.StatusCode)
			return
		}

		defer resp.Body.Close()
	}

	// Accessing the data with the token
	time.Sleep(2 * time.Second)

	uRL := frontUrl + "/api/v2/sample-data.json"

	client = &http.Client{}

	req, err = http.NewRequest("GET", uRL, nil)
	if err != nil {
		t.Log(err)
		return
	}
	req.Header.Add("Cookie", fmt.Sprintf("Authorization=%s", jwtToken))
	resp, err = client.Do(req)
	if err != nil {
		t.Log(err)
		return
	}
	//t.Log(resp)

	body, err = ioutil.ReadAll(resp.Body)
	if false {
		t.Log(string(body))
	}
	//fmt.Println(string(body))

	if resp.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", resp.StatusCode)
		return
	}
	if !strings.Contains(string(body), "id") {
		t.Error("Failed to access data with the token")
	}
}

func Test10_5_DeleteAccessRules(t *testing.T) {
	// Ensure we have a valid token for deletion
	if tokenValue == "" {
		TestAuthLoginAndFetchToken(t)
		if tokenValue == "" {
			t.Fatal("Failed to get authentication token")
		}
	}

	// Deleting the AccessAll rule
	ruleId = ruleAccessAll
	TestDeleteRule(t)
	// Deleting the AccessApi rule
	ruleId = ruleAccessApi
	TestDeleteRule(t)

	// Deleting the server
	TestDeleteServer(t)

}
