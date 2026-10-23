#!/usr/bin/env bash
# Runs every page test against a local static server, phone and desktop, light and dark.
# usage: tests/run.sh [test names...]   (default: all)   needs node + playwright (no network)
set -u
cd "$(dirname "$0")/.."
PORT=${PORT:-8832}
export SHOTS=${SHOTS:-$(mktemp -d)}
export NODE_PATH=${NODE_PATH:-$(npm root -g 2>/dev/null)}
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.1; done
BASE="http://127.0.0.1:$PORT/"
TESTS=${*:-"smoke backup punch oconus audit"}
fail=0
for t in $TESTS; do
  for combo in "402 874 1 light" "402 874 1 dark" "1280 900 0 light" "1280 900 0 dark"; do
    set -- $combo
    case $t in
      smoke) f=tests/smoke.js; args="$BASE $1 $2 $3 $4" ;;
      oconus) f=tests/oconus.test.js; args="$BASE '' $1 $2 $3 $4" ;;
      audit) f=tests/audit-2026-10-23.test.js; args="$BASE $1 $2 $3 $4" ;;
      *) f=tests/$t.test.js; args="$BASE $1 $2 $3 $4" ;;
    esac
    out=$(eval node "$f" $args 2>&1); code=$?
    pass=$(grep -c '^PASS' <<<"$out"); bad=$(grep -c '^FAIL ' <<<"$out")
    echo "$t $combo: $pass passed, $bad failed (exit $code)"
    if [ $code -ne 0 ] || [ $bad -ne 0 ]; then fail=1; grep -E '^FAIL |Error|CRASH' <<<"$out" | head -20; fi
  done
done
exit $fail
