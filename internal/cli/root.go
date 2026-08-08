package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/bwalia/wslproxy/internal/api"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	buildVersion string
	buildCommit  string
	buildDate    string

	flagBaseURL    string
	flagProfileID  string
	flagOutput     string
	flagInsecure   bool
	flagToken      string
	flagVerbose    bool
	flagInventory  string
	flagMCPAPIKey  string
	flagMCPWrite   bool
)

func Execute(version, commit, date string) int {
	buildVersion, buildCommit, buildDate = version, commit, date
	root := newRootCmd()
	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		if code, ok := err.(exitError); ok {
			return code.code
		}
		return ExitUsage
	}
	return ExitOK
}

type exitError struct {
	code int
	msg  string
}

func (e exitError) Error() string { return e.msg }

func exitf(code int, format string, args ...any) error {
	return exitError{code: code, msg: fmt.Sprintf(format, args...)}
}

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "wslproxy-cli",
		Short:         "Administer WSLProxy via REST API and MCP",
		SilenceUsage:  true,
		SilenceErrors: true,
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			return loadViper()
		},
	}

	cmd.PersistentFlags().StringVar(&flagBaseURL, "base-url", "", "API base URL (env WSLPROXY_BASE_URL)")
	cmd.PersistentFlags().StringVar(&flagBaseURL, "server", "", "Alias for --base-url (same destination)")
	cmd.PersistentFlags().StringVar(&flagProfileID, "profile-id", "", "Environment profile (env WSLPROXY_PROFILE_ID)")
	cmd.PersistentFlags().StringVarP(&flagOutput, "output", "o", "", "Output format: table|json|yaml")
	cmd.PersistentFlags().BoolVar(&flagInsecure, "insecure", false, "Skip TLS certificate verification")
	cmd.PersistentFlags().StringVar(&flagToken, "token", "", "Bearer JWT (env WSLPROXY_TOKEN)")
	cmd.PersistentFlags().BoolVarP(&flagVerbose, "verbose", "v", false, "Verbose logging (secrets masked)")
	cmd.PersistentFlags().StringVar(&flagInventory, "inventory", "", "Inventory YAML for multi-target checks")
	cmd.PersistentFlags().StringVar(&flagMCPAPIKey, "mcp-api-key", "", "MCP API key (env WSLPROXY_MCP_API_KEY)")
	cmd.PersistentFlags().BoolVar(&flagMCPWrite, "write", false, "Allow MCP write tools")

	_ = viper.BindPFlag("base_url", cmd.PersistentFlags().Lookup("base-url"))
	_ = viper.BindPFlag("profile_id", cmd.PersistentFlags().Lookup("profile-id"))
	_ = viper.BindPFlag("output", cmd.PersistentFlags().Lookup("output"))
	_ = viper.BindPFlag("insecure", cmd.PersistentFlags().Lookup("insecure"))
	_ = viper.BindPFlag("auth.token", cmd.PersistentFlags().Lookup("token"))
	_ = viper.BindPFlag("mcp.api_key", cmd.PersistentFlags().Lookup("mcp-api-key"))
	_ = viper.BindPFlag("mcp.write", cmd.PersistentFlags().Lookup("write"))

	cmd.AddCommand(newAuthCmd())
	cmd.AddCommand(newStatusCmd())
	cmd.AddCommand(newCheckCmd())
	cmd.AddCommand(newServerCmd())
	cmd.AddCommand(newRuleCmd())
	cmd.AddCommand(newWAFCmd())
	cmd.AddCommand(newPullCmd())
	cmd.AddCommand(newPushCmd())
	cmd.AddCommand(newApplyCmd())
	cmd.AddCommand(newMCPCmd())
	cmd.AddCommand(newVersionCmd())
	cmd.AddCommand(newCompletionCmd())

	return cmd
}

func effectiveConfig() Config {
	cfg := getConfig()
	if flagBaseURL != "" {
		cfg.BaseURL = flagBaseURL
	}
	// --server alias may set via same var if user used --server
	if s := viper.GetString("base_url"); s != "" && flagBaseURL == "" {
		cfg.BaseURL = s
	}
	if flagProfileID != "" {
		cfg.ProfileID = flagProfileID
	}
	if flagOutput != "" {
		cfg.Output = flagOutput
	}
	if flagInsecure {
		cfg.Insecure = true
	}
	if flagToken != "" {
		cfg.Auth.Token = flagToken
	}
	if flagMCPAPIKey != "" {
		cfg.MCP.APIKey = flagMCPAPIKey
	}
	if flagMCPWrite {
		cfg.MCP.Write = true
	}
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	return cfg
}

func newAPIClient(requireAuth bool) (*api.Client, Config, error) {
	cfg := effectiveConfig()
	c := api.NewClient(cfg.BaseURL, cfg.Auth.Token, cfg.ProfileID, cfg.Insecure)
	c.UserAgent = "wslproxy-cli/" + buildVersion
	if cfg.MCP.APIKey != "" {
		c.SetMCPAPIKey(cfg.MCP.APIKey)
	}
	if requireAuth && c.Token == "" {
		return nil, cfg, exitf(ExitAuth, "not authenticated: run `wslproxy-cli auth login` or set --token / WSLPROXY_TOKEN")
	}
	if flagVerbose {
		fmt.Fprintf(os.Stderr, "base_url=%s profile=%s token=%s\n", cfg.BaseURL, cfg.ProfileID, maskSecret(cfg.Auth.Token))
	}
	return c, cfg, nil
}

func outputFormat(cfg Config) string {
	if flagOutput != "" {
		return flagOutput
	}
	return cfg.Output
}

func newVersionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := effectiveConfig()
			info := map[string]string{
				"version": buildVersion,
				"commit":  buildCommit,
				"date":    buildDate,
			}
			return printOutput(outputFormat(cfg), info, func() error {
				fmt.Printf("wslproxy-cli %s (commit %s, built %s)\n", buildVersion, buildCommit, buildDate)
				return nil
			})
		},
	}
}

func newCompletionCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "completion [bash|zsh|fish|powershell]",
		Short: "Generate shell completion",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			switch args[0] {
			case "bash":
				return cmd.Root().GenBashCompletion(os.Stdout)
			case "zsh":
				return cmd.Root().GenZshCompletion(os.Stdout)
			case "fish":
				return cmd.Root().GenFishCompletion(os.Stdout, true)
			case "powershell":
				return cmd.Root().GenPowerShellCompletionWithDesc(os.Stdout)
			default:
				return exitf(ExitUsage, "unsupported shell %q", args[0])
			}
		},
	}
	return cmd
}

func mapAPIError(err error) error {
	if err == nil {
		return nil
	}
	if ae, ok := err.(*api.APIError); ok {
		if ae.Status == 401 || ae.Status == 403 {
			return exitf(ExitAuth, "%v", ae)
		}
		return exitf(ExitAPI, "%v", ae)
	}
	return exitf(ExitAPI, "%v", err)
}
