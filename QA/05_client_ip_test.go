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

var IpRuleId string

func TestClientIP(t *testing.T) {
	type TestPayload struct {
		RuleName       string
		Country        string
		ClientIP       string
		ExpectedOutput string
	}
	tests := []TestPayload{
		{RuleName: "Valid clientIp for BE", Country: "BE", ClientIP: "104.155.127.255", ExpectedOutput: "Hello world!"},
		{RuleName: "Invalid clientIp for BE", Country: "BE", ClientIP: "204.155.127.25", ExpectedOutput: "Configuration not match"},
		{RuleName: "Valid clientIp for IN", Country: "IN", ClientIP: "117.245.73.99", ExpectedOutput: "Hello world!"},
		{RuleName: "Invalid clientIp for IN", Country: "IN", ClientIP: "11.245.73.934", ExpectedOutput: "Configuration not match"},
		{RuleName: "Valid clientIp for AU", Country: "AU", ClientIP: "1.44.255.255", ExpectedOutput: "Hello world!"},
		{RuleName: "Invalid clientIp for AU", Country: "AU", ClientIP: "123.44.255.25", ExpectedOutput: "Configuration not match"},
		{RuleName: "Valid clientIp for GB", Country: "GB", ClientIP: "103.219.168.255", ExpectedOutput: "Hello world!"},
		{RuleName: "Invalid clientIp for GB", Country: "GB", ClientIP: "13.219.168.25", ExpectedOutput: "Configuration not match"},
		{RuleName: "Valid clientIp for TH", Country: "TH", ClientIP: "101.109.255.255", ExpectedOutput: "Hello world!"},
		{RuleName: "Invalid clientIp for TH", Country: "TH", ClientIP: "11.109.255.2", ExpectedOutput: "Configuration not match"},
	}

	for _, test := range tests {
		t.Run(fmt.Sprintf("%s : %s", test.RuleName, test.ClientIP), func(t *testing.T) {

			TestAuthLoginAndFetchToken(t)
			TestCreateServer(t)

			//creating rule with different input
			type Rule struct {
				Data struct {
					ID string `json:"id"`
				} `json:"data"`
			}
			url := targetHost + "/api/rules"
			payload := strings.NewReader(fmt.Sprintf(`{"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"/","country_key":"equals","country":"%s","client_ip_key":"equals","client_ip":"%s","jwt_token_validation":"equals"},"response":{"allow":true,"code":200,"message":"SGVsbG8gd29ybGQh"}},"name":"%s","profile_id":"%s"}`, test.Country, test.ClientIP, test.RuleName, profile))

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
				IpRuleId = jsonData.Data.ID
				//t.Log(IpRuleId)
			}

			// applying the rule to the server
			Url := targetHost + "/api/servers/" + serverId
			method := "PUT"

			Payload := strings.NewReader(fmt.Sprintf(`{"error_log":"logs/error.log","config":"server {\n      listen 80;  # Listen on port (HTTP)\n      server_name %s;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  ","custom_block":{},"locations":{},"root":"/var/www/html","id":"%s","index":"index.html","profile_id":"%s","listens":[{"listen":"80"}],"server_name":"%s","access_log":"logs/access.log","created_at":1693981431,"proxy_pass":"http://localhost","proxy_server_name":"myorigin.mydomain.com","rules":"%s","match_cases":[]}`, serverName, serverId, profile, serverName, IpRuleId))
			time.Sleep(2 * time.Second)

			client = &http.Client{}
			req, err = http.NewRequest(method, Url, Payload)
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
			defer res.Body.Close()

			if res.StatusCode != http.StatusOK {
				t.Error("Unexpected response status code", res.StatusCode)
			}

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
				t.Errorf("for country %s and IP %s, expected %s, but got %s", test.Country, test.ClientIP, test.ExpectedOutput, got)
			}

			// Deleting the rules to clear the junk
			ruleId = IpRuleId
			TestDeleteRule(t)

		})
	}
}
