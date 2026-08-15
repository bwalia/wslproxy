# VPN-only access

Restrict endpoints to clients connected through the
[wslvpn](https://github.com/bwalia/wslvpn) Zero Trust overlay, using a `cidr`
match on the client IP.

This is the network layer: *"the request arrived over the VPN."* It does not yet
know **who** the user is — that comes with identity resolution (see
[Not yet covered](#not-yet-covered)).

## Prerequisite: real client IP

`cidr` rules match `ngx.var.remote_addr`. If anything sits in front of WSLProxy,
that is the proxy's address, not the client's, and every VPN rule will deny.

Configure [`data/real_ip/`](../data/real_ip/README.md) first. Verify before
writing rules:

```bash
curl -sI https://your-host/ | grep -i x-origin-ip
```

It must show a client address, not your front proxy.

## The `cidr` match

```json
"client_ip_key": "cidr",
"client_ip": "10.8.1.0/24"
```

- Accepts one CIDR or a comma-separated list: `"10.8.1.0/24, 10.9.0.0/16"`
- A bare address is treated as `/32`
- IPv4 only — an IPv6 client never matches, so it cannot pass an IPv4 allowlist
- Malformed entries match nothing; one bad entry in a list does not affect the others

Use `cidr`, not `starts_with`. String prefix matching is not subnet matching:
`starts_with "10.8.1."` also matches `10.8.1x.y.z`-shaped addresses in other
ranges, and this is an access decision.

## Rules come in pairs

**This is the part to get right.** A single VPN-only rule is a silent bypass.

`rule_selector.lua` filters to the rules that *pass*, then ranks them. A rule
whose IP condition fails simply drops out of the running — it does not deny
anything. So with only:

| Rule | Path | Condition | Response |
|------|------|-----------|----------|
| A | `/admin` starts_with | `cidr 10.8.1.0/24` | 305 proxy |
| B | `/` starts_with | none | 305 proxy |

an off-VPN request to `/admin` fails rule A, matches the catch-all rule B, and
**gets proxied to `/admin` anyway**.

You need an explicit deny that catches what the allow rule drops:

| Rule | Priority | Path | Condition | Response |
|------|----------|------|-----------|----------|
| allow | 20 | `/admin` starts_with | `cidr 10.8.1.0/24` | 305 proxy |
| deny | 10 | `/admin` starts_with | none | 403 page |
| catch-all | 0 | `/` starts_with | none | 305 proxy |

On-VPN, both `/admin` rules pass and the higher priority wins → proxied.
Off-VPN, only the deny rule passes → 403. The catch-all never sees `/admin`
either way, because both `/admin` rules outrank it on priority.

Give the allow rule a **higher explicit priority** than the deny rule. The
selector would also break the tie by condition count (`compare_rules` step 3),
but relying on that is fragile — state the priority.

## Worked example

Allow:

```json
{
  "version": 1,
  "priority": 20,
  "name": "admin-vpn-allow",
  "profile_id": "prod",
  "servers": ["host:internal.example.com"],
  "match": {
    "rules": {
      "path_key": "starts_with",
      "path": "/admin",
      "client_ip_key": "cidr",
      "client_ip": "10.8.1.0/24"
    },
    "response": {
      "allow": true,
      "code": 305,
      "redirect_uri": "http://127.0.0.1:8080"
    }
  }
}
```

Deny — same path, no IP condition, lower priority:

```json
{
  "version": 1,
  "priority": 10,
  "name": "admin-vpn-deny",
  "profile_id": "prod",
  "servers": ["host:internal.example.com"],
  "match": {
    "rules": {
      "path_key": "starts_with",
      "path": "/admin"
    },
    "response": {
      "allow": false,
      "code": 403,
      "message": "<base64-encoded HTML>"
    }
  }
}
```

`403` renders `message` as HTML (`gateway_resp.lua`), so off-VPN users get a
"connect to the VPN" page rather than a bare error. Both rules are created
through the existing `POST /api/rules` endpoint — no new API.

## Verifying

Off the VPN:

```bash
curl -so /dev/null -w '%{http_code}\n' https://internal.example.com/admin   # 403
curl -so /dev/null -w '%{http_code}\n' https://internal.example.com/        # 200
```

On the VPN, with an address in `10.8.1.0/24`, `/admin` should return the origin
response. Confirm the address the proxy actually sees:

```bash
curl -sI https://internal.example.com/admin | grep -i x-origin-ip
```

Check both. An allow rule that works while the deny rule is misconfigured looks
identical to a working setup from the VPN side.

## Not yet covered

**Which user.** Any device on the overlay reaches every VPN-only endpoint. Group
and posture enforcement needs identity resolution — resolving the source IP to a
wslvpn session and its user's groups. Until then this is a network boundary, not
a Zero Trust one.

**Non-HTTP services.** Databases, SSH and anything else WSLProxy does not proxy
are unaffected by these rules. Restrict those on the wslvpn gateway with network
routes and the nftables allowlist.

**Revocation.** A revoked wslvpn session loses its tunnel, and with it the
overlay address, so proxy access ends when the peer is removed from the gateway
— there is no separate state to expire here.

## Related

- [`data/real_ip/README.md`](../data/real_ip/README.md) — trusted proxy setup
- `api/ip_cidr.lua` — matcher, `test/rules/test_ip_cidr.lua`
- `api/rule_matcher.lua` — `match_client_ip`
