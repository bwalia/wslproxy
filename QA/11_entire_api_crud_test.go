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

var serverId string
var ruleId string
var tokenValue string

var targetHost = os.Getenv("TARGET_HOST")
var serverName = os.Getenv("SERVER_NAME")

// Calling the auth API with the valid credentials to get the access token
func TestAuthLoginAndFetchToken(t *testing.T) {
	type authResponse struct {
		Data struct {
			AccessToken string `json:"accessToken"`
		} `json:"data"`
	}

	type LoginPayload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	url := targetHost + "/api/user/login"
	method := "POST"
	Email := os.Getenv("LOGIN_EMAIL")
	Password := os.Getenv("LOGIN_PASSWORD")

	payload := LoginPayload{
		Email:    Email,
		Password: Password,
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		fmt.Println(err)
		return
	}

	client := &http.Client{}
	req, err := http.NewRequest(method, url, strings.NewReader(string(jsonPayload)))

	if err != nil {
		fmt.Println(err)
		return
	}
	req.Header.Add("Content-Type", "application/json")

	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	buff := bytes.NewBuffer(body)
	defer res.Body.Close()

	var jsonData authResponse
	err = json.NewDecoder(buff).Decode(&jsonData)
	if err != nil {
		t.Error("failed to decode json", err)
	} else {
		tokenValue = jsonData.Data.AccessToken
	}
}

// Calling the Server API for GET method to get all server list
func TestGetServers(t *testing.T) {

	client := &http.Client{}

	req, err := http.NewRequest("GET", targetHost+"/api/servers?_format=json&params={%22pagination%22:{%22page%22:1,%22perPage%22:25},%22sort%22:{%22field%22:%22created_at%22,%22order%22:%22DESC%22},%22filter%22:{%22profile_id%22:%22test%22}}", nil)
	if err != nil {
		t.Log(err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+tokenValue)
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
	if resp.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", resp.StatusCode)
		return
	}
}

// Calling the Rule API for GET method to get all rules list
func TestGetRules(t *testing.T) {

	client := &http.Client{}

	req, err := http.NewRequest("GET", targetHost+"/api/rules?_format=json&params={%22pagination%22:{%22page%22:1,%22perPage%22:10},%22sort%22:{%22field%22:%22id%22,%22order%22:%22ASC%22},%22filter%22:{%22profile_id%22:%22test%22}}", nil)
	if err != nil {
		t.Log(err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+tokenValue)
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
	if resp.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", resp.StatusCode)
		return
	}
}

// Calling the Server API for POST method to create a new server
func TestCreateServer(t *testing.T) {

	type Server struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	url := targetHost + "/api/servers"
	method := "POST"

	payload := strings.NewReader(fmt.Sprintf(`{"listens":[{"listen":"80"}],"server_name":"%s", "proxy_server_name":"myorigin.mydomain.com", "profile_id":"test","root":"/var/www/html","index":"index.html","access_log":"logs/access.log","error_log":"logs/error.log","locations":[],"custom_block":[],"config":"server {\n      listen 80;  # Listen on port (HTTP)\n      server_name %s;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  "}`, serverName, serverName))

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

	var jsonData Server
	err = json.NewDecoder(buf).Decode(&jsonData)
	if err != nil {
		t.Log("failed to decode json", err)
	} else {
		if res.StatusCode == http.StatusOK {
			serverId = jsonData.Data.ID

		} else if res.StatusCode == http.StatusConflict {
			serverId = os.Getenv("SERVER_ID_QA")
		}
	}
}

// Calling the Rule API for POST method to create a new rule
func TestCreateRule(t *testing.T) {

	type Rule struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	url := targetHost + "/api/rules"
	method := "POST"

	//payload := strings.NewReader(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/router","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":200,"message":"SGVsbG8gd29ybGQh"}},"name":"API test rule"}`)
	payload := strings.NewReader(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/router","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":200,"message":"SGVsbG8gd29ybGQh"}},"name":"API test rule-gotest","profile_id":"test"}`)

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
		ruleId = jsonData.Data.ID
		//t.Log(ruleId)
	}

	if res.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", res.StatusCode)
		return
	}
	if !strings.Contains(string(body), "id") {
		t.Error("Returned unexpected body")
	}
}

// Calling the Server API for GET method to get the specific server with the uuid
func TestGetSingleServer(t *testing.T) {
	url := targetHost + "/api/servers/" + serverId + "?_format=json&envprofile=test"

	method := "GET"

	client := &http.Client{}
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		fmt.Println(err)
		return
	}

	req.Header.Add("Authorization", "Bearer "+tokenValue)
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
		return
	}
	if !strings.Contains(string(body), serverName) {
		t.Error("Returned unexpected body")
		return
	}
}

