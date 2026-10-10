#!/usr/bin/env bash
# Restart the Even simulator on a dev URL. usage: sim-start.sh "<query string>"
pkill -f sim-linux-x64/bin/evenhub-simulator || true; sleep 1
cd /workspace/grokbot-glass/evidence
DISPLAY="${DISPLAY:-:3}" nohup /workspace/grokbot-glass/repo/node_modules/@evenrealities/sim-linux-x64/bin/evenhub-simulator "http://127.0.0.1:5174/?$1" --automation-port 9898 > /tmp/glass-sim.log 2>&1 &
for i in $(seq 1 20); do curl -s -m 1 http://127.0.0.1:9898/api/ping >/dev/null && break; sleep 1; done; sleep 7
