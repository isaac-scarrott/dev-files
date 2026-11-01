import assert from "node:assert/strict"
import { test } from "node:test"
import { monitorOf, parseMonitorMessage, summarize } from "./parse.js"
import { renderWake, TRAILER, type Wake } from "./wrap.js"

const wake = (over: Partial<Wake>): Wake => ({ name: "storefront watch", id: "mon_24cbe1", seq: 5, lines: [], dropped: 0, notes: [], ...over })

test("an event batch reads back as the real lines, unescaped, without tags or trailer", () => {
  const text = renderWake(wake({ lines: ["DD MONITOR OK -> Alert 20:29Z", "a & b <c> \"d\"", "-&gt; already escaped by the command"] }))
  const parsed = parseMonitorMessage(text)!
  assert.equal(parsed.name, "storefront watch")
  assert.equal(parsed.id, "mon_24cbe1")
  assert.equal(parsed.blocks.length, 1)
  assert.deepEqual(parsed.blocks[0]!.lines, ["DD MONITOR OK -> Alert 20:29Z", 'a & b <c> "d"', "-&gt; already escaped by the command"])
  assert.equal(summarize(parsed), "DD MONITOR OK -> Alert 20:29Z · 3 lines")
})

test("a name with quotes and angle brackets survives the attribute escaping", () => {
  const parsed = parseMonitorMessage(renderWake(wake({ name: 'a "b" <c> & d', lines: ["x"] })))!
  assert.equal(parsed.name, 'a "b" <c> & d')
})

test("a restart notice summarises with its restart number", () => {
  const text = renderWake(wake({ restart: 5, notes: ["This monitor was restarted automatically after OpenCode restarted (restart 5). Output produced while it was down was not seen."] }))
  const parsed = parseMonitorMessage(text)!
  assert.equal(parsed.blocks[0]!.kind, "notice")
  assert.equal(parsed.blocks[0]!.restart, 5)
  assert.equal(summarize(parsed), "restarted (restart 5)")
})

test("notices classify: gone, ended, paused, resumed, exited", () => {
  const one = (note: string) => summarize(parseMonitorMessage(renderWake(wake({ notes: [note] })))!)
  assert.equal(one("Monitor gone: OpenCode restarted (restart 2) and this monitor was lost with it."), "lost")
  assert.equal(one("Monitor ended: it reached its time limit."), "ended")
  assert.equal(one("Paused: more than 60 lines in an hour."), "paused")
  assert.equal(one("Resumed: the rate fell below the limit."), "resumed")
  assert.equal(one("The command exited with code 1; it starts again at 2026-11-01T10:00:00.000Z."), "command exited")
  assert.equal(one("Something new happened. And more."), "Something new happened.")
})

test("an event block followed by a notice block is one message with both", () => {
  const parsed = parseMonitorMessage(renderWake(wake({ lines: ["one"], notes: ["Monitor ended: done."] })))!
  assert.deepEqual(parsed.blocks.map((block) => block.kind), ["event", "notice"])
  assert.equal(summarize(parsed), "one")
})

test("dropped lines keep their marker line", () => {
  const parsed = parseMonitorMessage(renderWake(wake({ lines: ["a"], dropped: 3 })))!
  assert.deepEqual(parsed.blocks[0]!.lines, ["a", "[3 more lines not shown]"])
})

test("malformed or foreign text is not parsed, so the host shows it as it is", () => {
  const good = renderWake(wake({ lines: ["x"] }))
  assert.equal(parseMonitorMessage(""), undefined)
  assert.equal(parseMonitorMessage("hello"), undefined)
  assert.equal(parseMonitorMessage(good.replace("</monitor-event>", "")), undefined)
  assert.equal(parseMonitorMessage(`typed before\n${good}`), undefined)
  assert.equal(parseMonitorMessage(good.replace(TRAILER, "something else")), undefined)
  assert.equal(parseMonitorMessage(good.replace('seq="5"', 'seq="x"')), undefined)
  assert.equal(parseMonitorMessage('<monitor-event name="a" id="b">x</monitor-event>'), undefined)
  assert.equal(parseMonitorMessage(`${good}\nextra text`), undefined)
})

test("a message without the trailer still parses (older wrapper)", () => {
  assert.ok(parseMonitorMessage(renderWake(wake({ lines: ["x"] })).replace(`\n${TRAILER}`, "")))
})

test("a huge line and many lines parse without trouble", () => {
  const lines = Array.from({ length: 5000 }, (_, i) => `line ${i} ${"x".repeat(i % 7 === 0 ? 20000 : 10)}`)
  const parsed = parseMonitorMessage(renderWake(wake({ lines })))!
  assert.equal(parsed.blocks[0]!.lines.length, 5000)
})

test("a block whose id changes is not one monitor's wake", () => {
  const a = renderWake(wake({ lines: ["x"] }))
  const b = renderWake(wake({ id: "mon_other", notes: ["Monitor ended: done."] }))
  assert.equal(parseMonitorMessage(`${a.replace(`\n${TRAILER}`, "")}\n${b}`), undefined)
})

test("monitorOf needs the server's metadata; a typed look-alike is not a wake", () => {
  const text = renderWake(wake({ lines: ["x"] }))
  const metadata = { monitor: { monitorID: "mon_24cbe1", seq: 5 } }
  assert.equal(monitorOf({ type: "user", text, metadata })?.monitorID, "mon_24cbe1")
  assert.equal(monitorOf({ type: "user", text }), undefined)
  assert.equal(monitorOf({ type: "user", text, metadata: {} }), undefined)
  assert.equal(monitorOf({ type: "assistant", text, metadata }), undefined)
  assert.equal(monitorOf({ type: "user", text, metadata: { monitor: { monitorID: "mon_other", seq: 5 } } }), undefined)
  assert.equal(monitorOf({ type: "user", text: "plain", metadata }), undefined)
  assert.equal(monitorOf({ type: "user", metadata }), undefined)
  assert.equal(monitorOf({ type: "user", text, metadata: { monitor: { monitorID: 1, seq: "5" } } }), undefined)
})
