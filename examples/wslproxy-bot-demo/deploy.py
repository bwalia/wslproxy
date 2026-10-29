#!/usr/bin/env python3
"""Deploy the Bot Defense & IVT demo (bots-open / bots-secure.fictionally.org).

Stages, in order (run all, or pick with --steps):

  origin   k3s1: namespace wslproxy-bot-demo, ConfigMap (app.py + lab.html),
           Deployment shop-api (cloud001), NodePort 30088. Needs KUBECONFIG.
  edge     Deploy this branch's wslproxy to lon1 (+ pop0, which co-deploys)
           through the delivery pipeline: DEPLOY_MODE=code, then nginx (the
           wsl_bot_defense shared dict and the init/log hooks). Needs `gh`.
  vhosts   Install the rule + both server JSONs on lon1, the way
           .claude/skills/wslproxy-add-domain does it (ssh + tar, backup, atomic
           rename, owner 33). Live on the next request; pop0 mirrors lon1
           within 5 min (wslproxy-edge-sync). Needs ssh root@195.20.255.201.
  cp       Import the same records into the cp.pop0.uk control plane with the
           same ids (/api/projects/import). Needs ~/.config/wslproxy/cp.env.
  dns      Cloudflare CNAMEs for both hosts, copied from payments-secure's
           record (lon1.pop0.uk, grey cloud so auto-ssl can solve HTTP-01).
           Needs ~/.config/cloudflare/token (Zone:Read, DNS:Edit).
  verify   test-bot-secure.sh + test_bot_live.py against the live hosts.

Every stage is idempotent. --dry-run prints what each stage would do.

  python3 examples/wslproxy-bot-demo/deploy.py --dry-run
  python3 examples/wslproxy-bot-demo/deploy.py
  python3 examples/wslproxy-bot-demo/deploy.py --steps vhosts,cp,dns,verify
"""

import argparse
import io
import json
import os
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
HOSTS = ["bots-open.fictionally.org", "bots-secure.fictionally.org"]
RULE = "bot-demo-default"
DATA = "/opt/nginx/data"
UA = "Mozilla/5.0 (compatible; wslproxy-bot-demo-deploy/1.0)"  # Cloudflare 1010 blocks python's default
PIPELINE = "deploy-wslproxy-delivery-pipeline.yml"
STEPS = ["origin", "edge", "vhosts", "cp", "dns", "verify"]


def log(msg):
    print(msg, flush=True)


def die(msg):
    log(f"ERROR: {msg}")
    sys.exit(1)


def run(cmd, dry, stdin=None, check=True, capture=False):
    shown = cmd if isinstance(cmd, str) else " ".join(cmd)
    if dry:
        log(f"  [dry-run] {shown[:300]}")
        return ""
    p = subprocess.run(cmd, shell=isinstance(cmd, str), input=stdin,
                       capture_output=capture or stdin is not None)
    if check and p.returncode != 0:
        err = (p.stderr or b"").decode().strip() if (capture or stdin is not None) else ""
        die(f"command failed ({p.returncode}): {shown[:200]} {err[:300]}")
    return (p.stdout or b"").decode() if (capture or stdin is not None) else ""


