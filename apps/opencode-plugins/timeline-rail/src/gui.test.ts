import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { render } from "solid-js/web"
import plugin from "./gui"
import type { Message } from "./rail"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]

const INSET = 48
const VIEWPORT = 600
const WIDTH = 1000

const rect = (top: number, left: number, width: number, height: number) => ({
  top,
  bottom: top + height,
  left,
  right: left + width,
  width,
  height,
  x: left,
  y: top,
  toJSON: () => ({}),
})

function fixture(options: { gutter?: number; desktop?: boolean; pages?: number } = {}) {
  // Solid delegates events to the document it loaded with, so the tests reuse it.
  const doc = globalThis.document
  doc.body.innerHTML = `<div data-view><div data-slot="session-timeline-scroll"><div data-scrollable><div data-session-title><div data-actions></div></div><div data-rows></div></div></div><div data-slot="session-timeline-visible"></div></div>`
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 1
  const gutter = options.gutter ?? 256
  const globals = {
    HTMLElement: globalThis.window.HTMLElement,
    WheelEvent: globalThis.window.WheelEvent,
    Node: globalThis.window.Node,
    // Solid's Portal checks its mount against HTMLHeadElement.
    HTMLHeadElement: globalThis.window.HTMLHeadElement,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(nextFrame, callback)
      return nextFrame++
    },
    cancelAnimationFrame: (id: number) => void frames.delete(id),
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const media = globalThis.window.matchMedia
  globalThis.window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("min-width") ? (options.desktop ?? true) : false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia

  const view = doc.querySelector("[data-view]") as HTMLElement
  const visible = doc.querySelector("[data-slot='session-timeline-visible']") as HTMLElement
  const scroller = doc.querySelector("[data-scrollable]") as HTMLElement
  const sticky = scroller.querySelector("[data-session-title]") as HTMLElement
  const actions = scroller.querySelector("[data-actions]") as HTMLElement
  const rowsHost = scroller.querySelector("[data-rows]") as HTMLElement
  Object.defineProperty(sticky, "offsetHeight", { value: INSET })
  view.getBoundingClientRect = () => rect(0, 0, WIDTH, VIEWPORT)
  visible.getBoundingClientRect = () => rect(0, 0, WIDTH, VIEWPORT)
  const state = { scrollTop: 0, total: 20000 }
  const scrolls: { top: number; behavior: ScrollBehavior }[] = []
  Object.defineProperty(scroller, "scrollTop", { get: () => state.scrollTop, set: (value: number) => void (state.scrollTop = value) })
  Object.defineProperty(scroller, "clientHeight", { get: () => VIEWPORT })
  Object.defineProperty(scroller, "scrollHeight", { get: () => state.total })
  scroller.getBoundingClientRect = () => rect(0, 0, WIDTH, VIEWPORT)
  scroller.scrollTo = ((options: ScrollToOptions) => {
    scrolls.push({ top: options.top ?? 0, behavior: options.behavior ?? "auto" })
    state.scrollTop = options.top ?? 0
  }) as HTMLElement["scrollTo"]

  const mount = (specs: { owner: string; y: number; height: number; prompt?: boolean }[]) => {
    rowsHost.innerHTML = ""
    for (const spec of specs) {
      const row = doc.createElement("div")
      row.setAttribute("data-message-id", spec.owner)
      row.setAttribute("data-timeline-row", spec.prompt ? "UserMessage" : "AssistantPart")
      row.getBoundingClientRect = () => rect(spec.y - state.scrollTop, gutter, WIDTH - 2 * gutter, spec.height)
      rowsHost.appendChild(row)
    }
  }

  const [messages, setMessages] = createSignal<Message[]>([])
  const [active, setActive] = createSignal(true)
  const [pages, setPages] = createSignal(options.pages ?? 0)
  const loads: { aborted: boolean; busy: string | null | undefined }[] = []
  const session = {
    id: "s",
    server: {
      id: "server",
      data: {
        session: {
          get: () => ({}),
          message: {
            list: () => messages(),
            more: () => pages() > 0,
            loadMore: async (_id: string, load?: { signal?: AbortSignal; beforePublish?: () => void }) => {
              loads.push({ aborted: load?.signal?.aborted ?? false, busy: doc.querySelector("[data-timeline-rail-ticks]")?.getAttribute("aria-busy") })
              await new Promise((resolve) => setTimeout(resolve, 10))
              if (load?.signal?.aborted) return
              load?.beforePublish?.()
              setPages(pages() - 1)
            },
          },
        },
      },
    },
  }
  const registry: { slots: any[]; styles: string[] } = { slots: [], styles: [] }
  const ctx = {
    id: "timeline-rail",
    add: (_kind: unknown, item: unknown) => {
      if (typeof item === "string") registry.styles.push(item)
      else registry.slots.push(item)
      return () => {}
    },
  }

  const flush = async () => {
    for (let round = 0; round < 12; round += 1) {
      const pending = [...frames.entries()]
      frames.clear()
      for (const [, callback] of pending) callback(0)
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  const prompt = (id: string, text: string): Message => ({ id, type: "user", text })
  const reply = (id: string, text: string): Message => ({ id, type: "assistant", content: [{ type: "text", text }], time: { completed: 1 } })

  return {
    ctx,
    registry,
    actions,
    view,
    scroller,
    state,
    scrolls,
    mount,
    setMessages,
    setActive,
    active,
    session,
    loads,
    flush,
    prompt,
    reply,
    rail: () => view.querySelector("[data-timeline-rail]") as HTMLElement | null,
    ticks: () => [...view.querySelectorAll("[data-timeline-rail-tick]")] as HTMLButtonElement[],
    card: () => view.querySelector("[data-timeline-rail-card]") as HTMLElement | null,
    close: () => {
      globalThis.window.matchMedia = media
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete (globalThis as Record<string, unknown>)[key]
      }
    },
  }
}

async function mountSlot(f: ReturnType<typeof fixture>) {
  let dispose = () => {}
  createRoot((d) => {
    dispose = d
    plugin.setup!(f.ctx as unknown as Context)
  })
  const slot = f.registry.slots.find((item) => typeof item === "object" && item.at === "session.header")
  assert.ok(slot, "slot contributed")
  assert.equal(f.registry.styles.length, 1, "one style contributed")
  const input = {
    get session() {
      return f.session
    },
    screen: {},
    get active() {
      return f.active()
    },
    compact: false,
  }
  const unmount = render(() => slot.render(input), f.actions)
  await f.flush()
  return { dispose: () => (unmount(), dispose()) }
}

const threeTurns = (f: ReturnType<typeof fixture>) => {
  f.setMessages([f.prompt("m1", "first question"), f.reply("a1", "first answer"), f.prompt("m2", "second question"), f.prompt("m3", "third")])
  f.mount([
    { owner: "m1", y: 48, height: 60, prompt: true },
    { owner: "m1", y: 108, height: 1000 },
    { owner: "m2", y: 1108, height: 60, prompt: true },
    { owner: "m2", y: 1168, height: 1000 },
    { owner: "m3", y: 2168, height: 60, prompt: true },
  ])
}

test("an empty rail under two prompts; with more, one labelled tick per prompt and the current one follows the scroll", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    const empty = () => !f.rail() || f.rail()!.hasAttribute("data-empty")
    assert.equal(empty(), true)
    f.setMessages([f.prompt("m1", "only")])
    f.mount([{ owner: "m1", y: 48, height: 60, prompt: true }])
    await f.flush()
    assert.equal(empty(), true)

    threeTurns(f)
    await f.flush()
    const rail = f.rail()
    assert.ok(rail)
    assert.equal(rail.hasAttribute("data-empty"), false)
    assert.equal(rail.style.left, `${(256 - 28) / 2}px`)
    assert.equal(rail.style.top, `${INSET}px`)
    assert.equal(rail.style.height, `${VIEWPORT - INSET}px`)
    assert.deepEqual(
      f.ticks().map((tick) => tick.getAttribute("aria-label")),
      ["first question", "second question", "third"],
    )
    assert.deepEqual(
      f.ticks().map((tick) => tick.hasAttribute("data-current")),
      [true, false, false],
    )
    assert.deepEqual(
      f.ticks().map((tick) => tick.tabIndex),
      [0, -1, -1],
    )

    f.state.scrollTop = 1200
    f.scroller.dispatchEvent(new globalThis.window.Event("scroll"))
    await f.flush()
    assert.deepEqual(
      f.ticks().map((tick) => tick.hasAttribute("data-current")),
      [false, true, false],
    )
    assert.deepEqual(
      f.ticks().map((tick) => tick.tabIndex),
      [-1, 0, -1],
    )
  } finally {
    dispose()
    f.close()
  }
})

