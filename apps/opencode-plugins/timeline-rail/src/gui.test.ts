import assert from "node:assert/strict"
import { test } from "node:test"
import { createEffect, createRoot, createSignal } from "solid-js"
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
              loads.push({ aborted: load?.signal?.aborted ?? false, busy: doc.querySelector("[data-timeline-rail-strip]")?.getAttribute("aria-busy") })
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
  // The host's IconButton and Tooltip, reduced to what the rail asks of them.
  const ui = {
    Tooltip: (props: { children: unknown }) => props.children,
    IconButton: (props: { label: string; disabled?: boolean; onClick?: (event: MouseEvent) => void }) => {
      const button = doc.createElement("button")
      button.setAttribute("aria-label", props.label)
      button.setAttribute("data-icon-button", "")
      createEffect(() => void (button.disabled = !!props.disabled))
      button.addEventListener("click", (event) => props.onClick?.(event as MouseEvent))
      return button
    },
  }
  const ctx = {
    id: "timeline-rail",
    ui,
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
    ticks: () => [...view.querySelectorAll("[data-timeline-rail-tick]")] as HTMLElement[],
    // The indexes of the nodes that carry an attribute (the faint ticks are one gradient, with no node per prompt).
    marked: (attribute: string) =>
      [...view.querySelectorAll(`[data-timeline-rail-tick][${attribute}]`)].map((node) => Number(node.getAttribute("data-index"))).sort((a, b) => a - b),
    // The strip's box is the rail's body: 200px from y=100, as the layout would give it.
    strip: () => {
      const strip = view.querySelector("[data-timeline-rail-strip]") as HTMLButtonElement
      strip.getBoundingClientRect = () => rect(100, 0, 28, 200)
      return strip
    },
    // y fraction along the strip, 0 to 1.
    at: (fraction: number) => 100 + fraction * 200,
    turn: (which: "Previous turn" | "Next turn") => view.querySelector(`[aria-label="${which}"]`) as HTMLButtonElement,
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

const Pointer = () => globalThis.window.PointerEvent
const move = (target: Element, y: number, init: PointerEventInit = {}) =>
  target.dispatchEvent(new (Pointer())("pointermove", { clientY: y, pointerType: "mouse", bubbles: true, ...init }))
const enter = (target: Element, y: number) =>
  target.dispatchEvent(new (Pointer())("pointerenter", { clientY: y, pointerType: "mouse" }))
const key = (target: Element, name: string) =>
  target.dispatchEvent(new globalThis.window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }))
const inView = (f: ReturnType<typeof fixture>) => f.marked("data-view")

test("an empty rail under two prompts; with more, one tick per prompt, the strip is one labelled target and current follows the scroll", async () => {
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
    assert.equal(rail.style.left, "6px")
    assert.equal(rail.style.top, `${INSET}px`)
    assert.equal(rail.style.height, `${VIEWPORT - INSET}px`)
    assert.equal((rail.querySelector("[data-timeline-rail-body]") as HTMLElement).style.getPropertyValue("--timeline-rail-height"), "max(0px, min(16px, calc(100vh - 18rem)))")
    assert.equal(rail.querySelectorAll("button[data-timeline-rail-strip]").length, 1, "one hit target, not one button per tick")
    assert.equal(f.strip().getAttribute("aria-label"), "Jump to message: first question")
    assert.deepEqual(f.marked("data-current"), [0])

    f.state.scrollTop = 1200
    f.scroller.dispatchEvent(new globalThis.window.Event("scroll"))
    await f.flush()
    assert.deepEqual(f.marked("data-current"), [1])
    assert.equal(f.strip().getAttribute("aria-label"), "Jump to message: second question")
  } finally {
    dispose()
    f.close()
  }
})

test("every prompt whose turn is on screen is in view, not just the current one", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    // At the top only the first turn's rows reach the viewport (m1: 48 to 1108; m2's prompt row starts at 1108).
    assert.deepEqual(inView(f), [0])
    f.state.scrollTop = 800
    f.scroller.dispatchEvent(new globalThis.window.Event("scroll"))
    await f.flush()
    assert.deepEqual(inView(f), [0, 1], "the viewport (800 to 1400) holds the end of turn 1 and the start of turn 2")
    f.state.scrollTop = 2000
    f.scroller.dispatchEvent(new globalThis.window.Event("scroll"))
    await f.flush()
    assert.deepEqual(inView(f), [1, 2])
  } finally {
    dispose()
    f.close()
  }
})

