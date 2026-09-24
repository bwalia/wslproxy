#!/bin/sh
# Container entry: start OpenResty in the foreground.
set -eu
exec /usr/local/openresty/nginx/sbin/nginx -g "daemon off;"
