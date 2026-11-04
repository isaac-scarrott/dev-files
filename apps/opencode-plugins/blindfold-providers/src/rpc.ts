import { Rpc } from "@opencode/plugin/rpc"
import type { AccountView, Overview as ManagerOverview, Tool } from "./manager.js"
import type { Probe } from "./probe.js"
import type { Provider } from "./store.js"

const secrets = {
  type: "object",
  properties: { token: { type: "string" }, clientId: { type: "string" }, clientSecret: { type: "string" } },
  additionalProperties: false,
} as const

const loose = { type: "object" } as const

const reply = {
  type: "object",
  properties: { ok: { type: "boolean" }, error: { type: "string" }, id: { type: "string" }, probe: loose },
  required: ["ok"],
  additionalProperties: false,
} as const

const byId = { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } as const

/**
 * The settings page's calls to the server part. Credentials travel only in `add` and `update` (`secrets`) and in `unlock`
 * (`password`), once, into the keychain or a CLI's stdin; nothing here echoes one, and no reply or event carries one.
 */
export const Providers = Rpc.define({
  id: "blindfold-providers",
  methods: {
    overview: {
      input: { type: "object", properties: { fresh: { type: "boolean" } }, additionalProperties: false },
      output: { type: "object", properties: { accounts: { type: "array", items: loose }, tools: loose, confirmed: loose, file: { type: "string" } }, required: ["accounts", "tools", "confirmed", "file"], additionalProperties: false },
    },
    add: {
      input: {
        type: "object",
        properties: { provider: { enum: ["1password", "bitwarden"] }, settings: loose, secrets },
        required: ["provider", "settings", "secrets"],
        additionalProperties: false,
      },
      output: reply,
    },
    update: { input: { type: "object", properties: { id: { type: "string" }, settings: loose, secrets }, required: ["id"], additionalProperties: false }, output: reply },
    remove: { input: byId, output: reply },
    confirm: { input: { type: "object", properties: { key: { enum: ["opAppIntegrationOff"] }, value: { type: "boolean" } }, required: ["key", "value"], additionalProperties: false }, output: reply },
    lock: { input: byId, output: reply },
    unlock: { input: { type: "object", properties: { id: { type: "string" }, password: { type: "string" } }, required: ["id", "password"], additionalProperties: false }, output: reply },
    test: { input: byId, output: reply },
    verify: { input: { type: "object", properties: { id: { type: "string" }, itemId: { type: "string" } }, required: ["id", "itemId"], additionalProperties: false }, output: reply },
  },
  events: {
    // Accounts or their state changed: the page reloads.
    changed: { schema: { type: "object", properties: {}, additionalProperties: false } },
  },
})

export type Overview = ManagerOverview
export type { AccountView, Probe, Provider, Tool }
export type Reply = { ok: boolean; error?: string; id?: string; probe?: Probe }
