import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createAttacher, type ControlActions, type PageData } from "./attach"
import type { Theme } from "./frame"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(initial: string[] = ["c1"]) {
  const window = new Window({ url: "https://app.test/" })
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<div id="timeline"></div>`
  const timeline = doc.getElementById("timeline")!
  const known = new Set(initial)
  const opened: string[] = []
  const unknown: string[][] = []
  const controls: ControlActions[] = []
  let loads = 0
  let theme: Theme = { mode: "light", vars: { "--bg": "#fff" } }
  const attacher = createAttacher({
    doc,
    known: () => known,
    load: async (id): Promise<PageData | undefined> => (loads++, known.has(id) ? { title: `Page ${id}`, html: `<p>${id}</p>` } : undefined),
    theme: () => theme,
    openExternal: (url) => opened.push(url),
    unknown: (ids) => unknown.push(ids),
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
  const hosts = () => [...doc.querySelectorAll("[data-visual-reply]")]
  const frames = () => [...doc.querySelectorAll("iframe")] as HTMLIFrameElement[]
  /** Gives a frame a recordable window and returns the messages posted to it. */
  const fake = (frame: HTMLIFrameElement) => {
    const posted: any[] = []
    const win = { postMessage: (message: unknown) => posted.push(message) }
    Object.defineProperty(frame, "contentWindow", { value: win, configurable: true })
    return { win, posted }
  }
  const send = (source: unknown, data: unknown) =>
    window.dispatchEvent(Object.assign(new window.MessageEvent("message", { data }), { source }) as never)
  return { window, doc, timeline, known, opened, unknown, controls, attacher, row, hosts, frames, fake, send, loads: () => loads, setTheme: (next: Theme) => (theme = next) }
}

test("attaches one sandboxed frame after the tool row and is idempotent", async () => {
  const t = setup()
  const wrapper = t.row("c1")
  t.timeline.append(wrapper, t.row("other"))
  t.attacher.scan()
  await tick()
  t.attacher.scan()
  t.attacher.scan()
  await tick()
  assert.equal(t.hosts().length, 1)
  assert.equal(wrapper.nextElementSibling, t.hosts()[0])
  const [frame] = t.frames()
  assert.equal(frame!.getAttribute("sandbox"), "allow-scripts")
  assert.match(frame!.getAttribute("csp")!, /default-src 'none'/)
  assert.match(frame!.srcdoc, /<p>c1<\/p>/)
  assert.equal(wrapper.textContent, "", "app-owned row is untouched")
  assert.equal(t.loads(), 1)
})

test("unknown rows are reported once and attach after the page is announced", async () => {
  const t = setup([])
  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  t.attacher.scan()
  assert.deepEqual(t.unknown, [["c1"]])
  assert.equal(t.hosts().length, 0)
  t.known.add("c1")
  t.attacher.recheck(["c1"])
  await tick()
  assert.equal(t.hosts().length, 1)
})

test("virtualization: a row that unmounts and remounts re-attaches without duplicates or a second fetch", async () => {
  const t = setup()
  const first = t.row("c1")
  t.timeline.append(first)
  t.attacher.scan()
  await tick()
  const [frame] = t.frames()
  const { win } = t.fake(frame!)
  t.send(win, { vr: "c1", type: "height", height: 480 })

  first.remove()
  t.hosts()[0]?.remove()
  t.attacher.scan()
  assert.equal(t.hosts().length, 0)

  const second = t.row("c1")
  t.timeline.append(second)
  t.attacher.scan()
  t.attacher.scan()
  await tick()
  assert.equal(t.hosts().length, 1)
  assert.equal(t.frames().length, 1)
  assert.equal(t.loads(), 1, "page comes from cache")
  assert.equal(t.frames()[0]!.style.height, "480px", "height is remembered so the row does not jump")

  // The same call mounted in a cached hidden timeline gets its own card; both are cleaned with their rows.
  const twin = t.row("c1")
  t.timeline.append(twin)
  t.attacher.scan()
  await tick()
  assert.equal(t.hosts().length, 2)
  twin.remove()
  t.attacher.scan()
  assert.equal(t.hosts().length, 1)
})

test("a host the app dropped from the DOM is rebuilt next to its row", async () => {
  const t = setup()
  const wrapper = t.row("c1")
  t.timeline.append(wrapper)
  t.attacher.scan()
  await tick()
  t.hosts()[0]!.remove()
  t.attacher.scan()
  await tick()
  assert.equal(t.hosts().length, 1)
  assert.equal(wrapper.nextElementSibling, t.hosts()[0])
})

test("height messages resize within limits and only from the owning frame", async () => {
  const t = setup()
  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  await tick()
  const frame = t.frames()[0]!
  const { win } = t.fake(frame)
  t.send(win, { vr: "c1", type: "height", height: 300 })
  assert.equal(frame.style.height, "300px")
  t.send(win, { vr: "c1", type: "height", height: 99999 })
  assert.equal(frame.style.height, "900px")
  t.send({}, { vr: "c1", type: "height", height: 100 })
  t.send(win, { vr: "wrong", type: "height", height: 100 })
  assert.equal(frame.style.height, "900px")
})

test("links open externally only for http(s) and mailto", async () => {
  const t = setup()
  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  await tick()
  const { win } = t.fake(t.frames()[0]!)
  t.send(win, { vr: "c1", type: "open", url: "https://example.com/a" })
  t.send(win, { vr: "c1", type: "open", url: "javascript:alert(1)" })
  assert.deepEqual(t.opened, ["https://example.com/a"])
})

test("theme changes reach live frames once and new frames start themed", async () => {
  const t = setup()
  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  await tick()
  const { win, posted } = t.fake(t.frames()[0]!)
  t.attacher.refreshTheme()
  assert.equal(posted.length, 0)
  t.setTheme({ mode: "dark", vars: { "--bg": "#000" } })
  t.attacher.refreshTheme()
  t.attacher.refreshTheme()
  assert.deepEqual(posted, [{ vr: "c1", type: "theme", mode: "dark", vars: { "--bg": "#000" } }])
  t.send(win, { vr: "c1", type: "ready" })
  assert.deepEqual(posted.slice(1).map((message) => message.type), ["theme", "zoom"])

  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  await tick()
  assert.match(t.frames()[1]!.srcdoc, /color-scheme:dark;--bg:#000/)
})

test("zoom steps are shared by the card and the overlay; expand and Escape work", async () => {
  const t = setup()
  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  await tick()
  const { posted } = t.fake(t.frames()[0]!)
  t.controls[0]!.zoomIn()
  t.controls[0]!.zoomIn()
  t.controls[0]!.zoomOut()
  assert.deepEqual(posted.map((message) => message.value), [1.25, 1.5, 1.25])
  t.controls[0]!.zoomReset()
  assert.equal(posted.at(-1).value, 1)

  t.controls[0]!.primary()
  const overlay = t.doc.querySelector("[data-visual-reply-overlay]")!
  assert.ok(overlay)
  assert.equal(t.frames().length, 2)
  assert.equal(t.controls.at(-1)!.surface, "overlay")
  t.attacher.scan()
  assert.equal(t.doc.querySelectorAll("[data-visual-reply-overlay]").length, 1)
  t.doc.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape" }) as never)
  assert.equal(t.doc.querySelector("[data-visual-reply-overlay]"), null)
  t.controls[0]!.primary()
  t.controls.at(-1)!.primary()
  assert.equal(t.doc.querySelector("[data-visual-reply-overlay]"), null)
})

test("dispose removes every node and a new instance clears leftovers from the old one", async () => {
  const t = setup()
  t.timeline.append(t.row("c1"))
  t.attacher.scan()
  await tick()
  t.controls[0]!.primary()
  assert.equal(t.hosts().length, 1)
  t.attacher.dispose()
  assert.equal(t.hosts().length, 0)
  assert.equal(t.doc.querySelectorAll("[data-visual-reply-overlay],iframe").length, 0)

  const stale = t.doc.createElement("div")
  stale.setAttribute("data-visual-reply", "c1")
  t.timeline.append(stale)
  const again = createAttacher({
    doc: t.doc, known: () => new Set(), load: async () => undefined, theme: () => ({ mode: "light", vars: {} }),
    openExternal: () => {}, schedule: (run) => run(), mountControls: () => () => {},
  })
  assert.equal(t.hosts().length, 0)
  again.dispose()
})
