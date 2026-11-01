import { getOwner, onCleanup, runWithOwner, type JSX } from "solid-js"
import { render } from "solid-js/web"

const ROW = "[data-timeline-row='UserMessage'][data-message-id]"
const TIMELINE = "[data-slot='session-timeline-scroll']"
const HOST_ATTR = "data-injected-host"
const MOUNT_ATTR = "data-injected-mount"

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

/**
 * The host has no message-renderer registry, so a message the plugin renders is a host `UserMessage` timeline row whose bubble
 * (`[data-component=user-message]`) is hidden by CSS and whose content slot gets the plugin's row appended in the same frame the
 * host adds it. The row, its id and its footer stay the host's (virtualisation, copy, retry, timeline-rail ids). Call inside
 * `setup(ctx)`: mounts run under the setup owner, which carries the app's contexts a rAF callback does not, and cleanup removes
 * what was added. Only the timeline scroll regions are observed, only their added nodes are searched, and nothing runs while
 * `known` is empty.
 */
export function mountInjectedRows<T>(options: InjectedRowsOptions<T>): InjectedRows {
  const { kind } = options
  const owner = getOwner()
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
  // False when the row is one of ours whose content slot is not there yet; the next frame scan retries it.
  const decorateRow = (row: HTMLElement, known: ReadonlyMap<string, T>) => {
    const item = known.get(row.dataset.messageId ?? "")
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
  const decorate = () => {
    frame = undefined
    if (disposed) return
    sweep()
    const known = options.known()
    if (known.size === 0) return
    for (const timeline of watched) for (const row of timeline.querySelectorAll<HTMLElement>(ROW)) decorateRow(row, known)
  }
  const schedule = () => {
    if (!disposed) frame ??= requestAnimationFrame(decorate)
  }

  // Rows only appear inside a timeline's scroll region, so that is all the observer watches. Cached timelines stay mounted, and a
  // new one arrives with a session switch, so the regions are looked up again then.
  const watched = new Set<Element>()
  // Mutation callbacks run before the next paint, so a row the host adds is swapped before it is ever drawn.
  const observer = new MutationObserver((records) => {
    if (disposed) return
    const known = options.known()
    if (known.size === 0) return
    let retry = false
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        const element = node as Element
        if (element.matches(ROW)) retry ||= !decorateRow(element as HTMLElement, known)
        else if (element.firstElementChild) for (const row of element.querySelectorAll<HTMLElement>(ROW)) retry ||= !decorateRow(row, known)
      }
    }
    if (retry) schedule()
  })
  let looking: number | undefined
  const locate = (attempts: number) => {
    looking = undefined
    if (disposed) return
    for (const timeline of watched) if (!timeline.isConnected) watched.delete(timeline)
    for (const timeline of document.querySelectorAll(TIMELINE)) {
      if (watched.has(timeline)) continue
      watched.add(timeline)
      observer.observe(timeline, { childList: true, subtree: true })
      schedule()
    }
    if (attempts > 0) looking = requestAnimationFrame(() => locate(attempts - 1))
  }
  const look = () => {
    if (looking === undefined && !disposed) looking = requestAnimationFrame(() => locate(12))
  }
  look()

  onCleanup(() => {
    disposed = true
    observer.disconnect()
    watched.clear()
    if (frame !== undefined) cancelAnimationFrame(frame)
    if (looking !== undefined) cancelAnimationFrame(looking)
    for (const host of [...mounted.keys()]) drop(host)
    for (const row of document.querySelectorAll(`[${HOST_ATTR}="${kind}"]`)) row.removeAttribute(HOST_ATTR)
  })

  return { schedule, look }
}
