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

var RespRuleId string

func TestRuleResponse(t *testing.T) {

	HTMLInput := `PCFET0NUWVBFIGh0bWw+CjxodG1sPgoKPGhlYWQ+Cgk8dGl0bGU+CgkJRmlyc3QgV2ViIFBhZ2UK
	CTwvdGl0bGU+CjwvaGVhZD4KCjxib2R5PgoJSGVsbG8gV29ybGQhCjwvYm9keT4KCjwvaHRtbD4K`
	TextInput := "SEVMTE9ESVhB"

	type TestPayload struct {
		RuleName       string
		MessageInput   string
		ActualValue    string
		ExpectedOutput string
	}
	tests := []TestPayload{
		{RuleName: "Verify response Text to Base64-gotest", MessageInput: TextInput, ActualValue: "HELLODIXA", ExpectedOutput: "HELLODIXA"},
		{RuleName: "Verify response HTML to Base64-gotest", MessageInput: HTMLInput, ActualValue: "Hello World!", ExpectedOutput: "Hello World!"},
	}

	for _, test := range tests {
		t.Run(fmt.Sprintf("%s", test.RuleName), func(t *testing.T) {

			TestAuthLoginAndFetchToken(t)
			TestCreateServer(t)

			//creating rule with different inputs for response message body
			type Rule struct {
				Data struct {
					ID string `json:"id"`
				} `json:"data"`
			}
			url := targetHost + "/api/rules"
			payload := strings.NewReader(fmt.Sprintf(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":200,"message":"%s"}},"name":"%s","profile_id":"test"}`, test.MessageInput, test.RuleName))

			client := &http.Client{}
			time.Sleep(4 * time.Second)

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
				RespRuleId = jsonData.Data.ID
				//t.Log(RespRuleId)
			}

			// applying the rule to the server
			ruleId = RespRuleId
			TestUpdateRuleWithServer(t)

			// Call the handle profile API
			if serverName != "localhost" {
				TestHandleProfileAPI(t)
			}

			// Call the data sync API
			if serverName != "localhost" {
				TestDataSync(t)
			}

			// compairing with the response output
			URL := "http://" + frontUrl

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

			got := string(body)
			//fmt.Println(got)

			// Compairing the output with the expected results
			if !strings.Contains(string(body), test.ExpectedOutput) {
				t.Errorf("for input %s, expected %s, but got %s", test.MessageInput, test.ExpectedOutput, got)
			}

			// Deleting the rules to clear the junk
			ruleId = RespRuleId
			TestDeleteRule(t)
		})
	}
}
