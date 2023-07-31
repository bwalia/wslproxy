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

var RuleId string

func TestURLPath(t *testing.T) {

	type TestPayload struct {
		PathCondition  string
		Input          string
		ExpectedOutput string
	}
	tests := []TestPayload{
		{PathCondition: "starts_with", Input: "/rou", ExpectedOutput: "HELLODIXA"},
		{PathCondition: "ends_with", Input: "ter", ExpectedOutput: "HELLODIXA"},
		{PathCondition: "equals", Input: "/router", ExpectedOutput: "HELLODIXA"},
		{PathCondition: "starts_with", Input: "/outer", ExpectedOutput: "No Rules"},
	}

	for _, test := range tests {
		t.Run(fmt.Sprintf("%s: %s", test.PathCondition, test.Input), func(t *testing.T) {

			TestAuthLoginAndFetchToken(t)
			TestCreateServer(t)

			//creating rule with different input
			type Rule struct {
				Data struct {
					ID string `json:"id"`
				} `json:"data"`
			}
			url := "http://int6-api.whitefalcon.io/api/rules"
			payload := strings.NewReader(fmt.Sprintf(`{"version":1,"priority":1,"match":{"rules":{"path_key":"%s","path":"%s","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":200,"message":"SEVMTE9ESVhB"}},"name":"test rule"}`, test.PathCondition, test.Input))
			//fmt.Println(payload)
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
				RuleId = jsonData.Data.ID
				//t.Log(RuleId)
			}

			// applying the rule to the server
			ruleId = RuleId
			TestUpdateRuleWithServer(t)

			// Call the data sync API
			TestDataSync(t)

			// compairing with the response output
			URL := "http://int6.whitefalcon.io/router"

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
				t.Errorf("for input %s, expected %s, but got %s", test.Input, test.ExpectedOutput, got)
			}

			// Deleting the rules to clear the junk
			TestDeleteRule(t)
			ruleId = RuleId
		})
	}
}
