#!/usr/bin/env python3
"""Add a proxied domain to the wslproxy edge: lon1 (live) -> lon2/pop0 (mirror)
-> cp.pop0.uk (source of truth) -> optional Cloudflare record.

Example:
  add_domain.py --host promptpilot.workstation.co.uk --backend 193.237.176.232:18095
  add_domain.py --host foo.workstation.co.uk --backend 193.237.176.232:18096 --dry-run
  add_domain.py --host bar.workstation.co.uk --rule-id a0f12ed0-...   # share an existing rule

Steps (all by default, pick with --steps): preflight,generate,lon1,verify,lon2,cp,dns
Stdlib only. Secrets are read from files and never printed.
"""
import argparse
import base64
import io
import json
import os
import re
import ssl
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import uuid

UA = "wslproxy-add-domain/1.0"  # Cloudflare in front of cp.pop0.uk 403s (1010) python's default UA
DATA = "/opt/nginx/data"
STEPS = ["preflight", "generate", "lon1", "verify", "lon2", "cp", "dns"]


def log(msg):
    print(msg, flush=True)


def die(msg):
    sys.exit(f"ERROR: {msg}")


def ssh(target, cmd, stdin=None, check=True):
    p = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", target, cmd],
                       input=stdin, capture_output=True)
    if check and p.returncode != 0:
        die(f"ssh {target}: {p.stderr.decode().strip() or p.stdout.decode().strip()}")
    return p.stdout.decode()


def read_env(path):
    env = {}
    for line in open(os.path.expanduser(path)):
        k, _, v = line.strip().partition("=")
        if k and not k.startswith("#"):
            env[k] = v.strip().strip('"').strip("'")
    return env


