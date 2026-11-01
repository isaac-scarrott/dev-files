import assert from "node:assert/strict"
import { test } from "node:test"
import { indexFromPointer, INITIAL_PROMPTS, loadedIds, PAGE_PROMPTS, promptLabel, promptWindow, prompts, railHeightStyle, stripMarkdown, topPercent, type Message } from "./rail"

const user = (id: string, text: string, extra: Partial<Message> = {}): Message => ({ id, type: "user", text, ...extra })
const reply = (id: string, text: string | undefined, extra: Partial<Message> = {}): Message => ({
  id,
  type: "assistant",
  content: text === undefined ? [] : [{ type: "text", text }],
  time: { completed: 1 },
  ...extra,
})

test("prompts: one per user message in order, reverted ones dropped, other message types ignored", () => {
  const list = prompts(
    [
      { id: "m0", type: "compaction" },
      user("m1", "first"),
      reply("m1a", "one"),
      user("m2", "second"),
      { id: "m2s", type: "system" },
      reply("m2a", "two"),
      user("m3", "third"),
    ],
    "m3",
  )
  assert.deepEqual(
    list.map((prompt) => [prompt.id, prompt.title, prompt.snippet]),
    [
      ["m1", "first", "one"],
      ["m2", "second", "two"],
    ],
  )
})

test("the snippet is the turn's final assistant message, as plain text; a final message without text shows the prompt alone", () => {
  const list = prompts([
    user("m1", "q"),
    reply("a1", "first step"),
    reply("a2", "# Title\n\nThe **answer** is `42`."),
    user("m2", "q2"),
    reply("b1", "said something"),
    reply("b2", undefined, { content: [{ type: "tool" }, { type: "reasoning", text: "hmm" }] }),
    user("m3", "q3"),
  ])
  assert.equal(list[0]!.snippet, "Title The answer is 42.")
  assert.equal(list[1]!.snippet, undefined, "t3-code reads the last assistant message, and that one has no text")
  assert.equal(list[2]!.snippet, undefined)
})

test("the snippet strips a fenced block's fences, not just its lines", () => {
  const list = prompts([user("m1", "q"), reply("a1", "Done.\n\n```ts\nconst a = 1\n```\n\n- one")])
  assert.equal(list[0]!.snippet, "Done. const a = 1 one")
})

test("the snippet is parsed from the first 1,500 characters of the reply", () => {
  const list = prompts([user("m1", "q"), reply("a1", `${"word ".repeat(400)}END`)])
  assert.ok(list[0]!.snippet!.length <= 1500)
  assert.ok(!list[0]!.snippet!.includes("END"))
})

test("prompts since an id: older prompts are left out, their replies still read", () => {
  const messages = [user("m1", "a"), reply("a1", "x"), user("m2", "b"), reply("a2", "y"), user("m3", "c"), reply("a3", "z")]
  assert.deepEqual(prompts(messages, undefined, "m2").map((prompt) => prompt.id), ["m2", "m3"])
  assert.deepEqual(prompts(messages, "m3", "m2").map((prompt) => prompt.id), ["m2"])
  assert.deepEqual(loadedIds(messages), ["m1", "m2", "m3"])
  assert.deepEqual(loadedIds(messages, "m3"), ["m1", "m2"])
})

test("prompt labels: display text wins, empty text is \"User message\", long text is cut", () => {
  assert.equal(promptLabel(user("m", "  two\n lines ")), "two lines")
  assert.equal(promptLabel(user("m", "/raw", { metadata: { displayText: "/review the diff" } })), "/review the diff")
  assert.equal(promptLabel(user("m", "", { files: [{ mime: "image/png" }] })), "User message")
  assert.equal(promptLabel(user("m", "")), "User message")
  const label = promptLabel(user("m", "x".repeat(500)))
  assert.equal(label.length, 201)
  assert.ok(label.endsWith("…"))
})

test("markdown falls away: fences, lists, quotes, links, images, tables, emphasis, html", () => {
  const text = [
    "```ts",
    "const a = 1",
    "```",
    "- item *one*",
    "1. item __two__",
    "> quoted",
    "See [the docs](https://x.y) and ![alt](img.png) <b>bold</b> ~~gone~~",
    "| a | b |",
    "| --- | --- |",
    "| 1 | 2 |",
    "---",
    "héllo 👋 مرحبا",
  ].join("\n")
  assert.equal(
    stripMarkdown(text),
    "const a = 1 item one item two quoted See the docs and alt bold gone a b 1 2 héllo 👋 مرحبا",
  )
  assert.equal(stripMarkdown("snake_case_name stays"), "snake_case_name stays")
})

test("rail height: one gap per prompt, capped by the window, independent of anything on screen", () => {
  assert.equal(railHeightStyle(2), "max(0px, min(8px, calc(100vh - 18rem)))")
  assert.equal(railHeightStyle(11), "max(0px, min(80px, calc(100vh - 18rem)))")
  assert.equal(railHeightStyle(5000), "max(0px, min(39992px, calc(100vh - 18rem)))")
  assert.equal(topPercent(0, 5), 0)
  assert.equal(topPercent(2, 5), 50)
  assert.equal(topPercent(4, 5), 100)
  assert.equal(topPercent(0, 1), 0)
})

