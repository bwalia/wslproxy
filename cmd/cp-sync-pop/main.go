// Command cp-sync-pop fetches a POP-filtered config bundle from the control
// plane (cp.pop0.uk) and writes it into the repo data/ tree (servers, rules,
// waf_*, secrets). CP is the source of truth; this tool only pulls.
//
//	CP_TOKEN=… go run ./cmd/cp-sync-pop -pop lon1 -env prod -cp-url https://cp.pop0.uk
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func main() {
	var (
		cpURL   = flag.String("cp-url", envOr("CP_URL", "https://cp.pop0.uk"), "Control plane base URL")
		token   = flag.String("token", envOr("CP_TOKEN", ""), "Bearer JWT for CP admin API")
		popID   = flag.String("pop", "", "POP id (required), e.g. lon1")
		envName = flag.String("env", "prod", "env_profile / data/<env>/ directory")
		dataDir = flag.String("data-dir", "data", "Repo data directory root")
		dryRun  = flag.Bool("dry-run", false, "Print plan only; do not write files")
		timeout = flag.Duration("timeout", 60*time.Second, "HTTP timeout")
	)
	flag.Parse()
	if strings.TrimSpace(*popID) == "" {
		fatalf("-pop is required")
	}
	if strings.TrimSpace(*token) == "" {
		fatalf("-token or CP_TOKEN is required")
	}

	bundle, err := fetchExport(strings.TrimRight(*cpURL, "/"), *token, *popID, *envName, *timeout)
	if err != nil {
		fatalf("fetch export: %v", err)
	}
	if bundle.Manifest.PopID != "" && bundle.Manifest.PopID != *popID {
		fatalf("manifest pop_id %q != requested %q", bundle.Manifest.PopID, *popID)
	}

	summary, err := applyBundle(*dataDir, *envName, *popID, bundle, *dryRun)
	if err != nil {
		fatalf("apply: %v", err)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(summary)
	if *dryRun {
		fmt.Fprintln(os.Stderr, "dry-run: no files written")
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "cp-sync-pop: "+format+"\n", args...)
	os.Exit(1)
}

type exportResponse struct {
	Data bundle `json:"data"`
}

// recordList accepts JSON [] or {} (Lua cjson empty-table quirk) or a
// map keyed by id. Live CP may still emit {} until api/ is redeployed.
type recordList []map[string]any

func (r *recordList) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) == 0 || string(b) == "null" {
		*r = nil
		return nil
	}
	switch b[0] {
	case '[':
		var arr []map[string]any
		if err := json.Unmarshal(b, &arr); err != nil {
			return err
		}
		*r = arr
		return nil
	case '{':
		if string(b) == "{}" {
			*r = nil
			return nil
		}
		var asMaps map[string]map[string]any
		if err := json.Unmarshal(b, &asMaps); err == nil {
			out := make([]map[string]any, 0, len(asMaps))
			for _, v := range asMaps {
				out = append(out, v)
			}
			*r = out
			return nil
		}
		var asAny map[string]any
		if err := json.Unmarshal(b, &asAny); err != nil {
			return err
		}
		out := make([]map[string]any, 0, len(asAny))
		for _, v := range asAny {
			if rec, ok := v.(map[string]any); ok {
				out = append(out, rec)
			}
		}
		*r = out
		return nil
	default:
		return fmt.Errorf("recordList: expected array or object, got %s", truncate(string(b), 40))
	}
}

type bundle struct {
	Manifest    manifest   `json:"manifest"`
	Servers     recordList `json:"servers"`
	Rules       recordList `json:"rules"`
	WafPolicies recordList `json:"waf_policies"`
	WafRules    recordList `json:"waf_rules"`
	Secrets     recordList `json:"secrets"`
}

type manifest struct {
	PopID          string         `json:"pop_id"`
	EnvProfile     string         `json:"env_profile"`
	ExportID       string         `json:"export_id"`
	ContentSHA256  string         `json:"content_sha256"`
	SourceHost     string         `json:"source_host"`
	ExportedAt     string         `json:"exported_at"`
	RecordCounts   map[string]int `json:"record_counts"`
}

type applySummary struct {
	PopID      string         `json:"pop_id"`
	Env        string         `json:"env"`
	ExportID   string         `json:"export_id"`
	DryRun     bool           `json:"dry_run"`
	Written    map[string]int `json:"written"`
	Removed    map[string]int `json:"removed"`
	Skipped    map[string]int `json:"skipped_unchanged"`
}

