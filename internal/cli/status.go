package cli

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
)

func newStatusCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Instance health / OpenResty status",
	}
	cmd.AddCommand(newStatusHealthCmd())
	cmd.AddCommand(newStatusReadyCmd())
	cmd.AddCommand(newStatusOpenRestyCmd())
	return cmd
}

func newStatusHealthCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "health",
		Short: "GET /healthz (or /health)",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, cfg, err := newAPIClient(false)
			if err != nil {
				return err
			}
			m, code, lat, err := c.Health()
			if err != nil {
				return mapAPIError(err)
			}
			m["http_status"] = code
			m["base_url"] = cfg.BaseURL
			ok := code >= 200 && code < 300
			return printOutput(outputFormat(cfg), m, func() error {
				fmt.Printf("health %s  status=%d  latency=%dms\n", cfg.BaseURL, code, lat.Milliseconds())
				if !ok {
					return exitf(ExitAPI, "health check failed")
				}
				return nil
			})
		},
	}
}

func newStatusReadyCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "ready",
		Short: "GET /ready",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, cfg, err := newAPIClient(false)
			if err != nil {
				return err
			}
			m, code, err := c.Ready()
			if err != nil && code == 0 {
				return mapAPIError(err)
			}
			out := map[string]any{"http_status": code, "body": m, "base_url": cfg.BaseURL}
			return printOutput(outputFormat(cfg), out, func() error {
				fmt.Printf("ready %s  status=%d\n", cfg.BaseURL, code)
				if code < 200 || code >= 300 {
					return exitf(ExitAPI, "ready check failed")
				}
				return nil
			})
		},
	}
}

func newStatusOpenRestyCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "openresty",
		Short: "GET /api/openresty_status",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			raw, err := c.OpenRestyStatus()
			if err != nil {
				return mapAPIError(err)
			}
			var v any
			_ = json.Unmarshal(raw, &v)
			return printOutput(outputFormat(cfg), v, func() error {
				return printResourceJSON(raw)
			})
		},
	}
}
