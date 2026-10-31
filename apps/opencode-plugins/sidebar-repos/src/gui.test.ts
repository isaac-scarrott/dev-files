import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createRoot, createSignal } from "solid-js"
import plugin from "./gui"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]

function fixture() {
  const window = new Window()
  const document = window.document
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  const resizeTargets = new Set<Element>()
  const observers = new Set<object>()
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
  document.body.innerHTML = `<div data-tab-key="a" data-orientation="vertical">
    <div data-titlebar-tab data-orientation="vertical" data-status="attention">
      <a data-slot="tab-link"><span data-slot="project-avatar-slot"><img src="repo.png"></span><span data-slot="tab-title">Original</span></a>
      <div data-slot="tab-status"><span data-mark="attention"></span><span data-mark="unread"></span><svg data-busy-ring></svg></div>
    </div></div>`
  const [hydrated, setHydrated] = createSignal(false)
  const [requests, setRequests] = createSignal<{ permissions?: unknown[]; forms?: unknown[] }>({})
  const [branch, setBranch] = createSignal("main")
  const calls = { vcs: 0, permission: 0, form: 0 }
  const session = {
    id: "s", location: { directory: "/git/worktree" },
    server: { data: {
      session: {
        get: () => hydrated() ? { projectID: "p" } : undefined,
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
  const ctx = { sessions: { list: sessions }, tabs: { list: tabs }, add: (_: unknown, css: string) => styles.push(css) } as unknown as Context
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
    document, session, calls, styles, frames, resizeTargets, observers,
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
    assert.equal(f.document.querySelector("[data-sidebar-repo]")?.textContent, "repository · main")
    assert.equal(f.document.querySelector("[data-titlebar-tab]")?.getAttribute("data-sidebar-attention"), "question")
    assert.equal(f.document.defaultView!.getComputedStyle(dot).display, "none")
    f.setRequests({ permissions: [{}], forms: [{}] })
    await f.paint()
    assert.equal(f.document.querySelector("[data-titlebar-tab]")?.getAttribute("data-sidebar-attention"), "permission")
    f.setRequests({})
    await f.paint()
    assert.notEqual(f.document.defaultView!.getComputedStyle(dot).display, "none")
    assert.deepEqual(f.calls, { vcs: 1, permission: 1, form: 1 })
  } finally { await f.close() }
})

test("setup follows branch, rename, row replacement and switching without self-write frames", async () => {
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
    assert.equal(f.document.querySelector("[data-sidebar-repo]")?.textContent, "repository · feature/rename")
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
    assert.equal(f.frames.size, 0)
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
    assert.deepEqual(f.calls, { vcs: 0, permission: 1, form: 1 })
    f.setRequests({ permissions: [{}] })
    await f.paint()
    assert.equal(f.document.querySelector("[data-titlebar-tab]")?.getAttribute("data-sidebar-attention"), "permission")
  } finally { await f.close() }
})
