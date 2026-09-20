package cli

import (
	"fmt"
	"os"
	"strings"
	"syscall"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

func newAuthCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "auth",
		Short: "Authentication (login / logout / whoami / token)",
	}
	cmd.AddCommand(newAuthLoginCmd())
	cmd.AddCommand(newAuthLogoutCmd())
	cmd.AddCommand(newAuthWhoamiCmd())
	cmd.AddCommand(newAuthTokenCmd())
	return cmd
}

func newAuthLoginCmd() *cobra.Command {
	var email, username, password string
	cmd := &cobra.Command{
		Use:   "login",
		Short: "Login with email/password; store JWT locally",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := effectiveConfig()
			loginID := resolveLoginEmail(cfg, username, email)
			if loginID == "" {
				return exitf(ExitUsage, "email/username required (--email / -u or WSLPROXY_EMAIL)")
			}
			if password == "" {
				password = os.Getenv("WSLPROXY_PASSWORD")
			}
			if password == "" {
				fmt.Fprint(os.Stderr, "Password: ")
				b, err := term.ReadPassword(int(syscall.Stdin))
				fmt.Fprintln(os.Stderr)
				if err != nil {
					return exitf(ExitUsage, "read password: %v", err)
				}
				password = string(b)
			}
			if password == "" {
				return exitf(ExitUsage, "password required (prompt or WSLPROXY_PASSWORD)")
			}

			c, _, err := newAPIClient(false)
			if err != nil {
				return err
			}
			tok, err := c.Login(loginID, password)
			if err != nil {
				return mapAPIError(err)
			}
			if err := saveToken(tok); err != nil {
				return exitf(ExitAPI, "save token: %v", err)
			}
			out := map[string]any{
				"ok":       true,
				"base_url": cfg.BaseURL,
				"email":    loginID,
				"token":    maskSecret(tok),
				"stored":   tokenPath(),
			}
			return printOutput(outputFormat(cfg), out, func() error {
				fmt.Printf("Logged in to %s as %s\nToken stored at %s\n", cfg.BaseURL, loginID, tokenPath())
				return nil
			})
		},
	}
	cmd.Flags().StringVar(&email, "email", "", "Login email (API field)")
	cmd.Flags().StringVarP(&username, "username", "u", "", "Alias for email (API still sends email)")
	cmd.Flags().StringVarP(&password, "password", "p", "", "Password (prefer WSLPROXY_PASSWORD or prompt)")
	return cmd
}

func newAuthLogoutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "logout",
		Short: "Remove locally stored JWT",
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := clearToken(); err != nil {
				return err
			}
			fmt.Println("Logged out (token cleared)")
			return nil
		},
	}
}

func newAuthWhoamiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "Show auth status (token presence, base URL)",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := effectiveConfig()
			info := map[string]any{
				"base_url":   cfg.BaseURL,
				"profile_id": cfg.ProfileID,
				"has_token":  cfg.Auth.Token != "",
				"token":      maskSecret(cfg.Auth.Token),
				"token_path": tokenPath(),
			}
			return printOutput(outputFormat(cfg), info, func() error {
				status := "anonymous"
				if cfg.Auth.Token != "" {
					status = "authenticated"
				}
				fmt.Printf("%s @ %s (profile %s)\n", status, cfg.BaseURL, cfg.ProfileID)
				return nil
			})
		},
	}
}

func newAuthTokenCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "token",
		Short: "Print stored JWT (use carefully)",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg := effectiveConfig()
			if cfg.Auth.Token == "" {
				return exitf(ExitAuth, "no token stored")
			}
			fmt.Println(strings.TrimSpace(cfg.Auth.Token))
			return nil
		},
	}
}
