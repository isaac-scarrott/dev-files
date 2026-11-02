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

function fixture(options: { gutter?: number; desktop?: boolean } = {}) {
  // Solid delegates events to the document it loaded with, so the tests reuse it.
  const doc = globalThis.document
  doc.body.innerHTML = `<div data-view><div data-slot="session-timeline-scroll"><div data-scrollable><div data-session-title><div data-actions></div></div><div data-rows></div></div></div><div data-slot="session-timeline-visible"></div></div>`
  const frames = new Map<number, FrameRequestCallback>()
  const bands = new Set<{ deliver(): void }>()
  const created: string[] = []
  const ended: string[] = []
  const watchers = new Set<MutationCallback>()
  const resizers = new Set<{ callback: ResizeObserverCallback; targets: Set<Element>; fresh: Set<Element> }>()
  let nextFrame = 1
  const gutter = options.gutter ?? 256
  const globals = {
    HTMLElement: globalThis.window.HTMLElement,
    Element: globalThis.window.Element,
    getComputedStyle: globalThis.window.getComputedStyle.bind(globalThis.window),
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
      constructor(callback: ResizeObserverCallback) {
        resizers.add({ callback, targets: this.targets, fresh: this.fresh })
      }
      targets = new Set<Element>()
      // The browser reports a newly observed element once, after layout.
      fresh = new Set<Element>()
      observe(target: Element) {
        this.targets.add(target)
        this.fresh.add(target)
      }
      unobserve() {}
      disconnect() {
        this.targets.clear()
        this.fresh.clear()
      }
    },
    // The browser's observers, reduced to what the rail asks: an observer on the reading line, told only
    // when a target's state against the band changes (`flush` delivers), and a child-list observer told by `mount`.
    IntersectionObserver: class {
      constructor(callback: IntersectionObserverCallback, init: IntersectionObserverInit) {
        this.callback = callback
        this.margin = init.rootMargin ?? ""
        this.whole = init.threshold === 1
        bands.add(this)
        ;(this.whole ? ended : created).push(this.margin)
      }
      callback: IntersectionObserverCallback
      margin: string
      // Threshold 1: told when the target comes wholly inside the root (the bottom watch).
      whole: boolean
      targets = new Map<Element, string | undefined>()
      observe(target: Element) {
        this.targets.set(target, undefined)
      }
      unobserve(target: Element) {
        this.targets.delete(target)
      }
      disconnect() {
        this.targets.clear()
        bands.delete(this)
      }
      deliver() {
        const [top = 0, , bottom = 0] = this.margin.split(" ").map(parseFloat)
        const band = { top: -top, bottom: VIEWPORT + bottom }
        const entries = [] as IntersectionObserverEntry[]

        for (const [target, last] of this.targets) {
          const box = target.getBoundingClientRect()
          const isIntersecting = this.whole ? box.top >= band.top && box.bottom <= band.bottom : box.bottom >= band.top && box.top <= band.bottom
          const state = `${isIntersecting}`

          if (state === last) continue
          this.targets.set(target, state)
          entries.push({ target, isIntersecting, boundingClientRect: box, rootBounds: band } as unknown as IntersectionObserverEntry)
        }
        if (entries.length) this.callback(entries, this as unknown as IntersectionObserver)
      }
    },
    MutationObserver: class {
      constructor(callback: MutationCallback) {
        watchers.add(callback)
      }
      observe() {}
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
  view.getBoundingClientRect = () => rect(0, 0, WIDTH, VIEWPORT)
  visible.getBoundingClientRect = () => rect(0, 0, WIDTH, VIEWPORT)
  const state = { scrollTop: 0, total: 20000, header: INSET }
  rowsHost.getBoundingClientRect = () => rect(-state.scrollTop, 0, WIDTH, state.total)
  Object.defineProperty(sticky, "offsetHeight", { get: () => state.header })
  const scrolls: { top: number; behavior: ScrollBehavior }[] = []
  Object.defineProperty(scroller, "scrollTop", { get: () => state.scrollTop, set: (value: number) => void (state.scrollTop = value) })
  Object.defineProperty(scroller, "clientHeight", { get: () => VIEWPORT })
  Object.defineProperty(scroller, "scrollHeight", { get: () => state.total })
  scroller.getBoundingClientRect = () => rect(0, 0, WIDTH, VIEWPORT)
  scroller.scrollTo = ((options: ScrollToOptions) => {
    scrolls.push({ top: options.top ?? 0, behavior: options.behavior ?? "auto" })
    state.scrollTop = options.top ?? 0
  }) as HTMLElement["scrollTo"]

  // The host's shape: each row in a keyed wrapper under one container.
  const mount = (specs: { owner: string; y: number; height: number; prompt?: boolean }[]) => {
    const removed = [...rowsHost.children]
    rowsHost.innerHTML = ""
    const added: HTMLElement[] = []
    for (const spec of specs) {
      const wrapper = doc.createElement("div")
      wrapper.setAttribute("data-timeline-key", `${spec.owner}-${spec.y}`)
      const row = doc.createElement("div")
      row.setAttribute("data-message-id", spec.owner)
      row.setAttribute("data-timeline-row", spec.prompt ? "UserMessage" : "AssistantPart")
      const box = () => rect(spec.y - state.scrollTop, gutter, WIDTH - 2 * gutter, spec.height)
      row.getBoundingClientRect = box
      wrapper.getBoundingClientRect = box
      wrapper.appendChild(row)
      rowsHost.appendChild(wrapper)
      added.push(wrapper)
    }
    for (const callback of watchers) callback([{ removedNodes: removed, addedNodes: added }] as unknown as MutationRecord[], undefined as never)
  }
  // The scroller's content height changed (the host's rows were measured, a reply streamed).
  const resized = () => {
    for (const { callback, targets } of resizers) {
      if (targets.size) callback([...targets].map((target) => ({ target })) as unknown as ResizeObserverEntry[], undefined as never)
    }
  }

  const [messages, setMessages] = createSignal<Message[]>([])
  const [active, setActive] = createSignal(true)
  // The host has older history to give (`more`), and every request for it is counted: the rail must make none.
  const loads: { aborted: boolean }[] = []
  const session = {
    id: "s",
    server: {
      id: "server",
      data: {
        session: {
          get: () => ({}),
          message: {
            list: () => messages(),
            more: () => true,
            loadMore: async (_id: string, load?: { signal?: AbortSignal }) => {
              loads.push({ aborted: load?.signal?.aborted ?? false })
            },
          },
        },
      },
    },
  }
  const registry: { slots: any[]; styles: string[] } = { slots: [], styles: [] }
  // The host's IconButton and Tooltip, reduced to what the rail asks of them.
  const ui = {
    // The host's trigger is a block div around its child.
    Tooltip: (props: { children: unknown }) => {
      const trigger = doc.createElement("div")
      trigger.setAttribute("data-component", "tooltip-v2-trigger")
      trigger.append(props.children as Node)
      return trigger
    },
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
      for (const { callback, fresh } of resizers) {
        if (!fresh.size) continue
        const entries = [...fresh].map((target) => ({ target })) as unknown as ResizeObserverEntry[]
        fresh.clear()
        callback(entries, undefined as never)
      }
      for (const band of [...bands]) band.deliver()
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
    resized,
    created,
    ended,
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
    // The indexes of the ticks that carry an attribute.
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
    body: () => view.querySelector("[data-timeline-rail-body]") as HTMLElement,
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
const key = (target: Element, name: string) =>
  target.dispatchEvent(new globalThis.window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }))
const lit = (f: ReturnType<typeof fixture>) => f.marked("data-active")
const scrollTo = async (f: ReturnType<typeof fixture>, top: number) => {
  f.state.scrollTop = top
  f.scroller.dispatchEvent(new globalThis.window.Event("scroll"))
  await f.flush()
}
const many = (f: ReturnType<typeof fixture>, count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => f.prompt(`m${String(from + index).padStart(4, "0")}`, `question ${from + index}`))

test("nothing under two prompts; then one tick per prompt, one labelled strip, the host's geometry", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    assert.equal(f.rail(), null)
    f.setMessages([f.prompt("m1", "only")])
    f.mount([{ owner: "m1", y: 48, height: 60, prompt: true }])
    await f.flush()
    assert.equal(f.rail(), null, "t3-code renders nothing under TIMELINE_MINIMAP_MIN_ITEMS")

    threeTurns(f)
    await f.flush()
    const rail = f.rail()
    assert.ok(rail)
    assert.equal(rail.style.top, `${INSET}px`)
    assert.equal(rail.style.height, `${VIEWPORT - INSET}px`)
    assert.equal(rail.hasAttribute("data-persistent"), true, "a 256px gutter is at least 48px")
    assert.equal(f.body().style.width, "40px", "the strip is the gutter minus 12px, at most 40px")
    assert.equal(f.body().style.getPropertyValue("--timeline-rail-height"), "max(0px, min(16px, calc(100vh - 18rem)))")
    assert.equal(rail.querySelectorAll("button[data-timeline-rail-strip]").length, 1, "one hit target, not one button per tick")
    assert.equal(f.ticks().length, 3)
    assert.deepEqual(f.ticks().map((tick) => tick.style.top), ["0%", "50%", "100%"])
    assert.equal(f.strip().getAttribute("aria-label"), "Jump to message: User message", "t3-code names the active prompt, and none is active")
  } finally {
    dispose()
    f.close()
  }
})

