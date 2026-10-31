import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import plugin from "./gui"
import { formatElapsed } from "./agents"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]
type Info = { id: string; parentID?: string; agent?: string; title?: string; time: { created: number; busy?: number } }

function fixture() {
  // Solid delegates events to the document it loaded with, so the tests reuse it.
  const doc = globalThis.document
  doc.body.innerHTML = `<main><header id="header"></header><div data-slot="session-timeline-scroll"></div></main>`
  const intervals = new Map<number, () => void>()
  let next = 1
  const globals = {
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn: () => void) => { fn(); return 1 }, cancelAnimationFrame: () => {},
    setInterval: ((fn: () => void) => { intervals.set(next, fn); return next++ }) as unknown as typeof setInterval,
    clearInterval: ((id: number) => { intervals.delete(id) }) as unknown as typeof clearInterval,
  }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })

  const [infos, setInfos] = createSignal<Info[] | undefined>(undefined)
  const [family, setFamily] = createSignal<string[] | undefined>(undefined)
  const [running, setRunning] = createSignal<string[]>([])
  const [background, setBackground] = createSignal<{ id: string; type: "shell" | "subagent"; label: string }[] | undefined>(undefined)
  const calls = { interrupt: [] as unknown[], shell: [] as unknown[], opened: [] as unknown[], toasts: [] as any[] }
  let failInterrupt = false

  const server = {
    id: "server",
    client: {
      session: { interrupt: async (input: unknown) => { calls.interrupt.push(input); if (failInterrupt) throw new Error("denied") } },
      shell: { remove: async (input: unknown) => { calls.shell.push(input) } },
    },
    data: { session: { list: infos, family, status: (id: string) => (running().includes(id) ? "running" : "idle") }, shell: { get: () => undefined } },
  }
  const [current, setCurrent] = createSignal("parent")
  const session = {
    key: "server\nparent", id: "parent", server, directory: "/repo",
    get background() { return background() as never },
  }
  const sessionB = { ...session, key: "server\nother", id: "other", get background() { return [] as never } }
  const [active, setActive] = createSignal(true)
  const ui = {
    Loader: () => doc.createElement("i"),
    Icon: () => doc.createElement("b"),
    IconButton: (props: { label: string }) => { const el = doc.createElement("button"); el.setAttribute("aria-label", props.label); return el },
  }
  const slots: any[] = []
  const ctx = {
    signal: new AbortController().signal, ui,
    add: (_: unknown, item: any) => { if (typeof item === "object" && item.at) slots.push(item) },
    tabs: { open: (...args: unknown[]) => calls.opened.push(args) },
    toast: { show: (toast: unknown) => { calls.toasts.push(toast); return { dismiss() {} } } },
  } as unknown as Context

  let dispose = () => {}
  let cleanup: unknown
  const start = () => {
    createRoot((stop) => {
      dispose = stop
      cleanup = plugin.setup!(ctx)
      const header = doc.getElementById("header")!
      const view = slots[0].render({
        get active() { return active() },
        get session() { return current() === "parent" ? session : sessionB },
      })
      header.append(view)
    })
  }
  const stop = () => { dispose(); if (typeof cleanup === "function") cleanup(); for (const [key, d] of previous) d ? Object.defineProperty(globalThis, key, d) : delete (globalThis as any)[key] }
  const hosts = () => doc.querySelectorAll("[data-agents-host]")
  const panel = () => doc.querySelector("[data-agents-panel]") as HTMLElement | null
  const rows = () => [...doc.querySelectorAll("[data-agents-row]")] as HTMLElement[]
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
  return {
    doc, calls, intervals, hosts, panel, rows, start, stop, flush, slots,
    setInfos, setFamily, setRunning, setBackground, setActive, setCurrent,
    failInterrupt: () => { failInterrupt = true },
  }
}

const child = (id: string, extra: Partial<Info> = {}): Info => ({ id, parentID: "parent", agent: "general", title: "Hold 5 min (@general subagent)", time: { created: Date.now() - 5000 }, ...extra })

test("cold state: no lists, nothing shown, no ticking", () => {
  const f = fixture()
  f.start()
  assert.equal(f.hosts().length, 1)
  assert.equal(f.panel()!.hasAttribute("data-open"), false)
  assert.equal(f.rows().length, 0)
  assert.equal(f.intervals.size, 0)
  f.stop()
})

