import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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
    MutationObserver: (globalThis as any).window.MutationObserver,
    PointerEvent: (globalThis as any).window.PointerEvent,
    MouseEvent: (globalThis as any).window.MouseEvent,
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
  const calls = { interrupt: [] as unknown[], shell: [] as unknown[], opened: [] as unknown[], closed: [] as string[], navigated: [] as string[], toasts: [] as any[], toggled: [] as unknown[] }
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
  const [tabList, setTabList] = createSignal<any[]>([])
  const [memory, setMemory] = createStore({ done: false })
  const [mode, setMode] = createStore({ enabled: true })
  const ctx = {
    id: "agents-panel", signal: new AbortController().signal, ui,
    add: (kind: { id: string }, item: any) => { added.push({ kind: kind.id, item }) },
    sessions: { current: mounted },
    layout: { ready: () => true },
    tabs: {
      list: () => tabList(),
      close: (key: string) => { calls.closed.push(key) },
    },
    stores: { mode: { get value() { return mode }, update: (fn: (draft: { enabled: boolean }) => void) => setMode(produce(fn)) } },
    storage: { memory: () => [memory, (fn: (draft: { done: boolean }) => void) => setMemory(produce(fn))] },
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
  const header = (active = true) => {
    doc.body.innerHTML = `<div id="header"></div>`
    createRoot((stop) => {
      const previousDispose = dispose
      dispose = () => { stop(); previousDispose() }
      const view = registered("slot")[0].render({ get active() { return active }, get session() { return mounted() } })
      insert(doc.getElementById("header")!, view)
    })
    return doc.getElementById("header")!
  }
  const stop = () => { dispose(); for (const [key, d] of previous) d ? Object.defineProperty(globalThis, key, d) : delete (globalThis as any)[key] }
  const rows = () => [...doc.querySelectorAll("[data-agents-row]")] as HTMLElement[]
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
  const toggle = () => doc.querySelector("[data-agents-toggle] button") as HTMLButtonElement
  return {
    doc, calls, intervals, rows, header, toggle, start, stop, flush, registered,
    setInfos, setFamily, setRunning, setBackground, setCurrent, setTabList, setMemory, server, session, mode, setEnabled: (value: boolean) => setMode("enabled", value),
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
  f.header()
  assert.equal(f.toggle().getAttribute("aria-label"), "Subagents")
  assert.equal(f.toggle().getAttribute("aria-pressed"), "false")
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  assert.equal(f.registered("slot").length, 1)
  assert.equal(f.registered("panel").length + f.registered("titlebar-item").length + f.registered("menu-item").length, 0)
  assert.equal(f.intervals.size, 0)
  f.stop()
})

test("the toggle opens one floating popover with the host's menu surface and wears the host's expanded attributes", async () => {
  const f = fixture()
  f.start()
  f.header()
  running(f, ["c1"])
  await open(f)
  assert.equal(f.doc.querySelectorAll("[data-agents-popover]").length, 1)
  assert.ok(f.doc.querySelector("[data-agents-popover] > [data-component=menu-v2-content] [data-agents-row]"))
  assert.match(f.doc.querySelector("[data-agents-heading]")!.textContent!, /Subagents\s*·\s*1 running/)
  assert.equal(f.toggle().getAttribute("aria-pressed"), "true")
  assert.equal(f.toggle().getAttribute("aria-expanded"), "true")
  assert.equal(f.toggle().hasAttribute("data-expanded"), true)
  assert.equal(f.doc.querySelector("[data-agents-dock]"), null)
  await open(f)
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  assert.equal(f.toggle().hasAttribute("data-expanded"), false)
  f.stop()
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
})

