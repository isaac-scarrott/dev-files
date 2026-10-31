import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { currentTarget, jump, type Host } from "./jump"

const INSET = 48
const VIEWPORT = 600

type Spec = { owner: string; y: number; height: number; prompt?: boolean }

/**
 * A timeline scroller with a sticky header and rows laid out by absolute content offset. Row boxes follow
 * `scrollTop`, as the real virtualizer's do; the fixture decides which rows are mounted.
 */
async function fixture(input: {
  ids: string[]
  rows: Spec[]
  more?: boolean
  total?: number
  scrollTop?: number
  reduced?: boolean
  loadMore?: (f: Fixture) => void
}) {
  const window = new Window()
  const document = window.document
  const globals = { window, document, HTMLElement: window.HTMLElement, WheelEvent: window.WheelEvent }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }

  document.body.innerHTML = `<div data-scrollable><div data-session-title></div><div data-rows></div></div>`
  const scroller = document.querySelector("[data-scrollable]") as unknown as HTMLElement
  const sticky = scroller.querySelector("[data-session-title]") as unknown as HTMLElement
  Object.defineProperty(sticky, "offsetHeight", { value: INSET })
  const rowsHost = scroller.querySelector("[data-rows]") as unknown as HTMLElement

  const state = { scrollTop: input.scrollTop ?? 0, total: input.total ?? 20000 }
  const scrolls: { top: number; behavior: ScrollBehavior }[] = []
  const wheels: number[] = []
  Object.defineProperty(scroller, "scrollTop", { get: () => state.scrollTop, set: (value: number) => void (state.scrollTop = value) })
  Object.defineProperty(scroller, "clientHeight", { get: () => VIEWPORT })
  Object.defineProperty(scroller, "scrollHeight", { get: () => state.total })
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: VIEWPORT, left: 0, right: 800, width: 800, height: VIEWPORT, x: 0, y: 0, toJSON: () => ({}) })
  scroller.scrollTo = ((options: ScrollToOptions) => {
    scrolls.push({ top: options.top ?? 0, behavior: options.behavior ?? "auto" })
    state.scrollTop = Math.min(Math.max(0, options.top ?? 0), state.total - VIEWPORT)
  }) as HTMLElement["scrollTo"]
  scroller.addEventListener("wheel", (event) => wheels.push((event as WheelEvent).deltaY))

  const mount = (specs: Spec[]) => {
    rowsHost.innerHTML = ""
    for (const spec of specs) {
      const row = document.createElement("div") as unknown as HTMLElement
      row.setAttribute("data-message-id", spec.owner)
      row.setAttribute("data-timeline-row", spec.prompt ? "UserMessage" : "AssistantPart")
      row.getBoundingClientRect = () => {
        const top = spec.y - state.scrollTop
        return { top, bottom: top + spec.height, left: 0, right: 800, width: 800, height: spec.height, x: 0, y: top, toJSON: () => ({}) }
      }
      rowsHost.appendChild(row as unknown as Node)
    }
  }
  mount(input.rows)

  const calls = { loads: 0, loading: [] as boolean[], frames: 0 }
  let ids = input.ids
  let more = input.more ?? false
  const f = {
    scroller,
    state,
    scrolls,
    wheels,
    calls,
    mount,
    setIds: (next: string[], nextMore = false) => {
      ids = next
      more = nextMore
    },
    host: undefined as unknown as Host,
    close: async () => {
      await window.happyDOM.abort()
      window.close()
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete (globalThis as Record<string, unknown>)[key]
      }
    },
  }
  f.host = {
    scroller,
    ids: () => ids,
    more: () => more,
    loadMore: async () => {
      calls.loads += 1
      input.loadMore?.(f)
    },
    reducedMotion: () => input.reduced ?? false,
    frame: async () => {
      calls.frames += 1
      if (calls.frames > 1000) throw new Error("runaway frames")
    },
    loading: (value) => calls.loading.push(value),
  }
  return f
}

type Fixture = Awaited<ReturnType<typeof fixture>>

