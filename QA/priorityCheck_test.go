package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	"testing"
)

var HighPriorityRule string
var LowPriorityRule string

func TestCheckRulePriority(t *testing.T) {

	TestAuthLoginAndFetchToken(t)
	TestCreateServer(t)

	//creating rule with High priority
	type Rule struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	url := targetHost + "/api/rules"
	payload := strings.NewReader(`{"version":1,"priority":8,"match":{"rules":{"path_key":"starts_with","path":"/","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":200,"message":"aGlnaCBwcmlvcml0eSBydWxl"}},"name":"Rule with High priority -gotest","profile_id":"test"}`)

	client := &http.Client{}
	req, err := http.NewRequest("POST", url, payload)
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

	var jsonData1 Rule
	err = json.NewDecoder(buf).Decode(&jsonData1)
	if err != nil {
		t.Error("failed to decode json", err)
	} else {
		HighPriorityRule = jsonData1.Data.ID
		//t.Log(HighPriorityRule)
	}

	//creating rule with low priority
	Payload := strings.NewReader(`{"version":1,"priority":4,"match":{"rules":{"path_key":"starts_with","path":"/","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":200,"message":"bG93IHByaW9yaXR5"}},"name":"Rule with Low priority- gotest","profile_id":"test"}`)
	client = &http.Client{}
	req, err = http.NewRequest("POST", url, Payload)
	if err != nil {
		fmt.Println(err)
		return
	}

	req.Header.Add("Authorization", "Bearer "+tokenValue)
	req.Header.Set("Content-Type", "application/json")
	res, err = client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	body, err = ioutil.ReadAll(res.Body)
	if false {
		fmt.Println(string(body))
	}
	buff := bytes.NewBuffer(body)
	defer res.Body.Close()

	var jsonData2 Rule
	err = json.NewDecoder(buff).Decode(&jsonData2)
	if err != nil {
		t.Error("failed to decode json", err)
	} else {
		LowPriorityRule = jsonData2.Data.ID
		//t.Log(LowPriorityRule)
	}

	// Adding rules to the server

	ruleAccessAll = HighPriorityRule
	ruleAccessApi = LowPriorityRule
	TestAddRulesWithServer(t)

	// Call the handle profile API
	TestHandleProfileAPI(t)

	// Call the data sync API
	TestDataSync(t)

	// compairing with the response output
	URL := "http://" + serverName

	client = &http.Client{}
	req, err = http.NewRequest("GET", URL, nil)
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

	body, err = ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Log(err)
	}

	Got := string(body)
	fmt.Println(Got)

	if !strings.Contains(string(body), "high priority") {
		//if got != test.ExpectedOutput {
		t.Errorf("Expected high priority, but got %s", Got)
	}

	// Reverse the order of rules attached
	ruleAccessAll = LowPriorityRule
	ruleAccessApi = HighPriorityRule
	TestAddRulesWithServer(t)

	// Call the data sync API
	TestDataSync(t)

	// compairing with the response output

	client = &http.Client{}
	req, err = http.NewRequest("GET", URL, nil)
	if err != nil {
		t.Log(err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+tokenValue)
	resp, err = client.Do(req)
	if err != nil {
		t.Log(err)
		return
	}
	//t.Log(resp)

	Body, err := ioutil.ReadAll(resp.Body)

	got := string(Body)
	fmt.Println(got)

	if !strings.Contains(string(Body), "high priority") {
		//if got != test.ExpectedOutput {
		t.Errorf("Expected high priority, but got %s", got)
	}

}

// Deleting the rules to clear the junk
func TestDeleteRules(t *testing.T) {

	ruleId = HighPriorityRule
	TestDeleteRule(t)

	ruleId = LowPriorityRule
	TestDeleteRule(t)
}
