import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createFrames, openInterval } from "./frames"
import type { Theme } from "./frame"

function setup() {
  const window = new Window({ url: "https://app.test/" })
  const doc = window.document as unknown as Document
  const opened: string[] = []
  let clock = 10_000
  let theme: Theme = { mode: "light", vars: { "--bg": "#fff" } }
  let activated = false
  let answer = true
  const asked: string[] = []
  const frames = createFrames({
    readyWait: 20,
    doc,
    theme: () => theme,
    open: async (url) => {
      asked.push(url)
      await Promise.resolve()
      if (answer) opened.push(url)
      return answer
    },
    now: () => clock,
    activation: () => activated,
  })
  const make = (surface: "inline" | "overlay" | "panel" = "inline", group = "g") => {
    const view = frames.create({ group, html: "<p>x</p>", surface, title: "t" })
    doc.body.append(view.frame)
    const posted: any[] = []
    Object.defineProperty(view.frame, "contentWindow", { value: { postMessage: (message: unknown) => posted.push(message) }, configurable: true })
    return { view, posted }
  }
  const send = (source: unknown, data: unknown) => window.dispatchEvent(Object.assign(new window.MessageEvent("message", { data }), { source }) as never)
  return {
    window, doc, frames, make, send, opened, asked,
    answer: (value: boolean) => (answer = value),
    activate: (on: boolean) => (activated = on),
    tick: (ms: number) => (clock += ms),
    setTheme: (next: Theme) => (theme = next),
  }
}

