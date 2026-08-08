package cli

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/bwalia/wslproxy/internal/mcp"
	"github.com/spf13/cobra"
)

func newCheckCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "check",
		Short: "Composite nginx / config / health checks (API-only)",
	}
	cmd.AddCommand(newCheckHealthCmd())
	cmd.AddCommand(newCheckOpenRestyCmd())
	cmd.AddCommand(newCheckConfigCmd())
	cmd.AddCommand(newCheckNginxCmd())
	cmd.AddCommand(newCheckAllCmd())
	return cmd
}

type checkResult struct {
	Name    string `json:"name"`
	OK      bool   `json:"ok"`
	Detail  string `json:"detail,omitempty"`
	Latency int64  `json:"latency_ms,omitempty"`
}

func newCheckHealthCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "health",
		Short: "Healthz + ready",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, cfg, err := newAPIClient(false)
			if err != nil {
				return err
			}
			results := []checkResult{}
			m, code, lat, err := c.Health()
			cr := checkResult{Name: "health", OK: err == nil && code >= 200 && code < 300, Latency: lat.Milliseconds()}
			if err != nil {
				cr.Detail = err.Error()
			} else {
				cr.Detail = fmt.Sprintf("status=%d path=%v", code, m["path"])
			}
			results = append(results, cr)

			rm, rcode, rerr := c.Ready()
			rr := checkResult{Name: "ready", OK: rerr == nil && rcode >= 200 && rcode < 300}
			if rerr != nil {
				rr.Detail = rerr.Error()
			} else {
				_ = rm
				rr.Detail = fmt.Sprintf("status=%d", rcode)
			}
			results = append(results, rr)

			ok := allOK(results)
			out := map[string]any{"base_url": cfg.BaseURL, "ok": ok, "checks": results}
			errOut := printOutput(outputFormat(cfg), out, func() error {
				printCheckTable(cfg.BaseURL, results)
				return nil
			})
			if errOut != nil {
				return errOut
			}
			if !ok {
				return exitf(ExitAPI, "health checks failed")
			}
			return nil
		},
	}
}

func newCheckOpenRestyCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "openresty",
		Short: "GET /api/openresty_status",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			start := time.Now()
			raw, err := c.OpenRestyStatus()
			cr := checkResult{Name: "openresty_status", OK: err == nil, Latency: time.Since(start).Milliseconds()}
			if err != nil {
				cr.Detail = err.Error()
			} else {
				cr.Detail = truncateStr(string(raw), 120)
			}
			results := []checkResult{cr}
			out := map[string]any{"base_url": cfg.BaseURL, "ok": cr.OK, "checks": results, "body": json.RawMessage(raw)}
			if e := printOutput(outputFormat(cfg), out, func() error {
				printCheckTable(cfg.BaseURL, results)
				return nil
			}); e != nil {
				return e
			}
			if !cr.OK {
				return mapAPIError(err)
			}
			return nil
		},
	}
}

func newCheckConfigCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "config",
		Short: "MCP validate_config (or report unavailable)",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, cfg, err := newAPIClient(false)
			if err != nil {
				return err
			}
			if cfg.MCP.APIKey != "" {
				c.SetMCPAPIKey(cfg.MCP.APIKey)
			} else if cfg.Auth.Token != "" {
				// Bearer also accepted by MCP auth
			}
			mc := mcp.New(c)
			start := time.Now()
			raw, err := mc.ValidateConfig()
			cr := checkResult{Name: "validate_config", OK: err == nil, Latency: time.Since(start).Milliseconds()}
			valid := true
			if err != nil {
				cr.Detail = err.Error()
				valid = false
			} else {
				cr.Detail = truncateStr(string(raw), 160)
				var probe map[string]any
				if json.Unmarshal(raw, &probe) == nil {
					if v, ok := probe["valid"]; ok {
						switch t := v.(type) {
						case bool:
							valid = t
						case string:
							valid = strings.EqualFold(t, "true") || t == "ok"
						}
					}
					if v, ok := probe["ok"]; ok {
						if b, ok2 := v.(bool); ok2 {
							valid = b
						}
					}
					if v, ok := probe["success"]; ok {
						if b, ok2 := v.(bool); ok2 {
							valid = b
						}
					}
				}
				cr.OK = valid
			}
			results := []checkResult{cr}
			out := map[string]any{"base_url": cfg.BaseURL, "ok": cr.OK, "checks": results, "result": json.RawMessage(raw)}
			if e := printOutput(outputFormat(cfg), out, func() error {
				printCheckTable(cfg.BaseURL, results)
				return nil
			}); e != nil {
				return e
			}
			if !cr.OK {
				return exitf(ExitValidate, "config validation failed")
			}
			return nil
		},
	}
}

func newCheckNginxCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "nginx",
		Short: "Bundle: health + openresty_status + validate_config",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runNginxCheck(effectiveConfig().BaseURL)
		},
	}
}