test("a click jumps to the prompt under the pointer and the current one re-aligns", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    const click = (fraction: number) =>
      f.strip().dispatchEvent(new globalThis.window.MouseEvent("click", { clientY: f.at(fraction), detail: 1, bubbles: true }))
    click(0.5)
    await f.flush()
    await new Promise((resolve) => setTimeout(resolve, 320))
    await f.flush()
    // The host's own ease-out, one write per frame: every write is instant, none goes backwards, the last lands.
    const tops = f.scrolls.map((scroll) => scroll.top)
    assert.ok(tops.length > 2, `eased over frames, got ${tops.length} writes`)
    assert.ok(f.scrolls.every((scroll) => scroll.behavior === "auto"))
    assert.deepEqual(tops, [...tops].sort((a, b) => a - b))
    assert.equal(tops.at(-1), 1108 - INSET)
    click(0.5)
    await f.flush()
    assert.equal(f.state.scrollTop, 1108 - INSET)
  } finally {
    dispose()
    f.close()
  }
})

test("scrubbing maps the pointer to an index and the card follows; Escape closes it; touch never opens it", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    const strip = f.strip()
    enter(strip, f.at(0))
    await f.flush()
    assert.equal(f.card(), null, "after the host's open delay, not before")
    await new Promise((resolve) => setTimeout(resolve, 450))
    await f.flush()
    const card = f.card()
    assert.ok(card)
    assert.equal(card.hasAttribute("data-entered"), true, "flipped open a frame after it mounted")
    assert.equal(card.querySelector("[data-timeline-rail-card-title]")!.textContent, "first question")
    assert.equal(card.querySelector("[data-timeline-rail-card-snippet]")!.textContent, "first answer")
    assert.equal(card.querySelector("[data-timeline-rail-card-meta]")!.textContent, "1 of 3")

    move(strip, f.at(1))
    await f.flush()
    assert.equal(f.card(), card, "the open card stays mounted and moves to the next prompt")
    assert.equal(f.card()!.querySelector("[data-timeline-rail-card-title]")!.textContent, "third")
    assert.equal(f.card()!.querySelector("[data-timeline-rail-card-snippet]"), null)
    assert.equal(f.strip().getAttribute("aria-label"), "Jump to message: third")

    key(strip, "Escape")
    await f.flush()
    assert.ok(f.card() && !f.card()!.hasAttribute("data-entered"), "exit transition runs while it stays mounted")
    await new Promise((resolve) => setTimeout(resolve, 120))
    await f.flush()
    assert.equal(f.card(), null)

    strip.dispatchEvent(new (Pointer())("pointerenter", { clientY: f.at(0), pointerType: "touch" }))
    await new Promise((resolve) => setTimeout(resolve, 450))
    await f.flush()
    assert.equal(f.card(), null)
  } finally {
    dispose()
    f.close()
  }
})

test("the fisheye is by index distance from the pointer's prompt and clears on leave", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    const messages: Message[] = []
    for (let index = 0; index < 40; index += 1) messages.push(f.prompt(`m${String(index).padStart(2, "0")}`, `q${index}`))
    f.setMessages(messages)
    f.mount([{ owner: "m00", y: 48, height: 60, prompt: true }])
    await f.flush()
    const d = () => new Map(f.marked("data-d").map((index) => [index, f.view.querySelector(`[data-index="${index}"]`)!.getAttribute("data-d")]))
    move(f.strip(), f.at(20 / 39))
    await f.flush()
    assert.deepEqual([...d()], [[18, "2"], [19, "1"], [20, "0"], [21, "1"], [22, "2"]])
    f.rail()!.dispatchEvent(new (Pointer())("pointerleave", { pointerType: "mouse" }))
    await f.flush()
    assert.equal(d().size, 0)
  } finally {
    dispose()
    f.close()
  }
})

test("a drag that starts off the strip passes through; one that starts on it scrubs", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    const strip = f.strip()
    move(strip, f.at(0.5), { buttons: 1 })
    await f.flush()
    assert.equal(strip.hasAttribute("data-pass"), true, "a button-down arrival does not scrub")
    globalThis.window.dispatchEvent(new (Pointer())("pointerup", { buttons: 0 }))
    await f.flush()
    assert.equal(strip.hasAttribute("data-pass"), false)

    strip.dispatchEvent(new (Pointer())("pointerdown", { bubbles: true, buttons: 1, pointerType: "mouse" }))
    move(strip, f.at(1), { buttons: 1 })
    await f.flush()
    assert.equal(strip.hasAttribute("data-pass"), false)
    assert.equal(f.strip().getAttribute("aria-label"), "Jump to message: third")
    globalThis.window.dispatchEvent(new (Pointer())("pointerup", { buttons: 0 }))
  } finally {
    dispose()
    f.close()
  }
})