test("index from pointer: linear to the nearest prompt, clamped, every index reachable at any count", () => {
  const at = (count: number, y: number) => indexFromPointer({ count, top: 100, height: 200, y })
  assert.equal(at(0, 150), null)
  assert.equal(at(1, 150), 0)
  assert.equal(at(5, 100), 0)
  assert.equal(at(5, 300), 4)
  assert.equal(at(5, 200), 2)
  assert.equal(at(5, 20), 0, "above the strip")
  assert.equal(at(5, 999), 4, "below the strip")
  assert.equal(indexFromPointer({ count: 5, top: 0, height: 0, y: 3 }), 0)
  // 5,000 prompts on 200px: ticks overlap 25 to a pixel, yet the pointer still lands on all of them.
  const reached = new Set<number>()
  for (let y = 100; y <= 300; y += 0.01) reached.add(at(5000, y)!)
  assert.equal(reached.size, 5000)
})

test("every index of 5,000 stays reachable from the pointer", () => {
  const seen = new Set<number>()
  for (let y = 0; y <= 8980; y += 1) seen.add(indexFromPointer({ count: 5000, top: 0, height: 898, y: y / 10 })!)
  assert.equal(seen.size, 5000)
  assert.equal(indexFromPointer({ count: 800, top: 100, height: 898, y: 100 + 449 }), 400)
})

const names = (count: number, from = 0) => Array.from({ length: count }, (_, index) => `m${String(from + index).padStart(4, "0")}`)

test("window: a thread opens on its newest 10 prompts, whatever the host holds", () => {
  assert.equal(INITIAL_PROMPTS, 10)
  assert.equal(promptWindow(undefined, []), undefined)
  assert.equal(promptWindow(undefined, names(3))?.from, "m0000")
  assert.equal(promptWindow(undefined, names(10))?.from, "m0000")
  assert.equal(promptWindow(undefined, names(11))?.from, "m0001")
  assert.equal(promptWindow(undefined, names(5000))?.from, "m4990")
})

test("window: new prompts join, the oldest stays put", () => {
  const first = promptWindow(undefined, names(30))!
  assert.equal(first.from, "m0020")
  const next = promptWindow(first, names(31))!
  assert.equal(next.from, "m0020")
  assert.equal(promptWindow(next, names(35))!.from, "m0020")
})

test("window: a page the host loads above joins, up to 20 prompts", () => {
  const first = promptWindow(undefined, names(30, 100))!
  assert.equal(first.from, "m0120")
  const paged = promptWindow(first, names(40, 90))!
  assert.equal(paged.from, "m0110", "ten older prompts arrived and all join")
  const huge = promptWindow(paged, names(100, 30))!
  assert.equal(huge.from, "m0090", "a page of 70 adds only 20")
  assert.equal(PAGE_PROMPTS, 20)
  assert.equal(promptWindow(huge, names(100, 30))!.from, "m0090", "no change, no growth")
})

test("window: a page the host loads before the user asked for one does not join", () => {
  const first = promptWindow(undefined, names(30, 100))!
  const hosted = promptWindow(first, names(40, 90), false)!
  assert.equal(hosted.from, "m0120", "the host's own second page stays out of the rail")
  const asked = promptWindow(hosted, names(50, 80), true)!
  assert.equal(asked.from, "m0110", "a page the user asked for adds ten, from the window's edge")
  assert.equal(promptWindow(hosted, names(41, 90), false)!.from, "m0120", "a new prompt at the end still joins")
})

test("window: a reverted edge hands over to the next prompt still listed; a lost thread reopens on its newest", () => {
  const first = promptWindow(undefined, names(30))!
  assert.equal(first.from, "m0020")
  const without = names(30).filter((id) => id !== "m0020")
  assert.equal(promptWindow(first, without)!.from, "m0021")
  assert.equal(promptWindow(first, names(5, 100))!.from, "m0100")
})

test("peer messages are not prompts: no tick, not loaded, whatever their number", () => {
  const peer = (id: string) => user(id, `<cross-session-message from="W [abc]">hi</cross-session-message>`, { metadata: { peerMessage: { sessionID: "s", title: "W", ref: "abc", text: "hi" } } })
  const messages = [user("m1", "first"), reply("a1", "one"), peer("p1"), reply("pa", "ack"), peer("p2"), user("m2", "second"), reply("a2", "two")]
  assert.deepEqual(prompts(messages).map((prompt) => prompt.id), ["m1", "m2"])
  assert.deepEqual(loadedIds(messages), ["m1", "m2"])
  assert.deepEqual(prompts(messages, "m2").map((prompt) => prompt.id), ["m1"])
  assert.deepEqual(prompts([user("m1", "only"), peer("p1"), peer("p2")]).map((prompt) => prompt.id), ["m1"])
})

test("a typed look-alike without the metadata stays a prompt", () => {
  assert.deepEqual(prompts([user("m1", `<cross-session-message from="X [1]">t</cross-session-message>`)]).map((prompt) => prompt.id), ["m1"])
})