test("exactly one tick is lit: the prompt whose turn is under the reading line, switching when the next prompt's row reaches it", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    assert.deepEqual(lit(f), [0])
    await scrollTo(f, 800)
    assert.deepEqual(lit(f), [0], "inside m1's reply: m1 stays lit")
    // The line is 8px under the 48px header; m2's row is at 1108 - scrollTop.
    await scrollTo(f, 1108 - 48 - 8 - 1)
    assert.deepEqual(lit(f), [0], "m2's row is one pixel under the line")
    await scrollTo(f, 1108 - 48 - 8)
    assert.deepEqual(lit(f), [1], "m2's row is on the line")
    await scrollTo(f, 2000)
    assert.deepEqual(lit(f), [1], "m2's long reply keeps m2 lit; its prompt row is far above")
    await scrollTo(f, 19400)
    assert.deepEqual(lit(f), [2], "the very bottom is the last prompt")
    await scrollTo(f, 0)
    assert.deepEqual(lit(f), [0])
  } finally {
    dispose()
    f.close()
  }
})

test("a chat that fits has its last prompt lit; a prompt that streams in is lit at the bottom", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    f.state.total = VIEWPORT
    threeTurns(f)
    await f.flush()
    assert.deepEqual(lit(f), [2])
    f.state.total = 20000
    await scrollTo(f, 19400)
    f.setMessages([f.prompt("m1", "first question"), f.reply("a1", "first answer"), f.prompt("m2", "second question"), f.prompt("m3", "third"), f.prompt("m4", "fourth")])
    f.mount([{ owner: "m3", y: 19000, height: 60, prompt: true }, { owner: "m4", y: 19900, height: 60, prompt: true }])
    await f.flush()
    assert.deepEqual(lit(f), [3], "at the bottom: the new prompt, though its row is below the line")
  } finally {
    dispose()
    f.close()
  }
})

