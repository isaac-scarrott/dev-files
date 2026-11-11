#!/usr/bin/env bash
# Restarts the shared OpenCode background service without cutting sessions off blind.
#
# Why: a restart (needed to load server plugins) kills every running turn and shell job. The host resumes every turn that
# was running ("The server restarted while you were working…"), so a busy session survives; only its running shell jobs
# are lost. This script shows what a restart would interrupt, waits until no shell job is running unless told otherwise,
# and afterwards wakes the sessions nothing else wakes.
# Who resumes what (measured on 2.2.5): the host itself resumes every turn that was running, and shell-handoff queues a
# notice about killed background shell jobs for the session's next turn. A session that was idle while its background job
# ran gets no next turn, so this script sends it one short message.
#
# Usage: scripts/opencode-safe-restart.sh                 show what would be interrupted; wait for running shell jobs, then restart
#        scripts/opencode-safe-restart.sh --now           restart at once
#        scripts/opencode-safe-restart.sh --dry-run       only show what would be interrupted
#        scripts/opencode-safe-restart.sh --max-wait 600  give up waiting after 600 s (default 900); exit 1, no restart
# In a terminal, running shell jobs prompt: wait, restart now, or cancel.
#
# Restarts with `opencode service restart`, the command the plugin READMEs and service-env.sh use. The shell jobs of the
# session running this script (OPENCODE_SESSION_ID) and of its parents are not waited for, since this script runs inside
# one of them. The restart runs detached, because it kills the shell that started it; its log path is printed.
# A private service is targeted the way the CLI targets one: set the XDG_* directories.
set -euo pipefail

CLI=${OPENCODE_CLI:-"$HOME/Library/Application Support/ai.opencode.desktop/cli/$(defaults read /Applications/OpenCode.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null || echo 2.2.5)-arm64/opencode-cli"}
STATE=${XDG_STATE_HOME:-$HOME/.local/state}/opencode/service.json
POLL=${OPENCODE_RESTART_POLL:-10}
max_wait=900
mode="wait"
while [ $# -gt 0 ]; do
  case $1 in
    --now) mode=now ;;
    --dry-run) mode=dry ;;
    --max-wait) max_wait=${2:?--max-wait needs seconds}; shift ;;
    --after-wait) shift; mode=after; break ;;   # internal: the detached restart phase, followed by the session ids to wake
    -h|--help) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

# api <command> [args]: one small node program over the service's HTTP API (url and password from its service.json).
#   busy          running sessions: id <tab> waited-for (yes/no) <tab> title
#   jobs          running shell jobs: session <tab> waited-for (yes/no) <tab> minutes <tab> title <tab> command
#   health        exit 0 when the API answers
#   wake ids..    send each session the restart message, which starts a turn
# "waited-for" is no when the session is this one or a parent of it: the host resumes its turn, and this script is itself
# running inside one of its shell jobs.
api() {
  STATE=$STATE node --input-type=module -e '
const { readFileSync } = await import("node:fs")
const svc = JSON.parse(readFileSync(process.env.STATE, "utf8"))
const headers = { "content-type": "application/json", authorization: "Basic " + Buffer.from(`opencode:${svc.password}`).toString("base64") }
const call = async (path, body) => {
  const res = await fetch(svc.url + path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()).data
}
const oneLine = (s, n) => String(s ?? "").replace(/\s+/g, " ").slice(0, n)
const title = (id) => call(`/api/session/${id}`).then((s) => oneLine(s.title || "(untitled)", 60), () => "(unknown)")
const self = async () => {
  const ids = new Set()
  for (let id = process.env.OPENCODE_SESSION_ID; id && !ids.has(id); ) {
    ids.add(id)
    id = await call(`/api/session/${id}`).then((s) => s.parentID, () => undefined)
  }
  return ids
}
const [cmd, ...args] = process.argv.slice(1)
if (cmd === "health") await call("/api/session/active")
if (cmd === "busy") {
  const me = await self()
  for (const id of Object.keys(await call("/api/session/active")))
    console.log([id, me.has(id) ? "no" : "yes", await title(id)].join("\t"))
}
if (cmd === "jobs") {
  const me = await self()
  const dirs = new Set((await call("/api/session?limit=200")).map((s) => s.location?.directory).filter(Boolean))
  for (const dir of dirs) {
    const jobs = await call(`/api/shell?location[directory]=${encodeURIComponent(dir)}`).catch(() => [])
    for (const job of jobs.filter((j) => j.status === "running" && j.metadata?.sessionID)) {
      const minutes = Math.round((Date.now() - job.time.started) / 60000)
      const id = job.metadata.sessionID
      console.log([id, me.has(id) ? "no" : "yes", minutes, await title(id), oneLine(job.command, 60)].join("\t"))
    }
  }
}
if (cmd === "wake") {
  const at = new Date().toTimeString().slice(0, 5)
  const text = `The OpenCode server restarted at ${at} and killed the background shell jobs this session had running ` +
    "(the notices above list them). Re-run the ones still needed; monitor.start survives restarts."
  for (const id of args)
    await call(`/api/session/${id}/synthetic`, { text, description: "Server restarted", delivery: "queue", resume: true })
      .then(() => console.log(`woke ${id}`), (e) => console.log(`could not wake ${id}: ${e.message}`))
}
' "$@"
}

