package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bwalia/wslproxy/internal/api"
	"gopkg.in/yaml.v3"
)

type stagingMeta struct {
	BaseURL   string   `yaml:"base_url" json:"base_url"`
	ProfileID string   `yaml:"profile_id" json:"profile_id"`
	PulledAt  string   `yaml:"pulled_at" json:"pulled_at"`
	Resources []string `yaml:"resources" json:"resources"`
}

type pushResult struct {
	Action string `json:"action"` // CREATE|UPDATE|SKIP|FAIL|DRY-CREATE|DRY-UPDATE
	Path   string `json:"path"`
	ID     string `json:"id"`
	Error  string `json:"error,omitempty"`
}

var defaultPullResources = []string{"servers", "rules", "waf_rules", "waf_policies"}

func parseResourceList(s string) []string {
	if strings.TrimSpace(s) == "" {
		return append([]string{}, defaultPullResources...)
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		switch p {
		case "waf":
			out = append(out, "waf_rules", "waf_policies")
		default:
			out = append(out, p)
		}
	}
	return out
}

func pullResources(c *api.Client, cfg Config, dir string, resources []string, filter string) (map[string]any, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	meta := stagingMeta{
		BaseURL:   cfg.BaseURL,
		ProfileID: cfg.ProfileID,
		PulledAt:  time.Now().UTC().Format(time.RFC3339),
		Resources: resources,
	}
	mb, _ := yaml.Marshal(meta)
	if err := os.WriteFile(filepath.Join(dir, "meta.yaml"), mb, 0o644); err != nil {
		return nil, err
	}

	summary := map[string]any{
		"dir":       dir,
		"resources": map[string]int{},
		"files":     []string{},
	}
	files := []string{}

	for _, res := range resources {
		items, err := c.ListResources(res)
		if err != nil {
			return nil, mapAPIError(err)
		}
		resDir := filepath.Join(dir, res, cfg.ProfileID)
		if err := os.MkdirAll(resDir, 0o755); err != nil {
			return nil, err
		}
		count := 0
		for _, it := range items {
			id := api.ResourceID(it)
			if id == "" {
				continue
			}
			name := ""
			var m map[string]any
			_ = json.Unmarshal(it, &m)
			name = firstString(m, "name", "server_name")
			if filter != "" && !matchFilter(filter, id, name, filepath.Join(res, cfg.ProfileID, id+".json")) {
				continue
			}
			path := filepath.Join(resDir, safeFilename(id)+".json")
			if err := writePrettyJSON(path, it); err != nil {
				return nil, err
			}
			files = append(files, path)
			count++
		}
		summary["resources"].(map[string]int)[res] = count
	}
	summary["files"] = files
	summary["total"] = len(files)
	return summary, nil
}

func matchFilter(filter, id, name, relPath string) bool {
	f := strings.TrimSpace(filter)
	if f == "" {
		return true
	}
	// name=prefix* or id=... or glob path
	if strings.HasPrefix(f, "name=") {
		pat := strings.TrimPrefix(f, "name=")
		return globMatch(pat, name)
	}
	if strings.HasPrefix(f, "id=") {
		pat := strings.TrimPrefix(f, "id=")
		return globMatch(pat, id)
	}
	return globMatch(f, relPath) || globMatch(f, id) || globMatch(f, filepath.Base(relPath))
}

func globMatch(pattern, s string) bool {
	ok, err := filepath.Match(pattern, s)
	if err != nil {
		return strings.Contains(s, strings.Trim(pattern, "*"))
	}
	if ok {
		return true
	}
	// also try **/style: contains
	if strings.Contains(pattern, "**") {
		p := strings.ReplaceAll(pattern, "**", "*")
		ok, _ = filepath.Match(p, s)
		return ok || strings.Contains(s, strings.Trim(pattern, "*/"))
	}
	return false
}

