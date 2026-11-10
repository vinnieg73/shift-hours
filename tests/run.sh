#!/usr/bin/env bash
# Runs every page test against a local static server, phone and desktop, light and dark.
# usage: tests/run.sh [test names...]   (default: all)   needs node + playwright
# The four sizes of a test run side by side (each has its own browser); JOBS=1 runs them one at a time.
# No network is needed: online the page loads its fonts from Google, offline it falls back to system fonts.
set -u
cd "$(dirname "$0")/.."
PORT=${PORT:-8832}
JOBS=${JOBS:-4}
export SHOTS=${SHOTS:-$(mktemp -d)}
export NODE_PATH=${NODE_PATH:-$(npm root -g 2>/dev/null)}
OUT=$(mktemp -d)
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -rf "$OUT"' EXIT
for i in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.1; done
BASE="http://127.0.0.1:$PORT/"
TESTS=${*:-"smoke backup punch oconus audit review months"}
COMBOS=("402 874 1 light" "402 874 1 dark" "1280 900 0 light" "1280 900 0 dark")
fail=0; total=0
for t in $TESTS; do
  case $t in
    smoke) f=tests/smoke.js; pre="" ;;
    oconus) f=tests/oconus.test.js; pre="''" ;;
    audit) f=tests/audit-2026-10-23.test.js; pre="" ;;
    review) f=tests/audit-2026-11-10.test.js; pre="" ;;
    *) f=tests/$t.test.js; pre="" ;;
  esac
  pids=()
  for k in "${!COMBOS[@]}"; do
    ( eval node "$f" "$BASE" $pre ${COMBOS[$k]} >"$OUT/$t.$k" 2>&1; echo $? >"$OUT/$t.$k.code" ) &
    pids+=($!)
    if [ "${#pids[@]}" -ge "$JOBS" ]; then wait "${pids[@]}"; pids=(); fi
  done
  [ "${#pids[@]}" -gt 0 ] && wait "${pids[@]}"
  for k in "${!COMBOS[@]}"; do
    out=$(cat "$OUT/$t.$k"); code=$(cat "$OUT/$t.$k.code" 2>/dev/null || echo 1)
    pass=$(grep -c '^PASS' <<<"$out"); bad=$(grep -c '^FAIL ' <<<"$out"); total=$((total + pass))
    echo "$t ${COMBOS[$k]}: $pass passed, $bad failed (exit $code)"
    if [ "$code" -ne 0 ] || [ "$bad" -ne 0 ]; then fail=1; grep -E '^FAIL |Error|CRASH' <<<"$out" | head -20; fi
  done
done
echo "total: $total passed; $([ $fail -eq 0 ] && echo 'all checks passed' || echo 'SOME CHECKS FAILED')"
exit $fail
