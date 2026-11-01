import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createAttacher, type ControlActions, type PageData } from "./attach"
import { createFrames } from "./frames"
import type { Placement } from "./ids"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup() {
  const window = new Window({ url: "https://app.test/" })
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<div id="timeline"></div>`
  const timeline = doc.getElementById("timeline")!
  const placements = new Map<string, Placement[]>()
  const settled = new Set<string>()
  const panels: string[] = []
  const unknown: string[][] = []
  const controls: ControlActions[] = []
  const pages = new Map<string, PageData | undefined>()
  let loads = 0
  const frames = createFrames({ doc, theme: () => ({ mode: "light", vars: {} }), open: async () => false })
  const attacher = createAttacher({
    doc,
    frames,
    scan: () => ({ placements, settled }),
    load: async (placement) => (loads++, pages.get(placement.artifactID ?? placement.callID)),
    updatedLabel: () => "Updated",
    failedLabel: () => "Could not load this page.",
    titleOf: () => undefined,
    unknown: (ids) => unknown.push(ids),
    openPanel: (id) => panels.push(id),
    schedule: (run) => run(),
    mountControls: (container, actions) => {
      controls.push(actions)
      const marker = doc.createElement("i")
      container.append(marker)
      return () => marker.remove()
    },
  })
  const row = (id: string) => {
    const wrapper = doc.createElement("div")
    wrapper.setAttribute("data-component", "tool-part-wrapper")
    wrapper.setAttribute("data-timeline-part-id", id)
    return wrapper
  }
  const card = (callID: string, artifactID: string): Placement => ({ callID, kind: "card", artifactID })
  const hosts = () => [...doc.querySelectorAll("[data-visual-reply]")]
  const rows = () => [...doc.querySelectorAll("[data-visual-reply-update]")]
  const iframes = () => [...doc.querySelectorAll("iframe")] as HTMLIFrameElement[]
  return { window, doc, timeline, placements, settled, panels, unknown, controls, pages, attacher, frames, row, card, hosts, rows, iframes, loads: () => loads }
}

test("attaches one sandboxed card after the tool row and is idempotent", async () => {
  const t = setup()
  t.placements.set("c1", [t.card("c1", "art_1")])
  t.pages.set("art_1", { title: "Page", html: "<p>c1</p>" })
  const wrapper = t.row("c1")
  t.timeline.append(wrapper, t.row("other"))
  t.attacher.scan()
  await tick()
  t.attacher.scan()
  t.attacher.scan()
  await tick()
  assert.equal(t.hosts().length, 1)
  assert.equal(wrapper.nextElementSibling, t.hosts()[0])
  const [frame] = t.iframes()
  assert.equal(frame!.getAttribute("sandbox"), "allow-scripts")
  assert.match(frame!.srcdoc, /<p>c1<\/p>/)
  assert.equal(wrapper.textContent, "", "app-owned row is untouched")
  assert.equal(t.loads(), 1)
  assert.ok(t.controls[0]!.panel, "a card with an artifact id offers the panel")
})

test("an update is a compact row in the host's tool-row markup, not a second card, and opens the panel", async () => {
  const t = setup()
  t.placements.set("c1", [t.card("c1", "art_1")])
  t.placements.set("u1", [{ callID: "u1", kind: "update", artifactID: "art_1", title: "Rev v2" }])
  t.pages.set("art_1", { title: "Rev", html: "<p>latest</p>" })
  t.timeline.append(t.row("c1"), t.row("u1"))
  t.attacher.scan()
  await tick()
  assert.equal(t.hosts().length, 1)
  assert.equal(t.rows().length, 1)
  assert.equal(t.iframes().length, 1)
  const row = t.rows()[0]!
  assert.equal(row.querySelector('[data-component="collapsible"]')!.getAttribute("data-variant"), "normal")
  assert.equal(row.getAttribute("data-timeline-part-id"), null, "not mistaken for a tool part")
  assert.equal(row.querySelector('[data-slot="basic-tool-tool-title"]')!.textContent, "Updated")
  assert.equal(row.querySelector('[data-slot="basic-tool-tool-arg"]')!.textContent, "Rev v2")
  row.querySelector("button")!.dispatchEvent(new t.window.MouseEvent("click", { bubbles: true }) as never)
  assert.deepEqual(t.panels, ["art_1"])
})

test("several placements under one row stack in order and unmount together", async () => {
  const t = setup()
  t.placements.set("e1", [t.card("e1", "art_a"), t.card("e1", "art_b")])
  t.pages.set("art_a", { title: "A", html: "a" })
  t.pages.set("art_b", { title: "B", html: "b" })
  const wrapper = t.row("e1")
  t.timeline.append(wrapper)
  t.attacher.scan()
  await tick()
  assert.deepEqual(t.hosts().map((host) => host.querySelector('[data-slot="title"]')!.textContent), ["A", "B"])
  assert.equal(wrapper.nextElementSibling, t.hosts()[0])
  wrapper.remove()
  t.attacher.scan()
  assert.equal(t.hosts().length, 0)
  assert.equal(t.frames.count(), 0, "frames are retired with their cards")
})

test("a card with no loadable page shows the failure as a state", async () => {
  const t = setup()
  t.placements.set("c1", [t.card("c1", "art_x")])
  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  await tick()
  assert.equal(t.hosts()[0]!.querySelector('[data-slot="error"]')!.textContent, "Could not load this page.")
  assert.equal(t.iframes().length, 0)
})

test("unknown rows are reported, finished ones are not, and a running one is asked again later with backoff", async () => {
  const t = setup()
  t.timeline.append(t.row("c1"), t.row("c2"))
  t.settled.add("c2")
  t.attacher.scan()
  assert.deepEqual(t.unknown, [["c1"]])
  t.attacher.scan()
  assert.equal(t.unknown.length, 1, "not asked again at once")
  const realNow = Date.now
  try {
    Date.now = () => realNow() + 1100
    t.attacher.scan()
    assert.deepEqual(t.unknown.at(-1), ["c1"])
    Date.now = () => realNow() + 1100 + 1200
    t.attacher.scan()
    assert.equal(t.unknown.length, 2, "the second backoff is 2s")
  } finally {
    Date.now = realNow
  }
})

test("refresh reloads a live card in place, keeping its frame count", async () => {
  const t = setup()
  t.placements.set("c1", [t.card("c1", "art_1")])
  t.pages.set("art_1", { title: "Old", html: "<p>old</p>" })
  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  await tick()
  t.pages.set("art_1", { title: "New", html: "<p>new</p>" })
  await t.attacher.refresh("art_1")
  assert.equal(t.iframes().length, 1)
  assert.match(t.iframes()[0]!.srcdoc, /<p>new<\/p>/)
  assert.equal(t.hosts()[0]!.querySelector('[data-slot="title"]')!.textContent, "New")
})

test("expand opens one overlay frame and closes on its button; dispose removes everything", async () => {
  const t = setup()
  t.placements.set("c1", [t.card("c1", "art_1")])
  t.pages.set("art_1", { title: "Page", html: "<p>c1</p>" })
  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  await tick()
  t.controls[0]!.primary()
  assert.equal(t.doc.querySelectorAll("[data-visual-reply-overlay]").length, 1)
  assert.equal(t.iframes().length, 2)
  t.controls.at(-1)!.primary()
  assert.equal(t.doc.querySelectorAll("[data-visual-reply-overlay]").length, 0)
  t.attacher.dispose()
  assert.equal(t.doc.querySelectorAll("[data-visual-reply]").length, 0)
})
