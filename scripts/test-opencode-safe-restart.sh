#!/usr/bin/env bash
# End-to-end test for opencode-safe-restart.sh against a private OpenCode service (own XDG root and port, stub model).
# Never touches the user's service: every CLI call runs with this test's XDG_* dirs, and only the pids it started are killed.
# Usage: scripts/test-opencode-safe-restart.sh    (about 3 minutes)
# shellcheck disable=SC2016,SC2034,SC2097,SC2098  # expect() evals its single-quoted checks later
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT=$HERE/opencode-safe-restart.sh
CLI=${OPENCODE_CLI:-"$HOME/Library/Application Support/ai.opencode.desktop/cli/$(defaults read /Applications/OpenCode.app/Contents/Info.plist CFBundleShortVersionString)-arm64/opencode-cli"}
ROOT=$(mktemp -d /private/tmp/oc-safe-restart-test.XXXXXX)
SVC_PORT=${TEST_SVC_PORT:-49731}
STUB_PORT=${TEST_STUB_PORT:-49732}
for port in "$SVC_PORT" "$STUB_PORT"; do
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null && { echo "port $port is in use; set TEST_SVC_PORT / TEST_STUB_PORT" >&2; exit 1; }
done
export XDG_CONFIG_HOME=$ROOT/config XDG_DATA_HOME=$ROOT/data XDG_STATE_HOME=$ROOT/state XDG_CACHE_HOME=$ROOT/cache
export OPENCODE_CLI=$CLI OPENCODE_RESTART_POLL=2 NODE_OPTIONS=--max-old-space-size=1500 TMPDIR=$ROOT   # restart logs land in ROOT
unset OPENCODE_SESSION_ID   # the caller's own session lives on the user's service, not this one
STATE=$XDG_STATE_HOME/opencode/service.json

service_pid() { node -e 'console.log(require(process.argv[1]).pid)' "$STATE"; }
cleanup() {
  [ -f "$STATE" ] && kill "$(service_pid)" 2>/dev/null
  [ -f "$ROOT/stub.pid" ] && kill "$(cat "$ROOT/stub.pid")" 2>/dev/null
  [ -n "${TEST_KEEP:-}" ] && echo "kept $ROOT" || rm -rf "$ROOT"
}
trap cleanup EXIT

# Stub OpenAI-compatible model: "HOLD n" answers after n seconds; "BG" starts `sleep 600` as a background shell job and
# "BG n" starts `sleep n`; "RUN" calls the shell tool with the script (no --now, so it must not wait on itself); a tool
# result answers "Done."; anything else "OK". Each request's last three messages are logged as one line, so a test can see
# what the model was shown together.
cat > "$ROOT/stub.mjs" <<'JS'
import { createServer } from "node:http"
import { appendFileSync } from "node:fs"
const chunk = (delta, finish) => `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "stub-1", choices: [{ index: 0, delta, finish_reason: finish ?? null }] })}\n\n`
createServer((req, res) => {
  let data = ""
  req.on("data", (c) => (data += c))
  req.on("end", async () => {
    if (req.method !== "POST") return res.writeHead(404).end()
    const body = JSON.parse(data)
    const last = body.messages.at(-1)
    const text = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "")
    appendFileSync(process.env.STUB_LOG, JSON.stringify(body.messages.slice(-3)).slice(0, 4000) + "\n")
    const hold = last?.role === "user" && /HOLD (\d+)/.exec(text)
    if (hold) await new Promise((r) => setTimeout(r, Number(hold[1]) * 1000))
    res.writeHead(200, { "content-type": "text/event-stream" })
    if (last?.role === "user" && /\bBG\b/.test(text)) {
      const seconds = Number(/\bBG (\d+)/.exec(text)?.[1] ?? 600)
      const args = { command: `sleep ${seconds}`, background: true }
      res.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: "function", function: { name: "shell", arguments: JSON.stringify(args) } }] }))
      res.write(chunk({}, "tool_calls"))
    } else if (last?.role === "user" && /\bRUN\b/.test(text)) {
      // The XDG dirs are spelled out so the script can only ever reach this private service. --max-wait keeps a regression
      // (waiting on the session that runs it) short instead of hanging the test.
      const env = ["CONFIG", "DATA", "STATE", "CACHE"].map((d) => `XDG_${d}_HOME=${process.env[`XDG_${d}_HOME`]}`).join(" ")
      const args = { command: `${env} ${process.env.SCRIPT} --max-wait 20 > ${process.env.ROOT}/inside.log 2>&1`, timeout: 120000 }
      res.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: "function", function: { name: "shell", arguments: JSON.stringify(args) } }] }))
      res.write(chunk({}, "tool_calls"))
    } else {
      res.write(chunk({ role: "assistant", content: last?.role === "tool" ? "Done." : "OK" }))
      res.write(chunk({}, "stop"))
    }
    res.end("data: [DONE]\n\n")
  })
}).listen(Number(process.env.STUB_PORT), "127.0.0.1")
JS
STUB_PORT=$STUB_PORT STUB_LOG=$ROOT/stub.log SCRIPT=$SCRIPT ROOT=$ROOT nohup node "$ROOT/stub.mjs" > "$ROOT/stub.out" 2>&1 < /dev/null &
echo $! > "$ROOT/stub.pid"
touch "$ROOT/stub.log"

