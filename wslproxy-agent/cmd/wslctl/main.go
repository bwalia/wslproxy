package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"text/tabwriter"
	"time"

	"github.com/spf13/cobra"
	"github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version"
)

var agentURL string

func main() {
	rootCmd := &cobra.Command{
		Use:   "wslctl",
		Short: "WSLproxy cluster management CLI",
	}

	rootCmd.PersistentFlags().StringVar(&agentURL, "agent-url", envOrDefault("WSLCTL_AGENT_URL", "http://localhost:9090"), "Agent API URL")

	rootCmd.AddCommand(clusterCmd())
	rootCmd.AddCommand(nodeCmd())
	rootCmd.AddCommand(versionCmd())

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func clusterCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "cluster",
		Short: "Cluster operations",
	}

	cmd.AddCommand(&cobra.Command{
		Use:   "status",
		Short: "Show cluster status",
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := apiGet("/api/v1/cluster/status")
			if err != nil {
				return err
			}
			var resp map[string]interface{}
			json.Unmarshal(data, &resp)

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintf(w, "CLUSTER\t%v\n", resp["cluster_name"])
			fmt.Fprintf(w, "REGION\t%v\n", resp["region"])
			fmt.Fprintf(w, "NODES\t%v\n", resp["node_count"])
			fmt.Fprintf(w, "CONFIG VERSION\t%v\n", resp["config_version"])
			fmt.Fprintf(w, "CONFIG IN SYNC\t%v\n", resp["config_in_sync"])
			fmt.Fprintf(w, "IS LEADER\t%v\n", resp["is_leader"])

			if leader, ok := resp["leader"].(map[string]interface{}); ok && leader != nil {
				fmt.Fprintf(w, "LEADER NODE\t%v\n", leader["node_id"])
				fmt.Fprintf(w, "ELECTED AT\t%v\n", leader["elected_at"])
			} else {
				fmt.Fprintf(w, "LEADER NODE\t<none>\n")
			}
			w.Flush()
			return nil
		},
	})

	return cmd
}

func nodeCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "node",
		Short: "Node operations",
	}

	cmd.AddCommand(&cobra.Command{
		Use:   "list",
		Short: "List cluster nodes",
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := apiGet("/api/v1/nodes")
			if err != nil {
				return err
			}
			var resp struct {
				Region string                   `json:"region"`
				Nodes  []map[string]interface{} `json:"nodes"`
				Count  int                      `json:"count"`
			}
			json.Unmarshal(data, &resp)

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintf(w, "NODE ID\tREGION\tSTATUS\tROLE\tCONFIG VER\tLAST HEARTBEAT\n")
			for _, n := range resp.Nodes {
				fmt.Fprintf(w, "%v\t%v\t%v\t%v\t%v\t%v\n",
					n["node_id"], n["region"], n["status"], n["role"],
					n["config_version"], n["last_heartbeat"])
			}
			w.Flush()

			fmt.Printf("\n%d node(s) in region %s\n", resp.Count, resp.Region)
			return nil
		},
	})

	return cmd
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Show version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("wslctl %s (commit: %s, built: %s)\n", version.Version, version.Commit, version.BuildDate)
		},
	}
}

func apiGet(path string) ([]byte, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(agentURL + path)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, body)
	}

	return body, nil
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
