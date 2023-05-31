package main

import (
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

	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Log(err)
	}
	res, err := client.Do(req)
	if err != nil {
		t.Log(err)
	}
	//fmt.Println(res)

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Log(err)
	}

	//fmt.Println(string(body))

	if !strings.Contains(string(body), "pong") {
		t.Error("Returned unexpected body ")
	} else {
		t.Log("Received response pong")
	}
	if res.StatusCode != http.StatusOK {
		t.Error("Unexpected response status code", res.StatusCode)
		return
	}

}
