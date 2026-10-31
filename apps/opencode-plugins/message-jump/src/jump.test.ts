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
  run?: (command: string, f: Fixture) => boolean
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

  const calls = { commands: [] as string[], loads: 0, loading: [] as boolean[], frames: 0 }
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
    run: (command) => {
      calls.commands.push(command)
      return input.run ? input.run(command, f) : false
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
    assert.deepEqual(f.calls.commands, [])
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

test("an unmounted prompt is revealed through the host's message commands, then glided to", async () => {
  // Reading deep inside m3's turn; m3's prompt and m2 are unmounted far above. The host cursor is on m3.
  const f = await fixture({
    ids: ["m1", "m2", "m3", "m4"],
    scrollTop: 9000,
    rows: [
      { owner: "m3", y: 8500, height: 1200 },
      { owner: "m4", y: 9700, height: 60, prompt: true },
    ],
    run: (command, fx) => {
      // The host lands the revealed prompt under the header after the last command.
      if (fx.calls.commands.length === 2) {
        fx.mount([
          { owner: "m2", y: 3000, height: 60, prompt: true },
          { owner: "m2", y: 3060, height: 500 },
          { owner: "m3", y: 3560, height: 60, prompt: true },
          { owner: "m3", y: 3620, height: 6000 },
        ])
        fx.state.scrollTop = 3560 - INSET
      }
      return true
    },
  })
  try {
    assert.deepEqual(currentTarget(f.host), { kind: "message", id: "m3" })
    assert.equal(await jump(f.host, new AbortController().signal), "done")
    assert.deepEqual(f.wheels, [-1])
    assert.deepEqual(f.calls.commands, ["message.previous", "message.next"])
    // Already in place after the host settled: the glide is a no-op scroll to the same offset.
    assert.deepEqual(f.scrolls, [{ top: 3560 - INSET, behavior: "smooth" }])
    assert.equal(f.state.scrollTop, 3560 - INSET)
  } finally {
    await f.close()
  }
})

test("a prompt on the fold steps the host back once per prompt between its cursor and the target", async () => {
  // m4's prompt is on the fold; the target is m3, unmounted. The host's cursor line (100px) is in m4's turn.
  const f = await fixture({
    ids: ["m1", "m2", "m3", "m4"],
    scrollTop: 9000,
    rows: [
      { owner: "m4", y: 9048, height: 60, prompt: true },
      { owner: "m4", y: 9108, height: 1000 },
    ],
    run: (_command, fx) => {
      fx.mount([{ owner: "m3", y: 5000, height: 60, prompt: true }, { owner: "m3", y: 5060, height: 4000 }])
      fx.state.scrollTop = 5000 - INSET
      return true
    },
  })
  try {
    assert.deepEqual(currentTarget(f.host), { kind: "message", id: "m3" })
    assert.equal(await jump(f.host, new AbortController().signal), "done")
    assert.deepEqual(f.calls.commands, ["message.previous"])
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

test("without host commands, the scroller pages up until the prompt's row mounts", async () => {
  const f = await fixture({
    ids: ["m1", "m2", "m3"],
    scrollTop: 9000,
    rows: [{ owner: "m3", y: 8800, height: 2000 }],
    run: () => false,
  })
  const original = f.host.frame
  f.host.frame = async () => {
    await original()
    if (f.state.scrollTop < 4000) {
      f.mount([{ owner: "m3", y: 3000, height: 60, prompt: true }, { owner: "m3", y: 3060, height: 8000 }])
    }
  }
  try {
    assert.equal(await jump(f.host, new AbortController().signal), "done")
    // The first unavailable command ends the host route.
    assert.deepEqual(f.calls.commands, ["message.previous"])
    assert.ok(f.scrolls.length >= 3)
    assert.equal(f.state.scrollTop, 3000 - INSET)
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
