import assert from "node:assert/strict"
import { test } from "node:test"
import { createShellGuard, FOREGROUND_WAIT, isForegroundWait } from "./foreground.js"

test("a sleep of the threshold or longer is a foreground wait", () => {
  assert.equal(isForegroundWait("sleep 300", 30), true)
  assert.equal(isForegroundWait("sleep 30", 30), true)
  assert.equal(isForegroundWait("sleep 30 && x", 30), true)
  assert.equal(isForegroundWait("sleep 2m", 30), true)
})

test("a short sleep, or another command, is not", () => {
  assert.equal(isForegroundWait("sleep 5", 30), false)
  assert.equal(isForegroundWait("sleep 29", 30), false)
  assert.equal(isForegroundWait("npm test", 30), false)
  assert.equal(isForegroundWait("sleep 5; npm test", 30), false)
})

test("a polling loop is a foreground wait whatever the sleep's length", () => {
  assert.equal(isForegroundWait("until gh pr checks; do sleep 20; done", 30), true)
  assert.equal(isForegroundWait("while true; do sleep 1; done", 30), true)
  assert.equal(isForegroundWait("for i in $(seq 1 23); do gh pr checks; sleep 5; done", 30), true)
  assert.equal(isForegroundWait("for i in 1 2 3; do sleep 1; done", 30), true)
})

test("a for loop that does real work is not a wait", () => {
  assert.equal(isForegroundWait("for f in *.ts; do echo $f; done", 30), false)
  assert.equal(isForegroundWait("for f in *.ts; do npm test -- $f; done", 30), false)
})

test("a sleep that is data, not a command, is not a wait", () => {
  assert.equal(isForegroundWait('git commit -m "fix sleep 300 timeout"', 30), false)
  assert.equal(isForegroundWait("echo sleep 300", 30), false)
})

test("a sleep inside a heredoc body is data, not a wait", () => {
  assert.equal(isForegroundWait("cat > run.sh <<EOF\nsleep 300\nEOF", 30), false)
  assert.equal(isForegroundWait("cat > run.sh <<'EOF'\nsleep 300\nEOF", 30), false)
  assert.equal(isForegroundWait('cat > run.sh <<"EOF"\nsleep 300\nEOF', 30), false)
  assert.equal(isForegroundWait("cat > run.sh <<-EOF\n\tsleep 300\n\tEOF", 30), false)
  assert.equal(isForegroundWait("bash <<'SCRIPT'\nwhile true; do\n  sleep 1\ndone\nSCRIPT", 30), false)
  // The report that put this here: `cargo test --nocapture` refused because `sleep 0.02` sat inside the quoted body of
  // the probe script the same command was about to write.
  assert.equal(isForegroundWait("cat > /tmp/probe.sh <<'EOF'\nwhile true; do\n  sleep 0.02\n  grep -q done out || continue\ndone\nEOF\ncargo test -p openbot --lib -- --nocapture", 30), false)
})

test("a wait after the heredoc's closing line is still a wait", () => {
  assert.equal(isForegroundWait("cat <<EOF\nsleep 300\nEOF\nsleep 300", 30), true)
  assert.equal(isForegroundWait("cat <<EOF\nsleep 300\nEOF\nwhile true; do sleep 1; done", 30), true)
  assert.equal(isForegroundWait("cat <<-EOF\n\tsleep 300\n\tEOF\nsleep 45", 30), true)
})

test("a heredoc that never closes makes the rest of the command its body", () => {
  assert.equal(isForegroundWait("cat <<EOF\nsleep 300\n", 30), false)
})

test("a << inside quotes, a here-string or arithmetic is not a heredoc", () => {
  assert.equal(isForegroundWait('echo "cat <<EOF"\nsleep 300', 30), true)
  assert.equal(isForegroundWait("cat <<< 'sleep 300'", 30), false)
  assert.equal(isForegroundWait("echo $((1 << 2)) && sleep 300", 30), true)
  assert.equal(isForegroundWait("for ((i = 0; i < 3; i++)); do echo $i; done", 30), false)
})

test("the guard refuses a foreground wait on the shell tool only", () => {
  const guard = createShellGuard(30)
  const run = (tool: string, input: unknown) => guard({ tool, input })
  assert.throws(() => run("shell", { command: "sleep 300" }), { message: FOREGROUND_WAIT })
  assert.doesNotThrow(() => run("monitor.start", { command: "sleep 300" }))
  assert.doesNotThrow(() => run("shell", { command: "sleep 5" }))
  assert.doesNotThrow(() => run("shell", { command: "sleep 300", background: true }))
})

test("a threshold of 0 turns the guard off", () => {
  assert.equal(isForegroundWait("sleep 300", 0), false)
  assert.doesNotThrow(() => createShellGuard(0)({ tool: "shell", input: { command: "while true; do sleep 1; done" } }))
})

test("the refusal points at monitor.wait for sub-agents and results needed now", () => {
  assert.match(FOREGROUND_WAIT, /Start the command with monitor\.start/)
  assert.match(FOREGROUND_WAIT, /end your turn/)
  assert.match(FOREGROUND_WAIT, /call monitor\.wait\(\{id\}\)/)
  assert.match(FOREGROUND_WAIT, /sub-agent/)
})
