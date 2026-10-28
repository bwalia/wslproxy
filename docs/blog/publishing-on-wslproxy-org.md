# Tech note: set up and publish a post on wslproxy.org

[Live version on wslproxy.org](https://wslproxy.org/blog/publishing-on-wslproxy-org.html)

wslproxy.org is static HTML in `html/`, published to GitHub Pages by `.github/workflows/deploy-pages.yml`. There is no build step.

## Layout

| Path | Purpose |
|------|---------|
| `html/index.html` | Landing page. `docs/index.html` is a mirror, so keep both identical |
| `html/blog/index.html` | Blog list |
| `html/blog/<slug>.html` | One file per post |
| `html/css/site.css`, `html/js/theme.js` | Shared styles and the light/dark toggle |
| `html/images/` | Post images (root-relative `/images/…`) |
| `docs/blog/<slug>.md` | Markdown copy of each post, for GitHub |
| `CNAME` | `wslproxy.org`. The workflow copies it into the published site |

## Steps

1. **Write.** Copy an existing post (e.g. `html/blog/vpn-only-hosts.html`) to `html/blog/<slug>.html`. Keep the head, header and footer. Update `<title>`, `meta description`, `og:title` and `og:image` (absolute `https://wslproxy.org/…`). Body classes: `kicker`, `lede`, `meta`, `callout`, `features`, `hero-shot`, `video-frame`. Use `203.0.113.0/24` and `example.com` in examples, never real IPs or keys.
2. **List.** Add a `post-card` at the top of `html/blog/index.html`, add a `media-row` in the `#blog` section of `html/index.html`, then run `cp html/index.html docs/index.html`. Add `docs/blog/<slug>.md`.
3. **Preview.** `cd html && python3 -m http.server 8000`, then open `http://localhost:8000/blog/<slug>.html`. Check light, dark and phone width.
4. **Publish.** Merge a PR to `main`. The workflow runs on changes to `html/index.html`, `html/blog/**`, `html/{css,js,images,waf,swagger}/**` and `CNAME`. To re-publish by hand: `gh workflow run deploy-pages.yml && gh run watch`. Then check with `curl -sI https://wslproxy.org/blog/<slug>.html`.

A **new top-level folder** (e.g. `html/guides/`) needs its own `cp -R` in the workflow's "Assemble static site" step and an `on.push.paths` entry.

## Edge landing vhosts

Each edge also serves `html/index.html` from the landing vhost in `default.conf` (template `infra/ansible/roles/wslproxy/templates/default.conf.j2`). Its `server_name` is built from `nginx_default_server_frontend`, `host_lan_ip` and `host_public_ip`. Set `host_public_ip` in host_vars when `host_lan_ip` is a hostname (lon1), so that `http://<edge-ip>/` shows the landing page instead of "Host not configured". Edge copies update with a delivery-pipeline `code`/`nginx` deploy, not with the Pages workflow.
