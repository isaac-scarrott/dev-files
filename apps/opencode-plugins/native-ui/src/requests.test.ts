import assert from "node:assert/strict"
import { test } from "node:test"
import { pendingRequests, requestPending, syncRequests, type RequestData } from "./requests.js"

function rig(input: {
  sessions?: Record<string, { parentID?: string; time?: { updated?: number } }>
  permissions?: Record<string, { id: string; action?: string; resources?: string[]; message?: string }[]>
  forms?: Record<string, { id: string; title?: string; metadata?: Record<string, unknown>; fields?: { key: string; title?: string; description?: string; options?: { value: string; label: string }[]; custom?: boolean }[] }[]>
} = {}) {
  const sessions = input.sessions ?? { ses_1: { time: { updated: 1_000 } } }
  const permissions = input.permissions ?? {}
  const forms = input.forms ?? {}
  const synced: string[] = []
  const data: RequestData = {
    session: {
      get: (id) => sessions[id],
      root: (id) => sessions[id]?.parentID ?? id,
      permission: {
        list: (id) => permissions[id],
        sessions: () => Object.keys(permissions),
        sync: async (id) => void synced.push(`permission:${id}`),
      },
      form: {
        list: (id) => forms[id],
        sessions: () => Object.keys(forms),
        sync: async (id) => void synced.push(`form:${id}`),
      },
    },
  }
  return { data, synced }
}

test("one session: permissions before forms, one line of text, the root and the session's time", () => {
  const { data } = rig({
    sessions: { ses_1: { time: { updated: 5_000 } }, ses_2: { parentID: "ses_1" } },
    permissions: { ses_2: [{ id: "per_1", action: "bash", resources: ["git status", "git diff"] }, { id: "per_2", message: "Read\nsecrets" }] },
    forms: { ses_2: [{ id: "frm_1", title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", title: "Theme", description: "Dark or  light?" }] }] },
  })
  assert.deepEqual(pendingRequests(data, { server: "sidecar", session: "ses_2" }), [
    { server: "sidecar", session: "ses_2", root: "ses_1", kind: "permission", id: "per_1", text: "bash git status, git diff", createdAt: 0 },
    { server: "sidecar", session: "ses_2", root: "ses_1", kind: "permission", id: "per_2", text: "Read secrets", createdAt: 0 },
    {
      server: "sidecar",
      session: "ses_2",
      root: "ses_1",
      kind: "form",
      id: "frm_1",
      text: "Dark or light?",
      createdAt: 0,
      formKind: "question",
      field: { key: "q0", options: [], custom: false },
    },
  ])
})

test("forms outside the host's request kinds are left out; a form's single field carries its options", () => {
  const { data } = rig({
    forms: {
      ses_1: [
        { id: "frm_auth", metadata: { kind: "auth" } },
        { id: "frm_ask", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Pick", options: [{ value: "a", label: "A" }], custom: true }] },
        { id: "frm_two", metadata: { kind: "question" }, fields: [{ key: "q0" }, { key: "q1" }] },
      ],
    },
  })
  const requests = pendingRequests(data, { server: "s", session: "ses_1" })
  assert.deepEqual(requests.map((request) => request.id), ["frm_ask", "frm_two"])
  assert.deepEqual(requests[0]!.field, { key: "q0", options: [{ value: "a", label: "A" }], custom: true })
  assert.equal(requests[1]!.field, undefined, "two fields are answered in the host's dock")
})

test("no session given: every session either list names, once", () => {
  const { data } = rig({
    permissions: { ses_1: [], ses_2: [{ id: "per_1" }] },
    forms: { ses_1: [{ id: "frm_1", metadata: { kind: "question" }, fields: [{ key: "q0", description: "Q" }] }], ses_2: [] },
  })
  assert.deepEqual(
    pendingRequests(data, { server: "s" }).map((request) => `${request.kind}:${request.session}:${request.id}`),
    ["permission:ses_2:per_1", "form:ses_1:frm_1"],
  )})

test("a request is pending until the list says otherwise; a list the window has not synced counts as pending", () => {
  const { data } = rig({ permissions: { ses_1: [{ id: "per_1" }] }, forms: { ses_1: [{ id: "frm_1", metadata: { kind: "question" } }] } })
  assert.equal(requestPending(data, "permission", "ses_1", "per_1"), true)
  assert.equal(requestPending(data, "permission", "ses_1", "per_2"), false)
  assert.equal(requestPending(data, "form", "ses_1", "frm_1"), true)
  assert.equal(requestPending(data, "form", "ses_1", "frm_2"), false)
})

test("syncing loads both lists of the session", async () => {
  const { data, synced } = rig()
  await syncRequests(data, "ses_1")
  assert.deepEqual(synced, ["permission:ses_1", "form:ses_1"])
})
