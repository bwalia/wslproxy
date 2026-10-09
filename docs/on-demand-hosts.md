# On-demand hosts

Serve, and get certificates for, hosts that have no server on this edge, when
another service vouches for them. This is how a SaaS lets its customers point
their own domains at the edge without an operator adding each one.

Code: `api/on_demand.lua`. Test: `scripts/test-on-demand-hosts.sh`.

## How it works

1. A server opts in by setting **On-demand hosts: ask URL**
   (`on_demand_ask_url`), in the SSL card of the server editor.
2. A request, or a TLS handshake, arrives for a host that has no server of its
   own. The edge asks every opted-in server's URL:

   ```
   GET <on_demand_ask_url>?domain=<host>
   ```

   **200** means yes. Anything else, or no answer within 2 s, means no.
3. On a yes:
   - the host is served with that server's rules and settings (WAF, rate
     limits, force HTTPS…);
   - the upstream `Host` is that server's `proxy_server_name`, else its
     `server_name`, so host-routed backends such as the k3s ingress still
     match;
   - the client's host is sent as **`X-Original-Host`**. The edge overwrites
     any value the client sent;
   - auto-ssl may issue the host's certificate. This uses the `allow_domain`
     callback in `api/init.lua`, the same "ask" pattern as Caddy's
     `on_demand_tls`.

Hosts that have their own server are never asked about, and nothing changes for
them. If no server sets an ask URL, nothing is ever asked.

## Limits and failure modes

| | |
|---|---|
| Answers are cached per host | yes: 5 min; no: 1 min; ask failed: 15 s |
| Asks per edge | at most 300 a minute. Beyond that the answer is no, so floods of made-up `Host`/SNI names reach neither the ask service nor Let's Encrypt |
| Never asked about | IP addresses, names without a dot, anything but letters, digits, dots and hyphens |
| A host stops being vouched for | it stops being routed within 5 minutes, and its certificate isn't renewed |
| Ask service down | unknown hosts get the "not configured" page, and hosts already cached keep working until their entry expires |

The list of opted-in servers is read from `data/servers/<env_profile>/` by
worker 0 every 30 s, and kept in `lua_shared_dict wsl_on_demand` (both nginx
templates). Without that dict the feature is off, and a notice is logged.

## Example: opsapi custom form domains

opsapi lets a workspace put its form links on its own domain
(`forms.acme.com/f/…`). opsapi checks the customer's DNS records itself (a TXT
proof of ownership), and then answers `GET /api/v2/public/form-domains/check?domain=`
with 200.

On the edge:
1. Open the opsapi **dashboard's** server, e.g. `opsapi-ui.example.com`, which
   routes to the dashboard.
2. Set **On-demand hosts: ask URL** to
   `https://<opsapi api host>/api/v2/public/form-domains/check`.
3. In opsapi, set `FORMS_DOMAIN_TARGET` to the name customers should CNAME to,
   for example this edge's POP name.

A connected `forms.acme.com` then gets a certificate on its first HTTPS visit
and reaches the dashboard, with `Host: opsapi-ui.example.com` and
`X-Original-Host: forms.acme.com`. The dashboard serves only that workspace's
forms there.