test("Escape and an outside click close the popover; Escape returns focus to the button", async () => {
  const f = fixture()
  f.start()
  f.header()
  await open(f)
  f.doc.dispatchEvent(new (f.doc.defaultView as any).KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  await f.flush()
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  assert.equal(f.doc.activeElement, f.toggle())
  await open(f)
  f.doc.body.dispatchEvent(new (f.doc.defaultView as any).Event("pointerdown", { bubbles: true }))
  await f.flush()
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  f.stop()
})

test("routing to another session closes the popover", async () => {
  const f = fixture()
  f.start()
  f.header()
  await open(f)
  f.setCurrent("other")
  await f.flush()
  assert.equal(f.doc.querySelector("[data-agents-popover]"), null)
  f.stop()
})

test("scope: only this session's descendants and shells; not siblings, other trees or other sessions", async () => {
  const f = fixture()
  f.start()
  f.header()
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
  f.setCurrent("other")
  await f.flush()
  await open(f)
  assert.deepEqual(text().map((t) => /Other tree/.test(t!)), [true])
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

test("row click navigates the current tab to the child session route, opening no tab", async () => {
  const f = fixture()
  f.start()
  f.header()
  running(f, ["c1"])
  await open(f)
  const clicked: { href: string; link: boolean }[] = []
  f.doc.addEventListener("click", (event) => {
    const anchor = (event.target as Element).closest("a")
    if (anchor) { clicked.push({ href: anchor.getAttribute("href")!, link: anchor.hasAttribute("link") }); event.preventDefault() }
  })
  f.rows()[0].click()
  assert.deepEqual(clicked, [{ href: "/server/c2VydmVy/session/c1", link: true }])
  assert.equal(f.calls.opened.length, 0)
  assert.equal(f.doc.querySelector("a"), null)
  f.stop()
})

const tab = (key: string, id: string, extra: Record<string, unknown> = {}) => ({ key, active: false, session: { key: `server\n${id}`, id, server: fixtureServer() }, ...extra })
let fixtureServer: () => unknown = () => ({})

test("close subagent tabs: closes child-session tabs, never the active or routed tab, and says how many", async () => {
  const f = fixture()
  fixtureServer = () => f.server
  f.setMemory({ done: true })
  f.start()
  f.setInfos([{ id: "parent", time: { created: 1 } }, { ...child("c1") }, { ...child("c2") }, { ...child("c3") }, { id: "top", time: { created: 1 } }])
  f.setTabList([tab("t-parent", "parent"), tab("t-c1", "c1"), tab("t-c2", "c2", { active: true }), tab("t-top", "top")])
  f.registered("command")[0].run()
  assert.deepEqual(f.calls.closed, ["t-c1"])
  assert.match(f.calls.toasts[0].title, /Closed 1 subagent tab\b/)
  assert.match(f.calls.toasts[0].description, /Recently closed/)
  // The routed session's tab (parent here) is never closed even if it were a child.
  f.setInfos([{ id: "parent", parentID: "x", time: { created: 1 } }])
  f.setTabList([tab("t-parent", "parent")])
  f.calls.closed.length = 0
  f.registered("command")[0].run()
  assert.deepEqual(f.calls.closed, [])
  f.stop()
})

test("automatic cleanup runs once per load, after every tab's session is known", async () => {
  const f = fixture()
  fixtureServer = () => f.server
  f.start()
  f.setTabList([tab("t-parent", "parent", { active: true }), tab("t-c1", "c1")])
  await f.flush()
  assert.deepEqual(f.calls.closed, [])
  f.setInfos([{ id: "parent", time: { created: 1 } }, { ...child("c1") }])
  await f.flush()
  assert.deepEqual(f.calls.closed, ["t-c1"])
  f.setTabList([tab("t-parent", "parent", { active: true }), tab("t-c9", "c1")])
  await f.flush()
  assert.deepEqual(f.calls.closed, ["t-c1"])
  assert.equal(f.calls.toasts.length, 1)
  f.stop()
})

test("automatic cleanup waits until a tab is on screen, so the viewed tab is never judged blind", async () => {
  const f = fixture()
  fixtureServer = () => f.server
  f.start()
  f.setInfos([{ id: "parent", time: { created: 1 } }, { ...child("c1") }])
  f.setTabList([tab("t-parent", "parent"), tab("t-c1", "c1")])
  await f.flush()
  assert.deepEqual(f.calls.closed, [])
  f.stop()
})

test("elapsed format matches the host's", () => {
  assert.equal(formatElapsed(23_000), "23s")
  assert.equal(formatElapsed(336_000), "5m 36s")
  assert.equal(formatElapsed(3_720_000), "1h 02m")
  assert.equal(formatElapsed(-5), "0s")
})

const HOST_LIST = (selected: string) => `
  <div data-action="settings-background-activity" id="sel" data-component="select-v2-root">
    <div data-component="select-v2" id="sel-trigger"><div data-slot="select-v2-value"><span id="sel-value" data-slot="select-v2-value-text">Hidden</span></div></div>
  </div>
  <ul role="listbox" id="sel-listbox">${["off:Hidden", "left:Left", "center:Center", "right:Right"].map((entry) => {
    const [key, name] = entry.split(":")
    const on = key === selected ? " data-selected" : ""
    return `<li role="option" tabindex="-1" aria-selected="${key === selected}" data-key="${key}" id="o-${key}" data-component="menu-v2-item"${on}><span data-slot="menu-v2-item-content"${on}>${name}</span><div data-slot="menu-v2-item-indicator"${on}></div></li>`
  }).join("")}</ul>`

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)) }
const option = (f: ReturnType<typeof fixture>) => f.doc.querySelector("[data-agents-option]") as HTMLElement | null
const valueText = (f: ReturnType<typeof fixture>) => [...f.doc.querySelectorAll("#sel [data-slot=select-v2-value-text]")] as HTMLElement[]

