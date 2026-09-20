#!/bin/sh
# Container entry: emit admin runtime-config.js then start OpenResty.
set -eu

SCRIPT="/usr/local/bin/write-admin-runtime-config.sh"
if [ -x "$SCRIPT" ]; then
  "$SCRIPT" || true
elif [ -f "$SCRIPT" ]; then
  sh "$SCRIPT" || true
fi

exec /usr/local/openresty/nginx/sbin/nginx -g "daemon off;"