def http(method, url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", UA)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def records():
    rule = json.load(open(os.path.join(HERE, "data/rules/prod", RULE + ".json")))
    servers = [json.load(open(os.path.join(HERE, "data/servers/prod", f"host:{h}.json"))) for h in HOSTS]
    return rule, servers


# ─── stages ──────────────────────────────────────────────────────────────────

def origin(a):
    log("[origin] k3s1 namespace wslproxy-bot-demo, shop-api on cloud001, NodePort 30088")
    run("kubectl create namespace wslproxy-bot-demo --dry-run=client -o yaml | kubectl apply -f -", a.dry_run)
    run(f"kubectl -n wslproxy-bot-demo create configmap shop-api-src "
        f"--from-file=app.py={HERE}/app/app.py --from-file=lab.html={HERE}/lab.html "
        f"-o yaml --dry-run=client | kubectl apply -f -", a.dry_run)
    run(["kubectl", "apply", "-f", os.path.join(HERE, "k3s1-shop-api.yaml")], a.dry_run)
    # A ConfigMap change does not restart the pod by itself.
    run(["kubectl", "-n", "wslproxy-bot-demo", "rollout", "restart", "deploy/shop-api"], a.dry_run)
    run(["kubectl", "-n", "wslproxy-bot-demo", "rollout", "status", "deploy/shop-api", "--timeout=180s"], a.dry_run)
    log("[origin] ready")


def dispatch_and_wait(a, mode):
    log(f"[edge] delivery pipeline: branch={a.branch} host=lon1.pop0.uk mode={mode}")
    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 5))
    run(["gh", "workflow", "run", PIPELINE, "-R", a.repo, "-f", f"DEPLOY_BRANCH={a.branch}",
         "-f", "TARGET_ENV=prod", "-f", "TARGET_HOST=lon1.pop0.uk", "-f", f"DEPLOY_MODE={mode}"], a.dry_run)
    if a.dry_run:
        return
    run_id = None
    for _ in range(30):
        out = run(["gh", "run", "list", "-R", a.repo, "--workflow", PIPELINE, "--event", "workflow_dispatch",
                   "--limit", "5", "--json", "databaseId,createdAt"], False, capture=True)
        fresh = [r for r in json.loads(out or "[]") if r["createdAt"] >= started]
        if fresh:
            run_id = str(fresh[0]["databaseId"])
            break
        time.sleep(4)
    if not run_id:
        die("could not find the dispatched run")
    log(f"[edge] watching run {run_id}: https://github.com/{a.repo}/actions/runs/{run_id}")
    run(["gh", "run", "watch", run_id, "-R", a.repo, "--exit-status", "--interval", "20"], False, check=False)
    out = run(["gh", "run", "view", run_id, "-R", a.repo, "--json", "conclusion,jobs"], False, capture=True)
    view = json.loads(out)
    lon1 = [j for j in view.get("jobs", []) if "lon1" in j.get("name", "").lower()]
    concl = lon1[0]["conclusion"] if lon1 else view.get("conclusion")
    if concl != "success":
        die(f"lon1 deploy ({mode}) ended '{concl}' — see the run; stopping before the next stage")
    log(f"[edge] {mode} deployed to lon1")


def edge(a):
    # code first: the nginx restart then finds the bot_defense module in place.
    dispatch_and_wait(a, "code")
    dispatch_and_wait(a, "nginx")


def vhosts(a):
    rule, servers = records()
    files = {f"rules/prod/{RULE}.json": rule}
    for s in servers:
        files[f"servers/prod/{s['id']}.json"] = s
    log(f"[vhosts] installing on {a.lon1}: {', '.join(files)}")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as t:
        for rel, obj in files.items():
            data = json.dumps(obj, separators=(",", ":")).encode()
            info = tarfile.TarInfo(rel)
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
    rels = " ".join(f"'{r}'" for r in files)
    run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", a.lon1, f"""set -e
T=$(mktemp -d); tar xf - -C $T
for r in {rels}; do
  if [ -e "{DATA}/$r" ]; then cp "{DATA}/$r" "{DATA}/$r.bak.$(date +%s)"; fi
  install -o 33 -g 0 -m 0777 "$T/$r" "{DATA}/$r.tmp" && mv -f "{DATA}/$r.tmp" "{DATA}/$r"
