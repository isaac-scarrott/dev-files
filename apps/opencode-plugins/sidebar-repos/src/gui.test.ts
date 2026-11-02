import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createRoot, createSignal } from "solid-js"
import plugin from "./gui"
import { fake } from "../../test-utils/fake"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]

function fixture() {
  const window = new Window()
  const document = window.document
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  const resizeTargets = new Set<Element>()
  const observers = new Set<object>()
  // happy-dom's own timers keep whenAsyncComplete pending forever; the plugin's one interval is faked.
  const intervals = new Map<number, { fn: () => void; ms: number }>()
  let nextInterval = 0
  Object.assign(window, {
    setInterval: (fn: () => void, ms: number) => { intervals.set(++nextInterval, { fn, ms }); return nextInterval },
    clearInterval: (id: number) => { intervals.delete(id) },
  })
  const globals = {
    window,
    document,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    MutationObserver: class extends window.MutationObserver {
      constructor(callback: MutationCallback) {
        super((records, observer) => {
          callback(records as unknown as MutationRecord[], observer as unknown as MutationObserver)
        })
        observers.add(this)
      }
      disconnect() {
        super.disconnect()
        observers.delete(this)
      }
    },
    ResizeObserver: class {
      observe(element: Element) { resizeTargets.add(element) }
      unobserve(element: Element) { resizeTargets.delete(element) }
      disconnect() { resizeTargets.clear() }
    },
  }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, globals)
  document.body.innerHTML = `<div data-slot="vertical-tabs"><div data-tab-key="a" data-orientation="vertical">
    <div data-titlebar-tab data-orientation="vertical" data-status="attention">
      <a data-slot="tab-link"><span data-slot="project-avatar-slot"><img src="repo.png"></span><span data-slot="tab-title">Original</span></a>
      <div data-slot="tab-status"><span data-mark="attention"></span><span data-mark="unread"></span><svg data-busy-ring></svg></div>
    </div></div></div>`
  const [hydrated, setHydrated] = createSignal(false)
  const [requests, setRequests] = createSignal<{ permissions?: unknown[]; forms?: unknown[] }>({})
  const [branch, setBranch] = createSignal("main")
  const calls = { vcs: 0, permission: 0, form: 0, message: 0 }
  const [messages, setMessages] = createSignal<{ type: "user" | "assistant"; time: { created: number; completed?: number } }[]>([])
  const [updated, setUpdated] = createSignal(1000)
  const session = {
    id: "s", location: { directory: "/git/worktree" },
    server: { id: "srv", data: {
      session: {
        get: () => hydrated() ? { projectID: "p", time: { updated: updated() } } : undefined,
        message: { list: messages, sync: async () => { calls.message++ } },
        permission: { list: () => requests().permissions, sync: async () => { calls.permission++ } },
        form: { list: () => requests().forms, sync: async () => { calls.form++ } },
      },
      project: { get: () => hydrated() ? { canonical: "/git/repository" } : undefined },
      location: { vcs: {
        info: () => hydrated() ? { branch: { current: branch() } } : undefined,
        sync: async () => { calls.vcs++ },
      } },
    } },
  }
  type Session = Omit<typeof session, "location"> & { location?: typeof session.location }
  const [tabs, setTabs] = createSignal<{ key: string; session: Session }[]>([])
  const [sessions, setSessions] = createSignal<Session[]>([])
  let dispose = () => {}
  let cleanup: ReturnType<NonNullable<typeof plugin.setup>>
  const styles: string[] = []
  const iconNames: string[] = []
  const ui = { Icon: (props: { name: string }) => { iconNames.push(props.name); return document.createElement("svg") } }
  const ctx = fake<Context>({ sessions: { list: sessions }, tabs: { list: tabs }, ui, add: (_, css) => { styles.push(css as string); return () => {} } })
  const start = () => createRoot((stop) => { dispose = stop; cleanup = plugin.setup!(ctx) })
  const stop = () => { dispose(); if (typeof cleanup === "function") void cleanup() }
  const deliver = () => window.happyDOM.whenAsyncComplete()
  const paint = async () => {
    await deliver()
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(0))
    await deliver()
  }
  return {
    document, session, calls, intervals, setMessages, setUpdated, iconNames, styles, frames, resizeTargets, observers,
    setHydrated, setRequests, setBranch, setTabs, setSessions, start, stop, paint, deliver,
    async close() {
      stop()
      await window.happyDOM.close()
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    },
  }
}

