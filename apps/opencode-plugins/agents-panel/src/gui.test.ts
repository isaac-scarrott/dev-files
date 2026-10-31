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
  doc.body.innerHTML = `<main id="side"></main>`
  const intervals = new Map<number, () => void>()
  let next = 1
  const globals = {
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    setInterval: ((fn: () => void) => { intervals.set(next, fn); return next++ }) as unknown as typeof setInterval,
    clearInterval: ((id: number) => { intervals.delete(id) }) as unknown as typeof clearInterval,
  }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })

  const [infos, setInfos] = createSignal<Info[] | undefined>(undefined)
  const [family, setFamily] = createSignal<string[] | undefined>(undefined)
  const [running, setRunning] = createSignal<string[]>([])
  const [background, setBackground] = createSignal<{ id: string; type: "shell" | "subagent"; label: string }[] | undefined>(undefined)
  const [state, setState] = createSignal("closed")
  const calls = { interrupt: [] as unknown[], shell: [] as unknown[], opened: [] as unknown[], toasts: [] as any[], toggled: [] as unknown[] }
  let failInterrupt = false

  const server = {
    id: "server",
    client: {
      session: { interrupt: async (input: unknown) => { calls.interrupt.push(input); if (failInterrupt) throw new Error("denied") } },
      shell: { remove: async (input: unknown) => { calls.shell.push(input) } },
    },
    data: { session: { list: infos, family, status: (id: string) => (running().includes(id) ? "running" : "idle") }, shell: { get: () => undefined } },
  }
  const [current, setCurrent] = createSignal<"parent" | "other" | undefined>("parent")
  const session = {
    key: "server\nparent", id: "parent", server, directory: "/repo",
    get background() { return background() as never },
  }
  const sessionB = { ...session, key: "server\nother", id: "other", get background() { return [] as never } }
  const mounted = () => (current() === "parent" ? session : current() === "other" ? sessionB : undefined)
  const ui = {
    Icon: (props: { name: string }) => { const el = doc.createElement("b"); el.setAttribute("data-icon", props.name); return el },
    IconButton: (props: { label: string }) => { const el = doc.createElement("button"); el.setAttribute("aria-label", props.label); return el },
  }
  const added: { kind: string; item: any }[] = []
  const ctx = {
    id: "agents-panel", signal: new AbortController().signal, ui,
    add: (kind: { id: string }, item: any) => { added.push({ kind: kind.id, item }) },
    sessions: { current: mounted },
    layout: { state: state, toggle: (...args: unknown[]) => calls.toggled.push(args) },
    tabs: { open: (...args: unknown[]) => calls.opened.push(args) },
    toast: { show: (toast: unknown) => { calls.toasts.push(toast); return { dismiss() {} } } },
  } as unknown as Context

  let dispose = () => {}
  const start = () => {
    createRoot((stop) => {
      dispose = stop
      plugin.setup!(ctx)
    })
  }
  const registered = (kind: string) => added.filter((entry) => entry.kind === kind).map((entry) => entry.item)
  const resolve = (kind: string) => { const item = registered(kind)[0]; return typeof item === "function" ? item() : item }
  // The panel renders once into the side region, as the host does, and follows the routed session itself.
  const mount = () => {
    createRoot((stop) => {
      const previousDispose = dispose
      dispose = () => { stop(); previousDispose() }
      const panel = registered("panel")[0]
      doc.getElementById("side")!.append(panel.render({ get session() { return mounted() } }) as Node)
    })
  }
  const stop = () => { dispose(); for (const [key, d] of previous) d ? Object.defineProperty(globalThis, key, d) : delete (globalThis as any)[key] }
  const panel = () => doc.querySelector("[data-agents-panel]") as HTMLElement | null
  const rows = () => [...doc.querySelectorAll("[data-agents-row]")] as HTMLElement[]
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
  return {
    doc, calls, intervals, panel, rows, start, mount, stop, flush, registered, resolve,
    setInfos, setFamily, setRunning, setBackground, setState, setCurrent,
    failInterrupt: () => { failInterrupt = true },
  }
}

const child = (id: string, extra: Partial<Info> = {}): Info => ({ id, parentID: "parent", agent: "general", title: "Hold 5 min (@general subagent)", time: { created: Date.now() - 5000 }, ...extra })

test("cold state: panel mounts empty, nothing ticks", () => {
  const f = fixture()
  f.start()
  f.mount()
  assert.equal(f.rows().length, 0)
  assert.match(f.doc.querySelector("[data-agents-heading]")!.textContent!, /Agents\s*·\s*0 running/)
  assert.equal(f.intervals.size, 0)
  f.stop()
})