done
rm -rf $T"""], a.dry_run, stdin=buf.getvalue())
    log("[vhosts] live on lon1 on the next request; pop0 mirrors within 5 min")


def cp(a):
    rule, servers = records()
    if a.dry_run:
        log(f"  [dry-run] login {a.cp}/api/user/login, import rules:{rule['id']} + servers:"
            f"{', '.join(s['id'] for s in servers)}")
        return
    env = {}
    with open(os.path.expanduser(a.cp_env)) as f:
        for line in f:
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k] = v.strip().strip('"').strip("'")
    st, d = http("POST", f"{a.cp}/api/user/login", {"email": env["CP_API_USER"], "password": env["CP_API_PASSWD"]},
                 {"x-platform": "openresty-admin-next"})
    if st != 200:
        die(f"CP login failed: {st}")
    hdr = {"Authorization": "Bearer " + d["data"]["accessToken"], "x-platform": "openresty-admin-next"}
    for dtype, recs in (("rules", [rule]), ("servers", servers)):
        for rec in recs:
            st, d = http("POST", f"{a.cp}/api/projects/import?_format=json",
                         {"dataType": dtype, "envProfile": "prod", "data": [rec]}, hdr)
            if not 200 <= st < 300:
                die(f"CP import {dtype} {rec['id']}: {st} {str(d)[:300]}")
            log(f"[cp] imported {dtype} {rec['id']}")
    for s in servers:
        st, d = http("GET", f"{a.cp}/api/servers/{s['id']}?envprofile=prod", headers=hdr)
        rec = d.get("data", {}) if isinstance(d, dict) else {}
        log(f"[cp] read back {s['id']}: rules={rec.get('rules')} pop_ids={rec.get('pop_ids')} "
            f"bot_defense={(rec.get('bot_defense') or {}).get('mode', 'off')}")


def dns(a):
    path = os.path.expanduser(a.cf_token_file)
    if a.dry_run:
        log(f"  [dry-run] Cloudflare: CNAME {', '.join(HOSTS)} copied from {a.dns_from} (token {a.cf_token_file})")
        return
    if not os.path.exists(path):
        die(f"no Cloudflare token at {a.cf_token_file} — add one, or create CNAMEs "
            f"{', '.join(HOSTS)} -> lon1.pop0.uk (DNS only) by hand")
    hdr = {"Authorization": "Bearer " + open(path).read().strip()}
    api = "https://api.cloudflare.com/client/v4"
    st, d = http("GET", f"{api}/zones?name=fictionally.org", headers=hdr)
    if st != 200 or not d.get("result"):
        die(f"Cloudflare zone fictionally.org: {st}")
    zone = d["result"][0]["id"]

    def records_for(name):
        return http("GET", f"{api}/zones/{zone}/dns_records?name={name}", headers=hdr)[1].get("result", [])

    src = records_for(a.dns_from)
    if len(src) != 1:
        die(f"expected exactly one DNS record for {a.dns_from}, found {len(src)}")
    s = src[0]
    for host in HOSTS:
        if records_for(host):
            log(f"[dns] {host} already has a record; leaving it")
            continue
        st, d = http("POST", f"{api}/zones/{zone}/dns_records", {
            "type": s["type"], "name": host, "content": s["content"], "proxied": s["proxied"], "ttl": s["ttl"],
            "comment": "wslproxy Bot Defense demo (examples/wslproxy-bot-demo)"}, hdr)
        if st != 200 or not d.get("success"):
            die(f"[dns] create {host} failed: {st} {str(d)[:300]}")
        log(f"[dns] {s['type']} {host} -> {s['content']} (proxied={s['proxied']})")


def verify(a):
    log("[verify] waiting for HTTPS (auto-ssl issues on the first hit)...")
    if a.dry_run:
        log("  [dry-run] curl https://<host>/health; test-bot-secure.sh; test_bot_live.py")
        return
    for host in HOSTS:
        for i in range(12):
            try:
                req = urllib.request.Request(f"https://{host}/health", headers={"User-Agent": UA})
                code = urllib.request.urlopen(req, timeout=60).status
            except urllib.error.HTTPError as e:
                code = e.code
            except Exception as e:
                code = type(e).__name__
            log(f"[verify] https://{host}/health try {i + 1}: {code}")
            if code == 200:
                break
            time.sleep(15)
        else:
            die(f"{host} did not come up — check DNS (grey cloud), the vhost on lon1 and the origin")
    run([os.path.join(HERE, "test-bot-secure.sh")], False)
    run([sys.executable, "-I", os.path.join(HERE, "test_bot_live.py")], False)
    log("[verify] demo is live: https://bots-secure.fictionally.org/lab")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--steps", default=",".join(STEPS), help=f"comma list of {', '.join(STEPS)}")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--branch", default="feat/bot-defense", help="branch the edge stage deploys")
    p.add_argument("--repo", default="bwalia/wslproxy")
    p.add_argument("--lon1", default="root@195.20.255.201")
    p.add_argument("--cp", default="https://cp.pop0.uk")
    p.add_argument("--cp-env", default="~/.config/wslproxy/cp.env")
    p.add_argument("--cf-token-file", default="~/.config/cloudflare/token")
    p.add_argument("--dns-from", default="payments-secure.fictionally.org")
    a = p.parse_args()
    steps = [s.strip() for s in a.steps.split(",") if s.strip()]
    bad = [s for s in steps if s not in STEPS]
    if bad:
        die(f"unknown step(s): {', '.join(bad)}")
    for name in STEPS:
        if name in steps:
            globals()[name](a)
    log("done")


if __name__ == "__main__":
    main()
