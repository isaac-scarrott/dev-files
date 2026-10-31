import assert from "node:assert/strict"
import { test } from "node:test"
import { layout, MIN_PITCH, promptLabel, prompts, stripMarkdown, tickLength, tickOf, type Message } from "./rail"

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

test("tick length follows prompt length", () => {
  assert.equal(tickLength("short"), "short")
  assert.equal(tickLength("x".repeat(100)), "medium")
  assert.equal(tickLength("x".repeat(200)), "long")
})

test("layout: one tick per prompt at a pitch that fits 60% of the height, compressing before bucketing", () => {
  assert.deepEqual(layout(0, 600), { pitch: MIN_PITCH, ticks: [] })
  const few = layout(5, 600)
  assert.equal(few.pitch, 10)
  assert.equal(few.ticks.length, 5)
  assert.deepEqual(few.ticks[4], { start: 4, end: 4 })
  const many = layout(60, 600)
  assert.equal(many.pitch, 6)
  assert.equal(many.ticks.length, 60)
})

test("layout: beyond the tightest pitch, prompts are bucketed into evenly sized ticks covering every prompt", () => {
  const { pitch, ticks } = layout(200, 600)
  assert.equal(pitch, MIN_PITCH)
  assert.equal(ticks.length, 90)
  assert.equal(ticks[0]!.start, 0)
  assert.equal(ticks.at(-1)!.end, 199)
  for (let index = 1; index < ticks.length; index += 1) assert.equal(ticks[index]!.start, ticks[index - 1]!.end + 1)
  assert.equal(tickOf(ticks, 199), 89)
  assert.equal(tickOf(ticks, 0), 0)
  assert.equal(tickOf(ticks, 500), -1)
  assert.equal(tickOf(ticks, -1), -1)
})
