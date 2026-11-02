// Loads a plugin's built GUI bundle the way the desktop host does and checks it set up and tore down cleanly.
// Nothing here imports a package: the plugin's own node_modules supply Solid and happy-dom, so the bundle and the
// harness share one Solid instance. Run under `node --conditions=browser`.
import Module, { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

/** Deep stand-in for a host API nobody configured: any property is another stand-in, a call returns undefined. */
function inert() {
  const target = () => undefined
  return new Proxy(target, {
    get: (_, key) => (key === "then" || typeof key === "symbol" ? undefined : inert()),
    apply: () => undefined,
  })
}

/** Declared stores at their initial values. A session store has not loaded, so its value is undefined. */
function stores(declared = {}) {
  const out = {}
  for (const [name, declaration] of Object.entries(declared)) {
    if (declaration.scope === "session") {
      out[name] = () => ({ value: undefined, update: () => undefined, set: () => undefined })
      continue
    }
    const handle = { value: structuredClone(declaration.initial) }
    handle.update = (change) => change(handle.value)
    handle.set = (next) => void (handle.value = next)
    out[name] = handle
  }
  return out
}

function installDom(require) {
  const { Window } = require("happy-dom")
  const window = new Window()
  const forced = new Set(["Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "PointerEvent", "FocusEvent", "InputEvent"])
  const names = Object.getOwnPropertyNames(window).filter((name) => /^[A-Z]/.test(name) && (forced.has(name) || !(name in globalThis)))
  for (const name of [...names, "window", "document", "getComputedStyle", "matchMedia", "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback"]) {
    let value
    try {
      value = name === "window" ? window : window[name]
      if (typeof value === "function" && /^[a-z]/.test(name)) value = value.bind(window)
    } catch {
      continue
    }
    if (value === undefined) continue
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
  return window
}

/** Counts what a plugin leaves running: timers, frames, observers, document/window listeners. */
function meter(window) {
  const live = { timers: new Set(), intervals: new Set(), frames: new Set(), observers: new Set(), listeners: new Map() }
  const keep = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }

  const timer = (set, make, clear) => [
    (fn, ms, ...rest) => {
      let handle
      handle = make(
        (...args) => {
          if (set === live.timers) set.delete(handle)
          return fn?.(...args)
        },
        ms,
        ...rest,
      )
      set.add(handle)
      return handle
    },
    (handle) => {
      set.delete(handle)
      return clear(handle)
    },
  ]
  for (const target of [globalThis, window]) {
    const [st, ct] = timer(live.timers, keep.setTimeout, keep.clearTimeout)
    const [si, ci] = timer(live.intervals, keep.setInterval, keep.clearInterval)
    Object.assign(target, { setTimeout: st, clearTimeout: ct, setInterval: si, clearInterval: ci })
    if (typeof target.requestAnimationFrame === "function") {
      const raf = target.requestAnimationFrame.bind(target)
      const caf = target.cancelAnimationFrame.bind(target)
      target.requestAnimationFrame = (fn) => {
        let handle
        handle = raf((time) => {
          live.frames.delete(handle)
          fn(time)
        })
        live.frames.add(handle)
        return handle
      }
      target.cancelAnimationFrame = (handle) => {
        live.frames.delete(handle)
        caf(handle)
      }
    }
  }

  for (const name of ["MutationObserver", "ResizeObserver", "IntersectionObserver"]) {
    const Base = globalThis[name]
    if (!Base) continue
    const Metered = class extends Base {
      observe(...args) {
        live.observers.add(this)
        return super.observe(...args)
      }
      disconnect() {
        live.observers.delete(this)
        return super.disconnect()
      }
    }
    Object.defineProperty(Metered, "name", { value: name })
    globalThis[name] = Metered
    window[name] = Metered
  }

  for (const [label, target] of [["document", window.document], ["window", window]]) {
    const add = target.addEventListener.bind(target)
    const remove = target.removeEventListener.bind(target)
    target.addEventListener = (type, listener, options) => {
      const key = `${label}:${type}:${typeof options === "object" ? !!options?.capture : !!options}`
      const entries = live.listeners.get(key) ?? new Set()
      entries.add(listener)
      live.listeners.set(key, entries)
      if (typeof options === "object" && options?.signal) options.signal.addEventListener("abort", () => entries.delete(listener), { once: true })
      return add(type, listener, options)
    }
    target.removeEventListener = (type, listener, options) => {
      live.listeners.get(`${label}:${type}:${typeof options === "object" ? !!options?.capture : !!options}`)?.delete(listener)
      return remove(type, listener, options)
    }
  }

  return {
    leaks() {
      const found = []
      if (live.timers.size) found.push(`${live.timers.size} timeout(s)`)
      if (live.intervals.size) found.push(`${live.intervals.size} interval(s)`)
      if (live.frames.size) found.push(`${live.frames.size} animation frame(s)`)
      if (live.observers.size) found.push(`${live.observers.size} observer(s)`)
      for (const [key, set] of live.listeners) if ([...set].some((fn) => fn.name !== "eventHandler")) found.push(`${set.size} listener(s) ${key}`)
      return found
    },
    stop() {
      for (const handle of live.timers) keep.clearTimeout(handle)
      for (const handle of live.intervals) keep.clearInterval(handle)
    },
  }
}

/**
 * @param {object} input
 * @param {string} input.dir plugin directory (holds package.json, dist/, node_modules/)
 * @param {string[]} input.registries registry ids the plugin must have contributed to by the end of setup
 * @param {Record<string, unknown>} [input.options] plugin options for `ctx.options`
 * @param {Record<string, unknown>} [input.host] host members to override inert stand-ins, by name (`{ screen: {...} }`)
 * @param {string} [input.server] server bundle relative to dir; checked for a plugin definition
 * @returns {Promise<{ added: string[], leaks: string[] }>}
 */
export async function smokeGui({ dir, registries, options = {}, host = {}, server }) {
  const root = resolve(dir)
  const require = createRequire(join(root, "package.json"))
  const window = installDom(require)
  const meters = meter(window)
  const solid = require("solid-js")
  // The host runs a newer engine than the Node that runs CI.
  Promise.try ??= (fn, ...args) => new Promise((resolve) => resolve(fn(...args)))

  const bundle = join(root, "dist", "gui-experimental.cjs")
  if (!existsSync(bundle)) throw new Error(`missing ${bundle}`)
  // The host hands the bundle its shared modules. The SDK package only exports ESM entries, so load their files.
  const sdkRoot = join(root, "node_modules/@opencode/plugin/dist")
  const sdk = (request) => {
    const sub = request.slice("@opencode/plugin/".length)
    return require(join(sdkRoot, sub === "gui" ? "gui/index.js" : `${sub}.js`))
  }
  const load = Module._load
  Module._load = function (request, ...rest) {
    return request.startsWith("@opencode/plugin/") ? sdk(request) : load.call(this, request, ...rest)
  }
  let definition
  try {
    definition = require(bundle).default
  } finally {
    Module._load = load
  }
  if (!definition || typeof definition.setup !== "function") throw new Error("bundle has no default definition with setup")

  const abort = new AbortController()
  const added = []
  const removed = new Set()
  const i18n = definition.i18n?.en ?? {}
  const base = {
    id: "smoke",
    options,
    signal: abort.signal,
    t: (key) => i18n[key] ?? key,
    plural: (key) => i18n[key] ?? key,
    list: () => [],
    add(registry, item) {
      const entry = { id: registry.id, item }
      added.push(entry)
      return () => void removed.add(entry)
    },
    provide: () => () => undefined,
    use: () => () => ({ status: "pending" }),
    stores: stores(definition.stores),
  }
  // An empty app: no sessions, tabs or servers. `host` replaces any of these.
  const empty = {
    sessions: { list: () => [], current: () => undefined },
    tabs: { list: () => [], current: () => undefined },
    servers: { list: () => [], get: () => undefined },
    screen: { current: () => undefined },
    router: { path: () => "/" },
    commands: { run: () => false },
    desktop: undefined,
  }
  const members = { ...empty, ...host }
  const ctx = new Proxy(base, {
    get: (target, key) => (key in target ? target[key] : key in members ? members[key] : inert()),
  })

  let dispose
  // Setup runs synchronously under the root owner, as the host runs it. It may return a cleanup; a thenable is refused.
  let cleanup
  solid.createRoot((close) => {
    dispose = close
    const result = definition.setup(ctx)
    if (result && typeof result.then === "function") throw new Error("setup returned a thenable; the host rejects that")
    cleanup = result
  })

  const seen = new Set(added.map((entry) => entry.id))
  const missing = registries.filter((id) => !seen.has(id))
  if (missing.length) throw new Error(`setup did not contribute to: ${missing.join(", ")} (got ${[...seen].join(", ") || "nothing"})`)

  if (typeof cleanup === "function") cleanup()
  dispose()
  abort.abort()
  await new Promise((done) => setImmediate(done))
  const leaks = meters.leaks()
  meters.stop()
  if (leaks.length) throw new Error(`left running after dispose: ${leaks.join("; ")}`)

  if (server) {
    const mod = await import(new URL(`file://${join(root, server)}`).href)
    if (!mod.default?.id || typeof mod.default.setup !== "function") throw new Error(`${server} has no plugin definition`)
  }

  return { added: [...seen], leaks }
}
