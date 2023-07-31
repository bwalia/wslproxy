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

func TestHostOverRide(t *testing.T) {

	TestAuthLoginAndFetchToken(t)
	TestCreateServer(t)

	//creating rule with 305 status code
	var RuleID string

	type Rule struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	url := "http://int6-api.whitefalcon.io/api/rules"
	payload := strings.NewReader((`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":false,"code":305,"redirect_uri":"httpbin.org","message":"undefined"}},"name":"Test rule host"}`))

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

	var jsonData Rule
	err = json.NewDecoder(buf).Decode(&jsonData)
	if err != nil {
		t.Error("failed to decode json", err)
	} else {
		RuleID = jsonData.Data.ID
		//t.Log(RuleID)
	}

	// applying the rule to the server
	ruleId = RuleID
	TestUpdateRuleWithServer(t)

	// Call the data sync API
	TestDataSync(t)

	// verifying the host header
	Url := "http://int6.whitefalcon.io/"

	client = &http.Client{}
	req, err = http.NewRequest("GET", Url, nil)
	if err != nil {
		fmt.Println(err)
	}

	res, err = client.Do(req)
	if err != nil {
		fmt.Println(err)
	} else {
		//fmt.Println(res.Body)
	}
	defer res.Body.Close()

	fmt.Println(res.Header.Get("X-Debug-Host"))

	if strings.Contains(res.Header.Get("X-Debug-Host"), "test-my.workstation.co.uk") {
		fmt.Println("Returned expected host header value")
	} else {
		t.Error("Failed to get expected host value")
	}

	// Deleting the rules to clear the junk
	TestDeleteRule(t)
	ruleId = RuleID

}
