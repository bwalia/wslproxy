# Edge sync: lon1 → pop0

pop0 (85.190.106.189) is the failover edge for lon1 (lon1.pop0.uk,
195.20.255.201). Every 5 minutes it pulls lon1's
`servers/`, `rules/` and `waf_policies/` JSON and mirrors them into its own
`/opt/nginx/data`. `settings.json` is **not** synced, because pop0 has its own
`instance_id` (`wslproxy-prod-pop0`).

## How it works

| Where | File | What |
|---|---|---|
| lon1 | `/usr/local/sbin/wslproxy-edge-export` | Forced command. Writes a tar.gz of `servers|rules|waf_policies/<env>/*.json` to stdout. Editor droppings (`*.json.<pid>.<date>~`) never match. |
| lon1 | `/root/.ssh/authorized_keys` | `from="85.190.106.189",command="/usr/local/sbin/wslproxy-edge-export",restrict ssh-ed25519 … edge-sync@pop0` |
| pop0 | `/root/.ssh/edge-sync_ed25519` | The pull key. It can only run the export: no shell, no PTY, no forwarding, and only from pop0's IP. |
| pop0 | `/root/.ssh/known_hosts_edge-sync` | lon1's ed25519 host key, pinned (`SHA256:tSQL4VBfhq1k37lpqgJ5c00wuN8G6PH5cjla3hOh8cY`) |
| pop0 | `/usr/local/sbin/wslproxy-edge-sync` | Pull, validate, mirror, reload |
| pop0 | `wslproxy-edge-sync.{service,timer}` | Every 5 min (`OnCalendar=*:0/5`, 30s jitter, `Persistent`) |

A run applies **nothing** if any of these is true:
- any file fails to parse as JSON, or has an unexpected path
- any directory's file count drops below `EDGE_SYNC_MIN_PERCENT` (80) of what pop0 has now
- the servers export is empty

Only `*.json` is copied or deleted; other files and directories on pop0 are
kept. OpenResty is reloaded (after `openresty -t`) only when servers or WAF
policies changed. Rules are read per request and need no reload.

## Operating it

```sh
# on pop0
systemctl list-timers wslproxy-edge-sync.timer
journalctl -u wslproxy-edge-sync -n 50 -o cat
cat /var/lib/wslproxy-edge-sync/last-success   # UTC; alert if > 15 min old
sudo systemctl start wslproxy-edge-sync        # run now

# deliberately apply a big deletion that the guard refuses:
sudo EDGE_SYNC_MIN_PERCENT=0 /usr/local/sbin/wslproxy-edge-sync
```

Check that the two edges are identical (same hash and count on both):

```sh
cd /opt/nginx/data && find servers rules waf_policies -mindepth 2 -maxdepth 2 \
  -type f -name '*.json' -print0 | sort -z | xargs -0 sha256sum | sha256sum
```

## Delivery-pipeline deploys overwrite edge data

Every `deploy-wslproxy-delivery-pipeline.yml` deploy, in **any** mode except
`permissions` (so `code`, `dashboard-next` and the rest too), runs
`deploy-environment.yml` → "Deploy server configs and rules" →
`infra/ansible/deploy-configs.yml`. That step pushes this repo's
`data/servers/<env>` and `data/rules/<env>` over the target. On pop0 the
timer puts lon1's data back within 5 minutes. On **lon1** it overwrites live
edge config with whatever the repo has, and the timer then copies the result
to pop0.

## Reinstall

```sh
# lon1
install -m 0755 infra/edge-sync/wslproxy-edge-export /usr/local/sbin/
# pop0
ssh-keygen -t ed25519 -N '' -C edge-sync@pop0 -f /root/.ssh/edge-sync_ed25519
ssh-keyscan -t ed25519 195.20.255.201 > /root/.ssh/known_hosts_edge-sync   # verify the fingerprint!
install -m 0755 infra/edge-sync/wslproxy-edge-sync /usr/local/sbin/
install -m 0644 infra/edge-sync/wslproxy-edge-sync.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now wslproxy-edge-sync.timer
# then add the authorized_keys line above on lon1 with pop0's new public key
```
