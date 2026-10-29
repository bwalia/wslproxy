#!/usr/bin/env bash
# Build a data-centre CIDR file for Bot Defense (BD_DATACENTER, general IVT)
# from the ranges cloud providers publish themselves. Free, public data; run
# it offline (cron, CI) and ship the file — the edge never fetches anything.
#
#   scripts/bot-defense-datacenter-ranges.sh > data/bot_defense/datacenter.cidr
#
# Then point settings.json at it (re-read within reload_interval_s):
#   "bot_defense": { "datacenter_file": "data/bot_defense/datacenter.cidr" }
#
# Sources: AWS, Google Cloud, Oracle Cloud, DigitalOcean. Add your own lines
# (one CIDR each, '#' comments allowed) for other hosting providers.
set -euo pipefail

fetch() { curl -fsSL --max-time 60 "$1"; }

echo "# Bot Defense data-centre ranges, generated $(date -u +%Y-%m-%dT%H:%M:%SZ) by $(basename "$0")"

echo "# AWS"
fetch https://ip-ranges.amazonaws.com/ip-ranges.json | python3 -c '
import json, sys
d = json.load(sys.stdin)
for p in d.get("prefixes", []): print(p["ip_prefix"])
for p in d.get("ipv6_prefixes", []): print(p["ipv6_prefix"])'

echo "# Google Cloud"
fetch https://www.gstatic.com/ipranges/cloud.json | python3 -c '
import json, sys
for p in json.load(sys.stdin).get("prefixes", []):
    v = p.get("ipv4Prefix") or p.get("ipv6Prefix")
    if v: print(v)'

echo "# Oracle Cloud"
fetch https://docs.oracle.com/en-us/iaas/tools/public_ip_ranges.json | python3 -c '
import json, sys
for region in json.load(sys.stdin).get("regions", []):
    for c in region.get("cidrs", []): print(c["cidr"])'

echo "# DigitalOcean"
fetch https://digitalocean.com/geo/google.csv | cut -d, -f1
