package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"testing"
)

func TestHealthCheck(t *testing.T) {
	url := "https://test.whitefalcon.io/ping"

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

	fmt.Println(string(body))

	// if !strings.Contains(string(body), "pong") {
	// 	t.Error("Returned unexpected body ")
	// } else {
	// 	t.Log("Received response pong")
	// }
	if res.StatusCode != http.StatusNotFound {
		t.Error("Unexpected response status code", res.StatusCode)
		return
	}

}
