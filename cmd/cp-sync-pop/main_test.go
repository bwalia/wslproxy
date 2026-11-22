package main

import (
	"encoding/json"
	"os"
	"path/filepath"
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

func TestApplyBundleWritesCacheAndAccessProfiles(t *testing.T) {
	dir := t.TempDir()
	raw := `{"data":{"manifest":{"pop_id":"lon1"},
	  "servers":[{"id":"host:www.site.org","server_name":"www.site.org","pop_ids":["lon1"]}],
	  "rules":[],"waf_policies":[],"waf_rules":[],"secrets":[],
	  "access_profiles":[{"name":"vpn-only","allow_cidrs":["10.0.0.0/8"]}],
	  "cache":[{"server_name":"site.org","cache_enabled":true}]}}`
	var wrap exportResponse
	if err := json.Unmarshal([]byte(raw), &wrap); err != nil {
		t.Fatal(err)
	}
	sum, err := applyBundle(dir, "prod", "lon1", &wrap.Data, false)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Written["cache"] != 1 || sum.Written["access_profiles"] != 1 {
		t.Fatalf("written=%v", sum.Written)
	}
	for _, p := range []string{"cache/site.org.json", "access_profiles/prod/vpn-only.json"} {
		if _, err := os.Stat(filepath.Join(dir, p)); err != nil {
			t.Fatalf("missing %s: %v", p, err)
		}
	}
}

func TestOldExportWithoutNewKindsStillDecodes(t *testing.T) {
	raw := `{"data":{"manifest":{"pop_id":"lon1"},"servers":[],"rules":[],"waf_policies":[],"waf_rules":[],"secrets":[]}}`
	var wrap exportResponse
	if err := json.Unmarshal([]byte(raw), &wrap); err != nil {
		t.Fatal(err)
	}
	if len(wrap.Data.Cache) != 0 || len(wrap.Data.AccessProfiles) != 0 {
		t.Fatal("expected empty new kinds")
	}
}