test("setting: the header toggle exists only while the mode is on", () => {
  const f = fixture()
  f.start()
  f.header()
  assert.ok(f.toggle())
  f.setEnabled(false)
  assert.equal(f.toggle(), null)
  f.setEnabled(true)
  assert.ok(f.toggle())
  f.stop()
})

test("setting: the first-run mode is off", () => {
  const source = readFileSync(new URL("./gui.tsx", import.meta.url), "utf8")
  assert.match(source, /Store\.global\(Schema\.Struct\(\{ enabled: Schema\.Boolean \}\), \{ enabled: false \}\)/)
})

test("setting: a fifth option clones the host's markup and sits after the host options", async () => {
  const f = fixture()
  f.setEnabled(false)
  f.start()
  f.doc.body.innerHTML = HOST_LIST("center")
  await settle()
  const ours = option(f)!
  assert.ok(ours)
  assert.equal(ours.parentElement!.lastElementChild, ours)
  assert.equal(ours.getAttribute("data-component"), "menu-v2-item")
  assert.equal(ours.getAttribute("role"), "option")
  assert.equal(ours.hasAttribute("data-key"), false)
  assert.equal(ours.querySelector("[data-slot=menu-v2-item-content]")!.textContent, "Subagents panel")
  assert.equal(ours.getAttribute("aria-selected"), "false")
  assert.equal(f.doc.getElementById("o-center")!.hasAttribute("data-selected"), true)
  f.stop()
})

test("setting: picking it turns the mode on and commits the host's Hidden", async () => {
  const f = fixture()
  f.setEnabled(false)
  f.start()
  f.doc.body.innerHTML = HOST_LIST("center")
  await settle()
  const committed: string[] = []
  for (const key of ["off", "left"]) f.doc.getElementById(`o-${key}`)!.addEventListener("pointerup", () => {
    committed.push(key)
    // What Kobalte does on selection.
    f.doc.getElementById("o-center")!.removeAttribute("data-selected")
    f.doc.getElementById(`o-${key}`)!.setAttribute("data-selected", "")
  })
  option(f)!.dispatchEvent(new (globalThis as any).window.PointerEvent("pointerup", { bubbles: true, cancelable: true }))
  await settle()
  assert.equal(f.mode.enabled, true)
  assert.deepEqual(committed, ["off"])
  assert.equal(option(f)!.getAttribute("aria-selected"), "true")
  assert.equal(option(f)!.hasAttribute("data-selected"), true)
  assert.equal(f.doc.getElementById("sel")!.hasAttribute("data-agents-on"), true)
  assert.deepEqual(valueText(f).map((el) => el.textContent), ["Hidden", "Subagents panel"])
  assert.equal(valueText(f)[1].hasAttribute("data-agents-value"), true)
  f.stop()
})

test("setting: picking a host option leaves the mode, and Hidden counts as one", async () => {
  for (const key of ["center", "off"]) {
    const f = fixture()
    f.start()
    f.doc.body.innerHTML = HOST_LIST("off")
    await settle()
    assert.equal(f.mode.enabled, true)
    f.doc.getElementById(`o-${key}`)!.dispatchEvent(new (globalThis as any).window.PointerEvent("pointerup", { bubbles: true, cancelable: true }))
    await settle()
    assert.equal(f.mode.enabled, false)
    assert.equal(f.doc.getElementById("sel")!.hasAttribute("data-agents-on"), false)
    assert.deepEqual(valueText(f).map((el) => el.textContent), ["Hidden"])
    f.stop()
  }
})

test("setting: a host value changed elsewhere ends the mode", async () => {
  const f = fixture()
  f.start()
  f.doc.body.innerHTML = HOST_LIST("right")
  await settle()
  assert.equal(f.mode.enabled, false)
  f.stop()
})

test("setting: cleanup removes every injected node and attribute", async () => {
  const f = fixture()
  f.start()
  f.doc.body.innerHTML = HOST_LIST("off")
  await settle()
  assert.ok(option(f))
  f.stop()
  assert.equal(option(f), null)
  assert.equal(f.doc.querySelector("[data-agents-value], [data-agents-on]"), null)
})
