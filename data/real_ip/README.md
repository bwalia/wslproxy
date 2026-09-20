# Trusted proxy hops (`real_ip`)

`.conf` files in this directory are included into the `http` block. They exist to
recover the **real client IP** when something sits in front of WSLProxy.

Nothing is enabled by default. That is deliberate: with no file here,
`remote_addr` is whoever actually connected, so an IP allowlist behind an
unconfigured proxy denies everyone rather than trusting a header anyone can set.
Fail closed, not open.

## Why this matters

Rules that match on client IP — including VPN-only rules
(see [docs/VPN_ACCESS.md](../../docs/VPN_ACCESS.md)) — read `ngx.var.remote_addr`.
With a chain like:

```
client → nginx → wslproxy
```

`remote_addr` inside WSLProxy is **nginx**, not the client. Every IP rule
evaluates against the wrong address.

## Setup

Create `trusted.conf` in this directory:

```nginx
set_real_ip_from  10.0.0.5;      # the address of YOUR front nginx — one entry per hop
real_ip_header    X-Forwarded-For;
real_ip_recursive on;
```

Then reload. `remote_addr` becomes the true client IP and all existing IP logic
works unchanged.

## Two things that will bite you

**1. The front nginx must overwrite `X-Forwarded-For`, not append to it.**

`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` *appends* to
whatever the client sent. With `real_ip_recursive on` and a single trusted hop
that is normally fine — nginx walks right-to-left and stops at the first
untrusted address — but it means the client controls part of the chain. If you
ever widen `set_real_ip_from`, a client-supplied entry can become the one that
is trusted. On the hop directly in front of WSLProxy, prefer:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
```

**2. List only hosts you control.**

Every address in `set_real_ip_from` is permitted to assert who the client is.
Never put a broad range here, and never add a proxy you do not operate.

## Cloudflare

With Cloudflare in **DNS-only** mode (grey cloud), Cloudflare is not in the
request path — there is nothing to trust and nothing to add. Trust only your own
nginx hop.

If Cloudflare is ever switched to **proxied** (orange cloud), traffic starts
arriving from Cloudflare's edge instead. `set_real_ip_from` must then list
Cloudflare's published ranges and `real_ip_header` should become `CF-Connecting-IP`.
Until that change is made, IP-based rules will match Cloudflare's addresses
rather than your users' — VPN-only rules would deny everyone. Treat flipping the
orange cloud as a change that requires updating this directory.

## Verifying

Any rule with `client_ip` set echoes `remote_addr` back in a response header
(`rule_matcher.lua`, `match_client_ip`):

```bash
curl -sI https://your-host/ | grep -i x-origin-ip
```

That is the address `cidr` rules match against. If it shows your front nginx
rather than your own address, this directory is not configured correctly yet.