test("clicking a tick glides its prompt under the header; the current tick re-aligns", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    f.ticks()[1]!.click()
    await f.flush()
    await new Promise((resolve) => setTimeout(resolve, 320))
    await f.flush()
    // The host's own ease-out, one write per frame: every write is instant, none goes backwards, the last lands.
    const tops = f.scrolls.map((scroll) => scroll.top)
    assert.ok(tops.length > 2, `eased over frames, got ${tops.length} writes`)
    assert.ok(f.scrolls.every((scroll) => scroll.behavior === "auto"))
    assert.deepEqual(tops, [...tops].sort((a, b) => a - b))
    assert.equal(tops.at(-1), 1108 - INSET)
    f.ticks()[1]!.click()
    await f.flush()
    assert.equal(f.state.scrollTop, 1108 - INSET)
  } finally {
    dispose()
    f.close()
  }
})

test("hovering a tick opens the card after the host's delay with the prompt and the reply; Escape closes it", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    f.ticks()[0]!.dispatchEvent(new globalThis.window.PointerEvent("pointerenter", { pointerType: "mouse" }))
    await f.flush()
    assert.equal(f.card(), null)
    await new Promise((resolve) => setTimeout(resolve, 450))
    await f.flush()
    const card = f.card()
    assert.ok(card)
    assert.equal(card.hasAttribute("data-entered"), true, "flipped open a frame after it mounted")
    assert.equal(card.querySelector("[data-timeline-rail-card-title]")!.textContent, "first question")
    assert.equal(card.querySelector("[data-timeline-rail-card-snippet]")!.textContent, "first answer")

    f.ticks()[2]!.dispatchEvent(new globalThis.window.PointerEvent("pointerenter", { pointerType: "mouse" }))
    await f.flush()
    assert.equal(f.card(), card, "the open card stays mounted and moves to the next tick")
    assert.equal(f.card()!.querySelector("[data-timeline-rail-card-title]")!.textContent, "third")
    assert.equal(f.card()!.querySelector("[data-timeline-rail-card-snippet]"), null)

    f.rail()!.dispatchEvent(new globalThis.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await f.flush()
    assert.ok(f.card() && !f.card()!.hasAttribute("data-entered"), "exit transition runs while it stays mounted")
    await new Promise((resolve) => setTimeout(resolve, 120))
    await f.flush()
    assert.equal(f.card(), null)

    // A touch never opens the card.
    f.ticks()[0]!.dispatchEvent(new globalThis.window.PointerEvent("pointerenter", { pointerType: "touch" }))
    await new Promise((resolve) => setTimeout(resolve, 450))
    await f.flush()
    assert.equal(f.card(), null)
  } finally {
    dispose()
    f.close()
  }
})

