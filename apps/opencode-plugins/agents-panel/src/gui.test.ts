import assert from "node:assert/strict"
import { test } from "node:test"
import { createEffect, createRoot, createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { insert } from "solid-js/web"
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
    requestAnimationFrame: (fn: () => void) => { fn(); return 1 }, cancelAnimationFrame: () => {},
    HTMLHeadElement: (globalThis as any).window.HTMLHeadElement,
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
    IconButton: (props: { label: string; pressed?: boolean; onClick?: () => void }) => {
      const el = doc.createElement("button")
      el.setAttribute("aria-label", props.label)
      createEffect(() => { el.setAttribute("aria-label", props.label); el.setAttribute("aria-pressed", String(!!props.pressed)) })
      el.onclick = () => props.onClick?.()
      return el
    },
    Tooltip: (props: { children: Node }) => props.children,
  }
  const added: { kind: string; item: any }[] = []
  const [side, setSide] = createSignal(false)
  const [memory, setMemory] = createStore<{ keys: Record<string, boolean> }>({ keys: {} })
  const ctx = {
    id: "agents-panel", signal: new AbortController().signal, ui,
    add: (kind: { id: string }, item: any) => { added.push({ kind: kind.id, item }) },
    sessions: { current: mounted },
    layout: { side: { opened: side } },
    storage: { memory: () => [memory, (fn: (draft: { keys: Record<string, boolean> }) => void) => setMemory(produce(fn))] },
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
  // The header slot renders into the timeline row, as the host does.
  const header = (active = true) => {
    doc.body.innerHTML = `<div data-pane-row id="row"><div id="header"></div></div>`
    createRoot((stop) => {
      const previousDispose = dispose
      dispose = () => { stop(); previousDispose() }
      const view = registered("slot")[0].render({ get active() { return active }, get session() { return mounted() } })
      insert(doc.getElementById("header")!, view)
    })
    return doc.getElementById("row")!
  }
  const stop = () => { dispose(); for (const [key, d] of previous) d ? Object.defineProperty(globalThis, key, d) : delete (globalThis as any)[key] }
  const rows = () => [...doc.querySelectorAll("[data-agents-row]")] as HTMLElement[]
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
  const toggle = () => doc.querySelector("[data-agents-toggle] button") as HTMLButtonElement
  return {
    doc, calls, intervals, rows, header, toggle, start, stop, flush, registered,
    setInfos, setFamily, setRunning, setBackground, setCurrent, setSide,
    failInterrupt: () => { failInterrupt = true },
  }
}

const child = (id: string, extra: Partial<Info> = {}): Info => ({ id, parentID: "parent", agent: "general", title: "Hold 5 min (@general subagent)", time: { created: Date.now() - 5000 }, ...extra })

const open = async (f: ReturnType<typeof fixture>) => { f.toggle().click(); await f.flush() }
const running = (f: ReturnType<typeof fixture>, ids: string[], infos: Info[] = ids.map((id) => child(id))) => {
  f.setInfos(infos); f.setFamily(["parent", ...infos.map((info) => info.id)]); f.setRunning(ids)
}

test("closed by default: only the header toggle is mounted", () => {
  const f = fixture()
  f.start()
  const row = f.header()
  assert.equal(f.toggle().getAttribute("aria-label"), "Subagents")
  assert.equal(f.toggle().getAttribute("aria-pressed"), "false")
  assert.equal(row.querySelector("[data-agents-dock]"), null)
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  assert.equal(f.registered("panel").length + f.registered("titlebar-item").length + f.registered("menu-item").length, 0)
  assert.equal(f.intervals.size, 0)
  f.stop()
})

test("side panel closed: the toggle docks a column in the timeline row and removes it again", async () => {
  const f = fixture()
  f.start()
  const row = f.header()
  running(f, ["c1"])
  await open(f)
  assert.ok(row.hasAttribute("data-agents-docked"))
  assert.equal(row.querySelectorAll("[data-agents-dock]").length, 1)
  assert.match(row.querySelector("[data-agents-heading]")!.textContent!, /Subagents\s*·\s*1 running/)
  assert.equal(f.toggle().getAttribute("aria-pressed"), "true")
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  await open(f)
  assert.equal(row.querySelector("[data-agents-dock]"), null)
  assert.equal(row.hasAttribute("data-agents-docked"), false)
  f.stop()
})

test("cleanup removes the dock and the row attribute", async () => {
  const f = fixture()
  f.start()
  const row = f.header()
  await open(f)
  assert.ok(row.querySelector("[data-agents-dock]"))
  f.stop()
  assert.equal(row.querySelector("[data-agents-dock]"), null)
  assert.equal(row.hasAttribute("data-agents-docked"), false)
})