mkdir -p "$XDG_CONFIG_HOME/opencode" "$ROOT/project"
cat > "$XDG_CONFIG_HOME/opencode/opencode.json" <<JSON
{
  "provider": { "stub": { "npm": "@ai-sdk/openai-compatible", "name": "Stub",
    "options": { "baseURL": "http://127.0.0.1:$STUB_PORT/v1", "apiKey": "stub" },
    "models": { "stub-1": { "name": "Stub 1", "tool_call": true, "limit": { "context": 100000, "output": 4000 }, "cost": { "input": 0, "output": 0 } } } } },
  "model": "stub/stub-1",
  "plugins": ["$HERE/../apps/opencode-plugins/shell-handoff"],
  "permission": { "bash": "allow", "shell": "allow", "external_directory": "allow" }
}
JSON
"$CLI" service set port "$SVC_PORT" >/dev/null
perl -e 'alarm 90; exec @ARGV' "$CLI" service start >/dev/null

# drive <command> [args]: session | prompt <id> <text> | busy <id> | messages <id>
drive() {
  node --input-type=module -e '
const { readFileSync } = await import("node:fs")
const svc = JSON.parse(readFileSync(process.env.XDG_STATE_HOME + "/opencode/service.json", "utf8"))
const headers = { "content-type": "application/json", authorization: "Basic " + Buffer.from(`opencode:${svc.password}`).toString("base64") }
const api = async (path, body) => (await (await fetch(svc.url + path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers })).json()).data
const [cmd, a, b] = process.argv.slice(1)
if (cmd === "session") console.log((await api("/api/session", { location: { directory: process.argv[2] } })).id)
if (cmd === "prompt") await api(`/api/session/${a}/prompt`, { text: b })
if (cmd === "busy") console.log(a in (await api("/api/session/active")) ? "busy" : "idle")
if (cmd === "messages") console.log(JSON.stringify(await api(`/api/session/${a}/message`)))
' "$@"
}
await_state() {   # await_state <id> busy|idle <seconds>
  for _ in $(seq "$3"); do [ "$(drive busy "$1")" = "$2" ] && return 0; sleep 1; done
  return 1
}
await_log() {   # await_log <seconds> <pattern>: the host's own resume of an interrupted turn is not instant
  for _ in $(seq "$1"); do grep -q "$2" "$ROOT/stub.log" && return 0; sleep 1; done
  return 1
}

pass=0 fail=0
expect() {
  if eval "$2"; then echo "  PASS  $1"; pass=$((pass + 1)); else echo "  FAIL  $1"; fail=$((fail + 1)); fi
}

echo "=== quiet service: dry run says nothing is running ==="
out=$("$SCRIPT" --dry-run)
expect "no session running" '[[ $out == *"No session is running."* ]]'

s1=$(drive session "$ROOT/project")
drive prompt "$s1" "hi"; await_state "$s1" idle 20   # the host resumes a turn in a session that already has history

echo "=== busy session with no shell job: nothing is lost, so the default restarts at once ==="
drive prompt "$s1" "HOLD 30"
await_state "$s1" busy 20
pid=$(service_pid)
: > "$ROOT/stub.log"
out=$(perl -e 'alarm 120; exec @ARGV' "$SCRIPT" --max-wait 30 < /dev/null)
expect "lists the busy session as resumed after the restart" '[[ $out == *"resumed automatically after the restart"* ]] && [[ $out == *"$s1"* ]]'
expect "does not wait for the running turn" '[[ $out != *"Waiting:"* ]]'
expect "service restarted" '[ "$(service_pid)" != "$pid" ]'
expect "nobody to wake" '[[ $out != *"woke"* ]]'
expect "the host resumed the interrupted turn" 'await_log 30 "restarted while you were working"'
await_state "$s1" idle 30 || true