func fetchExport(cpURL, token, popID, env string, timeout time.Duration) (*bundle, error) {
	u, err := url.Parse(cpURL + "/api/configuration/export")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("pop_id", popID)
	q.Set("env", env)
	u.RawQuery = q.Encode()

	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "wslproxy-cp-sync-pop/1.0")

	client := &http.Client{Timeout: timeout}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 64<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", res.StatusCode, truncate(string(body), 500))
	}
	var wrap exportResponse
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &wrap.Data, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func applyBundle(dataDir, env, popID string, b *bundle, dryRun bool) (*applySummary, error) {
	sum := &applySummary{
		PopID:    popID,
		Env:      env,
		ExportID: b.Manifest.ExportID,
		DryRun:   dryRun,
		Written:  map[string]int{},
		Removed:  map[string]int{},
		Skipped:  map[string]int{},
	}

	kinds := []struct {
		name string
		recs []map[string]any
	}{
		{"servers", b.Servers},
		{"rules", b.Rules},
		{"waf_policies", b.WafPolicies},
		{"waf_rules", b.WafRules},
		{"secrets", b.Secrets},
	}

	keepIDs := map[string]map[string]struct{}{}
	for _, k := range kinds {
		keepIDs[k.name] = map[string]struct{}{}
		for _, rec := range k.recs {
			id, _ := rec["id"].(string)
			if id == "" {
				continue
			}
			keepIDs[k.name][id] = struct{}{}
			path := recordPath(dataDir, k.name, env, id)
			changed, err := writeRecord(path, rec, dryRun)
			if err != nil {
				return nil, fmt.Errorf("write %s: %w", path, err)
			}
			if changed {
				sum.Written[k.name]++
			} else {
				sum.Skipped[k.name]++
			}
		}
	}

	// Remove local servers tagged with this POP that are no longer exported.
	removed, err := prunePOPServers(dataDir, env, popID, keepIDs["servers"], dryRun)
	if err != nil {
		return nil, err
	}
	sum.Removed["servers"] = removed

	// Prune orphan rules/waf/secrets that were only referenced by removed
	// POP-owned servers is left for a later pass — shared rules stay.
	return sum, nil
}

func recordPath(dataDir, kind, env, id string) string {
	safe := sanitizeID(id)
	return filepath.Join(dataDir, kind, env, safe+".json")
}

func sanitizeID(id string) string {
	var b strings.Builder
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '.', r == '_', r == '-', r == ':', r == '@':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	return b.String()
}

func writeRecord(path string, rec map[string]any, dryRun bool) (changed bool, err error) {
	newBytes, err := json.MarshalIndent(rec, "", "    ")
	if err != nil {
		return false, err
	}
	newBytes = append(newBytes, '\n')

	if old, err := os.ReadFile(path); err == nil {
		if bytes.Equal(normalizeJSON(old), normalizeJSON(newBytes)) {
			return false, nil
		}
	}
	if dryRun {
		return true, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return false, err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, newBytes, 0o644); err != nil {
		return false, err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return false, err
	}
	return true, nil
}

func normalizeJSON(b []byte) []byte {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return b
	}
	out, err := json.Marshal(v)
	if err != nil {
		return b
	}
	return out
}

func prunePOPServers(dataDir, env, popID string, keep map[string]struct{}, dryRun bool) (int, error) {
	dir := filepath.Join(dataDir, "servers", env)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	removed := 0
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		path := filepath.Join(dir, name)
		raw, err := os.ReadFile(path)
		if err != nil {
			return removed, err
		}
		var rec map[string]any
		if err := json.Unmarshal(raw, &rec); err != nil {
			continue
		}
		id, _ := rec["id"].(string)
		if id == "" {
			continue
		}
		if !popIDsContain(rec["pop_ids"], popID) {
			continue
		}
		if _, ok := keep[id]; ok {
			continue
		}
		if dryRun {
			removed++
			continue
		}
		if err := os.Remove(path); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

func popIDsContain(v any, popID string) bool {
	switch t := v.(type) {
	case []any:
		for _, x := range t {
			if s, ok := x.(string); ok && s == popID {
				return true
			}
		}
	case []string:
		for _, s := range t {
			if s == popID {
				return true
			}
		}
	case map[string]any:
		if _, ok := t[popID]; ok {
			return true
		}
		for _, x := range t {
			if s, ok := x.(string); ok && s == popID {
				return true
			}
		}
	}
	return false
}
