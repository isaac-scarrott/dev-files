import { Rpc } from "@opencode/plugin/rpc"
import type { Field } from "./fields.js"
import type { Source } from "./broker.js"
import type { SavedRule } from "./rules.js"
import type { AuditEntry } from "./audit.js"

const request = {
  type: "object",
  properties: { requestID: { type: "string" } },
  required: ["requestID"],
  additionalProperties: false,
} as const

const reply = {
  type: "object",
  properties: { accepted: { type: "boolean" } },
  required: ["accepted"],
  additionalProperties: false,
} as const

const candidate = {
  type: "object",
  properties: {
    key: { type: "string" },
    account: { type: "string" },
    label: { type: "string" },
    state: { enum: ["ready", "locked"] },
    methods: { type: "array", items: { enum: ["masterPassword", "serviceAccount", "apiKey"] } },
    item: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } }, required: ["id", "title"], additionalProperties: false },
    covered: { type: "boolean" },
    confirm: { type: "boolean" },
    flow: {
      type: "object",
      properties: { parts: { type: "array", items: { type: "string" } }, always: { type: "array", items: { type: "string" } }, minutes: { type: "number" } },
      required: ["parts", "always", "minutes"],
      additionalProperties: false,
    },
    once: { type: "boolean" },
  },
  required: ["key", "account", "label", "state", "methods", "covered"],
  additionalProperties: false,
} as const

/** Where a field's value can come from: the accounts that hold it, which one is chosen, or why none can. */
const source = {
  type: "object",
  properties: {
    state: { enum: ["choose", "unavailable"] },
    candidates: { type: "array", items: candidate },
    selected: { type: "string" },
    hint: { type: "string" },
  },
  required: ["state", "candidates"],
  additionalProperties: false,
} as const

const requestedSchema = {
  type: "object",
  properties: {
    requestID: { type: "string" },
    sessionID: { type: "string" },
    callID: { type: "string" },
    messageID: { type: "string" },
    reason: { type: "string" },
    origin: { type: "string" },
    via: { enum: ["get", "fill"] },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          label: { type: "string" },
          kind: { enum: ["text", "email", "secret", "otp"] },
          masked: { type: "boolean" },
          source,
        },
        required: ["name", "label", "kind", "masked"],
        additionalProperties: false,
      },
    },
  },
  required: ["requestID", "sessionID", "callID", "messageID", "reason", "fields"],
  additionalProperties: false,
} as const

export const Blindfold = Rpc.define({
  id: "blindfold",
  methods: {
    // `values` are the typed fields; `picks` chooses a candidate per provider field (default: the selected one);
    // `remember` is "Always allow": a saved rule for each provider field. `flow` says the user approved the whole sign-in the
    // card offered (the server checks it against its own copy of the offer).
    submit: {
      input: {
        type: "object",
        properties: {
          requestID: { type: "string" },
          values: { type: "object", additionalProperties: { type: "string", minLength: 1 } },
          picks: { type: "object", additionalProperties: { type: "string" } },
          remember: { type: "boolean" },
          flow: { type: "boolean" },
        },
        required: ["requestID", "values"],
        additionalProperties: false,
      },
      output: reply,
    },
    // Unlocks an account for an open request. The secrets travel only here, in `input`; the reply carries the vendor's
    // first error line (never a value) when it failed.
    unlock: {
      input: {
        type: "object",
        properties: {
          requestID: { type: "string" },
          account: { type: "string" },
          input: {
            type: "object",
            properties: {
              method: { enum: ["masterPassword", "serviceAccount", "apiKey"] },
              password: { type: "string" },
              token: { type: "string" },
              clientId: { type: "string" },
              clientSecret: { type: "string" },
            },
            required: ["method"],
            additionalProperties: false,
          },
        },
        required: ["requestID", "account", "input"],
        additionalProperties: false,
      },
      output: { type: "object", properties: { accepted: { type: "boolean" }, error: { type: "string" } }, required: ["accepted"], additionalProperties: false },
    },
    // The saved rules, the accounts' lock state and the recent uses, for the settings page.
    overview: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", properties: { rules: { type: "array", items: { type: "object" } }, accounts: { type: "array", items: { type: "object" } }, audit: { type: "array", items: { type: "object" } } }, required: ["rules", "accounts", "audit"], additionalProperties: false },
    },
    revoke: { input: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, output: reply },
    lock: { input: { type: "object", properties: { account: { type: "string" } }, required: ["account"], additionalProperties: false }, output: reply },
    ack: { input: request, output: reply },
    // What is still waiting, so a window that reloaded while a card was open shows it again.
    list: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", properties: { requests: { type: "array", items: requestedSchema } }, required: ["requests"], additionalProperties: false },
    },
    cancel: { input: request, output: reply },
  },
  events: {
    requested: {
      schema: requestedSchema,
    },
    // The request changed (an account was unlocked): the card shows the new rows.
    updated: {
      schema: {
        type: "object",
        properties: { requestID: { type: "string" }, fields: requestedSchema.properties.fields },
        required: ["requestID", "fields"],
        additionalProperties: false,
      },
    },
    // A sign-in approved on this card was used: how many of its fields have been filled so far.
    flowed: {
      schema: {
        type: "object",
        properties: { requestID: { type: "string" }, count: { type: "number" } },
        required: ["requestID", "count"],
        additionalProperties: false,
      },
    },
    // Rules or account state changed: the settings page reloads.
    changed: { schema: { type: "object", properties: {}, additionalProperties: false } },
    resolved: {
      schema: {
        type: "object",
        properties: { requestID: { type: "string" }, status: { enum: ["submitted", "cancelled", "timeout", "unavailable"] } },
        required: ["requestID", "status"],
        additionalProperties: false,
      },
    },
  },
})

export type SecretResolved = { requestID: string; status: "submitted" | "cancelled" | "timeout" | "unavailable" }

export type RequestedField = Field & { source?: Source }

export type SecretRequested = {
  requestID: string
  sessionID: string
  callID: string
  messageID: string
  reason: string
  /** The page the secrets are for, when the agent named one. */
  origin?: string
  via?: "get" | "fill"
  fields: RequestedField[]
}

export type AccountState = { id: string; label: string; kind: string; state: "unlocked" | "locked" | "unavailable"; reason?: string; expiresAt?: number }
export type Overview = { rules: SavedRule[]; accounts: AccountState[]; audit: AuditEntry[] }
