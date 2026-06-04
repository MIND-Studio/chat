#!/usr/bin/env bash
# wait-for-chat.sh — adaptive "active/afk" gate for the /mind-join-chat-as loop.
#
#   wait-for-chat.sh <max_wait_s> <watcher_out_file> [<watcher_out_file> ...]
#
# Polls the given chat-agent `watch` output file(s) every POLL_S seconds and
# exits the MOMENT a NEW engage-worthy line appears (an `allow` line or a
# `★@you` mention — i.e. an allowlisted human/ping, never our own `self` lines).
# Exits 0 on activity, 124 on timeout. The caller (Claude) is re-invoked when
# this background task exits, so reaction is ~POLL_S when the room is active and
# costs nothing while idle.
#
# Adaptive cadence lives in the CALLER: on exit 0 (activity) re-arm with a small
# max_wait; on exit 124 (idle) grow it (30 → 60 → 120 → 300). This script just
# blocks efficiently and reports which bucket it ended in.
set -euo pipefail

POLL_S="${WAIT_POLL_S:-3}"
MAX_WAIT="${1:?usage: wait-for-chat.sh <max_wait_s> <file> [file...]}"
shift
FILES=("$@")
[ "${#FILES[@]}" -ge 1 ] || { echo "no watcher files given" >&2; exit 2; }

# Count engage-worthy lines across all files. `self`/`other`/`[agent]` are not
# engage-worthy; only `] allow` (allowlisted sender) and `★@you` (a direct ping).
count_lines() {
  local n=0 f c
  for f in "${FILES[@]}"; do
    if [ -f "$f" ]; then
      c=$(grep -cE '\] allow|★@you' "$f" 2>/dev/null || true)
      n=$(( n + ${c:-0} ))
    fi
  done
  printf '%s' "$n"
}

baseline=$(count_lines)
elapsed=0
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  sleep "$POLL_S"
  elapsed=$(( elapsed + POLL_S ))
  now=$(count_lines)
  if [ "$now" -gt "$baseline" ]; then
    echo "ACTIVITY +$(( now - baseline )) after ${elapsed}s"
    exit 0
  fi
done
echo "IDLE timeout after ${MAX_WAIT}s (no new allow/mention lines)"
exit 124