echo "=== --now: restarts while busy without asking ==="
drive prompt "$s1" "HOLD 30"
await_state "$s1" busy 20
pid=$(service_pid)
: > "$ROOT/stub.log"
out=$(perl -e 'alarm 120; exec @ARGV' "$SCRIPT" --now < /dev/null)
expect "service restarted" '[ "$(service_pid)" != "$pid" ]'
expect "the busy session is not messaged" '[[ $out != *"woke"* ]]'
expect "the host resumed the interrupted turn" 'await_log 30 "restarted while you were working"'
expect "only the host's resume notice reached the model" '! grep -q "background shell jobs this session" "$ROOT/stub.log"'
await_state "$s1" idle 30 || true

echo "=== idle session with a background shell job: woken, shell-handoff notice arrives in the same turn ==="
s3=$(drive session "$ROOT/project")
drive prompt "$s3" "BG"
sleep 2; await_state "$s3" idle 20
pid=$(service_pid)
: > "$ROOT/stub.log"
out=$(perl -e 'alarm 120; exec @ARGV' "$SCRIPT" --now < /dev/null)
expect "lists the shell job" '[[ $out == *"$s3"*"sleep 600"* ]]'
expect "does not wait" '[[ $out != *"Waiting:"* ]]'
expect "service restarted" '[ "$(service_pid)" != "$pid" ]'
expect "woke the session" '[[ $out == *"woke $s3"* ]]'
expect "the model saw the wake message" 'sleep 5; grep -q "background shell jobs this session" "$ROOT/stub.log"'
expect "with shell-handoff's notice in the same turn" 'grep "background shell jobs this session" "$ROOT/stub.log" | grep -q "shell-handoff/$s3.md"'
await_state "$s3" idle 30 || true

echo "=== run by an agent inside a session: its own shell job does not hold the restart back ==="
s2=$(drive session "$ROOT/project")
pid=$(service_pid)
: > "$ROOT/stub.log"
drive prompt "$s2" "RUN"
for _ in $(seq 60); do [ "$(service_pid)" != "$pid" ] && grep -q "restarted while you were working" "$ROOT/stub.log" && break; sleep 1; done
expect "service restarted" '[ "$(service_pid)" != "$pid" ]'
expect "the script did not wait" '! grep -q "Waiting:" "$ROOT/inside.log"'
expect "the host resumed the session that ran the script" 'grep -q "restarted while you were working" "$ROOT/stub.log"'

echo "=== running shell job: the default waits until it ends, then restarts ==="
drive prompt "$s1" "BG 8"
sleep 2; await_state "$s1" idle 20
pid=$(service_pid)
out=$(perl -e 'alarm 120; exec @ARGV' "$SCRIPT" --max-wait 60 < /dev/null)
expect "lists the shell job" '[[ $out == *"$s1"*"sleep 8"* ]]'
expect "prints wait progress" '[[ $out == *"Waiting: 1 shell job(s) running"* ]]'
expect "waits until quiet" '[[ $out == *"Quiet."* ]]'
expect "service restarted" '[ "$(service_pid)" != "$pid" ]'
expect "nobody to wake: the job ended on its own" '[[ $out != *"woke"* ]]'

echo "=== shell job past --max-wait: gives up without restarting ==="
drive prompt "$s1" "BG 25"
sleep 2; await_state "$s1" idle 20
pid=$(service_pid)
status=0; out=$("$SCRIPT" --max-wait 3 < /dev/null 2>&1) || status=$?
expect "exits 1" '[ "$status" = 1 ]'
expect "says it is not restarting" '[[ $out == *"not restarting"* ]]'
expect "service untouched" '[ "$(service_pid)" = "$pid" ]'
out=$( (printf 'c\n'; sleep 8) | script -q /dev/null "$SCRIPT" 2>&1) || true   # sleep: script(1) ends its child when stdin closes
expect "in a terminal, offers wait / restart now / cancel" '[[ $out == *"restart now (r) or cancel (c)"* ]]'
expect "cancel leaves the service alone" '[[ $out == *"Cancelled."* ]] && [ "$(service_pid)" = "$pid" ]'

echo
echo "passed: $pass  failed: $fail"
[ "$fail" = 0 ]
