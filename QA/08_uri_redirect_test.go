package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	"testing"
	"time"
)

var RedirectRuleId string

func TestRedirectURI(t *testing.T) {

	type TestPayload struct {
		RuleName       string
		ResponseCode   int
		Target         string
		ExpectedOutput string
	}
	tests := []TestPayload{
		{RuleName: "Test Rule-305-gotest", ResponseCode: 305, Target: "httpbin.org", ExpectedOutput: "httpbin.org"},
		{RuleName: "Test Rule-302-gotest", ResponseCode: 302, Target: "https://google.com/", ExpectedOutput: "Google"},
		{RuleName: "Test Rule-301-gotest", ResponseCode: 301, Target: "https://httpbin.org/", ExpectedOutput: "httpbin.org"},
	}

	for _, test := range tests {
		t.Run(fmt.Sprintf("%s: %s", test.RuleName, test.Target), func(t *testing.T) {

			TestAuthLoginAndFetchToken(t)
			TestCreateServer(t)

			//creating rule with different input
			type Rule struct {
				Data struct {
					ID string `json:"id"`
				} `json:"data"`
			}
			url := targetHost + "/api/rules"
			payload := strings.NewReader(fmt.Sprintf(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":%d,"redirect_uri":"%s","message":"undefined"}},"name":"%s","profile_id":"test"}`, test.ResponseCode, test.Target, test.RuleName))
			time.Sleep(4 * time.Second)

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
				RedirectRuleId = jsonData.Data.ID
				//t.Log(RedirectRuleId)
			}

			// applying the rule to the server
			ruleId = RedirectRuleId
			TestUpdateRuleWithServer(t)

			// Call the handle profile API
			TestHandleProfileAPI(t)

			// Call the data sync API
			if serverName != "localhost" {
				TestDataSync(t)
			}

			// compairing with the response output
			URL := frontUrl

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

			got := string(body)
			//fmt.Println(got)

			if !strings.Contains(string(body), test.ExpectedOutput) {
				//if got != test.ExpectedOutput {
				t.Errorf("for status code %d, expected redirected to %s, but got %s", test.ResponseCode, test.ExpectedOutput, got)
			}

			// Deleting the rules to clear the junk
			ruleId = RedirectRuleId
			TestDeleteRule(t)

		})
	}
}