test("setup survives empty host APIs and unhydrated stores, then follows hydration", async () => {
  const f = fixture()
  try {
    f.start()
    await f.paint()
    assert.equal(f.document.querySelector("[data-sidebar-repo]"), null)
    f.setSessions([f.session])
    f.setTabs([{ key: "a", session: f.session }])
    await f.paint()
    assert.equal(f.document.querySelector("[data-sidebar-repo]")?.textContent, "worktree")
    const dot = f.document.querySelector("[data-mark='attention']")!
    assert.ok(dot)
    const style = f.document.createElement("style")
    style.textContent = f.styles[0]
    f.document.head.append(style)
    assert.notEqual(f.document.defaultView!.getComputedStyle(dot).display, "none")
    f.setHydrated(true)
    f.setRequests({ permissions: [], forms: [{}] })
    await f.paint()
    assert.equal(f.document.querySelector("[data-sidebar-repo]")?.textContent, "repository")
    assert.equal(f.document.querySelector("[data-titlebar-tab]")?.getAttribute("data-sidebar-attention"), "question")
    assert.equal(f.document.defaultView!.getComputedStyle(dot).display, "none")
    f.setRequests({ permissions: [{}], forms: [{}] })
    await f.paint()
    assert.equal(f.document.querySelector("[data-titlebar-tab]")?.getAttribute("data-sidebar-attention"), "permission")
    f.setRequests({})
    await f.paint()
    assert.notEqual(f.document.defaultView!.getComputedStyle(dot).display, "none")
    assert.deepEqual(f.calls, { vcs: 0, permission: 1, form: 1, message: 1 })
  } finally { await f.close() }
})

test("setup ignores the branch, follows rename, row replacement and switching without self-write frames", async () => {
  const f = fixture()
  try {
    f.setSessions([f.session]); f.setTabs([{ key: "a", session: f.session }]); f.setHydrated(true)
    f.start()
    await f.paint()
    assert.equal(f.frames.size, 0, "injection must not schedule a second frame")
    f.setBranch("feature/rename")
    await f.paint()
    const title = f.document.querySelector("[data-slot='tab-title']")!
    const avatar = f.document.querySelector("img")!
    title.textContent = "Renamed"
    await f.paint()
    assert.equal(title.textContent, "Renamed")
    assert.equal(f.document.querySelector("img"), avatar)
    assert.equal(f.document.querySelector("[data-sidebar-repo]")?.textContent, "repository")
    assert.ok(f.document.querySelector("[data-busy-ring]"))
    assert.ok(f.document.querySelector("[data-mark='unread']"))
    const old = f.document.querySelector("[data-titlebar-tab]")!
    old.replaceWith(old.cloneNode(true))
    await f.paint()
    assert.equal(f.resizeTargets.size, 1)
    assert.equal(f.resizeTargets.has(old as unknown as Element), false)
    f.setTabs([{ key: "b", session: f.session }])
    f.document.querySelector("[data-tab-key]")!.setAttribute("data-tab-key", "b")
    await f.paint()
    assert.equal(f.document.querySelectorAll("[data-sidebar-repo]").length, 1)
    assert.equal(f.frames.size, 0)
  } finally { await f.close() }
})

test("cleanup cancels pending frames, removes contributions and reload leaves one observer", async () => {
  const f = fixture()
  try {
    f.setSessions([f.session]); f.setTabs([{ key: "a", session: f.session }])
    f.start(); await f.paint()
    f.setHydrated(true)
    assert.equal(f.frames.size, 1)
    f.stop()
    assert.equal(f.frames.size, 0)
    assert.equal(f.observers.size, 0)
    assert.equal(f.resizeTargets.size, 0)
    assert.equal(f.document.querySelector("[data-sidebar-repo], [data-sidebar-status-icon], [data-sidebar-attention]"), null)
    f.setBranch("after-cleanup"); await f.deliver()
    assert.equal(f.frames.size, 0)
    f.start(); await f.paint()
    assert.equal(f.observers.size, 1)
    assert.equal(f.resizeTargets.size, 1)
    assert.equal(f.document.querySelectorAll("[data-sidebar-repo]").length, 1)
    assert.equal(f.document.querySelectorAll("[data-sidebar-status-icon]").length, 2)
    assert.ok(f.iconNames.includes("warning") && f.iconNames.includes("help"))
    assert.equal(f.frames.size, 0)
  } finally { await f.close() }
})

