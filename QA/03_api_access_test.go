package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strings"
	"testing"
)

func checkExecutionOutput(t *testing.T, ruleName string, expectedStatusCode int, expectedOutput string, resp *http.Response) {
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Log(err)
	}

	got := string(body)
	//fmt.Println(got)

	if !strings.Contains(string(body), expectedOutput) {
		//if got != test.ExpectedOutput {
		t.Errorf("for rule %s, expected %s, but got %s", ruleName, expectedOutput, got)
	}
	if resp.StatusCode != expectedStatusCode {
		t.Logf("for rule %s, expected status code %d, but got %d", ruleName, expectedStatusCode, resp.StatusCode)
	}
}
func TestApiAccessAuth(t *testing.T) {
	// Fetching the valid token
	TestAuthLoginAndFetchToken(t)
	expiredTokenForTestOnly := os.Getenv("QA_EXPIRED_JWT_TOKEN_KEY")

	type TestToken struct {
		RuleName           string
		TestTokenValue     string
		ExpectedStatusCode int
		ExpectedOutput     string
	}

	tests := []TestToken{
		{RuleName: "Test API access with valid token", TestTokenValue: tokenValue, ExpectedStatusCode: 200, ExpectedOutput: "data"},
		{RuleName: "Test API access with invalid token signature", TestTokenValue: tokenValue + "abc", ExpectedStatusCode: 401, ExpectedOutput: "signature mismatch"},
		{RuleName: "Test API access with invalid token header", TestTokenValue: "eyj" + tokenValue, ExpectedStatusCode: 401, ExpectedOutput: "invalid header"},
		{RuleName: "Test API access with expired token", TestTokenValue: expiredTokenForTestOnly, ExpectedStatusCode: 401, ExpectedOutput: "claim expired"},
		{RuleName: "Test API access with empty token", TestTokenValue: "", ExpectedStatusCode: 401, ExpectedOutput: "invalid jwt string"},
	}

	for _, test := range tests {
		t.Run(fmt.Sprintf(test.RuleName), func(t *testing.T) {
			// Verifying the access for GET request for rules
			fmt.Println("Executing GET request for token Authorization")
			client := &http.Client{}

			req, err := http.NewRequest("GET", targetHost+"/api/rules?_format=json&params={%22pagination%22:{%22page%22:1,%22perPage%22:10},%22sort%22:{%22field%22:%22id%22,%22order%22:%22ASC%22},%22filter%22:{%22profile_id%22:%22test%22}}", nil)
			if err != nil {
				t.Log(err)
				return
			}
			req.Header.Set("Authorization", "Bearer "+test.TestTokenValue)
			resp, err := client.Do(req)
			if err != nil {
				t.Log(err)
				return
			}
			//t.Log(resp)

			checkExecutionOutput(t, test.RuleName, test.ExpectedStatusCode, test.ExpectedOutput, resp)

			// Verifying the access for POST request for server
			fmt.Println("Executing POST request for token Authorization")

			payload := strings.NewReader(fmt.Sprintf(`{"listens":[{"listen":"80"}],"server_name":"%s", "proxy_server_name":"myorigin.mydomain.com", "profile_id":"test","root":"/var/www/html","index":"index.html","access_log":"logs/access.log","error_log":"logs/error.log","locations":[],"custom_block":[],"config":"server {\n      listen 80;  # Listen on port (HTTP)\n      server_name %s;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  "}`, serverName, serverName))

			client = &http.Client{}
			req, err = http.NewRequest("POST", targetHost+"/api/servers", payload)
			if err != nil {
				fmt.Println(err)
				return
			}

			req.Header.Add("Authorization", "Bearer "+test.TestTokenValue)
			req.Header.Set("Content-Type", "application/json")
			res, err := client.Do(req)
			if err != nil {
				fmt.Println(err)
				return
			}
			checkExecutionOutput(t, test.RuleName, test.ExpectedStatusCode, test.ExpectedOutput, res)

			// Verifying the access for PUT request for server
			fmt.Println("Executing PUT request for token Authorization")
			serverID := os.Getenv("SERVER_ID_QA")

			Payload := strings.NewReader(fmt.Sprintf(`{"access_log":"logs/access.log","server_name":"%s","error_log":"logs/error.log","config":"server {\n      listen 82;  # Listen on port (HTTP)\n      server_name %s;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  ","locations":{},"custom_block":{},"listens":[{"listen":"82"}],"created_at":1693985295,"root":"/var/www/html","proxy_pass":"http://localhost","id":"%s","index":"index.html","profile_id":"test"}`, serverName, serverName, serverID))

			client = &http.Client{}
			req, err = http.NewRequest("PUT", targetHost+"/api/servers/"+serverID, Payload)
			if err != nil {

				fmt.Println(err)
				return
			}

			req.Header.Add("Authorization", "Bearer "+test.TestTokenValue)
			req.Header.Set("Content-Type", "application/json")

			Resp, err := client.Do(req)
			if err != nil {
				fmt.Println(err)
				return
			}
			checkExecutionOutput(t, test.RuleName, test.ExpectedStatusCode, test.ExpectedOutput, Resp)

			// Verifying the access for Delete request for server
			fmt.Println("Executing DELETE request for token Authorization")
			PAYLOAD := strings.NewReader(fmt.Sprintf(`{"ids":{"ids":["%s"],"envProfile":"test"}}`, serverId))

			client = &http.Client{}
			req, err = http.NewRequest("DELETE", targetHost+"/api/servers", PAYLOAD)
			if err != nil {
				fmt.Println(err)
				return
			}

			req.Header.Add("Authorization", "Bearer "+test.TestTokenValue)
			RESP, err := client.Do(req)
			if err != nil {
				fmt.Println(err)
				return
			}
			checkExecutionOutput(t, test.RuleName, test.ExpectedStatusCode, test.ExpectedOutput, RESP)

		})
	}
}