test("registers a side panel, a toggle command, a launcher and a titlebar item, nothing floating", () => {
  const f = fixture()
  f.start()
  assert.equal(f.registered("panel")[0].region, "side")
  assert.deepEqual(f.registered("panel")[0].list({ open: [] }), [])
  assert.equal(f.registered("panel")[0].list({ open: ["agents"] })[0].id, "agents")
  assert.equal(f.registered("command")[0].id, "toggle")
  assert.equal(f.resolve("menu-item").menu, "session.panel")
  assert.equal(f.registered("slot").length, 0)
  assert.equal(f.doc.querySelector("[data-agents-host]"), null)
  f.stop()
})

test("titlebar toggle: count in the label, pressed only while visible, runs layout.toggle", async () => {
  const f = fixture()
  f.start()
  assert.equal(f.resolve("titlebar-item").label, "Agents")
  assert.equal(f.resolve("titlebar-item").pressed, false)
  f.setInfos([child("c1"), child("c2")]); f.setFamily(["c1", "c2"]); f.setRunning(["c1", "c2"])
  assert.equal(f.resolve("titlebar-item").label, "Agents · 2")
  f.setState("visible")
  assert.equal(f.resolve("titlebar-item").pressed, true)
  f.setState("active")
  assert.equal(f.resolve("titlebar-item").pressed, false)
  assert.equal(f.resolve("menu-item").opened, true)
  f.resolve("titlebar-item").run()
  f.registered("command")[0].run()
  assert.deepEqual(f.calls.toggled.map((args: any) => args[0]), ["agents-panel:agents", "agents-panel:agents"])
  f.setCurrent(undefined)
  assert.equal(f.resolve("titlebar-item"), undefined)
  f.stop()
})

test("running subagents list their description and elapsed, no agent name; count follows", async () => {
  const f = fixture()
  f.start()
  f.mount()
  f.setInfos([child("c1"), child("c2", { title: "Other" }), child("done"), { ...child("g"), parentID: "c1" }])
  f.setFamily(["parent", "c1", "c2", "done", "g"])
  f.setRunning(["c1", "c2", "g"])
  await f.flush()
  assert.equal(f.rows().length, 3)
  assert.match(f.doc.querySelector("[data-agents-heading]")!.textContent!, /Agents\s*·\s*3 running/)
  assert.match(f.rows()[0].textContent!, /Hold 5 min/)
  assert.doesNotMatch(f.rows()[0].textContent!, /General|@general/i)
  f.setRunning(["c2"])
  await f.flush()
  assert.equal(f.rows().length, 1)
  f.setRunning([])
  await f.flush()
  assert.equal(f.rows().length, 0)
  assert.ok(f.doc.querySelector("[data-agents-empty]"))
  f.stop()
})

test("subagent rows use the host's radar spinner markup, not Loader", async () => {
  const f = fixture()
  f.start()
  f.mount()
  f.setInfos([child("c1")]); f.setFamily(["c1"]); f.setRunning(["c1"])
  await f.flush()
  const svg = f.rows()[0].querySelector("svg[data-component=session-progress-indicator-v2]")!
  assert.equal(svg.getAttribute("viewBox"), "0 0 16 16")
  assert.equal(svg.getAttribute("data-slot"), "spinner-dots")
  assert.equal(svg.querySelectorAll("rect").length, 25)
  assert.equal(svg.querySelectorAll("rect[style*=animation]").length, 24)
  assert.ok(f.doc.head.textContent!.includes("@keyframes spinner-radar-0") || [...f.doc.head.querySelectorAll("style")].some((el) => el.textContent!.includes("spinner-radar-0")))
  f.stop()
})

test("elapsed ticks only while rows exist and stops with them and on cleanup", async () => {
  const f = fixture()
  f.start()
  f.mount()
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
  f.mount()
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
  f.mount()
  f.setInfos([child("c1")]); f.setFamily(["c1"]); f.setRunning(["c1"])
  await f.flush()
  f.rows()[0].click()
  assert.deepEqual(f.calls.opened, [[{ server: "server", id: "c1" }, { focus: true }]])
  f.stop()
})

test("session switch re-scopes rows", async () => {
  const f = fixture()
  f.start()
  f.mount()
  f.setInfos([child("c1")]); f.setFamily(["c1"]); f.setRunning(["c1"])
  await f.flush()
  assert.equal(f.rows().length, 1)
  f.setCurrent("other")
  await f.flush()
  assert.equal(f.rows().length, 0)
  f.stop()
})

test("elapsed format matches the host's", () => {
  assert.equal(formatElapsed(23_000), "23s")
  assert.equal(formatElapsed(336_000), "5m 36s")
  assert.equal(formatElapsed(3_720_000), "1h 02m")
  assert.equal(formatElapsed(-5), "0s")
})