test("only the sidebar tab region is observed, and a replaced region is found again", async () => {
  const f = fixture()
  try {
    f.setSessions([f.session]); f.setTabs([{ key: "a", session: f.session }]); f.setHydrated(true)
    f.start()
    await f.paint()
    // A streaming reply elsewhere adds nodes every frame and must schedule nothing.
    const timeline = f.document.createElement("div")
    f.document.body.append(timeline)
    for (let i = 0; i < 20; i++) timeline.append(f.document.createElement("span"))
    await f.deliver()
    assert.equal(f.frames.size, 0)
    // The sidebar remounts: the new region is observed once a frame notices it is gone.
    const region = f.document.querySelector("[data-slot='vertical-tabs']")!
    const next = region.cloneNode(true) as typeof region
    next.querySelector("[data-sidebar-repo]")?.remove()
    region.replaceWith(next)
    f.setTabs([{ key: "a", session: f.session }])
    await f.paint()
    await f.paint()
    assert.equal(next.querySelectorAll("[data-sidebar-repo]").length, 1)
    next.querySelector("[data-tab-key]")!.setAttribute("data-tab-key", "z")
    await f.deliver()
    assert.equal(f.frames.size, 1)
  } finally { await f.close() }
})

test("sessions without a location still sync attention requests", async () => {
  const f = fixture()
  try {
    const session = { ...f.session, location: undefined }
    f.setSessions([session])
    f.setTabs([{ key: "a", session }])
    f.start()
    await f.paint()
    assert.deepEqual(f.calls, { vcs: 0, permission: 1, form: 1, message: 1 })
    f.setRequests({ permissions: [{}] })
    await f.paint()
    assert.equal(f.document.querySelector("[data-titlebar-tab]")?.getAttribute("data-sidebar-attention"), "permission")
  } finally { await f.close() }
})

test("the trailing fade is one mask on the link, not on the title or badge lines", async () => {
  const f = fixture()
  try {
    f.start()
    const css = f.styles[0]
    const masks = [...css.matchAll(/([^{}]+)\{[^}]*(?<!-webkit-)mask-image: linear-gradient/g)].map((match) => match[1].trim())
    assert.equal(masks.length, 1)
    assert.match(masks[0], /\[data-slot='tab-link'\]$/)
    assert.doesNotMatch(masks[0], /tab-title|data-sidebar-repo/)
    assert.match(css, /--sidebar-fade: 30px/)
    assert.match(css, /--sidebar-fade: 56px/)
  } finally {
    await f.close()
  }
})

test("an idle row shows its last message time, follows new messages, hides on a status and ticks on one timer", async () => {
  const f = fixture()
  try {
    f.document.querySelector("[data-titlebar-tab]")!.removeAttribute("data-status")
    const tab = f.document.querySelector("[data-titlebar-tab]")!
    const slot = f.document.createElement("div")
    slot.setAttribute("data-slot", "tab-close")
    tab.append(slot)
    f.setHydrated(true)
    f.setSessions([f.session])
    f.setTabs([{ key: "a", session: f.session }])
    f.setUpdated(Date.now() - 2 * 3600_000)
    f.start()
    await f.paint()
    const time = () => f.document.querySelector("[data-slot=tab-close] [data-sidebar-time]")
    assert.equal(time()?.textContent, "2h", "falls back to session.time.updated")
    f.setMessages([{ type: "user", time: { created: Date.now() - 5 * 60_000 } }])
    await f.paint()
    assert.equal(time()?.textContent, "5m", "the latest message wins")
    assert.ok(f.document.querySelector("[data-sidebar-repo]")?.getAttribute("title")?.includes("Last active"))
    tab.setAttribute("data-status", "unread")
    await f.paint()
    assert.equal(time(), null, "a status indicator hides it")
    tab.removeAttribute("data-status")
    await f.paint()
    assert.equal(time()?.textContent, "5m")
    assert.deepEqual([...f.intervals.values()].map((i) => i.ms), [30_000], "one 30s timer, not one per row")
    assert.equal(f.calls.message, 1, "messages synced once per thread")
    f.stop()
    assert.equal(f.intervals.size, 0)
    assert.equal(f.document.querySelector("[data-sidebar-time]"), null)
  } finally { await f.close() }
})
