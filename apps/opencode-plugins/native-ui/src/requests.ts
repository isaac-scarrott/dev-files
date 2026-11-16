// A pending request for a person: a permission the agent waits on, or a form that asks something. The host keeps both per
// session in its synced data; this is the one place that says which of those count as a request and reads them into one
// shape, for the plugins that raise attention, notify or list them. No imports: a GUI half and a plain unit test both use it.

/** The form kinds that are a person's request. Other forms (a plugin's own auth card, a settings prompt) are not. */
export const REQUEST_FORM_KINDS: ReadonlySet<unknown> = new Set(["question", "mcp-elicitation", "websearch.provider"])

export type RequestKind = "permission" | "form"

/** One thing waiting for an answer. */
export interface PendingRequest {
  /** The server's `ServerRef.id`. */
  readonly server: string
  /** The session that asked; a subagent's request names the subagent. */
  readonly session: string
  /** The root session of that session's family, which is where a request is shown. */
  readonly root: string
  readonly kind: RequestKind
  /** The host's id: a permission request id, or a form id. */
  readonly id: string
  /** The question, or what the permission is for, as one line. */
  readonly text: string
  /**
   * When the host raised it. The host keeps no time for a request, so this is the asking session's own last update as the
   * closest proxy, and 0 when that is unknown. A reader that needs an age records when it first saw the request.
   */
  readonly createdAt: number
  /** A form's metadata `kind` (`question`, `mcp-elicitation`, `websearch.provider`). Absent for a permission. */
  readonly formKind?: string
  /** A form with one field: the field's key, its choices and whether typing an own answer is allowed. */
  readonly field?: {
    readonly key: string
    readonly options: readonly { readonly value: string; readonly label: string }[]
    readonly custom: boolean
  }
}

interface Timed {
  readonly time?: { readonly updated?: unknown }
}

/** A session's last update from whatever the host returned, or 0 when it keeps none. */
const updatedAt = (info: unknown): number => {
  const time = (info as Timed | undefined)?.time
  return typeof time?.updated === "number" && Number.isFinite(time.updated) ? time.updated : 0
}

interface PermissionLike {
  readonly id: string
  readonly action?: string
  readonly resources?: readonly string[]
  readonly message?: string
}

interface FieldLike {
  readonly key: string
  readonly title?: string
  readonly description?: string
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  readonly custom?: boolean
}

interface FormLike {
  readonly id: string
  readonly title?: string
  readonly metadata?: Record<string, unknown>
  readonly fields?: readonly FieldLike[]
}

/** The slice of one server's synced data these readers need. */
export interface RequestData {
  readonly session: {
    /** The host's session info; only `time.updated` is read, and it may be absent. */
    get(sessionID: string): unknown
    root(sessionID: string): string
    permission: {
      list(sessionID: string): readonly PermissionLike[] | undefined
      sessions?(): readonly string[]
      sync(sessionID: string): Promise<void>
    }
    form: {
      list(sessionID: string): readonly FormLike[] | undefined
      sessions?(): readonly string[]
      sync(sessionID: string): Promise<void>
    }
  }
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim()

const permissionText = (permission: PermissionLike) => {
  if (permission.message) return oneLine(permission.message)
  const action = permission.action ?? "permission"
  const resources = permission.resources?.join(", ")
  return resources ? `${action} ${resources}` : action
}

const formText = (form: FormLike) => {
  const field = form.fields?.[0]
  return oneLine(field?.description ?? field?.title ?? form.title ?? "Question")
}

const singleField = (form: FormLike): PendingRequest["field"] => {
  if (form.fields?.length !== 1) return undefined
  const field = form.fields[0]!
  return { key: field.key, options: field.options ?? [], custom: field.custom === true }
}

/**
 * The requests waiting on one session, or on every session the server knows has pending lists. Permissions come first, as a
 * permission outranks a question wherever both are shown. Forms outside `REQUEST_FORM_KINDS` are left out.
 */
export function pendingRequests(data: RequestData, input: { readonly server: string; readonly session?: string }): PendingRequest[] {
  const sessions =
    input.session !== undefined
      ? [input.session]
      : [
          ...new Set([
            ...(data.session.permission.sessions?.() ?? []),
            ...(data.session.form.sessions?.() ?? []),
          ]),
        ]
  const out: PendingRequest[] = []
  for (const session of sessions) {
    const root = data.session.root(session)
    const createdAt = updatedAt(data.session.get(session))
    for (const permission of data.session.permission.list(session) ?? []) {
      out.push({ server: input.server, session, root, kind: "permission", id: permission.id, text: permissionText(permission), createdAt })
    }
  }
  for (const session of sessions) {
    const root = data.session.root(session)
    const createdAt = updatedAt(data.session.get(session))
    for (const form of data.session.form.list(session) ?? []) {
      const formKind = form.metadata?.kind
      if (!REQUEST_FORM_KINDS.has(formKind)) continue
      out.push({
        server: input.server,
        session,
        root,
        kind: "form",
        id: form.id,
        text: formText(form),
        createdAt,
        formKind: typeof formKind === "string" ? formKind : undefined,
        field: singleField(form),
      })
    }
  }
  return out
}

/** Whether a request the host just announced is still waiting (it may have been answered or auto-approved meanwhile). */
export function requestPending(data: RequestData, kind: RequestKind, sessionID: string, id: string): boolean {
  const list = kind === "permission" ? data.session.permission.list(sessionID) : data.session.form.list(sessionID)
  return list === undefined || list.some((item) => item.id === id)
}

/** Loads both pending lists of a session once: requests asked before this window existed are not in its events. */
export function syncRequests(data: RequestData, sessionID: string): Promise<void> {
  return Promise.all([data.session.permission.sync(sessionID), data.session.form.sync(sessionID)]).then(() => undefined)
}
