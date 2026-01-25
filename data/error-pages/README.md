# WSL Proxy Error Pages

This directory contains the default HTML error pages for WSL Proxy. These pages are served when specific error conditions occur.

## Error Pages

| File | Purpose | Error Code |
|------|---------|------------|
| `no_rule.html` | Displayed when no routing rules are configured | NO_RULE_CONFIGURED |
| `conf_mismatch.html` | Displayed when configuration doesn't match expected format | CONF_MISMATCH |
| `no_server.html` | Displayed when no server configuration is found for the domain | NO_SERVER_CONFIG |

## Pipeline Override

These error pages are stored as **base64-encoded HTML** in `sample-settings.json` under `nginx.default.*`. 

### Default Values (Built-in)

The Lua code contains hardcoded fallback defaults that will be used if no value is provided in settings:

```lua
-- Default error pages are embedded in gateway_ack.lua
-- These can be overridden via settings.json at deployment time
```

### Environment-Specific Overrides

During deployment, the CI/CD pipeline can override these values per environment:

1. **GitHub Secrets Store**: Each environment has its own settings secret:
   - `DOT_WSLPROXY_SETTINGS_DEV` - Development settings
   - `DOT_WSLPROXY_SETTINGS_INT` - Integration settings  
   - `DOT_WSLPROXY_SETTINGS_TEST` - Test settings
   - `DOT_WSLPROXY_SETTINGS_ACC` - Acceptance settings
   - `DOT_WSLPROXY_SETTINGS_PROD` - Production settings

2. **Helm Deployment**: The `kubeseal_automation.sh` script injects environment-specific settings during deployment.

3. **Override Priority**:
   ```
   Hardcoded Default → sample-settings.json → Environment Secret → Runtime Config
   ```

## Generating Base64 Values

To update an error page:

```bash
# Edit the HTML file
vim data/error-pages/no_rule.html

# Generate base64 (macOS)
base64 -i data/error-pages/no_rule.html

# Generate base64 (Linux)
base64 -w 0 data/error-pages/no_rule.html

# Update the corresponding value in settings.json
```

## Customization

Each environment can have custom branded error pages by:

1. Creating custom HTML files per environment
2. Base64 encoding them
3. Adding to the environment's secrets in GitHub

Example for production:
```json
{
  "nginx": {
    "default": {
      "no_rule": "<base64-encoded-production-html>",
      "conf_mismatch": "<base64-encoded-production-html>",
      "no_server": "<base64-encoded-production-html>"
    }
  }
}
```

## Styling Guidelines

All error pages follow the WSL Proxy brand guidelines:
- Dark gradient background (`#0f0f23` → `#1a1a2e` → `#16213e`)
- Glass-morphism containers
- Font Awesome icons
- Inter font family
- Responsive design
- Color-coded error severity (Orange=Warning, Red=Error, Purple=Info)
