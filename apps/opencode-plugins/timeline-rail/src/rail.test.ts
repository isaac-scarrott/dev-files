import assert from "node:assert/strict"
import { test } from "node:test"
import { fisheyeBand, indexFromPointer, promptLabel, prompts, railHeightStyle, stripMarkdown, topPercent, visibleRange, type Message } from "./rail"

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

test("the snippet is the first text of the first reply with text; tool-only or reasoning-only replies are skipped", () => {
  const list = prompts([
    user("m1", "q"),
    reply("a1", undefined, { content: [{ type: "tool" }, { type: "reasoning", text: "hmm" }] }),
    reply("a2", "   "),
    reply("a3", "# Title\n\nThe **answer** is `42`."),
    user("m2", "q2"),
  ])
  assert.equal(list[0]!.snippet, "Title The answer is 42.")
  assert.equal(list[0]!.working, false)
})

test("a reply still streaming without text shows as working; a finished tool-only turn shows the prompt alone", () => {
  const streaming = prompts([user("m1", "q"), reply("a1", undefined, { content: [{ type: "tool" }], time: {} })])
  assert.equal(streaming[0]!.working, true)
  assert.equal(streaming[0]!.snippet, undefined)
  const done = prompts([user("m1", "q"), reply("a1", undefined, { content: [{ type: "tool" }] })])
  assert.equal(done[0]!.working, false)
  const failed = prompts([user("m1", "q"), reply("a1", undefined, { time: {}, error: { name: "x" } })])
  assert.equal(failed[0]!.working, false)
  const none = prompts([user("m1", "q")])
  assert.equal(none[0]!.working, false)
  assert.equal(none[0]!.snippet, undefined)
})

test("prompt labels: display text wins, attachments and agents stand in for empty text, long text is cut", () => {
  assert.equal(promptLabel(user("m", "  two\n lines ")), "two lines")
  assert.equal(promptLabel(user("m", "/raw", { metadata: { displayText: "/review the diff" } })), "/review the diff")
  assert.equal(promptLabel(user("m", "", { files: [{ mime: "image/png" }, { mime: "text/plain", name: "a.txt" }] })), "[image] [a.txt]")
  assert.equal(promptLabel(user("m", "", { agents: [{ name: "explore" }] })), "@explore")
  assert.equal(promptLabel(user("m", "")), "(empty prompt)")
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

test("fisheye band: the active prompt and two neighbours each side, clipped to the list", () => {
  assert.equal(fisheyeBand(undefined, 10), undefined)
  assert.equal(fisheyeBand(10, 10), undefined)
  assert.deepEqual(fisheyeBand(5, 10), [3, 7])
  assert.deepEqual(fisheyeBand(0, 10), [0, 2])
  assert.deepEqual(fisheyeBand(9, 10), [7, 9])
})

test("visible range: owners of rows that intersect the box; off-screen rows and unlisted owners are ignored", () => {
  const indexOf = new Map([["a", 0], ["b", 1], ["c", 2], ["d", 3]])
  const row = (owner: string, top: number, bottom: number) => ({ owner, prompt: false, top, bottom })
  const box = { top: 50, bottom: 650 }
  assert.deepEqual(visibleRange(indexOf, [row("a", -300, 40), row("b", 40, 400), row("c", 400, 700), row("d", 700, 900)], box), [1, 2])
  assert.deepEqual(visibleRange(indexOf, [row("b", 100, 200), row("x", 200, 300)], box), [1, 1])
  assert.equal(visibleRange(indexOf, [row("d", 900, 1000)], box), undefined)
  assert.equal(visibleRange(indexOf, [], box), undefined)
})
