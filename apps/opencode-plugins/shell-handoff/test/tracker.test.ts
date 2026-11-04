import assert from "node:assert/strict"
import { readFileSync, statSync } from "node:fs"
import { test } from "node:test"
import { FILE_CAP_BYTES } from "../src/report.js"
import { harness, background, memoryStore } from "./helpers.js"

const GHP = ["ghp", "_", "abcdefghijklmnopqrstuvwxyz0123"].join("")
const created = (id: string, extra: Record<string, unknown> = {}) => ({ id, command: "sleep 600", cwd: "/work/repo", pid: 4242, file: "/nonexistent/out", sessionID: "ses_a", started: 1_699_999_000_000, ...extra })

test("records a background shell job with what the host knew", async () => {
  const h = harness()
  h.tracker.created(created("sh_1"))
  await h.tracker.toolEnd(background("sh_1"))
  const stored = h.store.data.get("job/sh_1") as Record<string, unknown>
  assert.equal(stored.command, "sleep 600")
  assert.equal(stored.cwd, "/work/repo")
  assert.equal(stored.sessionID, "ses_a")
  assert.equal(stored.callID, "call_1")
  assert.equal(stored.messageID, "msg_1")
  assert.equal(stored.pid, 4242)
  assert.equal(stored.startedAt, 1_699_999_000_000)
  assert.equal(stored.boot, "100:1")
})

test("falls back to the tool input when shell.created was missed", async () => {
  const h = harness()
  await h.tracker.toolEnd(background("sh_1", { command: "make watch", workdir: "/w" }))
  const stored = h.store.data.get("job/sh_1") as Record<string, unknown>
  assert.equal(stored.command, "make watch")
  assert.equal(stored.cwd, "/w")
})

test("ignores foreground shell calls, other tools, errors and jobs that already exited", async () => {
  const h = harness()
  h.tracker.created(created("sh_1"))
  await h.tracker.toolEnd({ ...background("sh_1"), result: { output: "done", metadata: { status: "completed", shellID: "sh_1" } } })
  await h.tracker.toolEnd({ ...background("sh_2"), tool: "read" })
  await h.tracker.toolEnd({ ...background("sh_3"), status: "error", result: undefined })
  h.tracker.created(created("sh_4"))
  h.tracker.ended("sh_4", "exited")
  await h.tracker.toolEnd(background("sh_4"))
  await h.tracker.toolEnd({ ...background("sh_5"), result: { metadata: {} } })
  assert.equal(h.store.data.size, 0)
})

test("the stored command is redacted", async () => {
  const h = harness()
  await h.tracker.toolEnd(background("sh_1", { command: `GITHUB_TOKEN=${GHP} gh stack merge` }))
  const raw = JSON.stringify([...h.store.data])
  assert.ok(!raw.includes(GHP.slice(0, 12)))
  assert.ok(raw.includes("gh stack merge"))
})

test("a completed job removes its record; a killed one only after the grace", async () => {
  const h = harness()
  await h.tracker.toolEnd(background("sh_1"))
  await h.tracker.toolEnd(background("sh_2"))
  h.tracker.ended("sh_1", "exited")
  assert.equal(h.store.data.has("job/sh_1"), false)
  h.tracker.ended("sh_2", "killed")
  assert.equal(h.store.data.has("job/sh_2"), true, "a service shutdown kills jobs and must still find them")
  assert.equal(h.timers.length, 1)
  h.timers[0].run()
  assert.equal(h.store.data.has("job/sh_2"), false)
})

test("dispose cancels pending grace timers", async () => {
  const h = harness()
  await h.tracker.toolEnd(background("sh_1"))
  h.tracker.ended("sh_1", "killed")
  h.tracker.dispose()
  assert.equal(h.timers[0].cancelled, true)
})

test("idle drops jobs of that session the host no longer lists", async () => {
  const h = harness()
  await h.tracker.toolEnd(background("sh_1"))
  await h.tracker.toolEnd({ ...background("sh_2"), sessionID: "ses_b" })
  h.tracker.idle("ses_a", new Set(["sh_9"]))
  assert.equal(h.store.data.has("job/sh_1"), false)
  assert.equal(h.store.data.has("job/sh_2"), true)
  await h.tracker.toolEnd(background("sh_3"))
  h.tracker.idle("ses_a", new Set(["sh_3"]))
  assert.equal(h.store.data.has("job/sh_3"), true)
})

