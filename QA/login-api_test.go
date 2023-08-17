package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strings"
	"testing"
)

func TestLoginAccess(t *testing.T) {
	validEmail := os.Getenv("LOGIN_EMAIL")
	validPassword := os.Getenv("LOGIN_PASSWORD")

	type TestPayload struct {
		RuleName           string
		TestEmail          string
		TestPassword       string
		ExpectedStatusCode int
		ExpectedOutput     string
	}
	tests := []TestPayload{
		{RuleName: "Test login with valid credential", TestEmail: validEmail, TestPassword: validPassword, ExpectedStatusCode: 200, ExpectedOutput: "accessToken"},
		{RuleName: "Test login with invalid password", TestEmail: validEmail, TestPassword: "234567", ExpectedStatusCode: 401, ExpectedOutput: "Invalid credentials"},
		{RuleName: "Test login with invalid email", TestEmail: "abc@xyz.com", TestPassword: validPassword, ExpectedStatusCode: 401, ExpectedOutput: "Invalid credentials"},
		{RuleName: "Test login with empty password", TestEmail: validEmail, TestPassword: "", ExpectedStatusCode: 401, ExpectedOutput: "Invalid credentials"},
		{RuleName: "Test login with empty email", TestEmail: "", TestPassword: validPassword, ExpectedStatusCode: 401, ExpectedOutput: "Invalid credentials"},
	}

	for _, test := range tests {
		t.Run(fmt.Sprintf(test.RuleName), func(t *testing.T) {
			type LoginPayload struct {
				Email    string `json:"email"`
				Password string `json:"password"`
			}

			url := targetHost + "/api/user/login"
			method := "POST"
			Email := test.TestEmail
			Password := test.TestPassword

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
			body, err := ioutil.ReadAll(res.Body)
			if err != nil {
				t.Log(err)
			}
			defer res.Body.Close()

			got := string(body)
			//fmt.Println(got)

			if !strings.Contains(string(body), test.ExpectedOutput) {
				//if got != test.ExpectedOutput {
				t.Errorf("for rule %s, expected %s, but got %s", test.RuleName, test.ExpectedOutput, got)
			}
			if res.StatusCode != test.ExpectedStatusCode {
				t.Errorf("for rule %s, expected status code %d, but got %d", test.RuleName, test.ExpectedStatusCode, res.StatusCode)
			}

		})
	}
}
