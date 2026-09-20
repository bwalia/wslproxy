package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
	"gopkg.in/yaml.v3"
)

type Config struct {
	BaseURL   string            `mapstructure:"base_url" yaml:"base_url"`
	ProfileID string            `mapstructure:"profile_id" yaml:"profile_id"`
	Output    string            `mapstructure:"output" yaml:"output"`
	Insecure  bool              `mapstructure:"insecure" yaml:"insecure"`
	Auth      AuthConfig        `mapstructure:"auth" yaml:"auth"`
	MCP       MCPConfig         `mapstructure:"mcp" yaml:"mcp"`
	Inventory []InventoryTarget `mapstructure:"inventory" yaml:"inventory"`
}

type AuthConfig struct {
	Token    string `mapstructure:"token" yaml:"token"`
	Username string `mapstructure:"username" yaml:"username"`
	Email    string `mapstructure:"email" yaml:"email"`
}

type MCPConfig struct {
	APIKey string `mapstructure:"api_key" yaml:"api_key"`
	Write  bool   `mapstructure:"write" yaml:"write"`
}

type InventoryTarget struct {
	Name      string `mapstructure:"name" yaml:"name" json:"name"`
	BaseURL   string `mapstructure:"base_url" yaml:"base_url" json:"base_url"`
	ProfileID string `mapstructure:"profile_id" yaml:"profile_id" json:"profile_id,omitempty"`
}

func configDir() string {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "wslproxy")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".wslproxy"
	}
	return filepath.Join(home, ".config", "wslproxy")
}

func tokenPath() string {
	return filepath.Join(configDir(), "token")
}

func loadViper() error {
	viper.SetEnvPrefix("WSLPROXY")
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	viper.AutomaticEnv()

	viper.SetDefault("base_url", "http://127.0.0.1:8080")
	viper.SetDefault("profile_id", "prod")
	viper.SetDefault("output", "table")
	viper.SetDefault("insecure", false)

	_ = viper.BindEnv("base_url", "WSLPROXY_BASE_URL")
	_ = viper.BindEnv("profile_id", "WSLPROXY_PROFILE_ID")
	_ = viper.BindEnv("output", "WSLPROXY_OUTPUT")
	_ = viper.BindEnv("insecure", "WSLPROXY_INSECURE")
	_ = viper.BindEnv("auth.token", "WSLPROXY_TOKEN")
	_ = viper.BindEnv("auth.username", "WSLPROXY_USERNAME")
	_ = viper.BindEnv("auth.email", "WSLPROXY_EMAIL")
	_ = viper.BindEnv("mcp.api_key", "WSLPROXY_MCP_API_KEY")
	_ = viper.BindEnv("mcp.write", "WSLPROXY_MCP_WRITE")

	viper.SetConfigName("cli")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(configDir())
	viper.AddConfigPath(".")
	viper.AddConfigPath(".")

	// Also try .wslproxy-cli.yaml in cwd
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			// try alternate name
			viper.SetConfigName(".wslproxy-cli")
			_ = viper.ReadInConfig()
		}
	}

	// Load persisted token if env/config empty
	if viper.GetString("auth.token") == "" {
		if b, err := os.ReadFile(tokenPath()); err == nil {
			tok := strings.TrimSpace(string(b))
			if tok != "" {
				viper.Set("auth.token", tok)
			}
		}
	}
	return nil
}

func getConfig() Config {
	var c Config
	_ = viper.Unmarshal(&c)
	if c.BaseURL == "" {
		c.BaseURL = "http://127.0.0.1:8080"
	}
	if c.ProfileID == "" {
		c.ProfileID = "prod"
	}
	if c.Output == "" {
		c.Output = "table"
	}
	return c
}

func saveToken(token string) error {
	dir := configDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	return os.WriteFile(tokenPath(), []byte(strings.TrimSpace(token)+"\n"), 0o600)
}

func clearToken() error {
	err := os.Remove(tokenPath())
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func loadInventoryFile(path string) ([]InventoryTarget, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var wrap struct {
		Inventory []InventoryTarget `yaml:"inventory" json:"inventory"`
	}
	if err := yaml.Unmarshal(b, &wrap); err == nil && len(wrap.Inventory) > 0 {
		return wrap.Inventory, nil
	}
	var list []InventoryTarget
	if err := yaml.Unmarshal(b, &list); err != nil {
		return nil, fmt.Errorf("parse inventory %s: %w", path, err)
	}
	return list, nil
}

func resolveLoginEmail(cfg Config, flagUser, flagEmail string) string {
	for _, v := range []string{flagEmail, flagUser, cfg.Auth.Email, cfg.Auth.Username, os.Getenv("WSLPROXY_EMAIL"), os.Getenv("WSLPROXY_USERNAME")} {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
