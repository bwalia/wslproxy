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

const targetHost = "http://int2-api.whitefalcon.io"

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

func TestGetServers(t *testing.T) {

	client := &http.Client{}

	req, err := http.NewRequest("GET", targetHost+"/api/servers?_format=json&params={%22pagination%22:{%22page%22:1,%22perPage%22:10},%22sort%22:{%22field%22:%22created_at%22,%22order%22:%22DESC%22},%22filter%22:{},%22businessUUID%22:null}", nil)
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

func TestGetRules(t *testing.T) {

	client := &http.Client{}

	req, err := http.NewRequest("GET", targetHost+"/api/rules?_format=json&params={%22pagination%22:{%22page%22:1,%22perPage%22:10},%22sort%22:{%22field%22:%22created_at%22,%22order%22:%22DESC%22},%22filter%22:{},%22businessUUID%22:null}", nil)
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

func TestCreateServer(t *testing.T) {

	type Server struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	url := targetHost + "/api/servers"
	method := "POST"

	payload := strings.NewReader(`{"listens":[{"listen":"80"}],"server_name":"int2.whitefalcon.io","root":"/var/www/html","index":"index/html","access_log":"/logs/access.log","error_log":"/logs/error.log","locations":[],"custom_block":[]}`)

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
			serverId = os.Getenv("SERVER_ID")
		}
	}
}

func TestCreateRule(t *testing.T) {

	type Rule struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	url := targetHost + "/api/rules"
	method := "POST"

	payload := strings.NewReader(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/router","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":200,"message":"SGVsbG8gd29ybGQh"}},"name":"test rule"}`)

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
func TestGetSingleServer(t *testing.T) {
	url := targetHost + "/api/servers/" + serverId
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
	if !strings.Contains(string(body), "int2.whitefalcon.io") {
		t.Error("Returned unexpected body")
		return
	}
}

func TestGetSingleRule(t *testing.T) {
	url := targetHost + "/api/rules/" + ruleId
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

func TestUpdateRule(t *testing.T) {

	url := targetHost + "/api/rules/" + ruleId
	method := "PUT"

	payload := strings.NewReader(fmt.Sprintf(`{"created_at":1687853270,"version":1,"priority":1,"name":"Test rule","match":{"response":{"code":200,"message":"SGVsbG8gd29ybGQh","allow":true},"rules":{"jwt_token_validation":"equals","country_key":"equals","client_ip_key":"equals","path":"/router","path_key":"starts_with"}},"id":"%s"}`, ruleId))

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
	if !strings.Contains(string(body), "Test rule") {
		t.Error("Returned unexpected body")
		return
	}
}

func TestUpdateRuleWithServer(t *testing.T) {
	url := targetHost + "/api/servers/" + serverId
	method := "PUT"

	payload := strings.NewReader(fmt.Sprintf(`{"server_name":"int2.whitefalcon.io","listens":[{"listen":"81"}],"proxy_pass":"http://localhost","index":"index/html","id":"%s","match_cases":{},"error_log":"/logs/error.log","rules":"%s","locations":{},"root":"/var/www/html","custom_block":{},"access_log":"/logs/access.log","created_at":1687844569}`, serverId, ruleId))
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
	if !strings.Contains(string(body), "81") {
		t.Error("Returned unexpected body")
		return
	}
}

func TestServerResponse(t *testing.T) {
	url := "http://int2.whitefalcon.io/router"

	client := &http.Client{}

	req, err := http.NewRequest("GET", url, nil)
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
	if !strings.Contains(string(body), "Hello world!") {
		t.Error("Returned unexpected body")
		return
	}
}

func TestDeleteServer(t *testing.T) {
	url := targetHost + "/api/servers/" + serverId
	method := "DELETE"

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
}

func TestDeleteRule(t *testing.T) {
	url := targetHost + "/api/rules/" + ruleId
	method := "DELETE"

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
}