test("the wheel on the rail scrolls the timeline", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    const by: ScrollToOptions[] = []
    f.scroller.scrollBy = ((options: ScrollToOptions) => void by.push(options)) as HTMLElement["scrollBy"]
    const event = new globalThis.window.WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true })
    f.strip().dispatchEvent(event)
    assert.equal(event.defaultPrevented, true)
    assert.equal(by[0]?.top, 120)
  } finally {
    dispose()
    f.close()
  }
})

test("keyboard: focus lands on the current prompt; arrows, Home, End move it and open the card; Enter jumps", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    f.state.scrollTop = 1200
    f.scroller.dispatchEvent(new globalThis.window.Event("scroll"))
    await f.flush()
    const strip = f.strip()
    strip.focus()
    await f.flush()
    assert.equal(strip.getAttribute("aria-label"), "Jump to message: second question", "focus starts from the current prompt")
    key(strip, "ArrowDown")
    await f.flush()
    assert.equal(strip.getAttribute("aria-label"), "Jump to message: third")
    key(strip, "ArrowDown")
    await f.flush()
    assert.equal(strip.getAttribute("aria-label"), "Jump to message: third", "clamped at the end")
    key(strip, "Home")
    await f.flush()
    assert.equal(strip.getAttribute("aria-label"), "Jump to message: first question")
    key(strip, "ArrowUp")
    key(strip, "End")
    await f.flush()
    assert.equal(strip.getAttribute("aria-label"), "Jump to message: third")
    assert.equal(f.card()?.querySelector("[data-timeline-rail-card-title]")?.textContent, "third", "the card follows the keyboard instantly")
    key(strip, "Home")
    key(strip, "Enter")
    await f.flush()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await f.flush()
    assert.ok(f.scrolls.length > 0 && f.state.scrollTop < 1200, "Enter glided to the first prompt")
  } finally {
    dispose()
    f.close()
  }
})

test("previous / next turn buttons step from the current prompt and disable at the ends", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    assert.equal(f.turn("Previous turn").disabled, true, "nothing before the first prompt")
    assert.equal(f.turn("Next turn").disabled, false)
    f.turn("Next turn").click()
    await f.flush()
    await new Promise((resolve) => setTimeout(resolve, 320))
    await f.flush()
    assert.equal(f.state.scrollTop, 1108 - INSET)
    assert.equal(f.turn("Previous turn").disabled, false)
    f.state.scrollTop = 2168 - INSET
    f.scroller.dispatchEvent(new globalThis.window.Event("scroll"))
    await f.flush()
    assert.equal(f.turn("Next turn").disabled, true, "nothing after the last prompt")
    f.turn("Previous turn").click()
    await f.flush()
    await new Promise((resolve) => setTimeout(resolve, 320))
    await f.flush()
    assert.equal(f.state.scrollTop, 1108 - INSET)
  } finally {
    dispose()
    f.close()
  }
})

test("hundreds of prompts keep one tick each, none bucketed, every index reachable, rail height capped by the window", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    const messages: Message[] = []
    const rows: { owner: string; y: number; height: number; prompt?: boolean }[] = []
    for (let index = 0; index < 600; index += 1) {
      messages.push(f.prompt(`m${String(index).padStart(3, "0")}`, `question ${index}`))
      rows.push({ owner: `m${String(index).padStart(3, "0")}`, y: 48 + index * 100, height: 100, prompt: true })
    }
    f.setMessages(messages)
    f.mount(rows)
    await f.flush()
    assert.equal(f.rail()!.querySelectorAll("*").length < 40, true, "no node per prompt: the DOM stays small at 600 prompts")
    assert.equal((f.rail()!.querySelector("[data-timeline-rail-body]") as HTMLElement).style.getPropertyValue("--timeline-rail-height"), "max(0px, min(4792px, calc(100vh - 18rem)))")
    assert.deepEqual(f.marked("data-current"), [0])
    move(f.strip(), f.at(0.5))
    await f.flush()
    assert.equal(f.strip().getAttribute("aria-label"), "Jump to message: question 300")
    move(f.strip(), f.at(1))
    await f.flush()
    assert.equal(f.strip().getAttribute("aria-label"), "Jump to message: question 599")
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
    assert.equal(f.rail()!.querySelector("[data-timeline-rail-strip]")!.getAttribute("aria-busy"), null)
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
