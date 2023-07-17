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

func TestHealthCheck(t *testing.T) {
	url := os.Getenv("API_PING_URL")
	if len(url) == 0 {
		url = "http://127.0.0.1:8080/ping"
	}
	fmt.Println((url))

	// type pingResp struct {
	// 	Redis_status string `json:"redis_status_msg"`
	// 	Pod_Uptime   string `json:"pod_uptime"`
	// 	Node_Uptime  string `json:"node_uptime"`
	// }

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Log(err)
	}
	res, err := client.Do(req)
	if false {
		fmt.Println(res)
	}

	body, err := ioutil.ReadAll(res.Body)
	if false {
		fmt.Println(string(body))
	}

	if !strings.Contains(string(body), "Welcome to Workstation SRL") {
		t.Error("Returned unexpected body ")
	} else {
		t.Log("Received expected response ")
	}
	if res.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", res.StatusCode)
		return
	}
	// buff := bytes.NewBuffer(body)
	// var jsonData pingResp
	// err = json.NewDecoder(buff).Decode(&jsonData)
	// if err != nil {
	// 	t.Error("failed to decode json", err)
	// } else {
	// 	fmt.Println(jsonData.Redis_status)
	// 	fmt.Println(jsonData.Pod_Uptime)
	// 	fmt.Println(jsonData.Node_Uptime)
	// }
	// if jsonData.Redis_status != "OK" {
	// 	t.Error("Redis status is not ok")
	// }
	// if jsonData.Pod_Uptime == "" {
	// 	t.Error("Missing pod uptime")
	// }
	// if jsonData.Node_Uptime == "" {
	// 	t.Error("Missing node uptime")
	// }

}
