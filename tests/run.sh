#!/bin/sh
# Usage: tests/run.sh <tag> "<query>"   e.g. tests/run.sh wide "pdf=wide60&w=1280&h=720"
# Runs the harness in real-time headless Chrome and prints the JSON result.
cd "$(dirname "$0")"; rm -f out-$1.json
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1400,1000 --user-data-dir=/tmp/st-qa-$1 ${DPR:+--force-device-scale-factor=$DPR} "http://localhost:8888/workplaces/sunset-ticker/tests/m1-harness.html?tag=$1&$2" >/dev/null 2>&1 &
P=$!; i=0
while [ ! -s out-$1.json ] && [ $i -lt 150 ]; do sleep 1; i=$((i+1)); done
kill $P 2>/dev/null; pkill -f "st-qa-$1" 2>/dev/null; cat out-$1.json
