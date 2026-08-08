package cli

import (
	"fmt"

	"github.com/spf13/cobra"
)

func newPullCmd() *cobra.Command {
	var dir, resources, filter string
	cmd := &cobra.Command{
		Use:     "pull",
		Aliases: []string{"export"},
		Short:   "Export live config to a local staging directory",
		RunE: func(cmd *cobra.Command, args []string) error {
			if dir == "" {
				return exitf(ExitUsage, "--dir required")
			}
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			res := parseResourceList(resources)
			summary, err := pullResources(c, cfg, dir, res, filter)
			if err != nil {
				return err
			}
			return printOutput(outputFormat(cfg), summary, func() error {
				fmt.Printf("pulled %v files → %s\n", summary["total"], dir)
				for r, n := range summary["resources"].(map[string]int) {
					fmt.Printf("  %s: %d\n", r, n)
				}
				return nil
			})
		},
	}
	cmd.Flags().StringVarP(&dir, "dir", "d", "", "Staging directory")
	cmd.Flags().StringVar(&resources, "resources", "servers,rules,waf_rules,waf_policies", "Comma-separated resources (waf expands)")
	cmd.Flags().StringVar(&filter, "filter", "", "Glob / name= / id= filter")
	return cmd
}
