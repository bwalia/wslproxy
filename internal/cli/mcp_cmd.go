package cli

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/bwalia/wslproxy/internal/mcp"
	"github.com/spf13/cobra"
)

func newMCPCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "mcp",
		Short: "MCP HTTP client (manifest, tools, resources, call)",
	}
	cmd.AddCommand(&cobra.Command{
		Use:   "manifest",
		Short: "GET /mcp/manifest",
		RunE:  mcpFetch(func(m *mcp.Client) (json.RawMessage, error) { return m.Manifest() }),
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "capabilities",
		Short: "GET /mcp/capabilities",
		RunE:  mcpFetch(func(m *mcp.Client) (json.RawMessage, error) { return m.Capabilities() }),
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "tools",
		Short: "List MCP tools",
		RunE:  mcpFetch(func(m *mcp.Client) (json.RawMessage, error) { return m.Tools() }),
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "resources",
		Short: "List MCP resources",
		RunE:  mcpFetch(func(m *mcp.Client) (json.RawMessage, error) { return m.Resources() }),
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "schemas",
		Short: "List MCP schemas",
		RunE:  mcpFetch(func(m *mcp.Client) (json.RawMessage, error) { return m.Schemas() }),
	})

	var resourceID string
	resCmd := &cobra.Command{
		Use:   "resource [id]",
		Short: "GET /mcp/resources/{id}",
		RunE: func(cmd *cobra.Command, args []string) error {
			if resourceID == "" && len(args) > 0 {
				resourceID = args[0]
			}
			if resourceID == "" {
				return exitf(ExitUsage, "resource id required")
			}
			c, cfg, err := newAPIClient(false)
			if err != nil {
				return err
			}
			m := mcp.New(c)
			raw, err := m.Resource(resourceID)
			if err != nil {
				return mapAPIError(err)
			}
			return printOutput(outputFormat(cfg), mustAny(raw), func() error {
				return printResourceJSON(raw)
			})
		},
	}
	resCmd.Flags().StringVar(&resourceID, "id", "", "Resource id")
	cmd.AddCommand(resCmd)

	var argsJSON string
	var yes bool
	call := &cobra.Command{
		Use:   "call [tool]",
		Short: "Call MCP tool via JSON-RPC tools/call",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			tool := args[0]
			writeTools := map[string]bool{
				"reload_config": true, "bind_waf_policy": true, "unbind_waf_policy": true,
				"update_traffic_split": true, "promote_backend": true, "rollback_backend": true,
				"deploy_varnish": true, "purge_varnish": true, "create_server": true, "create_rule": true,
				"attach_rule": true, "update_server": true, "update_rule": true, "delete_server": true,
				"delete_rule": true, "create_pop": true, "update_pop": true, "delete_pop": true,
				"provision_dns": true,
			}
			cfg := effectiveConfig()
			if writeTools[tool] && !cfg.MCP.Write && !yes {
				return exitf(ExitUsage, "tool %s is write — pass --write or --yes", tool)
			}
			c, _, err := newAPIClient(false)
			if err != nil {
				return err
			}
			var toolArgs map[string]any
			if strings.TrimSpace(argsJSON) == "" {
				toolArgs = map[string]any{}
			} else {
				if err := json.Unmarshal([]byte(argsJSON), &toolArgs); err != nil {
					return exitf(ExitUsage, "invalid --args JSON: %v", err)
				}
			}
			m := mcp.New(c)
			raw, err := m.CallTool(tool, toolArgs)
			if err != nil {
				return mapAPIError(err)
			}
			return printOutput(outputFormat(cfg), mustAny(raw), func() error {
				fmt.Printf("mcp call %s\n", tool)
				return printResourceJSON(raw)
			})
		},
	}
	call.Flags().StringVar(&argsJSON, "args", "{}", "Tool arguments JSON object")
	call.Flags().BoolVar(&yes, "yes", false, "Confirm write tool")
	cmd.AddCommand(call)

	return cmd
}

func mcpFetch(fn func(*mcp.Client) (json.RawMessage, error)) func(*cobra.Command, []string) error {
	return func(cmd *cobra.Command, args []string) error {
		c, cfg, err := newAPIClient(false)
		if err != nil {
			return err
		}
		m := mcp.New(c)
		raw, err := fn(m)
		if err != nil {
			return mapAPIError(err)
		}
		return printOutput(outputFormat(cfg), mustAny(raw), func() error {
			return printResourceJSON(raw)
		})
	}
}
