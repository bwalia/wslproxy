# YAML servers & rules

WSLProxy accepts **`.json`**, **`.yaml`**, and **`.yml`** for servers and rules
under `data/servers/<env>/` and `data/rules/<env>/` (git and on-disk).

| Operation | Behaviour |
|-----------|-----------|
| Request path (`rule_loader`) | Tries `.json`, then `.yaml`, then `.yml` |
| Admin API save | Always writes `.json`; removes YAML siblings for that id |
| Ansible `deploy-configs` | Rsyncs all three extensions |

If both `host:example.com.json` and `host:example.com.yaml` exist, **JSON wins**.

## Sample

```yaml
# data/servers/prod/host:yaml-demo.example.com.yaml
id: host:yaml-demo.example.com
server_name: yaml-demo.example.com
profile_id: prod
ssl_enabled: true
ssl_force_https: true
config_status: false
rules: yaml-demo-default
listens:
  - listen: "80"
```

```yaml
# data/rules/prod/yaml-demo-default.yaml
id: yaml-demo-default
name: yaml-demo-default
profile_id: prod
priority: 1
match:
  rules:
    path: /
    path_key: starts_with
  response:
    code: 305
    redirect_uri: "http://127.0.0.1:8080"
    backends:
      - address: "127.0.0.1:8080"
        weight: 100
        label: local-demo
```

See also: `api/config_io.lua`, `api/tinyyaml.lua` (vendored pure-Lua parser).
