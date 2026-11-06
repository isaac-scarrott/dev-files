import { onCleanup } from "solid-js"

// Parametrised by what the plugin injects (it began as the snooze plugin's observer, which now uses this one). A plugin that
// injects into the sidebar creates one of these per window; `own` lists its injected nodes so its own writes never wake it.
// The one MutationObserver of the plugin. The host has no extension point for tab rows, the session menus or the
// sidebar's scroll region, so those are read from its DOM; this is the single place that watches it.
//
// Scope, not the whole document:
// - the vertical sidebar (`SIDEBAR`), and the row it sits in, so a sidebar that mounts or is swapped out is found;
// - `<body>`'s direct children only, so a menu or dialog portal is seen when it mounts, and then that portal's own
//   subtree while it lives. The app root, with the timeline that streams, is never observed.
// Records are filtered once here (ours are dropped) and each subscriber pre-filters the rest, so a streaming reply
// wakes nothing. Work runs in one animation frame; overlays run in the callback, before the menu paints.

export const SIDEBAR = '[data-slot="vertical-tabs-sidebar"]'
const SIDEBAR_ATTRIBUTES = ["data-tab-key", "data-slot"]

// An element was added or removed that is not ours.
export const elementsChangedBut = (own: string) => (record: MutationRecord) =>
  record.type === "childList" && [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1 && !(node as Element).matches(own))

export interface DomHub {
  // The vertical sidebar, found again if the host replaced it.
  sidebar(): Element | undefined
  // `run` happens once per frame after at least one sidebar record for which `wants` is true. Returns a poke to run it anyway.
  watch(wants: (record: MutationRecord) => boolean, run: () => void): () => void
  // Called in the observer callback with every record from a body portal (a menu, a dialog), none from the sidebar.
  overlay(handle: (records: MutationRecord[]) => void): void
  // Look for a sidebar that mounted without a mutation we saw (a route or layout change).
  refresh(): void
}

interface Subscriber { wants(record: MutationRecord): boolean; run(): void; dirty: boolean }

// Must run inside the plugin's owner: every acquisition registers its release at once.
export function createDomHub(doc: Document, schedule: (fn: () => void) => number, cancel: (id: number) => void, own: string, label = "native-ui"): DomHub {
  const subscribers: Subscriber[] = []
  const overlays: ((records: MutationRecord[]) => void)[] = []
  let root: Element | undefined
  let frame: number | undefined

  // The row the sidebar is a child of. It outlives the sidebar (the layout setting adds and removes the sidebar in it), so
  // watching its children finds a sidebar that mounts later; before one was ever seen it is the row that holds `<main>`.
  let shell: Element | undefined
  const locate = () => {
    const next = doc.querySelector(SIDEBAR) ?? undefined
    const row = next?.parentElement ?? (shell?.isConnected ? shell : doc.querySelector("main")?.parentElement) ?? undefined
    if (row && row !== shell) { shell = row; observer.observe(row, { childList: true }) }
    if (next === root) return false
    root = next
    if (next) observer.observe(next, { childList: true, subtree: true, attributes: true, attributeFilter: SIDEBAR_ATTRIBUTES })
    return true
  }
  const queue = () => { if (frame === undefined) frame = schedule(flush) }
  const flush = () => {
    frame = undefined
    if (locate()) for (const subscriber of subscribers) subscriber.dirty = true
    for (const subscriber of subscribers) {
      if (!subscriber.dirty) continue
      subscriber.dirty = false
      try { subscriber.run() } catch (cause) { console.error(`${label}:`, cause) }
    }
  }
  // A portal's contents arrive after the portal itself: watch it until it goes.
  const portal = (node: Node) => {
    if (node.nodeType !== 1 || (root && (node as Element).contains(root))) return
    observer.observe(node, { childList: true, subtree: true })
  }
  const observer = new doc.defaultView!.MutationObserver((records) => {
    const loose: MutationRecord[] = []
    let moved = false
    for (const record of records) {
      const target = record.target as Element
      if (target === doc.body) { moved = true; record.addedNodes.forEach(portal); loose.push(record) }
      else if (root?.contains(target)) {
        if (target.closest(own)) continue
        for (const subscriber of subscribers) if (!subscriber.dirty && subscriber.wants(record)) subscriber.dirty = true
      } else if (target === shell) moved = true
      else loose.push(record)
    }
    if (loose.length) for (const handle of overlays) handle(loose)
    if (moved || subscribers.some((subscriber) => subscriber.dirty)) queue()
  })
  onCleanup(() => { observer.disconnect(); if (frame !== undefined) cancel(frame) })
  observer.observe(doc.body, { childList: true })
  locate()

  return {
    sidebar() {
      if (!root?.isConnected) locate()
      return root
    },
    watch(wants, run) {
      const subscriber: Subscriber = { wants, run, dirty: false }
      subscribers.push(subscriber)
      onCleanup(() => { subscribers.splice(subscribers.indexOf(subscriber), 1) })
      return () => { subscriber.dirty = true; queue() }
    },
    overlay(handle) {
      overlays.push(handle)
      onCleanup(() => { overlays.splice(overlays.indexOf(handle), 1) })
    },
    refresh: queue,
  }
}
