import assert from "node:assert/strict"
import { test } from "node:test"
import { Window as HappyWindow } from "happy-dom"
import { createJumpController } from "./controller"

function fixture() {
  const host = new HappyWindow()
  const window = host as unknown as Window & typeof globalThis
  const document = window.document
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  window.requestAnimationFrame = (callback) => { frames.set(++id, callback); return id }
  window.cancelAnimationFrame = (key) => { frames.delete(key) }
  const observations: { target: Node; options?: MutationObserverInit }[] = []
  let mutate = () => {}
  let resize = () => {}
  window.MutationObserver = class {
    constructor(callback: () => void) { mutate = callback }
    observe(target: Node, options?: MutationObserverInit) { observations.push({ target, options }) }
    disconnect() {}
  } as unknown as typeof MutationObserver
  window.ResizeObserver = class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  let reduced = false
  window.matchMedia = (() => ({ matches: reduced })) as unknown as typeof window.matchMedia
  document.body.innerHTML = `
    <div data-slot="session-timeline-scroll">
      <div class="scroll-view__viewport" data-scrollable>
        <span data-marker></span>
        <div data-timeline-row="UserMessage"><span data-slot="user-message-text">Earlier prompt</span></div>
      </div>
    </div>`
  const container = document.querySelector<HTMLElement>(".scroll-view__viewport")!
  const marker = document.querySelector<HTMLElement>("[data-marker]")!
  const row = document.querySelector<HTMLElement>("[data-timeline-row]")!
  container.tabIndex = 0
  let left = 100
  let width = 600
  let bottom = 80
  container.getBoundingClientRect = () => ({ left, top: 100, width, height: 600 }) as DOMRect
  row.getBoundingClientRect = () => ({ top: bottom - 40, bottom, width: 300, height: 40 }) as DOMRect
  Object.defineProperties(container, {
    scrollHeight: { configurable: true, value: 2000 },
    clientHeight: { value: 600 },
    scrollTop: { value: 500 },
  })
  const jumps: ScrollIntoViewOptions[] = []
  row.scrollIntoView = (options) => jumps.push(options as ScrollIntoViewOptions)
  const pill = document.createElement("button")
  pill.setAttribute("data-message-jump", "")
  pill.innerHTML = "<span data-message-jump-text></span>"
  const controller = createJumpController(marker, pill)
  const flush = () => {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(0))
  }
  return {
    controller, container, marker, row, pill, document, window, frames, observations, jumps, flush,
    mutate: () => mutate(), resize: () => resize(),
    geometry: (x: number, w: number) => { left = x; width = w },
    rowBottom: (value: number) => { bottom = value },
    reducedMotion: () => { reduced = true },
  }
}

test("initial entrance has its own frame; visible pill is keyboard accessible", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush()
  assert.equal(f.pill.isConnected, true)
  assert.equal(f.pill.getAttribute("data-visible"), "false")
  f.flush()
  assert.equal(f.pill.getAttribute("data-visible"), "true")
  assert.equal(f.pill.tabIndex, 0)
  assert.equal(f.pill.getAttribute("aria-label"), "Jump to your message: Earlier prompt")
  f.controller.dispose()
})

test("resize repositions the same target and fits a narrow timeline", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush(); f.flush()
  f.geometry(300, 200)
  f.resize()
  f.flush()
  assert.equal(f.pill.style.left, "400px")
  assert.equal(f.pill.style.maxWidth, "176px")
  f.controller.dispose()
})

test("a cached connected timeline loses its pill immediately when inactive", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush(); f.flush()
  f.controller.setActive(false)
  assert.equal(f.container.isConnected, true)
  assert.equal(f.pill.isConnected, false)
  assert.equal(f.pill.tabIndex, -1)
  f.pill.click()
  assert.equal(f.jumps.length, 0)
  f.controller.setActive(true)
  f.flush(); f.flush()
  assert.equal(f.document.querySelectorAll("[data-message-jump]").length, 1)
  f.controller.dispose()
})

test("inactive session cannot complete an in-flight entrance", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush()
  f.controller.setActive(false)
  f.flush()
  assert.equal(f.pill.isConnected, false)
  assert.equal(f.frames.size, 0)
  f.controller.dispose()
})

test("observer is scoped to its timeline, excluding its own label writes", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush(); f.flush()
  assert.equal(f.observations.length, 1)
  assert.equal(f.observations[0].target, f.container)
  assert.equal(f.container.contains(f.pill), false)
  assert.equal(f.observations[0].options?.characterData, true)
  f.mutate(); f.mutate(); f.resize()
  assert.equal(f.frames.size, 1)
  f.controller.dispose()
  assert.equal(f.frames.size, 0)
})

test("a partly visible or unmounted target stops being actionable", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush(); f.flush()
  f.rowBottom(120)
  f.mutate(); f.flush()
  assert.equal(f.pill.getAttribute("data-visible"), "false")
  assert.equal(f.pill.tabIndex, -1)
  f.rowBottom(80)
  f.mutate(); f.flush()
  f.row.remove()
  f.pill.click()
  assert.equal(f.jumps.length, 0)
  f.controller.dispose()
})

test("click uses smooth scrolling, reduced motion uses auto", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush(); f.flush()
  f.pill.click()
  assert.deepEqual(f.jumps, [{ block: "start", behavior: "smooth" }])
  f.reducedMotion()
  f.resize(); f.flush()
  f.pill.click()
  assert.equal(f.jumps[1].behavior, "auto")
  f.controller.dispose()
})

test("a second timeline cannot supply this session's target", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush(); f.flush()
  const other = f.container.cloneNode(true) as HTMLElement
  f.document.body.prepend(other)
  f.row.remove()
  f.mutate(); f.flush()
  assert.equal(f.pill.getAttribute("data-visible"), "false")
  f.controller.dispose()
})

test("keyboard activation returns focus to the timeline before hiding", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush(); f.flush()
  f.pill.focus()
  assert.equal(f.document.activeElement, f.pill)
  f.pill.click()
  assert.equal(f.document.activeElement, f.container)
  f.controller.dispose()
})

test("the previous message remains available at the bottom of the chat", () => {
  const f = fixture()
  f.controller.setActive(true)
  f.flush(); f.flush()
  Object.defineProperty(f.container, "scrollHeight", { value: 1100 })
  f.container.dispatchEvent(new f.window.Event("scroll"))
  f.flush()
  assert.equal(f.pill.getAttribute("data-visible"), "true")
  assert.equal(f.pill.tabIndex, 0)
  f.controller.dispose()
})