test("arrow keys move focus between ticks", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    f.ticks()[0]!.focus()
    f.rail()!.dispatchEvent(new globalThis.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    assert.equal(globalThis.document.activeElement, f.ticks()[1])
    f.rail()!.dispatchEvent(new globalThis.window.KeyboardEvent("keydown", { key: "End", bubbles: true }))
    assert.equal(globalThis.document.activeElement, f.ticks()[2])
    f.rail()!.dispatchEvent(new globalThis.window.KeyboardEvent("keydown", { key: "Home", bubbles: true }))
    assert.equal(globalThis.document.activeElement, f.ticks()[0])
  } finally {
    dispose()
    f.close()
  }
})

test("hundreds of prompts compress to the tightest pitch and bucket within 60% of the height", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    const messages: Message[] = []
    const rows: { owner: string; y: number; height: number; prompt?: boolean }[] = []
    for (let index = 0; index < 200; index += 1) {
      messages.push(f.prompt(`m${String(index).padStart(3, "0")}`, `question ${index}`))
      rows.push({ owner: `m${String(index).padStart(3, "0")}`, y: 48 + index * 100, height: 100, prompt: true })
    }
    f.setMessages(messages)
    f.mount(rows)
    await f.flush()
    const ticks = f.ticks()
    assert.equal(ticks.length, Math.floor(((VIEWPORT - INSET) * 0.6) / 4))
    assert.equal(f.rail()!.style.getPropertyValue("--timeline-rail-pitch"), "4px")
    assert.equal(ticks[0]!.getAttribute("aria-label"), "question 0 (and 1 more)")
    assert.equal(ticks[0]!.hasAttribute("data-current"), true)
  } finally {
    dispose()
    f.close()
  }
})

test("a narrow gutter, a narrow window or an inactive (cached) timeline shows no rail", async () => {
  for (const options of [{ gutter: 20 }, { desktop: false }]) {
    const f = fixture(options)
    const { dispose } = await mountSlot(f)
    try {
      threeTurns(f)
      await f.flush()
      assert.equal(f.rail(), null, JSON.stringify(options))
    } finally {
      dispose()
      f.close()
    }
  }
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    f.setActive(false)
    await f.flush()
    assert.equal(f.rail(), null)
    f.setActive(true)
    await f.flush()
    assert.ok(f.rail())
  } finally {
    dispose()
    f.close()
  }
})

test("pages the whole history in behind the user, marks the rail busy meanwhile, and stops when it is done", async () => {
  const f = fixture({ pages: 12 })
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    assert.equal(f.loads.at(-1)?.busy, "true", "the rail says it is loading while a page is in flight")
    for (let round = 0; round < 80 && f.loads.length < 12; round += 1) await f.flush()
    await f.flush()
    assert.equal(f.loads.length, 12, "one request per page, no restarts")
    assert.equal(f.rail()!.querySelector("[data-timeline-rail-ticks]")!.getAttribute("aria-busy"), null)
  } finally {
    dispose()
    f.close()
  }
})

test("leaving the session or going inactive aborts the history load", async () => {
  const f = fixture({ pages: 50 })
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    const before = f.loads.length
    f.setActive(false)
    await f.flush()
    await f.flush()
    assert.ok(f.loads.length <= before + 1, "at most the page already in flight")
    const after = f.loads.length
    await f.flush()
    assert.equal(f.loads.length, after, "nothing further while inactive")
  } finally {
    dispose()
    f.close()
  }
})