// Calling the Rule API for GET method to get the specific rule with the uuid
func TestGetSingleRule(t *testing.T) {
	url := targetHost + "/api/rules/" + ruleId + "?_format=json&envprofile=test"

	method := "GET"

	client := &http.Client{}
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		fmt.Println(err)
	}

	req.Header.Add("Authorization", "Bearer "+tokenValue)
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
		return
	}
	if !strings.Contains(string(body), "test rule") {
		t.Error("Returned unexpected body")
		return
	}

}

// Calling the Rule API for PUT method to update a specific rule with the uuid
func TestUpdateRule(t *testing.T) {

	url := targetHost + "/api/rules/" + ruleId
	method := "PUT"

	//payload := strings.NewReader(fmt.Sprintf(`{"created_at":1689744334,"match":{"rules":{"path_key":"starts_with","client_ip_key":"equals","country_key":"equals","path":"/router","jwt_token_validation":"equals"},"response":{"allow":false,"code":200,"message":"SGVsbG8gd29ybGQh"}},"version":1,"name":"API Test Rule","priority":1,"id":"%s"}`, ruleId))
	payload := strings.NewReader(fmt.Sprintf(`{"name":"API Test Rule-gotest","version":1,"match":{"rules":{"country_key":"equals","client_ip_key":"equals","path_key":"starts_with","path":"/router","jwt_token_validation":"equals"},"response":{"code":200,"message":"SGVsbG8gd29ybGQh","allow":true}},"profile_id":"test","created_at":1693981946,"priority":1,"id":"%s"}`, ruleId))

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
		return
	}
	if !strings.Contains(string(body), "Test Rule") {
		t.Error("Returned unexpected body")
		return
	}
}

// Calling the Server API for PUT method to update a specific server and attech the rule
func TestUpdateRuleWithServer(t *testing.T) {
	url := targetHost + "/api/servers/" + serverId
	method := "PUT"

	payload := strings.NewReader(fmt.Sprintf(`{"error_log":"logs/error.log","config":"server {\n      listen 80;  # Listen on port (HTTP)\n      server_name %s;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  ","custom_block":{},"locations":{},"root":"/var/www/html","id":"%s","index":"index.html","profile_id":"test","listens":[{"listen":"80"}],"server_name":"%s","access_log":"logs/access.log","created_at":1693981431,"proxy_pass":"http://localhost","proxy_server_name":"myorigin.mydomain.com","rules":"%s","match_cases":[]}`, serverName, serverId, serverName, ruleId))

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
	if !strings.Contains(string(body), "80") {
		t.Error("Returned unexpected body")
		return
	}
}

// Calling the handle profile API to work with the profiles
func TestHandleProfileAPI(t *testing.T) {
	url := "http://" + serverName + "/frontdoor/opsapi/handle-profile"
	payload := strings.NewReader(`{"profile":"test"}`)

	client := &http.Client{}

	req, err := http.NewRequest("POST", url, payload)
	if err != nil {
		t.Log(err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		t.Log(err)
		return
	}
	//t.Log(resp)

	if resp.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", resp.StatusCode)
		return
	}

}

// Calling the sync API to sync the data
func TestDataSync(t *testing.T) {
	url := "http://" + serverName + "/frontdoor/opsapi/sync?envprofile=test"

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

	if resp.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", resp.StatusCode)
		return
	}

}

// Verifying the response output and the expected results
func TestServerResponse(t *testing.T) {
	url := "http://" + serverName + "/router"

	client := &http.Client{}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Log(err)
		return
	}
	//fmt.Println(req)
	req.Header.Set("Authorization", "Bearer "+tokenValue)
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
	fmt.Println(string(body))

	if resp.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", resp.StatusCode)
		return
	}
	if !strings.Contains(string(body), "Hello world!") {
		t.Error("Returned unexpected body")
		return
	}
}

// Calling the server API for DELETE method to delete the server
func TestDeleteServer(t *testing.T) {
	url := targetHost + "/api/servers"
	method := "DELETE"
	payload := strings.NewReader(fmt.Sprintf(`{"ids":{"ids":["%s"],"envProfile":"test"}}`, serverId))

	client := &http.Client{}
	req, err := http.NewRequest(method, url, payload)
	if err != nil {
		fmt.Println(err)
		return
	}

	req.Header.Add("Authorization", "Bearer "+tokenValue)
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
		return
	}
}

// Delete the rules if the value of executeFunction is true
func TestDeleteRule(t *testing.T) {
	executeFunction := os.Getenv("EXECUTE_FUNCTION")
	if executeFunction == "true" {
		url := targetHost + "/api/rules"
		method := "DELETE"

		payload := strings.NewReader(fmt.Sprintf(`{"ids":{"ids":["%s"],"envProfile":"test"}}`, ruleId))

		client := &http.Client{}
		req, err := http.NewRequest(method, url, payload)
		if err != nil {
			fmt.Println(err)
			return
		}

		req.Header.Add("Authorization", "Bearer "+tokenValue)
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
			return
		}

	}

}