test("running subagents list with name, description and count; removal hides the panel", async () => {
  const f = fixture()
  f.start()
  f.setInfos([child("c1"), child("c2", { title: "Other" }), child("done"), { ...child("g"), parentID: "c1" }])
  f.setFamily(["parent", "c1", "c2", "done", "g"])
  f.setRunning(["c1", "c2", "g"])
  await f.flush()
  assert.equal(f.panel()!.hasAttribute("data-open"), true)
  assert.equal(f.rows().length, 3)
  assert.match(f.doc.querySelector("[data-agents-heading]")!.textContent!, /Agents\s*·\s*3 running/)
  assert.match(f.rows()[0].textContent!, /General/)
  assert.match(f.rows()[0].textContent!, /Hold 5 min/)
  assert.doesNotMatch(f.rows()[0].textContent!, /@general/)
  f.setRunning(["c2"])
  await f.flush()
  assert.equal(f.rows().length, 1)
  f.setRunning([])
  await f.flush()
  assert.equal(f.panel()!.hasAttribute("data-open"), false)
  f.stop()
})

test("elapsed ticks only while rows exist and stops with them and on cleanup", async () => {
  const f = fixture()
  f.start()
  assert.equal(f.intervals.size, 0)
  f.setInfos([child("c1")]); f.setFamily(["c1"]); f.setRunning(["c1"])
  await f.flush()
  assert.equal(f.intervals.size, 1)
  f.setRunning([])
  await f.flush()
  assert.equal(f.intervals.size, 0)
  f.setRunning(["c1"])
  await f.flush()
  assert.equal(f.intervals.size, 1)
  f.stop()
  assert.equal(f.intervals.size, 0)
})

test("stop interrupts the child session, kills a shell, and reports failure", async () => {
  const f = fixture()
  f.start()
  f.setInfos([child("c1")]); f.setFamily(["c1"]); f.setRunning(["c1"])
  f.setBackground([{ id: "sh1", type: "shell", label: "sleep 300" }])
  await f.flush()
  const [agent, shell] = f.rows()
  ;(agent.querySelector("[data-slot=agents-row-stop]") as HTMLElement).click()
  assert.deepEqual(f.calls.interrupt, [{ sessionID: "c1" }])
  ;(shell.querySelector("[data-slot=agents-row-stop]") as HTMLElement).click()
  assert.deepEqual(f.calls.shell, [{ id: "sh1", location: { directory: "/repo" } }])
  assert.equal(f.calls.opened.length, 0)
  f.failInterrupt()
  ;(agent.querySelector("[data-slot=agents-row-stop]") as HTMLElement).click()
  await f.flush()
  assert.equal(f.calls.toasts[0].variant, "error")
  f.stop()
})

test("row click opens the child session tab", async () => {
  const f = fixture()
  f.start()
  f.setInfos([child("c1")]); f.setFamily(["c1"]); f.setRunning(["c1"])
  await f.flush()
  f.rows()[0].click()
  assert.deepEqual(f.calls.opened, [[{ server: "server", id: "c1" }, { focus: true }]])
  f.stop()
})

test("session switch re-scopes rows; an inactive timeline has no host", async () => {
  const f = fixture()
  f.start()
  f.setInfos([child("c1")]); f.setFamily(["c1"]); f.setRunning(["c1"])
  await f.flush()
  assert.equal(f.rows().length, 1)
  f.setCurrent("other")
  await f.flush()
  assert.equal(f.rows().length, 0)
  assert.equal(f.panel()!.hasAttribute("data-open"), false)
  f.setActive(false)
  await f.flush()
  assert.equal(f.hosts().length, 0)
  f.setActive(true)
  await f.flush()
  assert.equal(f.hosts().length, 1)
  f.stop()
})

test("cleanup removes the host and a reload leaves one", () => {
  const f = fixture()
  f.start()
  f.stop()
  assert.equal(f.hosts().length, 0)
  const g = fixture()
  g.start()
  assert.equal(g.hosts().length, 1)
  g.stop()
})

test("elapsed format matches the host's", () => {
  assert.equal(formatElapsed(23_000), "23s")
  assert.equal(formatElapsed(336_000), "5m 36s")
  assert.equal(formatElapsed(3_720_000), "1h 02m")
  assert.equal(formatElapsed(-5), "0s")
})
