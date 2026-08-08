package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/bwalia/wslproxy/internal/api"
	"github.com/spf13/cobra"
)

func addResourceCRUD(parent *cobra.Command, resource, singular string) {
	parent.AddCommand(resourceListCmd(resource, singular))
	parent.AddCommand(resourceGetCmd(resource, singular))
	parent.AddCommand(resourceCreateCmd(resource, singular))
	parent.AddCommand(resourceUpdateCmd(resource, singular))
	parent.AddCommand(resourceDeleteCmd(resource, singular))
	parent.AddCommand(resourceExportCmd(resource, singular))
	parent.AddCommand(resourceApplyCmd(resource, singular))
}

func resourceListCmd(resource, singular string) *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List " + resource,
		RunE: func(cmd *cobra.Command, args []string) error {
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			items, err := c.ListResources(resource)
			if err != nil {
				return mapAPIError(err)
			}
			summaries := make([]map[string]any, 0, len(items))
			rows := [][]string{}
			for _, it := range items {
				var m map[string]any
				_ = json.Unmarshal(it, &m)
				id := fmt.Sprint(m["id"])
				name := firstString(m, "name", "server_name", "id")
				summaries = append(summaries, map[string]any{"id": id, "name": name})
				rows = append(rows, []string{id, name})
			}
			out := map[string]any{"total": len(items), "data": summaries}
			if outputFormat(cfg) == "json" {
				// full payloads for scripting
				var full []any
				for _, it := range items {
					var v any
					_ = json.Unmarshal(it, &v)
					full = append(full, v)
				}
				return printJSON(map[string]any{"total": len(items), "data": full})
			}
			return printOutput(outputFormat(cfg), out, func() error {
				printKVTable([]string{"ID", "NAME"}, rows)
				return nil
			})
		},
	}
}

func resourceGetCmd(resource, singular string) *cobra.Command {
	var id string
	cmd := &cobra.Command{
		Use:   "get",
		Short: "Get one " + singular,
		RunE: func(cmd *cobra.Command, args []string) error {
			if id == "" && len(args) > 0 {
				id = args[0]
			}
			if id == "" {
				return exitf(ExitUsage, "--id required")
			}
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			raw, err := c.GetResource(resource, id)
			if err != nil {
				return mapAPIError(err)
			}
			if outputFormat(cfg) == "json" || outputFormat(cfg) == "yaml" {
				return printOutput(outputFormat(cfg), mustAny(raw), nil)
			}
			return printResourceJSON(raw)
		},
	}
	cmd.Flags().StringVar(&id, "id", "", "Resource id")
	return cmd
}

func resourceCreateCmd(resource, singular string) *cobra.Command {
	var file string
	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create " + singular + " from JSON file or stdin",
		RunE: func(cmd *cobra.Command, args []string) error {
			body, err := readJSONInput(file)
			if err != nil {
				return err
			}
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			raw, err := c.CreateResource(resource, body)
			if err != nil {
				return mapAPIError(err)
			}
			return printOutput(outputFormat(cfg), mustAny(raw), func() error {
				fmt.Printf("CREATED %s\n", resource)
				return printResourceJSON(raw)
			})
		},
	}
	cmd.Flags().StringVarP(&file, "file", "f", "", "JSON file (or - for stdin)")
	return cmd
}

func resourceUpdateCmd(resource, singular string) *cobra.Command {
	var id, file string
	cmd := &cobra.Command{
		Use:   "update",
		Short: "Update " + singular,
		RunE: func(cmd *cobra.Command, args []string) error {
			body, err := readJSONInput(file)
			if err != nil {
				return err
			}
			if id == "" {
				if m, ok := body.(map[string]any); ok {
					id = fmt.Sprint(m["id"])
				}
			}
			if id == "" || id == "<nil>" {
				return exitf(ExitUsage, "--id required (or id in JSON body)")
			}
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			raw, err := c.UpdateResource(resource, id, body)
			if err != nil {
				return mapAPIError(err)
			}
			return printOutput(outputFormat(cfg), mustAny(raw), func() error {
				fmt.Printf("UPDATED %s %s\n", resource, id)
				return nil
			})
		},
	}
	cmd.Flags().StringVar(&id, "id", "", "Resource id")
	cmd.Flags().StringVarP(&file, "file", "f", "", "JSON file (or - for stdin)")
	return cmd
}

func resourceDeleteCmd(resource, singular string) *cobra.Command {
	var id string
	var yes bool
	cmd := &cobra.Command{
		Use:   "delete",
		Short: "Delete " + singular,
		RunE: func(cmd *cobra.Command, args []string) error {
			if id == "" && len(args) > 0 {
				id = args[0]
			}
			if id == "" {
				return exitf(ExitUsage, "--id required")
			}
			if !yes && os.Getenv("WSLPROXY_ASSUME_YES") != "1" {
				return exitf(ExitUsage, "refusing delete without --yes")
			}
			c, _, err := newAPIClient(true)
			if err != nil {
				return err
			}
			if err := c.DeleteResource(resource, id); err != nil {
				return mapAPIError(err)
			}
			fmt.Printf("DELETED %s %s\n", resource, id)
			return nil
		},
	}
	cmd.Flags().StringVar(&id, "id", "", "Resource id")
	cmd.Flags().BoolVar(&yes, "yes", false, "Confirm delete")
	return cmd
}