test("a click jumps to the prompt under the pointer", async () => {
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
    // The host's own jump: one native smooth scrollTo to the prompt, no per-frame writes by the plugin.
    assert.deepEqual(f.scrolls, [{ top: 1108 - INSET, behavior: "smooth" }])
    click(0.5)
    await f.flush()
    assert.equal(f.state.scrollTop, 1108 - INSET)
  } finally {
    dispose()
    f.close()
  }
})

test("the card opens at once on the pointer's prompt, with no count and no delay; it hangs off the tick as t3-code's does", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    const strip = f.strip()
    assert.equal(f.card(), null)
    move(strip, f.at(0))
    await f.flush()
    const card = f.card()
    assert.ok(card, "mounted by the first move")
    assert.equal(card.querySelector("[data-timeline-rail-card-title]")!.textContent, "first question")
    assert.equal(card.querySelector("[data-timeline-rail-card-snippet]")!.textContent, "first answer")
    assert.equal(card.querySelector("[data-timeline-rail-card-meta]"), null, "t3-code shows no n-of-N")
    assert.equal(card.style.top, "0%")
    assert.equal(card.style.transform, "translateY(0%)", "the first card is flush with the strip's top")
    assert.equal(f.body().style.width, "22rem", "the hit area widens so the card stays under the pointer")
    assert.equal(strip.getAttribute("aria-label"), "Jump to message: first question")

    move(strip, f.at(0.5))
    await f.flush()
    assert.equal(f.card()!.style.transform, "translateY(-50%)")
    assert.equal(f.card()!.style.top, "50%")
    assert.equal(f.card()!.querySelector("[data-timeline-rail-card-snippet]"), null, "a turn without a reply shows the prompt alone")
    move(strip, f.at(1))
    await f.flush()
    assert.equal(f.card()!.style.transform, "translateY(-100%)", "the last card is flush with the strip's bottom")

    strip.dispatchEvent(new (Pointer())("pointerleave", { pointerType: "mouse" }))
    await f.flush()
    assert.equal(f.card(), null, "gone the moment the pointer leaves")
    assert.equal(f.body().style.width, "40px")

    move(strip, f.at(0), { pointerType: "touch" })
    await f.flush()
    assert.equal(f.card(), null, "touch never opens it")
  } finally {
    dispose()
    f.close()
  }
})

