// The panel's list: the host's pending permissions and question forms from every server, plus the `ask_isaac` asks the
// server half holds, read into one row shape. Pure, so the merge, blocking and waiter rules are unit-tested.

import type { PendingRequest } from "../../native-ui/src/requests.js"
import { normalise } from "./merge.js"
import type { AskView } from "./rpc.js"

/** What the panel needs to know about one session. */
export interface SessionView {
  readonly title: string
  readonly project: string
  readonly root: string
  readonly running: boolean
}

export type RowKind = "permission" | "form" | "ask"

export interface Row {
  /** Unique row id: `host:server:kind:id` or `ask:<number>`. */
  readonly key: string
  readonly server: string
  readonly session: string
  readonly root: string
  readonly project: string
  readonly title: string
  readonly kind: RowKind
  /** The host's request id, or the ask's number as text. */
  readonly id: string
  /** The permission or the question, as one line. */
  readonly text: string
  readonly createdAt: number
  readonly ageMin: number
  /** Times asked; above 1 for a re-asked question or ask. */
  readonly asks: number
  /** A permission, a built-in question, or an `ask_isaac` that blocks an idle session. */
  readonly blocked: boolean
  /** Idle sessions of the asker's family other than the asker itself. */
  readonly waiters: number
  /** An `ask_isaac`'s suggested answers. */
  readonly options?: readonly string[]
  /** A single-question form's field, for answering it in place. */
  readonly field?: PendingRequest["field"]
  /** The `ask_isaac` record this row answers, over RPC. */
  readonly askId?: number
}

export interface RowInput {
  readonly now: number
  /** The server that runs plugins: the `ask_isaac` records come from it. */
  readonly builtin: string | undefined
  readonly requests: readonly PendingRequest[]
  readonly asks: readonly AskView[]
  readonly session: (server: string, session: string) => SessionView | undefined
  readonly family: (server: string, session: string) => readonly string[]
  /** When each row was first seen (`key` → ms); a host request carries no time of its own. */
  readonly firstSeen: ReadonlyMap<string, number>
  /** Filled with rows seen now, so the next build knows their age. */
  readonly seen: Map<string, number>
}

const HOST = "host"

export function buildRows(input: RowInput): Row[] {
  const rows: Row[] = []
  const present = new Set<string>()

  const add = (row: Omit<Row, "ageMin">) => {
    present.add(row.key)
    if (!input.seen.has(row.key)) input.seen.set(row.key, input.now)
    rows.push({ ...row, ageMin: Math.max(0, (input.now - row.createdAt) / 60_000) })
  }

  const sessionOf = (server: string, id: string) => input.session(server, id)
  const waitersOf = (server: string, session: string) =>
    input.family(server, session).filter((id) => id !== session && sessionOf(server, id)?.running !== true).length

  const questionCounts = new Map<string, number>()
  for (const request of input.requests) {
    if (request.kind !== "form" || request.formKind !== "question") continue
    const key = `${request.root}\u0000${normalise(request.text)}`
    questionCounts.set(key, (questionCounts.get(key) ?? 0) + 1)
  }

  for (const request of input.requests) {
    if (request.kind === "form" && request.formKind !== "question") continue
    const key = `${HOST}:${request.server}:${request.kind}:${request.id}`
    const info = sessionOf(request.server, request.session)
    const group = request.kind === "form" ? questionCounts.get(`${request.root}\u0000${normalise(request.text)}`) ?? 1 : 1
    add({
      key,
      server: request.server,
      session: request.session,
      root: request.root,
      project: info?.project ?? "",
      title: info?.title ?? "",
      kind: request.kind,
      id: request.id,
      text: request.text,
      createdAt: input.firstSeen.get(key) ?? input.now,
      asks: group,
      blocked: request.kind === "permission" || request.kind === "form",
      waiters: waitersOf(request.server, request.session),
      ...(request.field !== undefined ? { field: request.field } : {}),
    })
  }

  const builtin = input.builtin ?? ""
  for (const ask of input.asks) {
    const info = sessionOf(builtin, ask.session)
    const running = info?.running === true
    add({
      key: `ask:${ask.id}`,
      server: builtin,
      session: ask.session,
      root: ask.root,
      project: info?.project ?? "",
      title: info?.title ?? "",
      kind: "ask",
      id: String(ask.id),
      text: ask.question,
      createdAt: ask.createdAt,
      asks: ask.asks,
      blocked: ask.blocking && !running,
      waiters: waitersOf(builtin, ask.session),
      ...(ask.options !== undefined && ask.options.length > 0 ? { options: ask.options } : {}),
      askId: ask.id,
    })
  }

  for (const key of [...input.seen.keys()]) if (!present.has(key)) input.seen.delete(key)
  return rows
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact age with no "ago": now, 5m, 2h, 3d. A timestamp slightly ahead of the clock reads "now". */
export function formatAge(ms: number): string {
  const age = Math.max(0, ms)
  if (age < MINUTE) return "now"
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`
  if (age < DAY) return `${Math.floor(age / HOUR)}h`
  return `${Math.floor(age / DAY)}d`
}
