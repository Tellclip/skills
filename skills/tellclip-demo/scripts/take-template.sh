#!/bin/bash
# Take template — copy, fill in the beats, run with ONE bash call.
#
# The whole recording lives in this file so no LLM turnaround ever lands
# inside the take (that dead air is what makes a clip look bot-made) and so
# helpers survive: shell state does NOT persist between agent tool calls, but
# it does inside one script.
#
#   bash take.sh 42          # 42 = window_id from `tellclip targets`
#
# Every beat is `sleep <pace> && tc-click <ref> "<label>"`. Pacing:
#   menu/dropdown opens                  0.9-1.3s
#   new screen or step                   1.5-2s
#   click -> dependent click, same view  0.6-0.8s
#   final beat before stop               2-2.5s
# Target: raw take under 30s.
set -euo pipefail

WINDOW="${1:?usage: take.sh <window_id>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tc-click() { "$HERE/tc-click" "$@"; }
# If `tellclip` is not on PATH, uncomment and point at the installed CLI:
# tellclip() { node /path/to/tellclip/dist/tellclip.js "$@"; }

# A failed beat must not leave the recorder running forever. Stop rather than
# cancel, so you can `tellclip frame` the wreck and see which beat died.
trap 'echo "beat failed — stopping the take" >&2; tellclip stop >&2 || true' ERR

tellclip record --window "$WINDOW"

# --- beats -----------------------------------------------------------------
# Refs come from the rehearsal pass. Re-snapshot after EVERY navigation
# during rehearsal — refs go stale silently, and a dead click is a retake.

sleep 1.8; tc-click @e5 "opened the Projects menu"
sleep 1.1; tc-click @e9 "chose New Project"
sleep 1.6; tc-click @e14 "created it"

# Non-click beats mark themselves:
# sleep 1.2; agent-browser scroll down 450 && tellclip mark "scrolled to plans"

# Navigation mid-take must repeat the EXACT launch flags, or agent-browser
# relaunches the browser and the infobar/stray tab come back on camera:
# sleep 1.0; agent-browser goto https://... --headed --args "--disable-infobars,about:blank" \
#   && tellclip mark "opened the dashboard"

sleep 2.2   # let the final state land before the cut
# ---------------------------------------------------------------------------

tellclip stop