func pushDir(c *api.Client, cfg Config, dir string, resources []string, filter string, dryRun, diff, yes, verify, deleteMissing bool) ([]pushResult, error) {
	if !dryRun && !yes && os.Getenv("WSLPROXY_ASSUME_YES") != "1" {
		if looksProd(cfg.BaseURL) {
			return nil, exitf(ExitUsage, "prod-like URL %s requires --yes (or WSLPROXY_ASSUME_YES=1)", cfg.BaseURL)
		}
		return nil, exitf(ExitUsage, "refusing push without --yes or --dry-run")
	}

	var results []pushResult
	for _, res := range resources {
		resDir := filepath.Join(dir, res)
		// support both res/<profile>/*.json and res/*.json
		paths, err := collectJSON(resDir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		for _, path := range paths {
			rel, _ := filepath.Rel(dir, path)
			if filter != "" && !matchFilter(filter, "", "", rel) && !matchFilter(filter, filepath.Base(path), "", rel) {
				// also try id from file
				b, _ := os.ReadFile(path)
				id := api.ResourceID(b)
				name := ""
				var m map[string]any
				_ = json.Unmarshal(b, &m)
				name = firstString(m, "name", "server_name")
				if !matchFilter(filter, id, name, rel) {
					continue
				}
			}
			body, err := readJSONFile(path)
			if err != nil {
				results = append(results, pushResult{Action: "FAIL", Path: path, Error: err.Error()})
				continue
			}
			pr, err := upsertOne(c, res, body, dryRun, diff, yes || dryRun, verify, cfg)
			if err != nil && pr.Action == "" {
				results = append(results, pushResult{Action: "FAIL", Path: path, Error: err.Error()})
				continue
			}
			pr.Path = path
			results = append(results, pr)
		}
	}
	_ = deleteMissing // reserved for later
	return results, nil
}

func collectJSON(root string) ([]string, error) {
	var out []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if strings.HasSuffix(strings.ToLower(info.Name()), ".json") {
			out = append(out, path)
		}
		return nil
	})
	return out, err
}

func readJSONFile(path string) (any, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return nil, err
	}
	return v, nil
}

func upsertOne(c *api.Client, resource string, body any, dryRun, showDiff, yes, verify bool, cfg Config) (pushResult, error) {
	m, ok := body.(map[string]any)
	if !ok {
		return pushResult{Action: "FAIL", Error: "JSON object required"}, exitf(ExitUsage, "JSON object required")
	}
	id := fmt.Sprint(m["id"])
	if id == "" || id == "<nil>" {
		return pushResult{Action: "FAIL", Error: "missing id"}, exitf(ExitUsage, "resource missing id field")
	}
	exists, remote, err := c.ResourceExists(resource, id)
	if err != nil {
		return pushResult{Action: "FAIL", ID: id, Error: err.Error()}, mapAPIError(err)
	}

	action := "CREATE"
	if exists {
		action = "UPDATE"
	}
	if showDiff && exists && remote != nil {
		localB, _ := json.MarshalIndent(body, "", "  ")
		remoteB, _ := json.MarshalIndent(mustAny(remote), "", "  ")
		fmt.Fprintf(os.Stderr, "--- remote %s/%s\n+++ local\n", resource, id)
		fmt.Fprint(os.Stderr, simpleDiff(string(remoteB), string(localB)))
	}

	if dryRun {
		return pushResult{Action: "DRY-" + action, ID: id}, nil
	}
	if !yes && os.Getenv("WSLPROXY_ASSUME_YES") != "1" {
		return pushResult{Action: "SKIP", ID: id, Error: "need --yes"}, nil
	}

	var raw json.RawMessage
	if exists {
		raw, err = c.UpdateResource(resource, id, body)
	} else {
		raw, err = c.CreateResource(resource, body)
	}
	if err != nil {
		return pushResult{Action: "FAIL", ID: id, Error: err.Error()}, mapAPIError(err)
	}
	_ = raw
	pr := pushResult{Action: action, ID: id}
	if verify {
		got, err := c.GetResource(resource, id)
		if err != nil {
			pr.Error = "verify failed: " + err.Error()
			return pr, nil
		}
		localB, _ := json.Marshal(body)
		var localNorm, remoteNorm any
		_ = json.Unmarshal(localB, &localNorm)
		_ = json.Unmarshal(got, &remoteNorm)
		lb, _ := json.Marshal(localNorm)
		rb, _ := json.Marshal(remoteNorm)
		if string(lb) != string(rb) {
			// soft warn — APIs often echo wrappers
			pr.Error = "verify: response differs from local (may be normal)"
		}
	}
	_ = cfg
	return pr, nil
}

func looksProd(base string) bool {
	b := strings.ToLower(base)
	for _, p := range []string{"prod", "pop0", "lon1", "diytaxreturn", "wslproxy.com"} {
		if strings.Contains(b, p) {
			return true
		}
	}
	return false
}

func simpleDiff(a, b string) string {
	al := strings.Split(a, "\n")
	bl := strings.Split(b, "\n")
	var sb strings.Builder
	max := len(al)
	if len(bl) > max {
		max = len(bl)
	}
	limit := max
	if limit > 80 {
		limit = 80
	}
	for i := 0; i < limit; i++ {
		var as, bs string
		if i < len(al) {
			as = al[i]
		}
		if i < len(bl) {
			bs = bl[i]
		}
		if as == bs {
			continue
		}
		if as != "" {
			sb.WriteString("- " + as + "\n")
		}
		if bs != "" {
			sb.WriteString("+ " + bs + "\n")
		}
	}
	if max > limit {
		sb.WriteString(fmt.Sprintf("… (%d more lines)\n", max-limit))
	}
	return sb.String()
}
