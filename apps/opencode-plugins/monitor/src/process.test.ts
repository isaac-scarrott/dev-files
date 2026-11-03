import assert from "node:assert/strict"
import { test } from "node:test"
import { Port } from "./handoff.js"
import { spawnShell } from "./process.js"

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test("killing the child ends the whole process group", async () => {
  let text = ""
  let ended: Promise<void>
  let done!: () => void
  ended = new Promise((r) => (done = r))
  const child = spawnShell({ command: "sleep 60 & echo $!; wait", cwd: "/tmp" }, { data: (c) => (text += c), exit: () => done() })
  while (!text.includes("\n")) await new Promise((r) => setTimeout(r, 20))
  const grandchild = Number(text.trim())
  assert.ok(alive(grandchild))
  child.kill("SIGTERM")
  await ended
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(alive(grandchild), false)
})

test("stdout and stderr both arrive, then exit code", async () => {
  let text = ""
  const code = await new Promise<number | null>((resolve) => {
    spawnShell({ command: "echo out; echo err 1>&2; exit 4", cwd: "/tmp" }, { data: (c) => (text += c), exit: (c) => resolve(c) })
  })
  assert.equal(code, 4)
  assert.ok(text.includes("out") && text.includes("err"))
})

test("a grandchild left behind by a command that exits is cleaned up by the monitor", async () => {
  let text = ""
  let child!: ReturnType<typeof spawnShell>
  await new Promise<void>((resolve) => {
    child = spawnShell({ command: "sleep 60 & echo $!", cwd: "/tmp" }, { data: (c) => (text += c), exit: () => resolve() })
  })
  const pid = Number(text.trim())
  child.kill("SIGKILL")
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(alive(pid), false)
})

test("a port holds output and the exit while nobody is attached, then replays them to the next owner", async () => {
  const port = new Port()
  const first: string[] = []
  const child = spawnShell({ command: "echo one; sleep 0.3; echo two; exit 5", cwd: "/tmp" }, port)
  port.attach({ data: (c) => first.push(String(c)), exit: () => first.push("exit") })
  while (!first.join("").includes("one")) await new Promise((r) => setTimeout(r, 20))
  port.detach()
  await new Promise((r) => setTimeout(r, 700))
  assert.deepEqual(first.join(""), "one\n")
  const second: string[] = []
  port.attach({ data: (c) => second.push(String(c)), exit: (code) => second.push(`exit ${code}`) })
  assert.deepEqual(second, ["two\n", "exit 5"])
  assert.ok(child.pid)
})
