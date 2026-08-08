package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

func newPushCmd() *cobra.Command {
	var dir, resources, filter string
	var dryRun, diff, yes, verify, deleteMissing bool
	cmd := &cobra.Command{
		Use:     "push",
		Aliases: []string{"import"},
		Short:   "Apply local staging directory to remote API",
		RunE: func(cmd *cobra.Command, args []string) error {
			if dir == "" {
				return exitf(ExitUsage, "--dir required")
			}
			if _, err := os.Stat(dir); err != nil {
				return exitf(ExitUsage, "dir: %v", err)
			}
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			res := parseResourceList(resources)
			results, err := pushDir(c, cfg, dir, res, filter, dryRun, diff, yes, verify, deleteMissing)
			if err != nil {
				return err
			}
			created, updated, failed, skipped := []pushResult{}, []pushResult{}, []pushResult{}, []pushResult{}
			for _, r := range results {
				switch r.Action {
				case "CREATE", "DRY-CREATE":
					created = append(created, r)
				case "UPDATE", "DRY-UPDATE":
					updated = append(updated, r)
				case "FAIL":
					failed = append(failed, r)
				default:
					skipped = append(skipped, r)
				}
			}
			out := map[string]any{
				"created": created,
				"updated": updated,
				"failed":  failed,
				"skipped": skipped,
				"total":   len(results),
			}
			errPrint := printOutput(outputFormat(cfg), out, func() error {
				rows := [][]string{}
				for _, r := range results {
					rows = append(rows, []string{r.Action, r.ID, r.Path, r.Error})
				}
				printKVTable([]string{"ACTION", "ID", "PATH", "ERROR"}, rows)
				return nil
			})
			if errPrint != nil {
				return errPrint
			}
			if len(failed) > 0 {
				return exitf(ExitAPI, "%d push operation(s) failed", len(failed))
			}
			return nil
		},
	}
	cmd.Flags().StringVarP(&dir, "dir", "d", "", "Staging directory")
	cmd.Flags().StringVar(&resources, "resources", "servers,rules,waf_rules,waf_policies", "Resources to push")
	cmd.Flags().StringVar(&filter, "filter", "", "Glob / name= / id= filter")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Plan only")
	cmd.Flags().BoolVar(&diff, "diff", false, "Show diff vs remote")
	cmd.Flags().BoolVar(&yes, "yes", false, "Apply writes")
	cmd.Flags().BoolVar(&verify, "verify", false, "Re-GET after each upsert")
	cmd.Flags().BoolVar(&deleteMissing, "delete-missing", false, "Delete remote absents (requires --yes)")
	return cmd
}

func newApplyCmd() *cobra.Command {
	var file, resource string
	var yes, dryRun, diff, verify bool
	cmd := &cobra.Command{
		Use:   "apply",
		Short: "Upsert a single JSON file (or stdin)",
		RunE: func(cmd *cobra.Command, args []string) error {
			if resource == "" {
				return exitf(ExitUsage, "--resource required (servers|rules|waf_rules|waf_policies)")
			}
			body, err := readJSONInput(file)
			if err != nil {
				return err
			}
			c, cfg, err := newAPIClient(true)
			if err != nil {
				return err
			}
			if !dryRun && !yes && os.Getenv("WSLPROXY_ASSUME_YES") != "1" {
				return exitf(ExitUsage, "refusing apply without --yes or --dry-run")
			}
			res, err := upsertOne(c, resource, body, dryRun, diff, yes || dryRun, verify, cfg)
			if err != nil && res.Action == "FAIL" {
				return err
			}
			res.Path = file
			return printOutput(outputFormat(cfg), res, func() error {
				fmt.Printf("%s %s\n", res.Action, res.ID)
				if res.Error != "" {
					fmt.Println(res.Error)
				}
				return nil
			})
		},
	}
	cmd.Flags().StringVarP(&file, "file", "f", "", "JSON file or -")
	cmd.Flags().StringVar(&resource, "resource", "", "API resource name")
	cmd.Flags().BoolVar(&yes, "yes", false, "Apply")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Plan only")
	cmd.Flags().BoolVar(&diff, "diff", false, "Diff vs remote")
	cmd.Flags().BoolVar(&verify, "verify", false, "Verify after apply")
	return cmd
}