test("a pointer over the card keeps its prompt; the card takes no click", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    move(f.strip(), f.at(0))
    await f.flush()
    move(f.card()!.querySelector("[data-timeline-rail-card-title]")!, f.at(1))
    await f.flush()
    assert.equal(f.card()!.querySelector("[data-timeline-rail-card-title]")!.textContent, "first question")
    f.card()!.dispatchEvent(new globalThis.window.MouseEvent("click", { clientY: f.at(1), detail: 1, bubbles: true }))
    await f.flush()
    assert.deepEqual(f.scrolls, [])
  } finally {
    dispose()
    f.close()
  }
})

test("the fisheye is by index distance from the pointer's prompt, only while the strip is pointed; at rest every tick is the same width", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    f.setMessages(many(f, 10))
    f.mount([{ owner: "m0000", y: 48, height: 60, prompt: true }])
    await f.flush()
    const d = () => new Map(f.marked("data-d").map((index) => [index, f.view.querySelector(`[data-index="${index}"]`)!.getAttribute("data-d")]))
    assert.deepEqual([...d()], [], "at rest no tick is scaled: all equal, the lit one included")
    assert.deepEqual(lit(f), [0])
    move(f.strip(), f.at(5 / 9))
    await f.flush()
    assert.deepEqual([...d()], [[3, "2"], [4, "1"], [5, "0"], [6, "1"], [7, "2"]], "centred on the pointer, not on the lit prompt")
    f.strip().dispatchEvent(new (Pointer())("pointerleave", { pointerType: "mouse" }))
    await f.flush()
    assert.deepEqual([...d()], [], "back to equal widths on leave")
  } finally {
    dispose()
    f.close()
  }
})

test("at rest no tick is scaled at any scroll position or active prompt", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    for (const top of [0, 800, 1108 - INSET - 8, 2000, 19400]) {
      await scrollTo(f, top)
      assert.equal(lit(f).length, 1)
      assert.deepEqual(f.marked("data-d"), [], `scrollTop ${top}`)
    }
  } finally {
    dispose()
    f.close()
  }
})

