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

func TestCreateRuleForAccessAll(t *testing.T) {

	TestCreateServer(t)

	type Rule struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	url := targetHost + "/api/rules"
	method := "POST"

	payload := strings.NewReader(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":false,"code":305,"redirect_uri":"10.43.69.108:3009","message":"undefined"}},"name":"Access All Rule"}`)

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
		ruleAccessAll = jsonData.Data.ID
		//t.Log(ruleAccessAll)
	}

	if res.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", res.StatusCode)
		return
	}
	if !strings.Contains(string(body), "id") {
		t.Error("Returned unexpected body")
	}
}
func TestCreateRuleForAccessApi(t *testing.T) {

	type Rule struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	url := targetHost + "/api/rules"
	method := "POST"

	payload := strings.NewReader(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/api","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"cookie","jwt_token_validation_value":"Authorization","jwt_token_validation_key":"HCsKpxQ4hU97V5us5TCwvLnAVBgLqNd1dP2R-4Uywg7946J3zAqT9EOA5hdWRCQn"},"response":{"allow":false,"code":305,"redirect_uri":"10.43.69.108:3009","message":"undefined"}},"name":"Access Api Rule"}`)

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
		//t.Log(ruleAccessApi)
	}

	if res.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", res.StatusCode)
		return
	}
	if !strings.Contains(string(body), "id") {
		t.Error("Returned unexpected body")
	}
}
func TestAddRulesWithServer(t *testing.T) {
	url := targetHost + "/api/servers/" + serverId
	method := "PUT"
	payload := strings.NewReader(fmt.Sprintf(`{"server_name":"int6-qa.whitefalcon.io","access_log":"logs/access.log","created_at":1690282152,"listens":[{"listen":"80"}],"rules":"%s","locations":{},"custom_block":{},"error_log":"logs/error.log","id":"%s","root":"/var/www/html","config":"server {\n      listen 80;  # Listen on port (HTTP)\n      server_name int6-qa.whitefalcon.io;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  ","proxy_pass":"http://localhost","match_cases":[{"statement":"%s","condition":"and"}],"index":"index.html"}`, ruleAccessAll, serverId, ruleAccessApi))
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

	// Calling sync data api
	TestDataSync(t)
}

func TestVerifyRule(t *testing.T) {
	// Accessing the data without token
	url := "http://int6-qa.whitefalcon.io/api/v2/sample-data.json"

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
	URL := "http://int6-qa.whitefalcon.io/"

	client = &http.Client{}

	req, err = http.NewRequest("GET", URL, nil)
	if err != nil {
		t.Log(err)
		return
	}
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
		Url := "http://int6-qa.whitefalcon.io/login"
		method := "POST"
		Email := os.Getenv("email")
		Password := os.Getenv("password")

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
		time.Sleep(20 * time.Second)
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
	uRL := "http://int6-qa.whitefalcon.io/api/v2/sample-data.json"

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

func TestDeleteBothRules(t *testing.T) {

	// Deleting the AccessAll rule
	ruleId = ruleAccessAll
	TestDeleteRule(t)
	// Deleting the AccessApi rule
	ruleId = ruleAccessApi
	TestDeleteRule(t)

	// Deleting the server
	TestDeleteServer(t)

}