test("frames are sandboxed without the app origin and carry the policy", () => {
  const t = setup()
  const { view } = t.make()
  assert.equal(view.frame.getAttribute("sandbox"), "allow-scripts")
  assert.match(view.frame.getAttribute("csp")!, /default-src 'none'/)
  assert.equal(view.frame.getAttribute("referrerpolicy"), "no-referrer")
  assert.match(view.frame.srcdoc, /<p>x<\/p>/)
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test("a page cannot open a link: it can only ask, after a real input, one question at a time, and the user's click opens it", async () => {
  const t = setup()
  const { view } = t.make()
  const open = async () => {
    t.send(view.frame.contentWindow, { vr: view.id, type: "open", url: "https://a.dev/" })
    await settle()
  }
  await open()
  assert.deepEqual(t.asked, [], "no user input: nothing is even asked")
  t.activate(true)
  t.answer(false)
  await open()
  assert.deepEqual(t.asked, ["https://a.dev/"])
  assert.deepEqual(t.opened, [], "declined: nothing opens")
  await open()
  assert.equal(t.asked.length, 1, "a pause follows every answer")
  t.tick(openInterval)
  t.answer(true)
  await open()
  assert.equal(t.asked.length, 1, "after a decline the pause triples")
  t.tick(openInterval * 3)
  await open()
  assert.deepEqual(t.opened, ["https://a.dev/"], "confirmed")
  t.tick(openInterval)
  t.activate(false)
  await open()
  assert.equal(t.asked.length, 2, "the user input expired")
  t.activate(true)
  await open()
  assert.equal(t.asked.length, 3, "a confirmation resets the pause")
})

test("while a question is open the page cannot stack more", async () => {
  const t = setup()
  const { view } = t.make()
  t.activate(true)
  for (let i = 0; i < 5; i++) t.send(view.frame.contentWindow, { vr: view.id, type: "open", url: "https://a.dev/" })
  await settle()
  assert.equal(t.asked.length, 1)
})

test("messages from other frames, with other ids or other shapes are dropped", () => {
  const t = setup()
  const { view } = t.make()
  t.activate(true)
  t.send({}, { vr: view.id, type: "open", url: "https://a.dev/" })
  t.send(view.frame.contentWindow, { vr: "other", type: "open", url: "https://a.dev/" })
  t.send(view.frame.contentWindow, { vr: view.id, type: "open", url: "file:///etc/passwd" })
  t.send(view.frame.contentWindow, { vr: view.id, type: "open", url: "javascript:alert(1)" })
  assert.deepEqual(t.asked, [])
})

const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("a load nothing answers is a foreign document and is replaced; a load our bridge answers is fine", async () => {
  const t = setup()
  const { view } = t.make()
  await later(5) // happy-dom may fire its own load for the appended srcdoc frame
  t.send(view.frame.contentWindow, { vr: view.id, type: "ready" })
  view.frame.dispatchEvent(new t.window.Event("load") as never)
  t.send(view.frame.contentWindow, { vr: view.id, type: "ready" })
  await later(40)
  assert.equal(view.blocked, false, "announced itself")
  view.frame.dispatchEvent(new t.window.Event("load") as never)
  t.send(view.frame.contentWindow, { vr: view.id, type: "ready" })
  await later(40)
  assert.equal(view.blocked, false, "a reload caused by moving the row is answered too")
  view.frame.dispatchEvent(new t.window.Event("load") as never)
  await later(40)
  assert.equal(view.blocked, true)
  assert.match(view.frame.srcdoc, /tried to navigate away/)
  t.activate(true)
  t.send(view.frame.contentWindow, { vr: view.id, type: "open", url: "https://a.dev/" })
  assert.deepEqual(t.asked, [], "a blocked frame is silent")
  t.frames.reload(view, "<p>y</p>")
  assert.equal(view.blocked, false)
})

test("retiring a frame cancels its pending check", async () => {
  const t = setup()
  const { view } = t.make()
  view.frame.dispatchEvent(new t.window.Event("load") as never)
  t.frames.retire(view)
  await later(40)
  assert.equal(view.blocked, false)
})

test("height reaches every inline frame of the artifact, and only inline ones", () => {
  const t = setup()
  const a = t.make("inline", "g")
  const b = t.make("inline", "g")
  const panel = t.make("panel", "g")
  t.send(a.view.frame.contentWindow, { vr: a.view.id, type: "height", height: 333 })
  assert.equal(a.view.frame.style.height, "333px")
  assert.equal(b.view.frame.style.height, "333px")
  t.send(panel.view.frame.contentWindow, { vr: panel.view.id, type: "height", height: 700 })
  assert.equal(panel.view.frame.style.height, "")
})

test("theme and zoom follow the app and are pushed to every live frame, and stop after retire", () => {
  const t = setup()
  const a = t.make("inline", "g")
  const p = t.make("panel", "other")
  t.send(a.view.frame.contentWindow, { vr: a.view.id, type: "ready" })
  assert.deepEqual(a.posted.map((m) => m.type), ["theme", "zoom"])
  t.setTheme({ mode: "dark", vars: { "--bg": "#000" } })
  t.frames.refreshTheme()
  assert.equal(a.posted.at(-1).mode, "dark")
  assert.equal(p.posted.at(-1).mode, "dark", "the panel re-themes live")
  t.frames.refreshTheme()
  assert.equal(a.posted.length, 3, "an unchanged theme posts nothing")
  t.frames.zoomStep("g", 1)
  assert.equal(a.posted.at(-1).value, 1.25)
  assert.equal(p.posted.length, 1, "zoom is per artifact: the panel got only the theme")
  const before = a.posted.length
  t.frames.retire(a.view)
  t.frames.zoomStep("g", 1)
  assert.equal(a.posted.length, before)
})

test("one page's declines do not slow another page's links", async () => {
  const t = setup()
  const noisy = t.make("inline", "noisy")
  const calm = t.make("inline", "calm")
  t.activate(true)
  t.answer(false)
  for (let round = 0; round < 3; round++) {
    t.send(noisy.view.frame.contentWindow, { vr: noisy.view.id, type: "open", url: "https://spam.dev/" })
    await settle()
    t.tick(openInterval * 3 ** (round + 1))
  }
  assert.equal(t.asked.length, 3)
  t.answer(true)
  t.send(calm.view.frame.contentWindow, { vr: calm.view.id, type: "open", url: "https://ok.dev/" })
  await settle()
  assert.deepEqual(t.opened, ["https://ok.dev/"])
})