func resourceExportCmd(resource, singular string) *cobra.Command {
	var id, outPath string
	cmd := &cobra.Command{
		Use:   "export",
		Short: "Export " + singular + " JSON to file or stdout",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			if id != "" {
				raw, err := c.GetResource(resource, id)
				if err != nil {
					return mapAPIError(err)
				}
				return writePrettyJSON(outPath, raw)
			}
			items, err := c.ListResources(resource)
			if err != nil {
				return mapAPIError(err)
			}
			if outPath == "" {
				var arr []any
				for _, it := range items {
					arr = append(arr, mustAny(it))
				}
				return printJSON(arr)
			}
			dir := outPath
			_ = os.MkdirAll(filepath.Join(dir, resource, cfg.ProfileID), 0o755)
			for _, it := range items {
				rid := api.ResourceID(it)
				if rid == "" {
					continue
				}
				path := filepath.Join(dir, resource, cfg.ProfileID, safeFilename(rid)+".json")
				if err := writePrettyJSON(path, it); err != nil {
					return err
				}
				fmt.Println(path)
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&id, "id", "", "Export single id (omit to export all)")
	cmd.Flags().StringVarP(&outPath, "out", "O", "", "Output file or directory")
	return cmd
}

func resourceApplyCmd(resource, singular string) *cobra.Command {
	var file string
	var yes, dryRun, diff, verify bool
	cmd := &cobra.Command{
		Use:   "apply",
		Short: "Upsert " + singular + " from JSON file",
		RunE: func(cmd *cobra.Command, args []string) error {
			body, err := readJSONInput(file)
			if err != nil {
				return err
			}
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			res, err := upsertOne(c, resource, body, dryRun, diff, yes, verify, cfg)
			if err != nil {
				return err
			}
			return printOutput(outputFormat(cfg), res, func() error {
				fmt.Printf("%s %s → %s\n", res.Action, res.Path, res.ID)
				return nil
			})
		},
	}
	cmd.Flags().StringVarP(&file, "file", "f", "", "JSON file (or -)")
	cmd.Flags().BoolVar(&yes, "yes", false, "Apply changes")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Show plan only")
	cmd.Flags().BoolVar(&diff, "diff", false, "Show unify diff vs remote")
	cmd.Flags().BoolVar(&verify, "verify", false, "Re-GET after apply")
	return cmd
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			s := fmt.Sprint(v)
			if s != "" && s != "<nil>" {
				return s
			}
		}
	}
	return ""
}

func mustAny(raw json.RawMessage) any {
	var v any
	_ = json.Unmarshal(raw, &v)
	return v
}

func readJSONInput(file string) (any, error) {
	var b []byte
	var err error
	switch {
	case file == "" || file == "-":
		if file == "" {
			stat, _ := os.Stdin.Stat()
			if stat == nil || (stat.Mode()&os.ModeCharDevice) != 0 {
				return nil, exitf(ExitUsage, "-f file.json required (or - for stdin)")
			}
		}
		b, err = io.ReadAll(os.Stdin)
	default:
		b, err = os.ReadFile(file)
	}
	if err != nil {
		return nil, exitf(ExitUsage, "read input: %v", err)
	}
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return nil, exitf(ExitUsage, "invalid JSON: %v", err)
	}
	return v, nil
}

func writePrettyJSON(path string, raw json.RawMessage) error {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	if path == "" || path == "-" {
		_, err = os.Stdout.Write(b)
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

func safeFilename(id string) string {
	return strings.ReplaceAll(id, "/", "_")
}

func newServerCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "server", Aliases: []string{"servers"}, Short: "Manage virtual servers"}
	addResourceCRUD(cmd, "servers", "server")
	return cmd
}

func newRuleCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "rule", Aliases: []string{"rules"}, Short: "Manage rules / routes"}
	addResourceCRUD(cmd, "rules", "rule")
	var serverID, ruleID string
	attach := &cobra.Command{
		Use:   "attach",
		Short: "Attach a rule to a server (updates server.rules / match_cases best-effort)",
		RunE: func(cmd *cobra.Command, args []string) error {
			if serverID == "" || ruleID == "" {
				return exitf(ExitUsage, "--server and --rule required")
			}
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			raw, err := c.GetResource("servers", serverID)
			if err != nil {
				return mapAPIError(err)
			}
			var srv map[string]any
			if err := json.Unmarshal(raw, &srv); err != nil {
				return err
			}
			// append rule id if not present
			switch r := srv["rules"].(type) {
			case nil:
				srv["rules"] = []any{ruleID}
			case string:
				if r != ruleID {
					srv["rules"] = []any{r, ruleID}
				}
			case []any:
				found := false
				for _, x := range r {
					if fmt.Sprint(x) == ruleID {
						found = true
						break
					}
				}
				if !found {
					srv["rules"] = append(r, ruleID)
				}
			}
			if _, err := c.UpdateResource("servers", serverID, srv); err != nil {
				return mapAPIError(err)
			}
			fmt.Printf("ATTACHED rule %s → server %s\n", ruleID, serverID)
			_ = cfg
			return nil
		},
	}
	attach.Flags().StringVar(&serverID, "server", "", "Server id (host:...)")
	attach.Flags().StringVar(&ruleID, "rule", "", "Rule uuid")
	cmd.AddCommand(attach)
	return cmd
}

func newWAFCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "waf", Short: "WAF rules, policies, events"}
	rules := &cobra.Command{Use: "rules", Short: "WAF detection rules"}
	addResourceCRUD(rules, "waf_rules", "waf rule")
	policies := &cobra.Command{Use: "policies", Short: "WAF policies"}
	addResourceCRUD(policies, "waf_policies", "waf policy")
	events := &cobra.Command{Use: "events", Short: "WAF events"}
	events.AddCommand(resourceListCmd("waf_events", "waf event"))
	events.AddCommand(resourceGetCmd("waf_events", "waf event"))
	cmd.AddCommand(rules, policies, events)
	return cmd
}