show() {
  if [ -z "$busy" ]; then echo "No session is running."; else
    echo "Running sessions (resumed automatically after the restart; not waited for):"
    printf '%s\n' "$busy" | awk -F'\t' '{ printf "  %s  %s%s\n", $1, $3, ($2 == "no" ? "  (runs this script)" : "") }'
  fi
  [ -n "$jobs" ] && { echo "Running shell jobs (the restart kills them):"
    printf '%s\n' "$jobs" | awk -F'\t' '{ printf "  %4s min  %s  %s  %s%s\n", $3, $1, $4, $5, ($2 == "no" ? "  (runs this script; not waited for)" : "") }'; }
  return 0
}
waited_jobs() { printf '%s\n' "$jobs" | awk -F'\t' '$2 == "yes"'; }   # the shell jobs a restart would cost
job_sessions() { waited_jobs | cut -f1 | sort -u; }                   # the sessions running them
waiting() { waited_jobs | grep -c . || true; }                        # how many there are

if [ "$mode" = after ]; then
  service_pid() { node -e 'console.log(require(process.argv[1]).pid ?? "")' "$STATE" 2>/dev/null || true; }
  old_pid=$(service_pid)
  echo "Restarting the service ($(date +%T))…"
  "$CLI" service restart
  for _ in $(seq 60); do
    pid=$(service_pid)
    [ -n "$pid" ] && [ "$pid" != "$old_pid" ] && api health 2>/dev/null && break
    sleep 2
  done
  api health || { echo "The service did not come back within 2 minutes; nobody was woken." >&2; exit 1; }
  echo "Service is back (pid $pid)."
  [ $# -gt 0 ] && api wake "$@"
  exit 0
fi

[ -f "$STATE" ] || { echo "service state not found: $STATE (is the service running?)" >&2; exit 1; }
busy=$(api busy)
jobs=$(api jobs)
show
[ "$mode" = dry ] && exit 0

if [ "$mode" = wait ] && [ "$(waiting)" -gt 0 ]; then
  if [ -t 0 ]; then
    read -r -p "Wait for the shell jobs (w), restart now (r) or cancel (c)? [w] " answer
    case ${answer:-w} in r*) mode=now ;; c*) echo "Cancelled."; exit 1 ;; esac
  fi
  start=$SECONDS
  while [ "$mode" = wait ] && [ "$(waiting)" -gt 0 ]; do
    if [ $((SECONDS - start)) -ge "$max_wait" ]; then
      echo "Shell jobs still running after ${max_wait}s; not restarting. Re-run with --now to restart anyway." >&2
      exit 1
    fi
    echo "Waiting: $(waiting) shell job(s) running, $((SECONDS - start))s elapsed…"
    sleep "$POLL"
    jobs=$(api jobs)
  done
  [ "$mode" = wait ] && echo "Quiet."
fi

# Wake the sessions that lose a shell job but have no running turn for the host to resume.
busy=$(api busy)
jobs=$(api jobs)
wake=$(comm -23 <(job_sessions) <(printf '%s\n' "$busy" | cut -f1 | sort -u))
log=$(mktemp "${TMPDIR:-/tmp}/opencode-safe-restart.XXXXXX")
# setsid: the restart kills the service's shell jobs, this script's own shell among them when an agent runs it.
# shellcheck disable=SC2086
nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' "$0" --after-wait $wake > "$log" 2>&1 < /dev/null &
phase=$!
echo "Restart log: $log"
status=0
wait "$phase" || status=$?
cat "$log"
exit "$status"