test("the pointed tick is lit as well as the active one while the strip is pointed; one lit again on leave", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    f.setMessages(many(f, 10))
    f.mount([{ owner: "m0000", y: 48, height: 60, prompt: true }])
    await f.flush()
    assert.deepEqual(lit(f), [0])
    move(f.strip(), f.at(5 / 9))
    await f.flush()
    assert.deepEqual(lit(f), [0, 5], "the current prompt stays lit; the pointed one joins it")
    move(f.strip(), f.at(8 / 9))
    await f.flush()
    assert.deepEqual(lit(f), [0, 8])
    move(f.strip(), f.at(0))
    await f.flush()
    assert.deepEqual(lit(f), [0], "pointing at the current prompt lights only it")
    f.strip().dispatchEvent(new (Pointer())("pointerleave", { pointerType: "mouse" }))
    await f.flush()
    assert.deepEqual(lit(f), [0])
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
    assert.equal(f.body().hasAttribute("data-pass"), true, "a button-down arrival does not scrub")
    assert.equal(f.card(), null)
    globalThis.window.dispatchEvent(new (Pointer())("pointerup", { buttons: 0 }))
    await f.flush()
    assert.equal(f.body().hasAttribute("data-pass"), false)

    strip.dispatchEvent(new (Pointer())("pointerdown", { bubbles: true, buttons: 1, pointerType: "mouse" }))
    move(strip, f.at(1), { buttons: 1 })
    await f.flush()
    assert.equal(f.body().hasAttribute("data-pass"), false)
    assert.equal(f.strip().getAttribute("aria-label"), "Jump to message: third")
    globalThis.window.dispatchEvent(new (Pointer())("pointerup", { buttons: 0 }))
  } finally {
    dispose()
    f.close()
  }
})

test("the wheel on the rail scrolls the timeline; ctrl-wheel and horizontal-only wheels are left alone", async () => {
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
    f.strip().dispatchEvent(Object.assign(new globalThis.window.WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }), { ctrlKey: true }))
    f.strip().dispatchEvent(new globalThis.window.WheelEvent("wheel", { deltaY: 0, deltaX: 40, bubbles: true, cancelable: true }))
    assert.equal(by.length, 1)
  } finally {
    dispose()
    f.close()
  }
})

test("keyboard, as t3-code: focus starts on the current prompt; arrows, Home, End move it; Enter jumps; nothing else", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await scrollTo(f, 1200)
    const strip = f.strip()
    strip.focus()
    await f.flush()
    assert.equal(strip.getAttribute("aria-label"), "Jump to message: second question", "focus starts from the current prompt")
    assert.equal(f.card()?.querySelector("[data-timeline-rail-card-title]")?.textContent, "second question", "the card opens with focus, at once")
    assert.deepEqual(lit(f), [1], "focus starts on the lit prompt")
    assert.deepEqual(f.marked("data-d"), [0, 1, 2], "the fisheye is centred on the keyboard's prompt")
    key(strip, "ArrowDown")
    await f.flush()
    assert.equal(strip.getAttribute("aria-label"), "Jump to message: third")
    assert.deepEqual(lit(f), [1, 2], "the keyboard's prompt is lit with the current one")
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
    key(strip, "PageUp")
    key(strip, "Escape")
    await f.flush()
    assert.equal(strip.getAttribute("aria-label"), "Jump to message: third", "no PageUp, no Escape")
    assert.ok(f.card(), "the card stays until the strip loses focus")
    key(strip, "Home")
    key(strip, "Enter")
    await f.flush()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await f.flush()
    assert.ok(f.scrolls.length > 0 && f.state.scrollTop < 1200, "Enter glided to the first prompt")
    strip.blur()
    await f.flush()
    assert.equal(f.card(), null)
    assert.equal(lit(f).length, 1, "one lit tick again")
    assert.deepEqual(f.marked("data-d"), [], "and equal widths")
  } finally {
    dispose()
    f.close()
  }
})