test("side panel open: the dock hides and the same button opens a popover; Escape and outside click close it", async () => {
  const f = fixture()
  f.start()
  const row = f.header()
  running(f, ["c1"])
  await open(f)
  f.setSide(true)
  await f.flush()
  assert.equal(row.querySelector("[data-agents-dock]"), null)
  assert.equal(f.toggle().getAttribute("aria-pressed"), "false")
  await open(f)
  const pop = f.doc.querySelector("[data-agents-popover]")!
  assert.ok(pop)
  assert.ok(pop.querySelector("[data-component=menu-v2-content] [data-agents-row]"))
  assert.equal(f.toggle().getAttribute("aria-pressed"), "true")
  f.doc.dispatchEvent(new (f.doc.defaultView as any).KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  await f.flush()
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  await open(f)
  f.doc.body.dispatchEvent(new (f.doc.defaultView as any).Event("pointerdown", { bubbles: true }))
  await f.flush()
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  // The dock returns, still opted in for this session, once the side panel closes.
  f.setSide(false)
  await f.flush()
  assert.equal(row.querySelectorAll("[data-agents-dock]").length, 1)
  f.stop()
})

test("closing the side panel closes an open popover", async () => {
  const f = fixture()
  f.start()
  f.header()
  f.setSide(true)
  await open(f)
  assert.ok(f.doc.querySelector("[data-agents-popover]"))
  f.setSide(false)
  await f.flush()
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  f.stop()
})

test("scope: only this session's descendants and shells; not siblings, other trees or other sessions", async () => {
  const f = fixture()
  f.start()
  const row = f.header()
  const other = { ...child("o1"), parentID: "other", title: "Other tree" }
  const sibling = { ...child("s1"), parentID: "root", title: "Sibling" }
  const grand = { ...child("g1"), parentID: "c1", title: "Grandchild" }
  running(f, ["c1", "o1", "s1", "g1"], [child("c1"), other, sibling, grand])
  f.setBackground([{ id: "sh1", type: "shell", label: "sleep 300" }])
  await open(f)
  const text = () => f.rows().map((r) => r.textContent)
  assert.equal(f.rows().length, 3)
  assert.ok(text().some((t) => /Hold 5 min/.test(t!)))
  assert.ok(text().some((t) => /Grandchild/.test(t!)))
  assert.ok(text().some((t) => /sleep 300/.test(t!)))
  assert.ok(!text().some((t) => /Other tree|Sibling/.test(t!)))
  // The other parent sees only its own child.
  f.setCurrent("other")
  await f.flush()
  assert.equal(f.rows().length, 0)
  await open(f)
  assert.deepEqual(text().map((t) => /Other tree/.test(t!)), [true])
  assert.ok(row)
  f.stop()
})

test("rows: description and elapsed, no agent type, subagent wording only", async () => {
  const f = fixture()
  f.start()
  f.header()
  running(f, ["c1", "c2"], [child("c1"), child("c2", { title: "Other" })])
  await open(f)
  assert.equal(f.rows().length, 2)
  assert.match(f.rows()[0].textContent!, /Hold 5 min/)
  assert.doesNotMatch(f.rows()[0].textContent!, /General|@general/i)
  assert.match(f.doc.body.textContent!, /Subagents\s*·\s*2 running/)
  assert.doesNotMatch(f.doc.body.textContent!, /sub-agent|sub agent|\bAgents\b/i)
  assert.equal(f.toggle().getAttribute("aria-label"), "Subagents · 2")
  assert.equal(f.doc.querySelector("[data-agents-badge]")!.textContent, "2")
  f.setRunning([])
  await f.flush()
  assert.equal(f.rows().length, 0)
  assert.match(f.doc.body.textContent!, /No subagents running/)
  f.stop()
})

test("subagent rows use the host's radar spinner markup, not Loader", async () => {
  const f = fixture()
  f.start()
  f.header()
  running(f, ["c1"])
  await open(f)
  const svg = f.rows()[0].querySelector("svg[data-component=session-progress-indicator-v2]")!
  assert.equal(svg.getAttribute("viewBox"), "0 0 16 16")
  assert.equal(svg.getAttribute("data-slot"), "spinner-dots")
  assert.equal(svg.querySelectorAll("rect").length, 25)
  assert.equal(svg.querySelectorAll("rect[style*=animation]").length, 24)
  f.stop()
})

test("elapsed ticks only while rows exist and stops with them and on cleanup", async () => {
  const f = fixture()
  f.start()
  f.header()
  await open(f)
  assert.equal(f.intervals.size, 0)
  running(f, ["c1"])
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
  f.header()
  running(f, ["c1"])
  f.setBackground([{ id: "sh1", type: "shell", label: "sleep 300" }])
  await open(f)
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
  assert.match(f.calls.toasts[0].title, /subagent/)
  f.stop()
})

test("row click opens the child session tab", async () => {
  const f = fixture()
  f.start()
  f.header()
  running(f, ["c1"])
  await open(f)
  f.rows()[0].click()
  assert.deepEqual(f.calls.opened, [[{ server: "server", id: "c1" }, { focus: true }]])
  f.stop()
})

test("elapsed format matches the host's", () => {
  assert.equal(formatElapsed(23_000), "23s")
  assert.equal(formatElapsed(336_000), "5m 36s")
  assert.equal(formatElapsed(3_720_000), "1h 02m")
  assert.equal(formatElapsed(-5), "0s")
})