test("deleting a session forgets its jobs and notice", async () => {
  const h = harness()
  await h.tracker.toolEnd(background("sh_1"))
  h.tracker.removeSession("ses_a")
  assert.equal(h.store.data.size, 0)
})

test("hot reload (same boot id): nothing is reported and the records are kept", async () => {
  const store = memoryStore()
  const first = harness({ store, boot: "100:1" })
  await first.tracker.toolEnd(background("sh_1"))
  const second = harness({ store, boot: "100:1" })
  await second.tracker.restore()
  assert.equal(second.sent.length, 0)
  assert.equal(second.notices.length, 0)
  assert.equal(second.tracker.jobs.size, 1)
  assert.equal(store.data.has("job/sh_1"), true)
})

test("restart (new boot id): the job is reported once, written down and cleared", async () => {
  const store = memoryStore()
  const first = harness({ store, boot: "100:1" })
  first.tracker.created(created("sh_1", { command: "gh stack merge --wait" }))
  await first.tracker.toolEnd(background("sh_1"))
  const second = harness({ store, boot: "200:9", dir: first.dir, clock: { now: 1_699_999_000_000 + 49 * 60_000 } })
  second.state.alivePids.add(4242)
  await second.tracker.restore()

  assert.equal(store.data.has("job/sh_1"), false)
  assert.equal(second.sent.length, 1)
  assert.equal(second.sent[0].sessionID, "ses_a")
  const text = second.sent[0].text
  assert.match(text, /lost to a restart: 1\./)
  assert.match(text, /"gh stack merge --wait" \(cwd \/work\/repo, ran 49m\)/)
  assert.match(text, /monitor\.start/)
  assert.ok(text.includes(second.deps.files.path("ses_a")))
  assert.ok(text.split("\n").length <= 6)
  assert.equal(store.data.has("notice/ses_a"), false, "delivered notices are not kept")

  const file = readFileSync(second.deps.files.path("ses_a"), "utf8")
  assert.match(file, /gh stack merge --wait/)
  assert.match(file, /cwd: \/work\/repo/)
  assert.match(file, /ran about 49m/)
  assert.match(file, /session: ses_a; tool call: call_1; message: msg_1; shell: sh_1/)
  assert.match(file, /monitor\.start/)
  assert.match(file, /pid 4242 still exists/)
  assert.equal(statSync(second.deps.files.path("ses_a")).mode & 0o777, 0o600)
  assert.equal(statSync(second.dir).mode & 0o777, 0o700)

  assert.equal(second.notices.length, 1)
  assert.equal(second.notices[0].session, "ses_a")
  assert.match(second.notices[0].title, /lost to a restart/)

  // A further restart with nothing running reports nothing.
  const third = harness({ store, boot: "300:3", dir: first.dir })
  await third.tracker.restore()
  assert.equal(third.sent.length, 0)
})

test("the host's output file is linked when it still exists", async () => {
  const store = memoryStore()
  const first = harness({ store })
  first.tracker.created(created("sh_1", { file: first.dir + "/out.txt" }))
  await import("node:fs").then((fs) => fs.writeFileSync(first.dir + "/out.txt", "last lines"))
  await first.tracker.toolEnd(background("sh_1"))
  const second = harness({ store, boot: "other", dir: first.dir })
  await second.tracker.restore()
  assert.match(readFileSync(second.deps.files.path("ses_a"), "utf8"), /last output \(the host keeps it\): .*out\.txt/)
})