test("previous / next turn step from the current prompt and disable at the ends; they show only under the pointer", async () => {
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
    await scrollTo(f, 2168 - INSET)
    assert.equal(f.turn("Next turn").disabled, true, "nothing after the last prompt")
    f.turn("Previous turn").click()
    await f.flush()
    await new Promise((resolve) => setTimeout(resolve, 320))
    await f.flush()
    assert.equal(f.state.scrollTop, 1108 - INSET)
    for (const name of ["Previous turn", "Next turn"] as const) {
      const trigger = f.turn(name).closest("[data-component='tooltip-v2-trigger']")!
      const placed = trigger.closest("[data-timeline-rail-turn]")
      assert.ok(placed && placed.contains(trigger) && placed !== trigger, `${name}: the tooltip trigger sits inside the positioned box, so it takes the chevron's size and place`)
      assert.equal(placed.querySelector("[data-timeline-rail-turn]"), null)
    }
    const style = f.registry.styles[0]!
    assert.ok(style.includes("[data-timeline-rail-turn]:hover"), "revealed by their own hover")
    assert.ok(!style.includes("[data-timeline-rail-body]:hover [data-timeline-rail-turn]"), "not by the strip's")
  } finally {
    dispose()
    f.close()
  }
})

test("the rail knows only the newest 10 prompts of a long thread, however many the host holds, and never asks for more", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    f.setMessages(many(f, 5000))
    f.mount([{ owner: "m4999", y: 48, height: 60, prompt: true }])
    await f.flush()
    assert.equal(f.ticks().length, 10)
    assert.equal(f.body().style.getPropertyValue("--timeline-rail-height"), "max(0px, min(72px, calc(100vh - 18rem)))")
    move(f.strip(), f.at(0))
    await f.flush()
    assert.equal(f.card()!.querySelector("[data-timeline-rail-card-title]")!.textContent, "question 4990", "the oldest tick is the 10th from the end")
    move(f.strip(), f.at(1))
    await f.flush()
    assert.equal(f.card()!.querySelector("[data-timeline-rail-card-title]")!.textContent, "question 4999")
    await new Promise((resolve) => setTimeout(resolve, 300))
    await f.flush()
    assert.equal(f.ticks().length, 10, "no growth after first paint")
    assert.equal(f.loads.length, 0, "no request for older history, though the host has more")
  } finally {
    dispose()
    f.close()
  }
})

test("a page the host loads on its own stays out; one the user scrolled for joins (up to 20); new prompts join; nothing is requested", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    f.setMessages(many(f, 30, 100))
    f.mount([{ owner: "m0129", y: 48, height: 60, prompt: true }])
    await f.flush()
    assert.equal(f.ticks().length, 10)
    f.setMessages(many(f, 40, 90))
    await f.flush()
    assert.equal(f.ticks().length, 10, "the host's own second page, before any input, does not make the rail grow")
    f.scroller.dispatchEvent(new globalThis.window.Event("wheel", { bubbles: true }))
    f.setMessages(many(f, 50, 80))
    await f.flush()
    assert.equal(f.ticks().length, 20, "ten more arrived after the user scrolled, and join")
    f.setMessages(many(f, 100, 30))
    await f.flush()
    assert.equal(f.ticks().length, 40, "a page of 50 adds only 20 (t3-code's older page)")
    f.setMessages(many(f, 101, 30))
    await f.flush()
    assert.equal(f.ticks().length, 41, "a new prompt joins")
    assert.equal(f.loads.length, 0)
  } finally {
    dispose()
    f.close()
  }
})

