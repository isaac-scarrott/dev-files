import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { render } from "solid-js/web"
import plugin from "./gui"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]
type Message = { id: string; type: string }

const INSET = 48
const VIEWPORT = 600

function fixture() {
  // Solid delegates events to the document it loaded with, so the tests reuse it.
  const doc = globalThis.document
  doc.body.innerHTML = `<div data-scrollable><div data-session-title><div data-actions></div></div><div data-rows></div></div>`
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 1
  const globals = {
    HTMLElement: globalThis.window.HTMLElement,
    WheelEvent: globalThis.window.WheelEvent,
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

  const scroller = doc.querySelector("[data-scrollable]") as HTMLElement
  const sticky = scroller.querySelector("[data-session-title]") as HTMLElement
  const actions = scroller.querySelector("[data-actions]") as HTMLElement
  const rowsHost = scroller.querySelector("[data-rows]") as HTMLElement
  Object.defineProperty(sticky, "offsetHeight", { value: INSET })
  const state = { scrollTop: 0, total: 20000 }
  const scrolls: { top: number; behavior: ScrollBehavior }[] = []
  Object.defineProperty(scroller, "scrollTop", { get: () => state.scrollTop, set: (value: number) => void (state.scrollTop = value) })
  Object.defineProperty(scroller, "clientHeight", { get: () => VIEWPORT })
  Object.defineProperty(scroller, "scrollHeight", { get: () => state.total })
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: VIEWPORT, left: 0, right: 800, width: 800, height: VIEWPORT, x: 0, y: 0, toJSON: () => ({}) })
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
      row.getBoundingClientRect = () => {
        const top = spec.y - state.scrollTop
        return { top, bottom: top + spec.height, left: 0, right: 800, width: 800, height: spec.height, x: 0, y: top, toJSON: () => ({}) }
      }
      rowsHost.appendChild(row)
    }
  }

  const [messages, setMessages] = createSignal<Message[]>([])
  const [active, setActive] = createSignal(true)
  const commands: string[] = []
  const session = {
    id: "s",
    server: {
      id: "server",
      data: {
        session: {
          get: () => ({}),
          message: { list: () => messages(), more: () => false, loadMore: async () => {} },
        },
      },
    },
  }
  const registry: { slots: any[]; commands: any[] } = { slots: [], commands: [] }
  const ctx = {
    id: "message-jump",
    add: (kind: unknown, item: unknown) => {
      const list = kind === (plugin as any).__slot ? registry.slots : registry.commands
      list.push(item)
      return () => {}
    },
    commands: { run: (id: string) => (commands.push(id), true) },
    keybinds: { keybind: () => [] },
    ui: {
      Tooltip: (props: { children: unknown }) => props.children,
      IconButton: (props: { icon: string; label: string; disabled?: boolean; busy?: boolean; onClick?: () => void }) => {
        const button = doc.createElement("button")
        button.setAttribute("data-icon", props.icon)
        button.setAttribute("aria-label", props.label)
        // Props are getters in Solid: read them when asked, through a small effect-free poll in the tests.
        Object.defineProperty(button, "isDisabled", { get: () => !!props.disabled })
        Object.defineProperty(button, "isBusy", { get: () => !!props.busy })
        button.addEventListener("click", () => props.onClick?.())
        return button
      },
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

  return {
    ctx,
    registry,
    actions,
    scroller,
    state,
    scrolls,
    commands,
    mount,
    setMessages,
    setActive,
    active,
    session,
    flush,
    button: () => actions.querySelector("button") as (HTMLButtonElement & { isDisabled: boolean; isBusy: boolean }) | null,
    close: () => {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete (globalThis as Record<string, unknown>)[key]
      }
    },
  }
}

async function mountSlot(f: ReturnType<typeof fixture>) {
  // The plugin adds one Slot and one Command; tell them apart by shape.
  let dispose = () => {}
  createRoot((d) => {
    dispose = d
    plugin.setup!(f.ctx as unknown as Context)
  })
  const items = [...f.registry.slots, ...f.registry.commands]
  const slot = items.find((item) => typeof item === "object" && item.at === "session.header")
  const command = items.find((item) => typeof item === "function")
  assert.ok(slot, "slot contributed")
  assert.ok(command, "command contributed")
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
  return { command: command as () => { enabled: boolean; run(): void }, dispose: () => (unmount(), dispose()) }
}

test("renders nothing for a session without prompts, a disabled button when nothing is above", async () => {
  const f = fixture()
  const { dispose } = await mountSlot(f)
  try {
    assert.equal(f.button(), null)
    f.setMessages([{ id: "m1", type: "user" }])
    f.mount([{ owner: "m1", y: 48, height: 60, prompt: true }, { owner: "m1", y: 108, height: 300 }])
    await f.flush()
    const button = f.button()
    assert.ok(button)
    assert.equal(button.getAttribute("data-icon"), "arrow-up")
    assert.equal(button.isDisabled, true)
  } finally {
    dispose()
    f.close()
  }
})

test("scrolling past a prompt enables the button; a click glides to it and the command mirrors the state", async () => {
  const f = fixture()
  const { command, dispose } = await mountSlot(f)
  try {
    f.setMessages([{ id: "m1", type: "user" }, { id: "m2", type: "user" }])
    f.mount([
      { owner: "m1", y: 48, height: 60, prompt: true },
      { owner: "m1", y: 108, height: 1000 },
      { owner: "m2", y: 1108, height: 60, prompt: true },
    ])
    await f.flush()
    assert.equal(f.button()!.isDisabled, true)
    assert.equal(command().enabled, false)

    f.state.scrollTop = 900
    f.scroller.dispatchEvent(new globalThis.window.Event("scroll"))
    await f.flush()
    assert.equal(f.button()!.isDisabled, false)
    assert.equal(command().enabled, true)

    f.button()!.click()
    await f.flush()
    assert.deepEqual(f.scrolls, [{ top: 0, behavior: "smooth" }])
    assert.deepEqual(f.commands, [])
  } finally {
    dispose()
    f.close()
  }
})

test("an inactive (cached) timeline neither reads the DOM nor answers the command", async () => {
  const f = fixture()
  const { command, dispose } = await mountSlot(f)
  try {
    f.setMessages([{ id: "m1", type: "user" }, { id: "m2", type: "user" }])
    f.mount([{ owner: "m2", y: -500, height: 60, prompt: true }, { owner: "m2", y: -440, height: 2000 }])
    f.setActive(false)
    await f.flush()
    assert.equal(command().enabled, false)
    f.button()!.click()
    await f.flush()
    assert.deepEqual(f.scrolls, [])

    f.setActive(true)
    await f.flush()
    assert.equal(command().enabled, true)
    command().run()
    await f.flush()
    assert.equal(f.scrolls.length, 1)
  } finally {
    dispose()
    f.close()
  }
})
