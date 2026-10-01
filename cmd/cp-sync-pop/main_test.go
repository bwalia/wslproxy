package main

import (
	"encoding/json"
	"testing"
)

func TestRecordListEmptyObject(t *testing.T) {
	// Lua cjson encodes empty tables as {} unless array_mt is set.
	raw := `{"data":{"manifest":{"pop_id":"lon1"},"servers":[{"id":"host:x"}],"rules":[],"waf_policies":{},"waf_rules":{},"secrets":{}}}`
	var wrap exportResponse
	if err := json.Unmarshal([]byte(raw), &wrap); err != nil {
		t.Fatal(err)
	}
	if len(wrap.Data.Servers) != 1 {
		t.Fatalf("servers=%d", len(wrap.Data.Servers))
	}
	if len(wrap.Data.Secrets) != 0 {
		t.Fatalf("secrets=%v", wrap.Data.Secrets)
	}
	if len(wrap.Data.WafPolicies) != 0 {
		t.Fatalf("waf_policies=%v", wrap.Data.WafPolicies)
	}
}
