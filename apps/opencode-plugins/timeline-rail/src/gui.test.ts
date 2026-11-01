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
const inView = (f: ReturnType<typeof fixture>) => f.marked("data-view")
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

test("in view is a prompt whose own row is on screen; the reply of a prompt scrolled away does not count", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    threeTurns(f)
    await f.flush()
    assert.deepEqual(inView(f), [0])
    await scrollTo(f, 800)
    assert.deepEqual(inView(f), [1], "m1's reply fills the screen from 800 to 1108, but only m2's prompt row is in view")
    await scrollTo(f, 2000)
    assert.deepEqual(inView(f), [2])
    await scrollTo(f, 1200)
    assert.deepEqual(inView(f), [], "inside m2's reply no prompt row is on screen")
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

test("the fisheye is by index distance from the pointer's prompt and clears on leave", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    f.setMessages(many(f, 10))
    f.mount([{ owner: "m0000", y: 48, height: 60, prompt: true }])
    await f.flush()
    const d = () => new Map(f.marked("data-d").map((index) => [index, f.view.querySelector(`[data-index="${index}"]`)!.getAttribute("data-d")]))
    move(f.strip(), f.at(5 / 9))
    await f.flush()
    assert.deepEqual([...d()], [[3, "2"], [4, "1"], [5, "0"], [6, "1"], [7, "2"]])
    f.strip().dispatchEvent(new (Pointer())("pointerleave", { pointerType: "mouse" }))
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
