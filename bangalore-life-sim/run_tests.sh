#!/usr/bin/env bash
# Runs every automated test in the repo. Exit code != 0 if anything fails.
# e2e needs Playwright (npm i -D playwright && npx playwright install chromium) and a static server on :8765.
set -euo pipefail
cd "$(dirname "$0")"
echo "== python: OSM pipeline =="; python3 tools/osm_pipeline/test_pipeline.py
echo "== node: graph / vehicle / traffic / missions =="
for t in graph vehicle traffic missions; do node prototype/tests/$t.test.mjs | tail -1; done
echo "== native: train dynamics (g++) =="
g++ -std=c++17 -O2 -Wall -Wextra -Iunreal/BangaloreLifeSim/Source/BangaloreLifeSim/Metro native_tests/test_train_dynamics.cpp -o "${TMPDIR:-/tmp}/bls_ttd" && "${TMPDIR:-/tmp}/bls_ttd" | tail -1
if [ "${E2E:-0}" = "1" ]; then
  echo "== e2e (headless Chromium) =="
  (cd prototype && python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/bls_srv.pid; sleep 1; node tests/e2e.cjs http://localhost:8765/index.html "${SHOTS:-/tmp}"; kill "$(cat /tmp/bls_srv.pid)")
fi
echo "ALL OK"