func runNginxCheck(baseURL string) error {
	// temporarily override base url via flag if needed
	if baseURL != "" {
		flagBaseURL = baseURL
	}
	c, cfg, err := newAPIClient(false)
	if err != nil {
		return err
	}
	results := []checkResult{}

	m, code, lat, err := c.Health()
	cr := checkResult{Name: "health", OK: err == nil && code >= 200 && code < 300, Latency: lat.Milliseconds()}
	if err != nil {
		cr.Detail = err.Error()
	} else {
		cr.Detail = fmt.Sprintf("status=%d", code)
		_ = m
	}
	results = append(results, cr)

	if cfg.Auth.Token != "" {
		start := time.Now()
		raw, err := c.OpenRestyStatus()
		or := checkResult{Name: "openresty_status", OK: err == nil, Latency: time.Since(start).Milliseconds()}
		if err != nil {
			or.Detail = err.Error()
		} else {
			or.Detail = "ok"
			_ = raw
		}
		results = append(results, or)
	} else {
		results = append(results, checkResult{Name: "openresty_status", OK: true, Detail: "skipped (no token)"})
	}

	mc := mcp.New(c)
	start := time.Now()
	raw, err := mc.ValidateConfig()
	vc := checkResult{Name: "validate_config", Latency: time.Since(start).Milliseconds()}
	if err != nil {
		// MCP may be disabled — treat as soft fail detail but don't fail nginx check hard if health ok
		vc.OK = false
		vc.Detail = "unavailable: " + err.Error()
	} else {
		vc.OK = true
		vc.Detail = truncateStr(string(raw), 120)
		var probe map[string]any
		if json.Unmarshal(raw, &probe) == nil {
			if v, ok := probe["valid"].(bool); ok {
				vc.OK = v
			}
		}
	}
	results = append(results, vc)

	// nginx check passes if health ok; validate_config failure → ExitValidate
	healthOK := results[0].OK
	configFail := false
	for _, r := range results {
		if r.Name == "validate_config" && !r.OK && !strings.HasPrefix(r.Detail, "unavailable") {
			configFail = true
		}
	}
	out := map[string]any{"base_url": cfg.BaseURL, "ok": healthOK && !configFail, "checks": results}
	if e := printOutput(outputFormat(cfg), out, func() error {
		printCheckTable(cfg.BaseURL, results)
		return nil
	}); e != nil {
		return e
	}
	if !healthOK {
		return exitf(ExitAPI, "nginx check failed: health")
	}
	if configFail {
		return exitf(ExitValidate, "nginx check failed: config invalid")
	}
	return nil
}

func newCheckAllCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "all",
		Short: "Fan-out check nginx across inventory",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := effectiveConfig()
			targets := cfg.Inventory
			if flagInventory != "" {
				list, err := loadInventoryFile(flagInventory)
				if err != nil {
					return exitf(ExitUsage, "%v", err)
				}
				targets = list
			}
			if len(targets) == 0 {
				// single target
				return runNginxCheck(cfg.BaseURL)
			}
			type hostResult struct {
				Name    string        `json:"name"`
				BaseURL string        `json:"base_url"`
				OK      bool          `json:"ok"`
				Error   string        `json:"error,omitempty"`
				Checks  []checkResult `json:"checks,omitempty"`
			}
			var hosts []hostResult
			failCount := 0
			for _, t := range targets {
				flagBaseURL = t.BaseURL
				if t.ProfileID != "" {
					flagProfileID = t.ProfileID
				}
				err := runNginxCheck(t.BaseURL)
				hr := hostResult{Name: t.Name, BaseURL: t.BaseURL, OK: err == nil}
				if err != nil {
					hr.Error = err.Error()
					failCount++
				}
				hosts = append(hosts, hr)
			}
			out := map[string]any{"ok": failCount == 0, "hosts": hosts, "failed": failCount}
			if e := printOutput(outputFormat(cfg), out, func() error {
				rows := [][]string{}
				for _, h := range hosts {
					st := "OK"
					if !h.OK {
						st = "FAIL"
					}
					rows = append(rows, []string{h.Name, h.BaseURL, st, h.Error})
				}
				printKVTable([]string{"NAME", "BASE_URL", "STATUS", "ERROR"}, rows)
				return nil
			}); e != nil {
				return e
			}
			if failCount > 0 {
				return exitf(ExitPartial, "%d/%d hosts failed", failCount, len(hosts))
			}
			return nil
		},
	}
}

func allOK(rs []checkResult) bool {
	for _, r := range rs {
		if !r.OK {
			return false
		}
	}
	return true
}

func printCheckTable(base string, rs []checkResult) {
	fmt.Printf("target: %s\n", base)
	rows := make([][]string, 0, len(rs))
	for _, r := range rs {
		st := "OK"
		if !r.OK {
			st = "FAIL"
		}
		rows = append(rows, []string{r.Name, st, fmt.Sprintf("%dms", r.Latency), r.Detail})
	}
	printKVTable([]string{"CHECK", "STATUS", "LATENCY", "DETAIL"}, rows)
}

func truncateStr(s string, n int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
