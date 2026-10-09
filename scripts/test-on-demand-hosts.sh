#!/usr/bin/env bash
# On-demand hosts end to end (api/on_demand.lua, docs/on-demand-hosts.md).
#
#   scripts/test-on-demand-hosts.sh              # uses wslproxy-wslproxy:latest (docker-compose-local build)
#   WSLPROXY_IMAGE=my/image:tag scripts/test-on-demand-hosts.sh
#
# Runs the image with this checkout's api/ and nginx-dev.conf.tmpl on an
# internal Docker network (no internet: no real certificate is ever
# requested), plus one Python stub that is both the backend (echoes the
# request headers) and the ask service (200 only for forms.acme.test).
set -euo pipefail
IMAGE=${WSLPROXY_IMAGE:-wslproxy-wslproxy:latest}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$(mktemp -d); NET=wslod-$$; P=wslod-$$
cleanup() { docker rm -f $P-proxy $P-stub >/dev/null 2>&1 || true; docker network rm $NET >/dev/null 2>&1 || true; rm -rf "$W"; }
trap cleanup EXIT

mkdir -p "$W/servers" "$W/rules"
cat > "$W/stub.py" <<'EOF'
import json, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading

class Echo(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        body = json.dumps({"headers": {k.lower(): v for k, v in self.headers.items()}, "path": self.path}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

class Ask(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        q = urllib.parse.urlparse(self.path)
        domain = urllib.parse.parse_qs(q.query).get("domain", [""])[0]
        with open("/w/asks.log", "a") as f:
            f.write(domain + "\n")
        self.send_response(200 if q.path == "/check" and domain == "forms.acme.test" else 404)
        self.send_header("Content-Length", "0"); self.end_headers()

threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", 8001), Ask).serve_forever, daemon=True).start()
ThreadingHTTPServer(("0.0.0.0", 8000), Echo).serve_forever()
EOF
touch "$W/asks.log"

docker network create --internal $NET >/dev/null
docker run -d --name $P-stub --network $NET --network-alias stub -v "$W:/w" python:3.12-alpine python -I /w/stub.py >/dev/null
STUB_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $P-stub)

server() { # name ask_url
  local ask=""
  [ -n "$2" ] && ask=", \"on_demand_ask_url\": \"$2\""
  cat > "$W/servers/host:$1.json" <<EOF
{"id": "host:$1", "server_name": "$1", "profile_id": "int", "rules": "od-rule", "listens": [{"listen": "80"}],
 "config_status": false, "ssl_enabled": true, "ssl_email": "ops@example.com", "ssl_force_https": false,
 "match_cases": [] $ask}
EOF
}
server dash.test "http://stub:8001/check"
cat > "$W/rules/od-rule.json" <<EOF
{"id": "od-rule", "name": "to the echo backend", "profile_id": "int", "priority": 1, "_schema_version": 2,
 "match": {"rules": {"path": "/", "path_key": "starts_with"},
           "response": {"code": 305, "redirect_uri": "$STUB_IP:8000", "allow": false, "message": "undefined"}}}
EOF

docker run -d --name $P-proxy --network $NET --add-host host.docker.internal:127.0.0.1 \
  -v "$ROOT/api:/usr/local/openresty/nginx/html/api:ro" \
  -v "$ROOT/nginx-dev.conf.tmpl:/usr/local/openresty/nginx/conf/nginx.conf:ro" \
  -v "$W/servers:/opt/nginx/data/servers/int" -v "$W/rules:/opt/nginx/data/rules/int" \
  "$IMAGE" >/dev/null
for _ in $(seq 1 30); do docker exec $P-proxy sh -c 'curl -fs -o /dev/null http://127.0.0.1:8080/health' 2>/dev/null && break; sleep 1; done
sleep 2 # the first list of on-demand servers (worker 0, at start)

fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails + 1)); fi; }
get() { # host [extra curl args] -> body
  docker exec $P-proxy sh -c "curl -s -H 'Host: $1' ${2:-} http://127.0.0.1/"
}
asks() { grep -cx "$1" "$W/asks.log" || true; }

echo "== on-demand hosts"
own=$(get dash.test)
check "a configured host is served as before, never asked about" \
  '[[ "$own" == *"\"host\": \"dash.test\""* && "$own" != *"x-original-host"* && $(asks dash.test) == 0 ]]'
od=$(get forms.acme.test)
check "a vouched-for host is served as that server (Host upstream = its name)" '[[ "$od" == *"\"host\": \"dash.test\""* ]]'
check "... and the backend gets the client's host as X-Original-Host" '[[ "$od" == *"\"x-original-host\": \"forms.acme.test\""* ]]'
spoof=$(get forms.acme.test "-H 'X-Original-Host: evil.test'")
check "... which a client can't spoof on an on-demand request" '[[ "$spoof" == *"\"x-original-host\": \"forms.acme.test\""* ]]'
nope=$(get nope.acme.test)
check "a host nobody vouches for isn't served (the 'not configured' page)" '[[ "$nope" != *"\"headers\""* ]]'
for _ in 1 2 3; do get forms.acme.test >/dev/null; get nope.acme.test >/dev/null; done
check "answers are cached: one ask per host" '[[ $(asks forms.acme.test) == 1 && $(asks nope.acme.test) == 1 ]]'
get 10.1.2.3 >/dev/null; get localhost >/dev/null
check "IP addresses and bare names are never asked about" '[[ $(asks 10.1.2.3) == 0 && $(asks localhost) == 0 ]]'

echo "== certificates (allow_domain)"
tls() { docker exec $P-proxy sh -c "echo | timeout 15 openssl s_client -connect 127.0.0.1:443 -servername $1 >/dev/null 2>&1" || true; }
tls forms.acme.test; tls never.acme.test
log=$(docker exec $P-proxy sh -c 'cat /var/log/nginx/error.log /usr/local/openresty/nginx/logs/error.log 2>/dev/null' || true)
check "a vouched-for host may get a certificate" '[[ "$log" == *"issuing new certificate for forms.acme.test"* ]]'
check "a host nobody vouches for may not" '[[ "$log" != *"issuing new certificate for never.acme.test"* && "$log" == *"not allowed"*"never.acme.test"* ]]'

echo "== off when no server asks"
server dash.test ""
sleep 32 # the next refresh of the list
before=$(wc -l < "$W/asks.log")
off=$(get other.acme.test)
check "without on_demand_ask_url nothing is asked and unknown hosts are 'not configured'" \
  '[[ $(wc -l < "$W/asks.log") == "$before" && "$off" != *"\"headers\""* ]]'

echo
if [ $fails -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "$fails CHECK(S) FAILED"; docker logs --tail 40 $P-proxy 2>&1 | tail -40; fi
exit $((fails > 0))
