package cli

import "testing"

func TestParseResourceList(t *testing.T) {
	got := parseResourceList("servers,waf")
	if len(got) != 3 || got[1] != "waf_rules" || got[2] != "waf_policies" {
		t.Fatalf("got=%v", got)
	}
}

func TestMatchFilter(t *testing.T) {
	if !matchFilter("name=k3s*", "id1", "k3s1api", "rules/prod/x.json") {
		t.Fatal("name filter")
	}
	if !matchFilter("id=r1*", "r1-abc", "n", "p") {
		t.Fatal("id filter")
	}
	if matchFilter("name=nope", "id", "other", "p") {
		t.Fatal("should not match")
	}
}

func TestLooksProd(t *testing.T) {
	if !looksProd("https://lon1.pop0.uk") {
		t.Fatal("lon1 should look prod")
	}
	if looksProd("http://127.0.0.1:8080") {
		t.Fatal("localhost should not")
	}
}
