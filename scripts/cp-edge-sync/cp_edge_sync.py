#!/usr/bin/env python3
"""CP → edge GitOps: plan (and safely apply) cp.pop0.uk's config on lon1; lon2 (pop0) mirrors lon1.

cp.pop0.uk is the source of truth, but nothing used to push it to the POPs: cp-sync-pop-to-git.yml stops at
an unapprovable PR, and deploy-pop-config.yml swaps whole trees with rsync --delete (which would delete every
vhost that exists on lon1 but not on CP). This tool works record by record instead.

  plan                     GET /api/configuration/export?pop_id=<pop>&env=<env>, pull the live JSON from the
                           edge over SSH, and classify every difference:
                             add_servers / add_rules      on CP, missing on the edge
                             meta_servers                 only metadata differs (pop_ids, timestamps)
                             change_servers / change_rules behaviour differs (routing, headers, blocks, …)
                             orphan_servers / orphan_rules on the edge, not on CP (would be deletes)
  apply --level adds       write add_* only; new hosts are merged into their rule's `servers` (never replaced)
  apply --level changes    + change_* and meta_* (CP wins), still never deletes
  apply ... --allow-delete + remove orphans (each removed file is backed up first)

Every apply first snapshots the edge's live servers/ and rules/ to /opt/nginx/data/.backups/cp-edge-sync-<ts>.tgz,
writes each file atomically (owner 33, mode 0777, as the edge's own admin API does), runs `openresty -t`, and
reloads only when a server file is new (lon1's auto-ssl learns new hostnames at worker start). Server and rule
JSON is read per request, so updates need no reload. lon2 (pop0) pulls lon1 every 5 minutes
(wslproxy-edge-sync); with --wait-mirror the tool waits until pop0 serves every added host (HTTP probe).

Output: a JSON plan (or result) on stdout and a Markdown summary at --summary (for $GITHUB_STEP_SUMMARY).
Exit codes: 0 ok, 1 error, 3 plan has changes the requested level would not apply (informational for CI).

Env: CP_URL, CP_TOKEN (or CP_API_USER + CP_API_PASSWD), EDGE (ssh target, default root@lon1.pop0.uk),
     MIRROR_IP (pop0's address for the HTTP mirror check, default 85.190.106.189).
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import os
import subprocess
import sys
import tarfile
import time
import urllib.request

DATA = "/opt/nginx/data"
META_KEYS = {"pop_ids", "updated_at", "created_at", "_comment", "_schema_version"}
# cp.pop0.uk sits behind wslproxy's bot filter, which refuses the default Python-urllib agent.
UA = {"User-Agent": "wslproxy-cp-edge-sync/1.0 (+https://github.com/bwalia/wslproxy)"}
SSH_OPTS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=15"]


# ---------------------------------------------------------------- CP

def cp_token(url: str) -> str:
    tok = os.environ.get("CP_TOKEN", "")
    if tok:
        return tok
    user, pw = os.environ.get("CP_API_USER", ""), os.environ.get("CP_API_PASSWD", "")
    if not (user and pw):
        sys.exit("set CP_TOKEN or CP_API_USER + CP_API_PASSWD")
    req = urllib.request.Request(f"{url}/api/user/login", data=json.dumps({"email": user, "password": pw}).encode(),
                                 headers={"Content-Type": "application/json", **UA}, method="POST")
    with urllib.request.urlopen(req, timeout=45) as r:
        body = json.load(r)
    tok = (body.get("data") or {}).get("accessToken") or body.get("accessToken")
    if not tok:
        sys.exit("CP login returned no accessToken")
    return tok


def cp_export(url: str, token: str, pop: str, env: str) -> dict:
    req = urllib.request.Request(f"{url}/api/configuration/export?pop_id={pop}&env={env}",
                                 headers={"Authorization": f"Bearer {token}", **UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = json.load(r)
    d = body.get("data", body)
    out = {}
    for kind in ("servers", "rules"):
        recs = {}
        for rec in d.get(kind) or []:
            rid = rec.get("id") or (f"host:{rec['server_name']}" if rec.get("server_name") else None)
            if rid:
                recs[rid] = rec
        out[kind] = recs
    out["export_id"] = d.get("export_id") or body.get("export_id")
    if len(out["servers"]) < 10:
        sys.exit(f"CP export for {pop}/{env} has only {len(out['servers'])} servers; refusing to plan against it")
    return out


# ---------------------------------------------------------------- edge

def ssh(target: str, cmd: str, stdin: bytes | None = None, sudo: bool = False) -> bytes:
    if sudo:
        cmd = f"sudo -n sh -c {sh_quote(cmd)}"
    p = subprocess.run(["ssh", *SSH_OPTS, target, cmd], input=stdin, capture_output=True, timeout=600)
    if p.returncode != 0:
        raise RuntimeError(f"ssh {target}: {cmd[:80]}…: rc={p.returncode} {p.stderr.decode(errors='replace')[:400]}")
    return p.stdout


def sh_quote(s: str) -> str:
    return "'" + s.replace("'", "'\\''") + "'"


def edge_live(target: str, env: str, sudo: bool = False) -> dict:
    raw = ssh(target, f"cd {DATA} && find servers/{env} rules/{env} -maxdepth 1 -name '*.json' -print0 "
                      f"| tar cf - --null -T -", sudo=sudo)
    out = {"servers": {}, "rules": {}}
    with tarfile.open(fileobj=io.BytesIO(raw)) as tf:
        for m in tf.getmembers():
            if not m.isfile():
                continue
            kind, _, name = m.name.split("/", 2)
            try:
                out[kind][name[:-5]] = json.load(tf.extractfile(m))
            except (ValueError, KeyError):
                out[kind][name[:-5]] = None  # unreadable: treated as changed
    return out


# ---------------------------------------------------------------- plan

def differing_keys(a: dict | None, b: dict) -> list[str]:
    if a is None:
        return ["<unreadable>"]
    keys = set(a) | set(b)
    return sorted(k for k in keys if json.dumps(a.get(k), sort_keys=True) != json.dumps(b.get(k), sort_keys=True))


def plan(cp: dict, live: dict) -> dict:
    p = {k: [] for k in ("add_servers", "add_rules", "meta_servers", "change_servers", "change_rules",
                         "orphan_servers", "orphan_rules")}
    for kind in ("servers", "rules"):
        for rid, rec in cp[kind].items():
            if rid not in live[kind]:
                p[f"add_{kind}"].append(rid)
                continue
            keys = differing_keys(live[kind][rid], rec)
            if kind == "rules":
                keys = [k for k in keys if k != "servers"]  # rule membership is merged, never replaced
            behaviour = [k for k in keys if k not in META_KEYS]
            if behaviour:
                p[f"change_{kind}"].append({"id": rid, "keys": behaviour})
            elif keys and kind == "servers":
                p["meta_servers"].append(rid)
        p[f"orphan_{kind}"] = sorted(set(live[kind]) - set(cp[kind]))
    for k in p:
        if p[k] and isinstance(p[k][0], str):
            p[k].sort()
    return p


def summary_md(pop: str, env: str, export_id, p: dict, applied: dict | None) -> str:
    rows = [("New vhosts", "add_servers"), ("New rules", "add_rules"), ("Metadata-only vhost diffs", "meta_servers"),
            ("Behaviour changes (vhosts)", "change_servers"), ("Behaviour changes (rules)", "change_rules"),
            ("On edge, not on CP (vhosts)", "orphan_servers"), ("On edge, not on CP (rules)", "orphan_rules")]
    out = [f"### CP → {pop} ({env})", f"Export `{export_id}`", "", "| Class | Count | Examples |", "|---|---|---|"]
    for label, k in rows:
        ex = ", ".join((x["id"] if isinstance(x, dict) else x) for x in p[k][:4])
        out.append(f"| {label} | {len(p[k])} | {ex} |")
    if applied:
        out += ["", "**Applied:** " + ", ".join(f"{k}={v}" for k, v in applied.items())]
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------- apply

def atomic_write_cmd(path: str) -> str:
    return (f"f={sh_quote(path)}; cat > \"$f.new\" && "
            f"install -o 33 -g 0 -m 0777 \"$f.new\" \"$f.tmp\" && mv -f \"$f.tmp\" \"$f\" && rm -f \"$f.new\"")


def apply(target: str, env: str, cp: dict, live: dict, p: dict, level: str, allow_delete: bool, sudo: bool) -> dict:
    ts = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ssh(target, f"mkdir -p {DATA}/.backups && cd {DATA} && tar czf .backups/cp-edge-sync-{ts}.tgz servers/{env} rules/{env} "
                f"&& ls -1t .backups/cp-edge-sync-*.tgz | tail -n +41 | xargs -r rm -f", sudo=sudo)
    done = {"backup": f"{DATA}/.backups/cp-edge-sync-{ts}.tgz", "servers_added": 0, "rules_added": 0,
            "rules_membership": 0, "servers_changed": 0, "rules_changed": 0, "deleted": 0}

    def put(kind: str, rid: str, rec: dict) -> None:
        ssh(target, atomic_write_cmd(f"{DATA}/{kind}/{env}/{rid}.json"),
            stdin=json.dumps(rec, separators=(",", ":")).encode(), sudo=sudo)

    # Rules first, so a new server never points at a rule the edge doesn't have.
    rules_to_write: dict[str, dict] = {}
    for rid in p["add_rules"]:
        rules_to_write[rid] = dict(cp["rules"][rid])
    if level == "changes":
        for c in p["change_rules"]:
            merged = dict(cp["rules"][c["id"]])
            merged["servers"] = sorted(set((live["rules"].get(c["id"]) or {}).get("servers") or [])
                                       | set(merged.get("servers") or []))
            rules_to_write[c["id"]] = merged
    servers_to_write = {rid: cp["servers"][rid] for rid in p["add_servers"]}
    if level == "changes":
        for c in p["change_servers"]:
            servers_to_write[c["id"]] = cp["servers"][c["id"]]
        for rid in p["meta_servers"]:
            servers_to_write[rid] = cp["servers"][rid]
    # Every server we write must be listed by each of its rules (merge into the live rule).
    for sid, srv in servers_to_write.items():
        for rule in srv.get("rules") or []:
            base = rules_to_write.get(rule) or live["rules"].get(rule) or cp["rules"].get(rule)
            if base is None:
                raise RuntimeError(f"{sid} uses rule {rule}, which is neither on CP nor on the edge")
            members = list(base.get("servers") or [])
            if sid not in members:
                rules_to_write[rule] = {**base, "servers": members + [sid]}
                if rule not in p["add_rules"]:
                    done["rules_membership"] += 1
    for rid, rec in rules_to_write.items():
        put("rules", rid, rec)
        if rid in p["add_rules"]:
            done["rules_added"] += 1
        elif level == "changes" and any(c["id"] == rid for c in p["change_rules"]):
            done["rules_changed"] += 1
    for sid, rec in servers_to_write.items():
        put("servers", sid, rec)
        if sid in p["add_servers"]:
            done["servers_added"] += 1
        else:
            done["servers_changed"] += 1
    if allow_delete:
        for kind in ("servers", "rules"):
            for rid in p[f"orphan_{kind}"]:
                ssh(target, f"rm -f {sh_quote(f'{DATA}/{kind}/{env}/{rid}.json')}", sudo=sudo)
                done["deleted"] += 1
    ssh(target, "openresty -t -q", sudo=sudo)
    if done["servers_added"]:
        ssh(target, "systemctl reload openresty && sleep 3 && systemctl is-active --quiet openresty", sudo=sudo)
        done["reloaded"] = True
    return done


def verify(target_host_ip: str, hosts: list[str]) -> list[str]:
    bad = []
    for h in hosts:
        p = subprocess.run(["curl", "-s", "-o", "/dev/null", "-D", "-", "-m", "15", "--resolve", f"{h}:80:{target_host_ip}",
                            f"http://{h}/"], capture_output=True, text=True)
        if "no_server" in p.stdout.lower():
            bad.append(h)
    return bad


def wait_mirror(mirror_ip: str, hosts: list[str], timeout_s: int) -> list[str]:
    """pop0 pulls lon1 every 5 min; wait until it serves every added host (HTTP probe, no SSH to pop0)."""
    deadline = time.time() + timeout_s
    missing = hosts
    while time.time() < deadline:
        missing = verify(mirror_ip, hosts)
        if not missing:
            return []
        time.sleep(30)
    return missing


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["plan", "apply"])
    ap.add_argument("--pop", default="lon1")
    ap.add_argument("--env", default="prod")
    ap.add_argument("--level", choices=["adds", "changes"], default="adds")
    ap.add_argument("--allow-delete", action="store_true")
    ap.add_argument("--max-adds", type=int, default=40, help="refuse an unattended apply bigger than this")
    ap.add_argument("--wait-mirror", type=int, default=0, help="seconds to wait for pop0 to mirror added hosts")
    ap.add_argument("--summary", default=os.environ.get("GITHUB_STEP_SUMMARY", ""))
    a = ap.parse_args()

    cp_url = os.environ.get("CP_URL", "https://cp.pop0.uk").rstrip("/")
    edge = os.environ.get("EDGE", "root@lon1.pop0.uk")
    mirror_ip = os.environ.get("MIRROR_IP", "85.190.106.189")
    sudo = not edge.startswith("root@")

    cp = cp_export(cp_url, cp_token(cp_url), a.pop, a.env)
    live = edge_live(edge, a.env, sudo=sudo)
    p = plan(cp, live)
    result: dict = {"pop": a.pop, "env": a.env, "export_id": cp["export_id"], "plan": p}
    applied = None
    if a.mode == "apply":
        n_adds = len(p["add_servers"]) + len(p["add_rules"])
        if n_adds > a.max_adds:
            sys.exit(f"{n_adds} additions exceed --max-adds {a.max_adds}; run it by hand to confirm")
        if n_adds or (a.level == "changes" and (p["change_servers"] or p["change_rules"] or p["meta_servers"])) \
                or (a.allow_delete and (p["orphan_servers"] or p["orphan_rules"])):
            applied = apply(edge, a.env, cp, live, p, a.level, a.allow_delete, sudo)
            new_hosts = [cp["servers"][s].get("server_name") for s in p["add_servers"] if cp["servers"][s].get("server_name")]
            ip = subprocess.run(["sh", "-c", f"getent hosts {edge.split('@')[-1]} 2>/dev/null | awk '{{print $1}}' "
                                 f"|| dig +short {edge.split('@')[-1]} | tail -1"], capture_output=True, text=True).stdout.split()
            if new_hosts and ip:
                applied["not_served"] = verify(ip[-1], new_hosts)
            if a.wait_mirror and new_hosts:
                applied["mirror_missing"] = wait_mirror(mirror_ip, new_hosts, a.wait_mirror)
        else:
            applied = {"nothing_to_apply": True}
        result["applied"] = applied
    print(json.dumps(result, indent=1))
    if a.summary:
        with open(a.summary, "a") as f:
            f.write(summary_md(a.pop, a.env, cp["export_id"], p, applied))
    if applied and (applied.get("not_served") or applied.get("mirror_missing")):
        return 1
    pending = p["change_servers"] or p["change_rules"] or p["orphan_servers"] or p["orphan_rules"]
    if a.mode == "plan" and pending:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