def http(method, url, body=None, headers=None, timeout=30):
    h = {"User-Agent": UA, "Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(url, method=method, headers=h,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:500]


# ---------------------------------------------------------------- config blob

def decode_config(blob, needle):
    """Server `config` is base64 nginx text — on lon1 often base64'd twice.
    Returns (text, layers) where layers is how many decodes were needed."""
    cur = blob
    for layers in range(1, 4):
        try:
            cur = base64.b64decode(cur).decode()
        except Exception:
            break
        if needle in cur:
            return cur, layers
    return None, 0


def encode_config(text, layers):
    for _ in range(layers):
        text = base64.b64encode(text.encode()).decode()
    return text


# --------------------------------------------------------------------- steps

def preflight(a):
    host_file = f"{DATA}/servers/prod/host:{a.host}.json"
    out = ssh(a.lon1, f"test -e '{host_file}' && echo EXISTS || echo ok")
    if "EXISTS" in out:
        die(f"{a.host} already exists on lon1 ({host_file}); refusing to overwrite")
    log(f"[preflight] {a.host} not on lon1 yet")
    if a.rule_id:
        out = ssh(a.lon1, f"cat {DATA}/rules/prod/{a.rule_id}.json", check=False)
        if not out.strip():
            die(f"rule {a.rule_id} not found on lon1")
        a.backend = json.loads(out)["match"]["response"].get("redirect_uri")
        log(f"[preflight] sharing rule {a.rule_id} -> {a.backend}")
    if not a.backend:
        die("--backend (or --rule-id) is required for a new host")
    code = ssh(a.lon1, f"curl -s -o /dev/null -m 8 -w '%{{http_code}}' http://{a.backend}/ || true", check=False).strip()
    if code in ("", "000"):
        die(f"lon1 cannot reach backend http://{a.backend}/ (LAN IPs like 192.168.x are NOT reachable from "
            f"the POPs — use the office public IP + router port-forward, e.g. 193.237.176.232:18xxx)")
    log(f"[preflight] lon1 -> http://{a.backend}/ answers HTTP {code}")
    dig = subprocess.run(["dig", "+short", a.host], capture_output=True, text=True).stdout.split()
    log(f"[preflight] DNS {a.host} -> {dig or 'NXDOMAIN'}")
    if not dig:
        log("[preflight] WARNING: no DNS yet — Let's Encrypt (HTTP-01) will fail until it resolves to lon1")


def generate(a):
    # Re-runs (e.g. --steps cp,dns after lon1 is done) must reuse lon1's ids,
    # otherwise CP would get a different rule id than the one serving traffic.
    existing = ssh(a.lon1, f"cat '{DATA}/servers/prod/host:{a.host}.json' 2>/dev/null", check=False)
    if existing.strip():
        a.server = json.loads(existing)
        a.rid = a.server["rules"]
        a.rule = json.loads(ssh(a.lon1, f"cat {DATA}/rules/prod/{a.rid}.json"))
        a.backend = a.backend or a.rule["match"]["response"].get("redirect_uri")
        a.files = {}
        log(f"[generate] {a.host} already on lon1 — reusing its server + rule {a.rid}")
        return
    if not a.backend and not a.rule_id:
        die("--backend (or --rule-id) is required for a new host")
    tpl = json.loads(ssh(a.lon1, f"cat '{DATA}/servers/prod/host:{a.template}.json'"))
    text, layers = decode_config(tpl.get("config") or "", a.template)
    if not text:
        die(f"could not find {a.template} inside template config")
    now = int(time.time())
    rid = a.rule_id or str(uuid.uuid4())
    server = dict(tpl)
    server.update({
        "id": f"host:{a.host}", "server_name": a.host, "rules": rid, "created_at": now,
        "config": encode_config(text.replace(a.template, a.host), layers),
        "pop_ids": a.pops,
    })
    for k in ("dns_record_type", "dns_cname_target", "updated_at"):
        server.pop(k, None)
    files = {f"servers/prod/host:{a.host}.json": server}
    if a.rule_id:
        rule = json.loads(ssh(a.lon1, f"cat {DATA}/rules/prod/{rid}.json"))
        if f"host:{a.host}" not in rule["servers"]:
            rule["servers"].append(f"host:{a.host}")
    else:
        # Repo convention: hh-<first IP octet>-<app>-<port>, e.g. hh-193-dockpilot-18090
        bhost, _, bport = a.backend.partition(":")
        app = re.sub(r"[^a-z0-9]+", "-", a.host.split(".")[0].lower())
        name = a.rule_name or f"hh-{bhost.split('.')[0]}-{app}-{bport or '80'}"
        rule = {
            "created_at": now, "priority": 1, "servers": [f"host:{a.host}"],
            "match": {
                "rules": {"jwt_token_validation": "equals", "path": "/", "client_ip_key": "equals",
                          "path_key": "starts_with", "country_key": "equals"},
                "response": {"strip_path": False, "auto_redirect_https": False, "routing": {"mode": "least_conn"},
                             "message": "", "backends": {}, "code": 305, "redirect_uri": a.backend,
                             "allow": True, "is_consul": False},
            },
            "id": rid, "version": 1, "profile_id": "prod", "_schema_version": 2, "name": name,
        }
    files[f"rules/prod/{rid}.json"] = rule
    os.makedirs(a.workdir, exist_ok=True)
    for rel, obj in files.items():
        path = os.path.join(a.workdir, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(obj, f, separators=(",", ":"))
    a.files, a.rid, a.rule, a.server = files, rid, rule, server
    log(f"[generate] rule {rule['name']} ({rid}) -> {rule['match']['response']['redirect_uri']}; "
        f"server host:{a.host} pop_ids={a.pops}; files in {a.workdir}")


def install_lon1(a):
    if not a.files:
        log("[lon1] nothing to install (already present)")
        return
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as t:
        for rel in a.files:
            t.add(os.path.join(a.workdir, rel), arcname=rel)
    rels = " ".join(f"'{r}'" for r in a.files)
    out = ssh(a.lon1, f"""set -e
T=$(mktemp -d); tar xf - -C $T
for r in {rels}; do
  [ -e "{DATA}/$r" ] && cp -p "{DATA}/$r" "{DATA}/$r.bak.$(date +%s)"
  install -o 33 -g 0 -m 0777 "$T/$r" "{DATA}/$r"
done
rm -rf $T
openresty -t 2>&1 | tail -1
systemctl reload openresty && systemctl is-active openresty""", stdin=buf.getvalue())
    log("[lon1] installed + reloaded: " + " | ".join(out.strip().splitlines()))


def verify(a):
    ctx = ssl.create_default_context()
    for i in range(8):
        try:
            req = urllib.request.Request(f"https://{a.host}/", headers={"User-Agent": UA})
            code = urllib.request.urlopen(req, timeout=60, context=ctx).status
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception as e:  # TLS not issued yet, timeouts, ...
            code = f"{type(e).__name__}: {e}"
        log(f"[verify] https://{a.host}/ try {i + 1}: {code}")
        if isinstance(code, int) and code < 500:
            log("[verify] OK — trusted certificate and backend reached")
            return
        time.sleep(15)
    die("HTTPS did not come up — check DNS points at lon1 (grey cloud) and the backend")


def lon2(a):
    if not a.lon2:
        return
    rel = f"servers/prod/host:{a.host}.json"
    for i in range(24):  # wslproxy-edge-sync.timer runs every 5 min
        out = ssh(a.lon2, f"test -e '{DATA}/{rel}' && echo yes || echo no", check=False).strip()
        if out == "yes":
            log(f"[lon2] mirrored from lon1 ({a.lon2})")
            return
        if i == 0:
            log("[lon2] waiting for wslproxy-edge-sync (<= 5 min)...")
        time.sleep(15)
    log("[lon2] WARNING: not mirrored after 6 min — check `systemctl list-timers wslproxy-edge-sync.timer` on lon2")


def cp_import(a):
    env = read_env(a.cp_env)
    st, d = http("POST", f"{a.cp}/api/user/login", {"email": env["CP_API_USER"], "password": env["CP_API_PASSWD"]})
    if st != 200:
        die(f"CP login failed: {st} {d}")
    hdr = {"Authorization": "Bearer " + d["data"]["accessToken"], "x-platform": "openresty-admin-next"}
    for dtype, rec in (("rules", a.rule), ("servers", a.server)):
        st, d = http("POST", f"{a.cp}/api/projects/import?_format=json",
                     {"dataType": dtype, "envProfile": "prod", "data": [rec]}, hdr)
        if st != 200:
            die(f"CP import {dtype}: {st} {d}")
    st, d = http("GET", f"{a.cp}/api/servers/host:{a.host}?envprofile=prod", headers=hdr)
    rec = d.get("data", d) if isinstance(d, dict) else {}
    log(f"[cp] imported; read back: rules={rec.get('rules')} pop_ids={rec.get('pop_ids')}")
    log("[cp] next: mirror CP into git (opens PRs; branch protection needs your approval):")
    for pop in a.pops:
        log(f"       gh workflow run 'Sync POP config from CP (Go → data/ → PR)' -R bwalia/wslproxy "
            f"-f pop_id={pop} -f env_profile=prod")


def dns(a):
    path = os.path.expanduser(a.cf_token_file)
    if not os.path.exists(path):
        log(f"[dns] skipped: no Cloudflare token at {a.cf_token_file} (the *.workstation.co.uk wildcard may already cover it)")
        return
    tok = open(path).read().strip()
    hdr = {"Authorization": "Bearer " + tok}
    api = "https://api.cloudflare.com/client/v4"
    zone_name = ".".join(a.host.split(".")[-3:]) if a.host.endswith(".co.uk") else ".".join(a.host.split(".")[-2:])
    st, d = http("GET", f"{api}/zones?name={zone_name}", headers=hdr)
    if st != 200 or not d.get("result"):
        die(f"Cloudflare zone {zone_name}: {st} {d if st != 200 else 'not found'}")
    zone = d["result"][0]["id"]
    def records(name):
        return http("GET", f"{api}/zones/{zone}/dns_records?name={name}", headers=hdr)[1].get("result", [])
    if records(a.host):
        log(f"[dns] {a.host} already has a record; leaving it")
        return
    src = records(a.dns_from)
    if len(src) != 1:
        die(f"[dns] expected exactly one record for {a.dns_from}, found {len(src)}")
    s = src[0]
    st, d = http("POST", f"{api}/zones/{zone}/dns_records", {
        "type": s["type"], "name": a.host, "content": s["content"], "proxied": s["proxied"], "ttl": s["ttl"],
        "comment": f"wslproxy vhost -> {a.backend} (added by wslproxy-add-domain)"}, hdr)
    if st != 200 or not d.get("success"):
        die(f"[dns] create failed: {st} {d}")
    log(f"[dns] {s['type']} {a.host} -> {s['content']} (proxied={s['proxied']}, ttl={s['ttl']}) copied from {a.dns_from}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", required=True, help="FQDN to add, e.g. foo.workstation.co.uk")
    p.add_argument("--backend", help="host:port the POP proxies to (public IP + port-forward), e.g. 193.237.176.232:18095")
    p.add_argument("--rule-id", help="attach to an existing rule instead of creating one (backend taken from it)")
    p.add_argument("--rule-name", help="name for the new rule (default derived from host + backend)")
    p.add_argument("--template", default="dockpilot.workstation.co.uk", help="existing lon1 server to clone")
    p.add_argument("--pops", default="lon1,pop0", help="server pop_ids (lon2 == pop0)")
    p.add_argument("--lon1", default="root@195.20.255.201")
    p.add_argument("--lon2", default="administrator@85.190.106.189", help="'' to skip the mirror check")
    p.add_argument("--cp", default="https://cp.pop0.uk")
    p.add_argument("--cp-env", default="~/.config/wslproxy/cp.env", help="file with CP_API_USER= / CP_API_PASSWD=")
    p.add_argument("--cf-token-file", default="~/.config/cloudflare/token", help="Cloudflare token (Zone:Read + DNS:Edit)")
    p.add_argument("--dns-from", default="dockpilot.workstation.co.uk", help="copy this host's DNS record")
    p.add_argument("--steps", default=",".join(STEPS))
    p.add_argument("--workdir", default=None)
    p.add_argument("--dry-run", action="store_true", help="preflight + generate only; change nothing")
    a = p.parse_args()
    a.pops = [x for x in a.pops.split(",") if x]
    a.workdir = a.workdir or tempfile.mkdtemp(prefix=f"add-domain-{a.host}-")
    steps = ["preflight", "generate"] if a.dry_run else [s for s in a.steps.split(",") if s]
    if any(s in steps for s in ("lon1", "cp")) and "generate" not in steps:
        steps.insert(0, "generate")
    fns = {"preflight": preflight, "generate": generate, "lon1": install_lon1, "verify": verify,
           "lon2": lon2, "cp": cp_import, "dns": dns}
    for s in STEPS:
        if s in steps:
            fns[s](a)
    log("done" + (" (dry run — nothing changed)" if a.dry_run else ""))


if __name__ == "__main__":
    main()
