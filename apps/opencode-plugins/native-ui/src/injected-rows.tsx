import { getOwner, onCleanup, runWithOwner, type JSX } from "solid-js"
import { render } from "solid-js/web"

const ROW = "[data-timeline-row='UserMessage'][data-message-id]"
const TIMELINE = "[data-slot='session-timeline-scroll']"
const HOST_ATTR = "data-injected-host"
const MOUNT_ATTR = "data-injected-mount"
// Plugins that show injected messages each bundle this file. They share one observer per window through this key, so three
// plugins cost one observer, not three (every record the host's timeline produces is delivered to each observer). The suffix is
// the protocol: a bundle with a different shape would use another key rather than misread this one.
const HUB = Symbol.for("opencode-plugins.injected-rows.v1")

export interface InjectedRowsOptions<T> {
  /** Which kind of message this plugin shows (`peer`, `monitor`, `scheduler`); its mounts carry it. */
  kind: string
  /** The messages of the open sessions this plugin renders, by message id. Reactive: the host's message store drives it. */
  known: () => ReadonlyMap<string, T>
  render(item: T): JSX.Element
}

export interface InjectedRows {
  /** Decorate every row in view on the next frame. Call when `known` changes. */
  schedule(): void
  /** Find the timeline scroll regions again (a new one arrives with a session switch). Call when the routed session changes. */
  look(): void
}

interface Member {
  /** Whether this plugin has anything to show; a plugin with nothing costs a size check per mutation batch. */
  active(): boolean
  /** False when the row is one of this member's but its content slot is not mounted yet. */
  decorate(row: HTMLElement): boolean
  scan(timeline: Element): void
  schedule(): void
}

interface Hub {
  readonly members: Set<Member>
  readonly watched: Set<Element>
  readonly observer: MutationObserver
  looking: number | undefined
}

function hubOf(): Hub {
  const holder = window as unknown as Record<symbol, Hub | undefined>
  const existing = holder[HUB]
  if (existing) return existing
  const members = new Set<Member>()
  // Mutation callbacks run before the next paint, so a row the host adds is swapped before it is ever drawn.
  const observer = new MutationObserver((records) => {
    const live = [...members].filter((member) => member.active())
    if (live.length === 0) return
    const retry = new Set<Member>()
    const visit = (row: HTMLElement) => {
      for (const member of live) if (!member.decorate(row)) retry.add(member)
    }
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        const element = node as Element
        if (element.matches(ROW)) visit(element as HTMLElement)
        else if (element.firstElementChild) for (const row of element.querySelectorAll<HTMLElement>(ROW)) visit(row)
      }
    }
    for (const member of retry) member.schedule()
  })
  const hub: Hub = { members, watched: new Set(), observer, looking: undefined }
  holder[HUB] = hub
  return hub
}

// Rows only appear inside a timeline's scroll region, so that is all the observer watches. Cached timelines stay mounted, and a
// new one arrives with a session switch, so the regions are looked up again then.
function locate(hub: Hub, attempts: number): void {
  hub.looking = undefined
  for (const timeline of hub.watched) if (!timeline.isConnected) hub.watched.delete(timeline)
  for (const timeline of document.querySelectorAll(TIMELINE)) {
    if (hub.watched.has(timeline)) continue
    hub.watched.add(timeline)
    hub.observer.observe(timeline, { childList: true, subtree: true })
    for (const member of hub.members) member.scan(timeline)
  }
  if (attempts > 0 && hub.members.size > 0) hub.looking = requestAnimationFrame(() => locate(hub, attempts - 1))
}

function look(hub: Hub): void {
  if (hub.looking === undefined && hub.members.size > 0) hub.looking = requestAnimationFrame(() => locate(hub, 12))
}

/**
 * The host has no message-renderer registry, so a message the plugin renders is a host `UserMessage` timeline row whose bubble
 * (`[data-component=user-message]`) is hidden by CSS and whose content slot gets the plugin's row appended in the same frame the
 * host adds it. The row, its id and its footer stay the host's (virtualisation, copy, retry, timeline-rail ids). Call inside
 * `setup(ctx)`: mounts run under the setup owner, which carries the app's contexts a rAF callback does not, and cleanup removes
 * what was added. Only the timeline scroll regions are observed, only their added nodes are searched, and nothing runs while
 * no plugin has a message to show.
 */
export function mountInjectedRows<T>(options: InjectedRowsOptions<T>): InjectedRows {
  const { kind } = options
  const owner = getOwner()
  const hub = hubOf()
  const mountSelector = `[${MOUNT_ATTR}="${kind}"]`

  for (const stale of document.querySelectorAll(mountSelector)) {
    stale.closest(`[${HOST_ATTR}]`)?.removeAttribute(HOST_ATTR)
    stale.remove()
  }
  const mounted = new Map<HTMLElement, () => void>()
  const drop = (host: HTMLElement) => {
    mounted.get(host)?.()
    mounted.delete(host)
    host.remove()
  }
  const sweep = () => {
    for (const host of [...mounted.keys()]) if (!host.isConnected) drop(host)
  }

  let frame: number | undefined
  let disposed = false
  const decorateRow = (row: HTMLElement) => {
    const item = options.known().get(row.dataset.messageId ?? "")
    if (item === undefined || row.querySelector(mountSelector)) return true
    const content = row.querySelector("[data-slot='session-turn-message-content']")
    if (!content) return false
    row.setAttribute(HOST_ATTR, kind)
    const host = document.createElement("div")
    host.setAttribute(MOUNT_ATTR, kind)
    host.style.display = "contents"
    content.append(host)
    mounted.set(host, runWithOwner(owner, () => render(() => options.render(item), host))!)
    return true
  }
  const scan = (timeline: Element) => {
    if (options.known().size === 0) return
    for (const row of timeline.querySelectorAll<HTMLElement>(ROW)) decorateRow(row)
  }
  const decorate = () => {
    frame = undefined
    if (disposed) return
    sweep()
    if (options.known().size === 0) return
    for (const timeline of hub.watched) scan(timeline)
  }
  const schedule = () => {
    if (!disposed) frame ??= requestAnimationFrame(decorate)
  }

  const member: Member = { active: () => options.known().size > 0, decorate: decorateRow, scan: (timeline) => schedule(), schedule }
  hub.members.add(member)
  look(hub)

  onCleanup(() => {
    disposed = true
    hub.members.delete(member)
    if (hub.members.size === 0) {
      hub.observer.disconnect()
      hub.watched.clear()
      if (hub.looking !== undefined) cancelAnimationFrame(hub.looking)
      delete (window as unknown as Record<symbol, Hub | undefined>)[HUB]
    }
    if (frame !== undefined) cancelAnimationFrame(frame)
    for (const host of [...mounted.keys()]) drop(host)
    for (const row of document.querySelectorAll(`[${HOST_ATTR}="${kind}"]`)) row.removeAttribute(HOST_ATTR)
  })

  return { schedule, look: () => look(hub) }
}
