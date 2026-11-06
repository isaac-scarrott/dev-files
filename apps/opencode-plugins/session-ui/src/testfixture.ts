import { createRoot, createSignal } from "solid-js"
import { Window } from "happy-dom"
import { delegate, fakeUi } from "./testui"

// A whole plugin under a fake host: the real setup, a fake `ctx`, and a window. Both the snooze and the archive plugin's
// tests run their own setup against it, so what is shared here is the host, not the plugin.

export interface StoredSnooze { server: string; id: string; title: string; at: number; until: number; updated: number; busy: number }
export interface WokeEntry { server: string; id: string }

// `host`: extra markup inside the vertical sidebar; `bound`: command ids the host's keybind lookup answers for;
// `dedicated`: the client has archive/unarchive calls; `id`: the plugin id the host would give `ctx`.
export interface FixtureExtra { options?: Record<string, unknown>; host?: string; bound?: string[]; dedicated?: boolean; openThrows?: boolean; id?: string }

type PluginLike = { setup?: (ctx: any) => unknown }

export function fixture<P extends PluginLike>(plugin: P, initial: StoredSnooze[] = [], initialWoke: WokeEntry[] = [], extra: FixtureExtra = {}) {
  type Context = Parameters<NonNullable<P["setup"]>>[0]
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-tab-key="tab"><div data-titlebar-tab><span data-slot="tab-title">Host title</span></div></div></div></div>${extra.host ?? ""}</aside>`
  const globals = { window, document: doc, Node: window.Node, HTMLElement: window.HTMLElement, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, globals)
  delegate(doc)
  const [servers, setServers] = createSignal<string[]>([])
  const [state, setState] = createSignal({ entries: initial })
  const [wokeState, setWokeState] = createSignal({ entries: initialWoke })
  const [connected, setConnected] = createSignal(true)
  const listeners = new Map<string, Set<(e: any) => void>>()
  const commands = new Map<string, { run(): Promise<void> | void }>()
  const calls = { closed: [] as string[], opened: [] as unknown[], updates: [] as unknown[], toasts: [] as any[], list: 0, listInputs: [] as any[], requestSync: 0, metadataReads: 0, removed: [] as unknown[], confirms: [] as any[], dedicated: [] as unknown[] }
  let permissions: unknown[] | undefined = []
  let forms: unknown[] | undefined = []
  let family: string[] | undefined = []
  const childRequests = new Map<string, { permissions?: unknown[]; forms?: unknown[] }>()
  let metadata: "ready" | "missing" | "no-time" = "ready"
  let sync = async () => {}
  let archiveError = false
  let listImpl: ((input: any) => any) | undefined
  let getImpl: ((input: any) => any) | undefined
  let select = ""
  let confirmResult = true
  let removeError = false
  const slots: any[] = []
  let archived = false
  let parentID: string | undefined
  const info = () => { calls.metadataReads++; return metadata === "missing" ? undefined : ({ id: "s", title: "Session", parentID, time: metadata === "no-time" ? undefined : { updated: 1, ...(archived ? { archived: 1 } : {}) }, location: { directory: "/repo" } }) }
  const server = {
    id: "server", name: "Local", compatible: true, get connected() { return connected() },
    client: { session: {
      list: async (input: any) => { calls.list++; calls.listInputs.push(input); if (archiveError) throw new Error("offline"); if (listImpl) return listImpl(input); return { data: archived ? [info()] : [], cursor: {} } },
      get: async (input: any) => getImpl ? getImpl(input) : info(),
      remove: async (input: unknown) => { calls.removed.push(input); if (removeError) throw new Error("server refused") },
      update: async (input: { archived: boolean }) => { calls.updates.push(input); if (archiveError) throw new Error("denied"); archived = input.archived },
      ...(extra.dedicated ? {
        archive: async (input: unknown) => { calls.dedicated.push(["archive", input]); archived = true },
        unarchive: async (input: unknown) => { calls.dedicated.push(["unarchive", input]); archived = false },
      } : {}),
    } },
    data: {
      on: (name: string, fn: (e: any) => void) => {
        const handlers = listeners.get(name) ?? new Set()
        handlers.add(fn); listeners.set(name, handlers)
        return () => { handlers.delete(fn) }
      },
      session: {
        get: () => info(), sync: () => sync(), family: () => family, root: (id: string) => id,
        permission: { sync: async () => { calls.requestSync++ }, list: (id: string) => id === "s" ? permissions : childRequests.get(id)?.permissions },
        form: { sync: async () => { calls.requestSync++ }, list: (id: string) => id === "s" ? forms : childRequests.get(id)?.forms },
      },
    },
  }
  const session = { id: "s", server, pending: false }
  const [current, setCurrent] = createSignal<typeof session | undefined>(session)
  const [tabs, setTabs] = createSignal([{ key: "tab", session }])
  // `ctx` is the plugin's own context type, so `setup` below is checked against it; the fake members are not, because the
  // plugin's type is only known through `P` here.
  const ctx = {
    id: extra.id ?? "test",
    ui: fakeUi(doc),
    options: extra.options ?? {},
    keybinds: { keybind: (id: string) => extra.bound?.includes(id) ? ["⌘", "K"] : [] },
    router: { path: () => "/" },
    signal: new AbortController().signal,
    add: (_: unknown, item: unknown) => { const value = (typeof item === "function" ? item() : item) as { at?: string; id?: string }; if (value.at) slots.push(value); else if (value.id) commands.set(value.id, value as { run(): void | Promise<void> }); return () => {} },
    servers: { list: servers, get: (id: string) => servers().includes(id) ? server : undefined },
    sessions: { current: () => current() },
    tabs: { list: tabs, close: (key: string) => { calls.closed.push(key); setTabs((list) => list.filter((tab) => tab.key !== key)) }, open: (...args: unknown[]) => { if (extra.openThrows) throw new Error("open failed"); calls.opened.push(args) } },
    dialogs: { confirm: async (options: unknown) => { calls.confirms.push(options); return confirmResult }, select: async () => select || String(Date.now() + 3_600_000), prompt: async () => "30m" },
    toast: { show: (toast: unknown) => { calls.toasts.push(toast); return { dismiss() {} } } },
  } as unknown as Record<string, unknown>
  // The stores are not what the plugin's own jest checks: each plugin's store shape is checked by its setup's use of them.
  Object.assign(ctx, { stores: {
    snoozes: { get value() { return state() }, update: (fn: (draft: { entries: StoredSnooze[] }) => void) => {
      const draft = structuredClone(state()); fn(draft); setState(draft)
    } },
    woke: { get value() { return wokeState() }, update: (fn: (draft: { entries: WokeEntry[] }) => void) => {
      const draft = structuredClone(wokeState()); fn(draft); setWokeState(draft)
    } },
  } })
  let cleanup: unknown
  let dispose = () => {}
  const start = () => createRoot((stop) => { dispose = stop; cleanup = plugin.setup!(ctx as Context) })
  const stop = () => { dispose(); if (typeof cleanup === "function") (cleanup as () => void)() }
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
  return {
    calls, commands, listeners, doc, state, addSnooze: (entry: StoredSnooze | undefined) => setState({ entries: entry ? [entry] : [] }), woke: wokeState, addWoke: () => setWokeState({ entries: [{ server: "server", id: "s" }] }), setCurrent: (value: boolean) => setCurrent(value ? session : undefined), start, stop, flush, setServers, setConnected,
    permissions: (value: unknown[] | undefined) => { permissions = value },
    forms: (value: unknown[] | undefined) => { forms = value },
    family: (value: string[] | undefined) => { family = value },
    child: (id: string, value: { permissions?: unknown[]; forms?: unknown[] }) => childRequests.set(id, value),
    metadata: (value: typeof metadata) => { metadata = value },
    sync: (value: () => Promise<void>) => { sync = value },
    archived: (value: boolean) => { archived = value },
    parent: (value: string | undefined) => { parentID = value },
    pending: (value: boolean) => { session.pending = value },
    slots, confirm: (value: boolean) => { confirmResult = value }, removeError: (value: boolean) => { removeError = value },
    fail: (value: boolean) => { archiveError = value },
    select: (value: string) => { select = value },
    listWith: (fn: (input: any) => any) => { listImpl = fn }, getWith: (fn: (input: any) => any) => { getImpl = fn },
    openArchive: () => { const toggle = doc.querySelector<HTMLButtonElement>('[data-sa-group="archived"] [data-sa-toggle] button'); if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click() },
    reopen: () => setTabs([{ key: "tab", session }]),
    emit: (name: string, sessionID = "s") => listeners.get(name)?.forEach((fn) => fn({ created: Date.now() + 1, data: { sessionID } })),
    // A prompt delivered to a session's inbox; by default what the composer stamps, else what another sender stamps (`null`: nothing).
    deliver: (sessionID = "s", metadata: Record<string, unknown> | null = { displayText: "hi", agent: "build" }, type = "user") => listeners.get("session.inbox.enqueued")?.forEach((fn) => fn({ created: Date.now() + 1, data: { sessionID, item: { type, delivery: "queue", payload: { text: "hi", ...(metadata ? { metadata } : {}) } } } })),
    async close() {
      stop(); await window.happyDOM.close()
      for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
    },
  }
}