test("a gutter under 48px shows the rail only while hovered; under 13px, or a narrow window, or a cached timeline, there is none", async () => {
  const f = fixture({ gutter: 30 })
  const small = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    assert.ok(f.rail())
    assert.equal(f.rail()!.hasAttribute("data-persistent"), false)
    assert.equal(f.body().style.width, "18px")
    assert.equal(f.body().hasAttribute("data-navigation"), true, "18px reaches the chevrons")
  } finally {
    small.dispose()
    f.close()
  }
  const narrow = fixture({ gutter: 24 })
  const second = await mountSlot(narrow)
  try {
    threeTurns(narrow)
    await narrow.flush()
    assert.equal(narrow.body().style.width, "12px")
    assert.equal(narrow.body().hasAttribute("data-navigation"), false, "under 14px the chevrons are out of reach")
  } finally {
    second.dispose()
    narrow.close()
  }
  for (const options of [{ gutter: 12 }, { desktop: false }]) {
    const g = fixture(options)
    const { dispose } = await mountSlot(g)
    try {
      threeTurns(g)
      await g.flush()
      assert.equal(g.rail(), null, JSON.stringify(options))
    } finally {
      dispose()
      g.close()
    }
  }
  const h = fixture()
  const { dispose } = await mountSlot(h)
  try {
    threeTurns(h)
    h.setActive(false)
    await h.flush()
    assert.equal(h.rail(), null)
    h.setActive(true)
    await h.flush()
    assert.ok(h.rail())
  } finally {
    dispose()
    h.close()
  }
})

test("a different session id starts the window over, though the new thread holds the old window's first prompt", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    f.setMessages(many(f, 12))
    f.mount([{ owner: "m0011", y: 48, height: 60, prompt: true }])
    await f.flush()
    assert.equal(f.ticks().length, 10, "the newest 10 of 12")
    ;(f.session as { id: string }).id = "other"
    f.setMessages(many(f, 30, 2))
    await f.flush()
    assert.equal(f.ticks().length, 10, "a new session opens on its newest 10, not on the old window's edge (m0002), which would hold 30")
    ;(f.session as { id: string }).id = "s"
    f.setMessages(many(f, 31, 2))
    await f.flush()
    assert.equal(f.ticks().length, 10, "and back")
  } finally {
    dispose()
    f.close()
  }
})

test("scrolling reads no layout and builds no observer: the browser reports the crossings", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    assert.deepEqual(f.created, ["10000000px 0px -544px 0px"], "one observer, its root everything above the line 8px under the 48px header")
    let reads = 0
    const box = f.scroller.getBoundingClientRect
    f.scroller.getBoundingClientRect = () => (reads++, box())
    const style = globalThis.getComputedStyle
    Object.defineProperty(globalThis, "getComputedStyle", { value: (...args: Parameters<typeof style>) => (reads++, style(...args)), configurable: true, writable: true })
    try {
      for (let top = 0; top <= 2400; top += 40) await scrollTo(f, top)
    } finally {
      Object.defineProperty(globalThis, "getComputedStyle", { value: style, configurable: true, writable: true })
    }
    assert.equal(reads, 0, "no rect or style read on the scroll path")
    assert.equal(f.created.length, 1, "no observer rebuilt by scrolling")
    assert.deepEqual(f.ended, ["10000000px 0px 2px 0px"], "one bottom watch, its root reaching far above and ending 2px under the viewport's bottom (no spacer here)")
  } finally {
    dispose()
    f.close()
  }
})

test("a taller sticky header moves the reading line: the observer is rebuilt with the new band", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    f.state.header = 80
    f.resized()
    await f.flush()
    assert.deepEqual(f.created, ["10000000px 0px -544px 0px", "10000000px 0px -512px 0px"])
    await scrollTo(f, 1108 - 80 - 8)
    assert.deepEqual(lit(f), [1], "the next prompt reaches the new line")
  } finally {
    dispose()
    f.close()
  }
})

test("a row that jumps across the reading line in one frame (a far jump, a layout shift) still switches the lit tick", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    assert.deepEqual(lit(f), [0])
    await scrollTo(f, 2400)
    assert.deepEqual(lit(f), [2], "m2's and m3's prompt rows went from below the line to above it without ever touching it")
    await scrollTo(f, 0)
    assert.deepEqual(lit(f), [0])
    await scrollTo(f, 1500)
    assert.deepEqual(lit(f), [1])
  } finally {
    dispose()
    f.close()
  }
})
