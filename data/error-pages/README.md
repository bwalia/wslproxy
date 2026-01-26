# WSL Proxy Error Pages

This directory contains custom HTML error pages for WSL Proxy. The default behavior is to **redirect to the main homepage** at `https://wslproxy.com/index.html`.

## Default Behavior

By default, all error pages simply redirect to the main WSL Proxy homepage. This is achieved with a simple meta refresh tag:

```html
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=https://wslproxy.com/index.html">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="https://wslproxy.com/index.html">WSL Proxy</a>...</p>
</body>
</html>
```

**Base64 encoded:**
```
PCFET0NUWVBFIGh0bWw+PGh0bWw+PGhlYWQ+PG1ldGEgaHR0cC1lcXVpdj0icmVmcmVzaCIgY29udGVudD0iMDt1cmw9aHR0cHM6Ly93c2xwcm94eS5jb20vaW5kZXguaHRtbCI+PHRpdGxlPlJlZGlyZWN0aW5nLi4uPC90aXRsZT48L2hlYWQ+PGJvZHk+PHA+UmVkaXJlY3RpbmcgdG8gPGEgaHJlZj0iaHR0cHM6Ly93c2xwcm94eS5jb20vaW5kZXguaHRtbCI+V1NMIFByb3h5PC9hPi4uLjwvcD48L2JvZHk+PC9odG1sPg==
```

## Error Page Types

| Type | Purpose | Error Code |
|------|---------|------------|
| `no_rule` | No routing rules configured | NO_RULE_CONFIGURED |
| `conf_mismatch` | Configuration format mismatch | CONF_MISMATCH |
| `no_server` | No server config for domain | NO_SERVER_CONFIG |

## Pipeline Override

These error pages can be overridden via `sample-settings.json` under `nginx.default.*`. 

### Default Values (Built-in)

The Lua code contains hardcoded fallback defaults (simple redirects) that will be used if no value is provided in settings:

```lua
-- Default error pages are embedded in gateway_ack.lua and temp.lua
-- These redirect to https://wslproxy.com/index.html
-- Can be overridden via settings.json at deployment time
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

## Custom Error Pages

To use custom error pages instead of redirects:

```bash
# Create a custom HTML file
cat > custom-error.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body><h1>Custom Error Page</h1></body>
</html>
EOF

# Generate base64 (macOS)
base64 -i custom-error.html

# Generate base64 (Linux)
base64 -w 0 custom-error.html

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
