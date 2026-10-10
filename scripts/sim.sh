#!/usr/bin/env bash
# Drive the Even simulator automation API. usage: sim.sh shot <name> | in <action> | log [n]
set -euo pipefail
P="${SIM_PORT:-9898}"; OUT="${SIM_OUT:-/workspace/grokbot-glass/evidence}"
case "$1" in
  shot) curl -s "http://127.0.0.1:$P/api/screenshot/glasses" -o "$OUT/$2.png" && echo "$OUT/$2.png" ;;
  in)   curl -s -X POST -H 'content-type: application/json' -d "{\"action\":\"$2\"}" "http://127.0.0.1:$P/api/input"; echo ;;
  log)  curl -s "http://127.0.0.1:$P/api/console" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(str(e.get('message', e))[:220]) for e in d['entries'] if '[glass]' in str(e.get('message','')) or e.get('level')=='error'][-int(sys.argv[1]):]" "${2:-15}" ;;
esac