test("a mounted prompt above the fold is glided to, below the header, after unpinning the host", async () => {
  const f = await fixture({
    ids: ["m1", "m2", "m3"],
    scrollTop: 1000,
    rows: [
      { owner: "m2", y: 700, height: 60, prompt: true },
      { owner: "m2", y: 760, height: 800 },
      { owner: "m3", y: 1560, height: 60, prompt: true },
    ],
  })
  try {
    assert.deepEqual(currentTarget(f.host), { kind: "message", id: "m2" })
    assert.equal(await jump(f.host, new AbortController().signal), "done")
    assert.deepEqual(f.wheels, [-1])
    assert.deepEqual(f.scrolls, [{ top: 700 - INSET, behavior: "smooth" }])
  } finally {
    await f.close()
  }
})

test("a mounted prompt far above gets an instant jump to one screen away, then the glide", async () => {
  const f = await fixture({
    ids: ["m1", "m2"],
    scrollTop: 5000,
    rows: [
      { owner: "m1", y: 100, height: 60, prompt: true },
      { owner: "m1", y: 160, height: 6000 },
    ],
  })
  try {
    assert.equal(await jump(f.host, new AbortController().signal), "done")
    assert.deepEqual(f.scrolls, [
      { top: 100 - INSET + VIEWPORT, behavior: "auto" },
      { top: 100 - INSET, behavior: "smooth" },
    ])
  } finally {
    await f.close()
  }
})

test("reduced motion lands instantly", async () => {
  const f = await fixture({
    ids: ["m1", "m2"],
    scrollTop: 1000,
    reduced: true,
    rows: [{ owner: "m1", y: 500, height: 60, prompt: true }, { owner: "m1", y: 560, height: 2000 }],
  })
  try {
    assert.equal(await jump(f.host, new AbortController().signal), "done")
    assert.deepEqual(f.scrolls, [{ top: 500 - INSET, behavior: "auto" }])
  } finally {
    await f.close()
  }
})

/**
 * A virtualizer stand-in: after every frame, mounts the rows of `layout` that intersect the viewport (plus
 * `overscan`), as of `lag` frames ago. The last turn's final row stays mounted, as in the real timeline.
 */
function virtualize(f: Fixture, layout: Spec[], options: { overscan?: number; lag?: number } = {}) {
  const { overscan = 0, lag = 0 } = options
  const tail = layout.at(-1)!
  const original = f.host.frame
  const history: number[] = []
  f.host.frame = async () => {
    await original()
    history.push(f.state.scrollTop)
    const at = history[Math.max(0, history.length - 1 - lag)]!
    const top = at - overscan
    const bottom = at + VIEWPORT + overscan
    const rows = layout.filter((spec) => spec.y < bottom && spec.y + spec.height > top)
    f.mount(rows.includes(tail) ? rows : [...rows, tail])
  }
}

const auto = (tops: number[]) => tops.map((top) => ({ top, behavior: "auto" as const }))

test("an unmounted prompt above is probed for one viewport per frame, then glided to", async () => {
  // Reading deep inside m3's turn; m3's prompt is unmounted far above.
  const layout: Spec[] = [
    { owner: "m2", y: 2000, height: 60, prompt: true },
    { owner: "m2", y: 2060, height: 940 },
    { owner: "m3", y: 3000, height: 60, prompt: true },
    { owner: "m3", y: 3060, height: 8000 },
    { owner: "m3", y: 11060, height: 200 },
  ]
  const f = await fixture({
    ids: ["m1", "m2", "m3"],
    scrollTop: 9000,
    rows: [{ owner: "m3", y: 3060, height: 8000 }, { owner: "m3", y: 11060, height: 200 }],
  })
  virtualize(f, layout, { overscan: 600 })
  try {
    assert.deepEqual(currentTarget(f.host), { kind: "message", id: "m3" })
    assert.equal(await jump(f.host, new AbortController().signal), "done")
    assert.deepEqual(f.wheels, [-1])
    assert.deepEqual(f.scrolls, [
      ...auto([8400, 7800, 7200, 6600, 6000, 5400, 4800, 4200, 3600]),
      { top: 3000 - INSET, behavior: "smooth" },
    ])
    assert.equal(f.state.scrollTop, 3000 - INSET)
  } finally {
    await f.close()
  }
})