test("notice: one per session per restart, five jobs then +N more, six lines at most", async () => {
  const store = memoryStore()
  const first = harness({ store })
  for (let i = 0; i < 8; i++) await first.tracker.toolEnd(background(`sh_${i}`, { command: `watch-${i} --long-flag-value ${"x".repeat(200)}` }))
  await first.tracker.toolEnd({ ...background("sh_b"), sessionID: "ses_b" })
  const second = harness({ store, boot: "other", dir: first.dir })
  await second.tracker.restore()
  assert.equal(second.sent.length, 2)
  const a = second.sent.find((m) => m.sessionID === "ses_a")!.text
  assert.match(a, /lost to a restart: 8\./)
  assert.match(a, /\+3 more/)
  assert.ok(a.split("\n").length <= 9)
  assert.equal((a.match(/^- "/gm) ?? []).length, 5)
  assert.ok(a.split("\n").every((line) => line.length < 260))
  assert.equal(second.notices.length, 1, "one notification for the restart")
  assert.equal(second.notices[0].session, undefined, "two sessions: no single target")
  await second.tracker.flush()
  assert.equal(second.sent.length, 2, "flushing again sends nothing")
})

test("a notice that cannot be delivered is kept and sent on the next try", async () => {
  const store = memoryStore()
  const first = harness({ store })
  await first.tracker.toolEnd(background("sh_1"))
  const second = harness({ store, boot: "other", dir: first.dir })
  second.state.failSynthetic = true
  await second.tracker.restore()
  assert.equal(second.sent.length, 0)
  assert.equal(second.tracker.hasPending("ses_a"), true)
  assert.equal(store.data.has("notice/ses_a"), true)
  second.state.failSynthetic = false
  await second.tracker.flush("ses_a")
  assert.equal(second.sent.length, 1)
  assert.equal(store.data.has("notice/ses_a"), false)
  // After yet another plugin load the leftover is picked up too.
  const third = harness({ store, boot: "other", dir: first.dir })
  assert.equal(third.tracker.hasPending("ses_a"), false)
})

test("a leftover notice from an earlier load is delivered at the next setup", async () => {
  const store = memoryStore()
  const first = harness({ store })
  await first.tracker.toolEnd(background("sh_1"))
  const second = harness({ store, boot: "other", dir: first.dir })
  second.state.failSynthetic = true
  await second.tracker.restore()
  const third = harness({ store, boot: "other", dir: first.dir })
  await third.tracker.restore()
  assert.equal(third.sent.length, 1)
  assert.equal(store.data.has("notice/ses_a"), false)
})

test("a session that no longer exists gets no notice", async () => {
  const store = memoryStore()
  const first = harness({ store })
  await first.tracker.toolEnd(background("sh_1"))
  const second = harness({ store, boot: "other", dir: first.dir })
  second.state.sessions.clear()
  await second.tracker.restore()
  assert.equal(second.sent.length, 0)
  assert.equal(second.tracker.hasPending("ses_a"), false)
})

test("options: notice false, file false, notify false", async () => {
  const store = memoryStore()
  const first = harness({ store })
  await first.tracker.toolEnd(background("sh_1"))
  const second = harness({ store, boot: "other", dir: first.dir + "/off", options: { notice: false, file: false, notify: true } })
  await second.tracker.restore()
  assert.equal(second.sent.length, 0)
  assert.throws(() => statSync(second.deps.files.path("ses_a")))
  assert.equal(store.data.size, 0)
})

test("the handoff file is newest first and capped", async () => {
  const store = memoryStore()
  let dir: string | undefined
  for (let round = 0; round < 3; round++) {
    const first = harness({ store, boot: `b${round}`, dir })
    dir = first.dir
    first.clock.now += round * 1000
    await first.tracker.toolEnd(background(`sh_${round}`, { command: `round-${round}` }))
    await harness({ store, boot: `b${round + 1}`, dir }).tracker.restore()
  }
  const text = readFileSync(`${dir}/ses_a.md`, "utf8")
  assert.ok(text.indexOf("round-2") < text.indexOf("round-1") && text.indexOf("round-1") < text.indexOf("round-0"))

  const big = harness({ store: memoryStore() })
  for (let round = 0; round < 40; round++) {
    const writer = harness({ store, boot: `c${round}`, dir: big.dir })
    for (let i = 0; i < 20; i++) await writer.tracker.toolEnd(background(`sh_${round}_${i}`, { command: `job ${round}-${i} ${"y".repeat(1500)}` }))
    await harness({ store, boot: `c${round + 1}`, dir: big.dir }).tracker.restore()
  }
  const size = statSync(`${big.dir}/ses_a.md`).size
  assert.ok(size <= FILE_CAP_BYTES, `file is ${size} bytes`)
  const capped = readFileSync(`${big.dir}/ses_a.md`, "utf8")
  assert.ok(capped.includes("job 39-0 "), "the newest restart is kept")
  assert.ok(!capped.includes("job 0-0 "), "the oldest restart went first")
})

test("secrets never reach the file, the notice or the storage", async () => {
  const store = memoryStore()
  const secret = GHP
  const first = harness({ store })
  first.tracker.created(created("sh_1", { command: `GITHUB_TOKEN=${secret} curl -H "Authorization: Bearer ${secret}" https://u:${secret}@h.test` }))
  await first.tracker.toolEnd(background("sh_1"))
  const second = harness({ store, boot: "other", dir: first.dir })
  await second.tracker.restore()
  const everything = [readFileSync(second.deps.files.path("ses_a"), "utf8"), ...second.sent.map((m) => m.text), JSON.stringify(second.notices), JSON.stringify([...store.data]), JSON.stringify([...first.store.data])].join("\n")
  assert.ok(!everything.includes(secret))
})

test("malformed, foreign and expired records are ignored and removed", async () => {
  const store = memoryStore()
  store.data.set("job/sh_bad", { shellID: "sh_bad" })
  store.data.set("job/sh_str", "nope")
  store.data.set("job/sh_mismatch", { shellID: "other", sessionID: "ses_a", command: "x", startedAt: 1, boot: "old", location: "/work" })
  store.data.set("notice/ses_a", { text: 5 })
  const clock = { now: 1_700_000_000_000 }
  store.data.set("job/sh_old", { shellID: "sh_old", sessionID: "ses_a", command: "x", startedAt: clock.now - 8 * 86_400_000, boot: "old", location: "/work" })
  const h = harness({ store, clock })
  await h.tracker.restore()
  assert.equal(store.data.size, 0)
  assert.equal(h.sent.length, 0)
  assert.equal(h.notices.length, 0)
})

test("the record cap drops the oldest", async () => {
  const h = harness({ options: { maxRecords: 3 } })
  for (let i = 0; i < 5; i++) {
    h.tracker.created(created(`sh_${i}`, { started: 1000 + i }))
    await h.tracker.toolEnd(background(`sh_${i}`))
  }
  assert.deepEqual([...h.store.data.keys()].sort(), ["job/sh_2", "job/sh_3", "job/sh_4"])
  assert.equal(h.tracker.jobs.size, 3)
})

test("handoff files older than the retention are pruned", async () => {
  const h = harness()
  const fs = await import("node:fs")
  await h.deps.files.write("ses_old", "x")
  await h.deps.files.write("ses_new", "x")
  const old = new Date(h.clock.now - 10 * 86_400_000)
  fs.utimesSync(h.deps.files.path("ses_old"), old, old)
  const recent = new Date(h.clock.now)
  fs.utimesSync(h.deps.files.path("ses_new"), recent, recent)
  await h.tracker.restore()
  assert.throws(() => statSync(h.deps.files.path("ses_old")))
  assert.ok(statSync(h.deps.files.path("ses_new")))
})

test("an unsafe session id never becomes a path", async () => {
  const h = harness()
  assert.throws(() => h.deps.files.path("../../etc/passwd"))
})

test("the host's created event after the tool call fills in cwd, output and start time", async () => {
  const h = harness()
  await h.tracker.toolEnd(background("sh_1"))
  assert.equal((h.store.data.get("job/sh_1") as Record<string, unknown>).cwd, undefined)
  h.tracker.created(created("sh_1"))
  await new Promise((resolve) => setImmediate(resolve))
  const stored = h.store.data.get("job/sh_1") as Record<string, unknown>
  assert.equal(stored.cwd, "/work/repo")
  assert.equal(stored.output, "/nonexistent/out")
  assert.equal(stored.startedAt, 1_699_999_000_000)
})

test("each location's instance reports only its own jobs, so several instances never report one job twice", async () => {
  const store = memoryStore()
  const a = harness({ store, location: "/a" })
  const b = harness({ store, location: "/b" })
  await a.tracker.toolEnd(background("sh_a"))
  await b.tracker.toolEnd({ ...background("sh_b"), sessionID: "ses_b" })
  const after = { store, boot: "other", dir: a.dir }
  const a2 = harness({ ...after, location: "/a" })
  const b2 = harness({ ...after, location: "/b" })
  const c2 = harness({ ...after, location: "/c" })
  await Promise.all([a2.tracker.restore(), b2.tracker.restore(), c2.tracker.restore()])
  assert.deepEqual(a2.sent.map((m) => m.sessionID), ["ses_a"])
  assert.deepEqual(b2.sent.map((m) => m.sessionID), ["ses_b"])
  assert.equal(c2.sent.length, 0)
  assert.equal(store.data.size, 0)
})
