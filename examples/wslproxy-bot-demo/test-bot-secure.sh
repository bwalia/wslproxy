#!/usr/bin/env sh
# Simplest Bot Defense smoke test — curl only, no Python. Asserts the
# protected host stops automation and lets a browser through.
#
#   ./test-bot-secure.sh                                   # https://bots-secure.fictionally.org
#   ./test-bot-secure.sh https://bots-secure.fictionally.org
#   CURL_EXTRA="--connect-to bots-secure.fictionally.org:80:localhost:18080" \
#     ./test-bot-secure.sh http://bots-secure.fictionally.org      # local Docker stack
set -u

BASE=${1:-https://bots-secure.fictionally.org}
CHROME='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
pass=0
fail=0

# check NAME EXPECT_STATUS EXPECT_ACTION curl-args...
check() {
    name=$1 want_status=$2 want_action=$3
    shift 3
    # shellcheck disable=SC2086
    out=$(curl -sk ${CURL_EXTRA:-} -o /dev/null -D - "$@" | tr -d '\r')
    status=$(printf '%s\n' "$out" | awk 'NR==1{print $2}')
    action=$(printf '%s\n' "$out" | awk -F': ' 'tolower($1)=="x-wsl-bot-action"{print $2}')
    class=$(printf '%s\n' "$out" | awk -F': ' 'tolower($1)=="x-wsl-bot-class"{print $2}')
    if [ "$status" = "$want_status" ] && [ "$action" = "$want_action" ]; then
        pass=$((pass + 1)); tag=PASS
    else
        fail=$((fail + 1)); tag=FAIL
    fi
    printf '  [%s] %-28s expect=%s/%s got=%s/%s class=%s\n' "$tag" "$name" "$want_status" "$want_action" \
        "$status" "${action:-none}" "${class:-none}"
}

echo "── Bot Defense smoke test → $BASE"
check "sqlmap scanner"      403 block     -A 'sqlmap/1.7.11#stable (https://sqlmap.org)' "$BASE/products?page=1"
check "headless Chrome"     403 challenge -A "$(echo "$CHROME" | sed 's/Chrome\//HeadlessChrome\//')" \
                                          -H 'Accept: text/html' -H 'Accept-Language: en' -H 'Accept-Encoding: gzip' \
                                          -H 'Sec-CH-UA: "Chromium";v="130"' -H 'Sec-Fetch-Mode: navigate' "$BASE/products?page=1"
check "fake Googlebot"      403 block     -A 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' "$BASE/products?page=1"
check "checkout needs check" 403 challenge -A "$CHROME" -H 'Accept: text/html' -H 'Accept-Language: en' \
                                          -H 'Accept-Encoding: gzip' -H 'Sec-CH-UA: "Chromium";v="130"' \
                                          -H 'Sec-Fetch-Mode: navigate' "$BASE/checkout"
check "real browser"        200 allow     -A "$CHROME" -H 'Accept: text/html' -H 'Accept-Language: en-GB,en;q=0.9' \
                                          -H 'Accept-Encoding: gzip' -H 'Sec-CH-UA: "Chromium";v="130"' \
                                          -H 'Sec-Fetch-Mode: navigate' "$BASE/products?page=1"
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
