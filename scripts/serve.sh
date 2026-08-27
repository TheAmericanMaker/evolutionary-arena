#!/usr/bin/env bash
# Local dev server for the arena: start / stop / status.
#
#   scripts/serve.sh           start (default)
#   scripts/serve.sh start     start in the background (pid in .serve.pid,
#                              log in .serve.log) — survives the shell exiting
#   scripts/serve.sh status    is it up?
#   scripts/serve.sh stop      kill it (TERM, then KILL if it ignores it)
#
# PORT=9000 scripts/serve.sh works too. A plain `python3 -m http.server 8000`
# left in a dead shell session can hang with its accept queue full; this
# wrapper keeps a pidfile and can always find the listener by port.
set -u
PORT="${PORT:-8000}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="$DIR/.serve.pid"
LOGFILE="$DIR/.serve.log"

port_pid() {
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
    cat "$PIDFILE"
    return 0
  fi
  rm -f "$PIDFILE"
  local out
  out="$(ss -ltnp 2>/dev/null | awk -v p="$PORT" '{n=split($4,a,":"); if (a[n]==p) print}')"
  if [[ -n "$out" ]]; then
    printf '%s' "$out" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -1
    return 0
  fi
  fuser "$PORT/tcp" 2>/dev/null | tr -d ' ' | head -c 20
}

start() {
  local pid
  pid="$(port_pid)"
  if [[ -n "$pid" ]]; then
    echo "already running (pid $pid) — http://localhost:$PORT/ — stop it with: $0 stop"
    return 0
  fi
  nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIR" >"$LOGFILE" 2>&1 </dev/null &
  echo $! > "$PIDFILE"
  disown 2>/dev/null || true
  sleep 0.5
  if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "started (pid $(cat "$PIDFILE")) — http://localhost:$PORT/"
  else
    rm -f "$PIDFILE"
    echo "failed to start; see $LOGFILE" >&2
    return 1
  fi
}

stop() {
  local pid
  pid="$(port_pid)"
  if [[ -z "$pid" ]]; then
    echo "not running"
    return 0
  fi
  kill "$pid" 2>/dev/null
  for _ in 1 2 3 4 5; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null
    echo "had to KILL it (pid $pid)"
  else
    echo "stopped (pid $pid)"
  fi
}

status() {
  local pid
  pid="$(port_pid)"
  if [[ -n "$pid" ]]; then
    echo "running (pid $pid) — http://localhost:$PORT/"
  else
    echo "not running"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "usage: $0 [start|stop|status]" >&2; exit 2 ;;
esac