test("a prompt the virtualizer renders one frame late is probed for again from the other side", async () => {
  // m4's prompt is on the fold; the target is m3. Rows arrive a frame after each stop, so the probe sees m3's
  // prompt one stop late, and the next render takes it out again; the retry turns around with a smaller step.
  const layout: Spec[] = [
    { owner: "m2", y: 1000, height: 60, prompt: true },
    { owner: "m2", y: 1060, height: 3940 },
    { owner: "m3", y: 5000, height: 60, prompt: true },
    { owner: "m3", y: 5060, height: 3988 },
    { owner: "m4", y: 9048, height: 60, prompt: true },
    { owner: "m4", y: 9108, height: 1000 },
    { owner: "m4", y: 10108, height: 20000 },
  ]
  const f = await fixture({ ids: ["m1", "m2", "m3", "m4"], scrollTop: 9000, total: 30108, rows: layout.slice(4) })
  virtualize(f, layout, { lag: 1 })
  try {
    assert.deepEqual(currentTarget(f.host), { kind: "message", id: "m3" })
    assert.equal(await jump(f.host, new AbortController().signal), "done")
    assert.deepEqual(f.scrolls, [
      ...auto([8400, 7800, 7200, 6600, 6000, 5400, 4800, 4200]),
      // m2's rows are in view: the prompt is below, so the retry goes down by half steps.
      ...auto([4500, 4800]),
      { top: 5000 - INSET, behavior: "smooth" },
    ])
    assert.equal(f.state.scrollTop, 5000 - INSET)
  } finally {
    await f.close()
  }
})

test("older history loads first when the prompt above is on an unloaded page", async () => {
  const f = await fixture({
    ids: ["m2", "m3"],
    more: true,
    scrollTop: 400,
    rows: [{ owner: "m2", y: 448, height: 60, prompt: true }, { owner: "m2", y: 508, height: 900 }],
    loadMore: (fx) => {
      fx.setIds(["m1", "m2", "m3"], false)
      fx.mount([
        { owner: "m1", y: 100, height: 60, prompt: true },
        { owner: "m1", y: 160, height: 288 },
        { owner: "m2", y: 448, height: 60, prompt: true },
        { owner: "m2", y: 508, height: 900 },
      ])
    },
  })
  try {
    assert.deepEqual(currentTarget(f.host), { kind: "load" })
    assert.equal(await jump(f.host, new AbortController().signal), "done")
    assert.equal(f.calls.loads, 1)
    assert.deepEqual(f.calls.loading, [true, false])
    assert.deepEqual(f.scrolls, [{ top: 100 - INSET, behavior: "smooth" }])
  } finally {
    await f.close()
  }
})

test("nothing above the first prompt: no target, no scroll", async () => {
  const f = await fixture({
    ids: ["m1", "m2"],
    scrollTop: 0,
    rows: [{ owner: "m1", y: 48, height: 60, prompt: true }, { owner: "m1", y: 108, height: 300 }],
  })
  try {
    assert.equal(currentTarget(f.host), undefined)
    assert.equal(await jump(f.host, new AbortController().signal), "none")
    assert.deepEqual(f.scrolls, [])
    assert.deepEqual(f.wheels, [])
  } finally {
    await f.close()
  }
})

test("an aborted jump stops after the load and scrolls nothing", async () => {
  const controller = new AbortController()
  const f = await fixture({
    ids: ["m2"],
    more: true,
    scrollTop: 0,
    rows: [{ owner: "m2", y: 48, height: 60, prompt: true }],
    loadMore: () => controller.abort(),
  })
  try {
    assert.equal(await jump(f.host, controller.signal), "aborted")
    assert.deepEqual(f.scrolls, [])
  } finally {
    await f.close()
  }
})
