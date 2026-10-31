import type { ComposerNote, IconName } from "@opencode/plugin/gui"

export const ORIGIN = "session-drag"
export const ICON: IconName = "speech-bubble"
export const HREF_PREFIX = "session-drag:"

/** A session a row or a palette pick names: enough to attach a note and to open the session later. */
export type SessionTarget = { readonly server: string; readonly id: string; readonly title: string }

/** The host's own wire form of a session mention (`util/src/session-mention.ts`), so agents parse it as a mention. */
export const token = (id: string) => `@session:${id}`

export const href = (target: Pick<SessionTarget, "server" | "id">) => `${HREF_PREFIX}${target.server}/${target.id}`

export function parseHref(value: string): { server: string; id: string } | undefined {
  if (!value.startsWith(HREF_PREFIX)) return
  const rest = value.slice(HREF_PREFIX.length)
  const slash = rest.indexOf("/")

  if (slash <= 0) return
  const id = rest.slice(slash + 1)

  if (!id.startsWith("ses_")) return

  return { server: rest.slice(0, slash), id }
}

/**
 * The chip the composer shows and the sentence the model reads: "The user referenced session @session:ses_… ("…")."
 * The id leads so an agent can hand it to a session tool; the title is quoted because the model wrote it.
 */
export function note(target: SessionTarget, commentID: ComposerNote["commentID"] = crypto.randomUUID()): ComposerNote {
  return {
    type: "note",
    origin: ORIGIN,
    commentID,
    label: target.title,
    title: target.title,
    subtitle: "Session",
    icon: ICON,
    subject: `session ${token(target.id)} (${JSON.stringify(target.title)})`,
    comment: "",
    href: href(target),
  }
}

/** Live session tabs in the sidebar, and the snooze-archive plugin's Snoozed/Archived rows. */
export const ROW_SELECTOR = '[data-slot="vertical-tabs"] [data-tab-key], [data-sa-row]'

const INERT = '[data-slot="tab-close"], [contenteditable="true"], [data-editing="true"], input, textarea, button'

export type RowRef = { kind: "tab"; key: string } | { kind: "archive"; server: string; id: string }

/** The row a press lands on, unless it lands on a control the row owns (close, rename). */
export function rowFromTarget(target: EventTarget | null): HTMLElement | undefined {
  // An element, by duck type: the tests run where `Element` is not a global.
  const element = target && "closest" in target ? (target as Element) : undefined
  const row = element?.closest<HTMLElement>(ROW_SELECTOR)

  if (!element || !row) return
  const control = element.closest(INERT)

  if (control && row.contains(control)) return

  return row
}

export function rowRef(row: HTMLElement): RowRef | undefined {
  const key = row.getAttribute("data-tab-key")

  if (key) return { kind: "tab", key }
  const archive = row.getAttribute("data-sa-row")

  if (!archive) return
  const split = archive.indexOf("\n")

  if (split <= 0) return

  return { kind: "archive", server: archive.slice(0, split), id: archive.slice(split + 1) }
}

export function rowTitle(row: HTMLElement) {
  return row.querySelector('[data-slot="tab-title"]')?.textContent?.trim() ?? ""
}

/** The element the host navigates from on mousedown; archive rows act on click instead. */
export function rowLink(row: HTMLElement) {
  return row.querySelector<HTMLElement>('[data-slot="tab-link"]') ?? row
}

export const isTabRow = (row: HTMLElement) => row.hasAttribute("data-tab-key")
