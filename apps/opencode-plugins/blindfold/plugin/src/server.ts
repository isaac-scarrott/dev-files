import { randomUUID } from "node:crypto"
import { Plugin } from "@opencode/plugin"
import { Error as ToolError, type Result } from "@opencode/plugin/promise/tool"
import { audit as createAudit, defaultAuditFile } from "./audit.js"
import { createBroker, itemFieldOf, type Ask, type Planned } from "./broker.js"
import { MAX_FIELDS, NAME_PATTERN, parseFields, type Field } from "./fields.js"
import { createFills, type FillField } from "./fill.js"
import { readOnePassword } from "./legacy-op.js"
import { accounts as registered, isLocked, originOf, type UnlockInput } from "./providers-contract.js"
import { Redactor } from "./redact.js"
import { Blindfold, type AccountState, type RequestedField } from "./rpc.js"
import { nameRule, parseRules, savedRules, type ConfigRule } from "./rules.js"

const NAMESPACE = "blindfold"
const GET_TOOL = "get"
const FILL_TOOL = "fill"
const GET_TOOL_IDS = new Set([`${NAMESPACE}_${GET_TOOL}`, `${NAMESPACE}.${GET_TOOL}`])
const EVALUATE_IDS = new Set(["browser_evaluate", "browser.evaluate"])
const PROMPT_TIMEOUT = 10 * 60_000
const ACK_TIMEOUT = 5_000
const ONEPASSWORD_PREFIX = "op://"

type Asked = { sessionID: string; callID: string; messageID: string; reason: string; origin?: string; via?: "get" | "fill"; fields: RequestedField[] }
type Answer =
  | { status: "submitted"; values: Record<string, string>; picks: Record<string, string>; remember: boolean; auto?: boolean }
  | { status: "cancelled" | "timeout" | "unavailable" }
type Pending = {
  request: Asked & { requestID: string }
  finish: (answer: Answer) => void
  acknowledge: () => void
  /** Called after an account was unlocked for this request: looks again and updates or completes the card. */
  refresh?: () => Promise<void>
}

const isProvider = (field: RequestedField) => field.source?.state === "choose"

function failure(names: string[], status: Exclude<Answer["status"], "submitted">, provider: boolean) {
  const what = names.join(", ")
  if (status === "cancelled") return provider ? `The user denied access to ${what}.` : `The user declined to provide ${what}.`
  if (status === "timeout") return `Timed out waiting for the user to provide ${what}.`
  return [
    `No OpenCode window or TUI with blindfold responded, so the user could not be asked for ${what}.`,
    "Ask the user to check that blindfold is in plugins in ~/.config/opencode/opencode.json (and cli.json for the TUI).",
  ].join(" ")
}

type Settings = {
  shell: { enabled: boolean; approve: boolean }
  codemode: { enabled: boolean }
  secrets: Map<string, string>
  onepassword: { account?: string }
  rules: ConfigRule[]
  auditFile: string | false
}

function group(options: Record<string, unknown>, key: string) {
  const value = options[key]
  if (value === undefined) return {}
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`opencode-blindfold ${key} option must be an object`)
  }
  return value as Record<string, unknown>
}

function boolean(options: Record<string, unknown>, key: string, name: string, fallback: boolean) {
  const value = options[name]
  if (value === undefined) return fallback
  if (typeof value !== "boolean") throw new Error(`opencode-blindfold ${key}.${name} option must be a boolean`)
  return value
}

function getSecrets(options: Record<string, unknown>) {
  const secrets = new Map<string, string>()
  for (const [name, value] of Object.entries(group(options, "secrets"))) {
    if (!new RegExp(NAME_PATTERN).test(name)) throw new Error(`opencode-blindfold secrets names must match ${NAME_PATTERN}, got ${name}`)
    if (typeof value !== "string") throw new Error(`opencode-blindfold secrets.${name} option must be a string`)
    secrets.set(name, value)
  }
  return secrets
}

function getOnePassword(options: Record<string, unknown>) {
  const account = group(options, "1password").account
  if (account === undefined) return {}
  if (typeof account !== "string" || account === "") throw new Error("opencode-blindfold 1password.account option must be a non-empty string")
  return { account }
}

function getAuditFile(options: Record<string, unknown>) {
  const file = group(options, "audit").file
  if (file === undefined) return defaultAuditFile()
  if (file !== false && (typeof file !== "string" || file === "")) throw new Error("opencode-blindfold audit.file option must be a path or false")
  return file as string | false
}

function getSettings(options: Record<string, unknown>): Settings {
  const shell = group(options, "shell")
  const codemode = group(options, "codemode")
  const settings = {
    shell: { enabled: boolean(shell, "shell", "enabled", true), approve: boolean(shell, "shell", "approve", true) },
    codemode: { enabled: boolean(codemode, "codemode", "enabled", true) },
    secrets: getSecrets(options),
    onepassword: getOnePassword(options),
    rules: parseRules(options.rules),
    auditFile: getAuditFile(options),
  }
  if (!settings.shell.enabled && !settings.codemode.enabled) {
    throw new Error("opencode-blindfold needs shell.enabled or codemode.enabled, otherwise secrets cannot be used")
  }
  return settings
}

// Secret names are environment-variable style, so a word match covers $NAME, ${NAME}, os.environ["NAME"], and so on.
function mentioned(names: string[], command: string) {
  return names.filter((name) => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(command))
}

function instructions(settings: Settings) {
  const call = settings.codemode.enabled ? "`tools.blindfold.get({ name, reason })` in Code Mode" : "the `blindfold_get` tool"
  const shape = settings.codemode.enabled ? "an object of the values keyed by name" : "a confirmation"
  return [
    `When a task needs a secret such as an API key, token, or password, call ${call}; it asks the user privately if the secret isn't stored yet.`,
    `When a step needs several inputs at once, such as a login, ask for them in one request, \`get({ fields: [{ name: "EMAIL" }, { name: "PASSWORD" }], reason })\`, which returns ${shape}; a field is masked unless its kind is \`text\` or \`email\`, and a name like PASSWORD or TOKEN is always masked.`,
    "Pass `origin` (the page's URL) so the user's password managers can serve a login for that site after the user approves; a field one of them holds is not typed in.",
    settings.codemode.enabled ? "To log in to a page without ever holding the password, call `tools.blindfold.fill({ tabID, origin, fields: [{ name: \"EMAIL\" }, { name: \"PASSWORD\" }], reason })` and pass the `script` it returns, unchanged and alone, to `tools.browser.evaluate({ tabID, script })`; the page is filled and masked and you see only a report." : undefined,
    settings.secrets.size > 0 ? `The user has configured these secrets: ${[...settings.secrets.keys()].join(", ")}.` : undefined,
    "Never ask the user to paste secrets into the chat.",
    "Secret values are redacted from tool output, so you won't see them even if you print them; you'll see `[REDACTED:NAME]` instead.",
  ].filter(Boolean).join(" ")
}

function shellUsage(settings: Settings) {
  if (!settings.shell.enabled) return []
  return [
    "Shell commands receive it as an environment variable only when the command names it; pass it explicitly to programs that expect another variable, e.g. `GH_TOKEN=\"$GITHUB_TOKEN\" gh api user`.",
    settings.shell.approve ? "The user must approve each such command." : undefined,
  ]
}

function getDescription(settings: Settings) {
  return [
    "Get a secret such as an API token or password, or several inputs at once with `fields` (each `{ name, label?, kind?: text | email | secret | otp }`, e.g. EMAIL and PASSWORD). If one isn't stored yet, the user is asked to enter it in a card in the chat.",
    "With `origin` (a page URL), a login the user keeps in a password manager (1Password, Bitwarden) is offered for approval instead of being typed; `field` names the part of the login (username, password, otp) when the name does not say.",
    settings.codemode.enabled
      ? "Returns the value (or, with `fields`, an object of values keyed by name) to the running code only; use it directly, e.g. in a fetch header."
      : "The value is never returned to you.",
    ...shellUsage(settings),
  ].filter(Boolean).join(" ")
}

const NAME_INPUT = {
  type: "string",
  pattern: NAME_PATTERN,
  description: "Environment-variable style name, e.g. GITHUB_TOKEN",
} as const

const FIELD_ITEMS = {
  type: "object",
  properties: {
    name: NAME_INPUT,
    label: { type: "string", description: "What the user sees above the input; defaults to the name" },
    kind: { enum: ["text", "email", "secret", "otp"], description: "text and email are shown as typed, secret and otp are masked. Defaults from the name (PASSWORD, TOKEN, KEY, SECRET => secret; EMAIL, USER, LOGIN => shown; OTP, TOTP, 2FA => one-time code, never kept)" },
    field: { type: "string", description: "Which part of a password manager login this is: username, password, otp, or a field label. Defaults from the name" },
    replace: { type: "boolean", description: "Ask again for this field even if it is stored" },
  },
  required: ["name"],
  additionalProperties: false,
} as const

/** The origin as a host, the way the card shows it. */
const display = (origin: string) => (origin.startsWith("https://") ? origin.slice("https://".length) : origin)

export default Plugin.define({
  id: "blindfold",
  async setup(ctx) {
    const settings = getSettings(ctx.options)
    const redactor = new Redactor()
    const pending = new Map<string, Pending>()
    const memory = new Map<string, unknown>()
    const store = ctx.storage ?? { get: async (key: string) => memory.get(key), set: async (key: string, value: unknown) => void memory.set(key, value) }
    const saved = savedRules(store as Parameters<typeof savedRules>[0], randomUUID)
    const audit = createAudit(settings.auditFile)
    const broker = createBroker({ accounts: registered, rules: settings.rules, saved: saved.list })
    const fills = createFills()

    // Plain values are known upfront, so they're redacted and reach shell commands before any get.
    for (const [name, source] of settings.secrets) {
      if (source !== "" && !source.startsWith(ONEPASSWORD_PREFIX)) redactor.set(name, source)
    }

    const changed = () => void rpc.events.emit("changed", {}).catch(() => undefined)

    const rpc = await ctx.rpc.register(Blindfold, {
      submit: async (input) => {
        const { requestID, values, picks = {}, remember = false } = input as { requestID: string; values: Record<string, string>; picks?: Record<string, string>; remember?: boolean }
        const request = pending.get(requestID)
        if (!request) return { accepted: false }
        const typed = request.request.fields.filter((field) => !isProvider(field)).map((field) => field.name)
        // Exactly the typed names, each non-empty: the values are the whole answer for those fields.
        const complete = typed.length === Object.keys(values).length && typed.every((name) => typeof values[name] === "string" && values[name] !== "")
        // Every provider field needs a chosen candidate that is ready (an account still locked cannot be approved).
        const chosen: Record<string, string> = {}
        const decided = request.request.fields.filter(isProvider).every((field) => {
          const key = picks[field.name] ?? field.source!.selected
          const candidate = field.source!.candidates.find((item) => item.key === key)
          if (!key || candidate?.state !== "ready") return false
          chosen[field.name] = key
          return true
        })
        if (!complete || !decided) return { accepted: false }
        request.finish({ status: "submitted", values, picks: chosen, remember: remember === true })
        return { accepted: true }
      },
      unlock: async (input) => {
        const { requestID, account: id, input: secret } = input as { requestID: string; account: string; input: UnlockInput }
        const request = pending.get(requestID)
        const account = registered().find((item) => item.id === id)
        const offered = request?.request.fields.some((field) => field.source?.candidates.some((item) => item.account === id && item.state === "locked"))
        if (!request?.refresh || !account || !offered) return { accepted: false }
        // Whatever the vendor says is cleaned of the secrets the user typed before it is shown.
        const given = Object.values(secret).filter((item): item is string => typeof item === "string" && item !== "")
        try {
          await account.unlock(secret)
        } catch (error) {
          let message = error instanceof Error ? error.message : "Could not unlock."
          for (const item of given) message = message.replaceAll(item, "[REDACTED]")
          return { accepted: true, error: message.slice(0, 200) }
        }
        changed()
        // Unlocked, but the card could not look again: say so instead of leaving it stale.
        const stale = await request.refresh().then(() => undefined, (error: unknown) => (error instanceof Error ? error.message : "unknown error").slice(0, 160))
        return stale ? { accepted: true, error: `Unlocked, but the card could not be refreshed: ${stale}` } : { accepted: true }
      },
      ack: async (input) => {
        const request = pending.get((input as { requestID: string }).requestID)
        if (!request) return { accepted: false }
        request.acknowledge()
        return { accepted: true }
      },
      list: async () => ({ requests: [...pending.values()].map((item) => item.request) }),
      cancel: async (input) => {
        const request = pending.get((input as { requestID: string }).requestID)
        if (!request) return { accepted: false }
        request.finish({ status: "cancelled" })
        return { accepted: true }
      },
      overview: async () => {
        const states: AccountState[] = await Promise.all(
          registered().map(async (account) => {
            const state = await account.status().catch((): { state: "unavailable"; reason: string } => ({ state: "unavailable", reason: "status failed" }))
            return { id: account.id, label: account.label, kind: account.kind, state: state.state, ...(state.state === "unavailable" ? { reason: state.reason } : {}), ...(state.state === "unlocked" && state.expiresAt ? { expiresAt: state.expiresAt } : {}) }
          }),
        )
        return { rules: await saved.list(), accounts: states, audit: audit.recent() }
      },
      revoke: async (input) => {
        const revoked = await saved.revoke((input as { id: string }).id)
        if (revoked) changed()
        return { accepted: revoked }
      },
      lock: async (input) => {
        const account = registered().find((item) => item.id === (input as { account: string }).account)
        if (!account) return { accepted: false }
        await account.lock()
        changed()
        return { accepted: true }
      },
    })

    function ask(request: Asked, signal?: AbortSignal, refresh?: (id: string) => Promise<void>) {
      const requestID = randomUUID()
      return new Promise<Answer>((resolve) => {
        let acknowledged = false
        const finish = (answer: Answer) => {
          if (!pending.delete(requestID)) return
          clearTimeout(timer)
          clearTimeout(ackTimer)
          signal?.removeEventListener("abort", abort)
          resolve(answer)
          void rpc.events.emit("resolved", { requestID, status: answer.status }).catch(() => undefined)
        }
        // The run was stopped: the card must not stay open for a call nobody is waiting on.
        const abort = () => finish({ status: "cancelled" })
        const timer = setTimeout(() => finish({ status: acknowledged ? "timeout" : "unavailable" }), PROMPT_TIMEOUT)
        const ackTimer = setTimeout(() => finish({ status: "unavailable" }), ACK_TIMEOUT)
        pending.set(requestID, {
          request: { requestID, ...request },
          finish,
          acknowledge: () => {
            acknowledged = true
            clearTimeout(ackTimer)
          },
          refresh: refresh ? () => refresh(requestID) : undefined,
        })
        rpc.events.emit("requested", { requestID, ...request }).catch(() => finish({ status: "unavailable" }))
        if (signal?.aborted) abort()
        else signal?.addEventListener("abort", abort, { once: true })
      })
    }

    // A session's prompts are asked one at a time (the TUI shows one dialog and a new prompt closes the open one), but a
    // card waiting in one session does not hold up another session's.
    const queues = new Map<string, Promise<unknown>>()
    function serial<T>(sessionID: string, task: () => Promise<T>) {
      const next = (queues.get(sessionID) ?? Promise.resolve()).then(task, task)
      const tail = next.catch(() => undefined)
      queues.set(sessionID, tail)
      void tail.then(() => queues.get(sessionID) === tail && queues.delete(sessionID))
      return next
    }

    type Wanted = { field: Field; replace?: boolean; item?: string; selector?: string; match?: string }
    type Request = { sessionID: string; callID: string; messageID: string; reason: string; wanted: Wanted[]; replace?: boolean; origin?: string; via: "get" | "fill"; signal?: AbortSignal }

    /** A one-time code is read on use and never kept. */
    const kept = (field: Field) => field.kind !== "otp"

    /**
     * The values of the fields. A field a password manager holds is offered for approval (or used straight away under a
     * saved "Always allow" rule); the rest are typed in the card, except stored ones, which are returned without asking.
     */
    async function obtain(request: Request) {
      const { wanted, replace, origin } = request
      const providers = registered().length > 0 && wanted.some(({ field }) => origin !== undefined || nameRule(field.name, settings.rules)?.ref !== undefined)
      const missing = (item: Wanted) => !kept(item.field) || redactor.get(item.field.name) === undefined || replace === true || item.replace === true
      if (!providers && !wanted.some(missing)) return Object.fromEntries(wanted.map(({ field }) => [field.name, redactor.get(field.name)!]))
      return serial(request.sessionID, () => (providers ? withProviders(request, missing) : typedOnly(request, missing)))
    }

    /** The stored values of the fields, asking the user once for those that are missing or to be replaced. */
    async function typedOnly(request: Request, missing: (item: Wanted) => boolean) {
      const { wanted } = request
      // Another call may have stored them while this one waited.
      const asking = wanted.filter(missing)
      const resolved: Record<string, string> = {}
      const prompted: Field[] = []
      for (const { field } of asking) {
        if (settings.secrets.has(field.name)) resolved[field.name] = await configured(field.name)
        else prompted.push(field)
      }
      if (prompted.length > 0) {
        const answer = await ask({ sessionID: request.sessionID, callID: request.callID, messageID: request.messageID, reason: request.reason, ...(request.origin ? { origin: request.origin } : {}), ...(request.via === "fill" ? { via: "fill" as const } : {}), fields: prompted }, request.signal)
        if (answer.status !== "submitted") throw new Error(failure(prompted.map((field) => field.name), answer.status, false))
        Object.assign(resolved, answer.values)
      }
      return remember(request, resolved)
    }

    /** Stores typed values (a one-time code is only redacted) and returns every wanted field's value. */
    function remember(request: Request, resolved: Record<string, string>) {
      for (const [name, value] of Object.entries(resolved)) {
        if (kept(request.wanted.find(({ field }) => field.name === name)!.field)) redactor.set(name, value)
        else redactor.track(name, value)
      }
      return Object.fromEntries(request.wanted.map(({ field }) => [field.name, resolved[field.name] ?? redactor.get(field.name)!]))
    }

    async function withProviders(request: Request, missing: (item: Wanted) => boolean) {
      const asks: Ask[] = request.wanted.map((item) => ({ name: item.field.name, field: item.field, item: item.item, origin: request.origin, via: request.via }))
      let plans = await broker.plan(asks)
      const providerAsks = () => asks.filter((item) => plans.get(item.name)?.source.state === "choose")
      const typed = () => request.wanted.filter((item) => plans.get(item.field.name)?.source.state !== "choose" && missing(item))
      /** Card rows: every provider field, and the typed ones that are missing (a failed lookup leaves a hint). */
      const rows = (): RequestedField[] =>
        request.wanted
          .filter((item) => plans.get(item.field.name)?.source.state === "choose" || missing(item))
          .map(({ field }) => ({ ...field, ...(plans.has(field.name) ? { source: plans.get(field.name)!.source } : {}) }))
      const decided = () => typed().length === 0 && providerAsks().length > 0 && broker.silent(providerAsks(), plans)

      let answer: Answer
      if (decided()) answer = { status: "submitted", values: {}, picks: {}, remember: false, auto: true }
      else {
        // An account the user unlocked in the card changes what can be offered: look again, and finish if a rule now covers it.
        const refresh = async (requestID: string) => {
          plans = await broker.plan(asks)
          const open = pending.get(requestID)
          if (!open) return
          if (decided()) return open.finish({ status: "submitted", values: {}, picks: {}, remember: false, auto: true })
          open.request.fields = rows()
          void rpc.events.emit("updated", { requestID, fields: open.request.fields }).catch(() => undefined)
        }
        answer = await ask({ sessionID: request.sessionID, callID: request.callID, messageID: request.messageID, reason: request.reason, ...(request.origin ? { origin: request.origin } : {}), via: request.via, fields: rows() }, request.signal, refresh)
      }

      const log = (planned: Planned | undefined, name: string, outcome: "allowed" | "always" | "rule" | "denied" | "error", key?: string) => {
        const candidate = planned?.source.candidates.find((item) => item.key === (key ?? planned.source.selected)) ?? planned?.source.candidates[0]
        audit.add({ time: new Date().toISOString(), session: request.sessionID, via: request.via, account: candidate?.account ?? "", accountLabel: candidate?.label ?? "", ...(candidate?.item ? { item: candidate.item.title } : {}), field: planned?.itemField ?? name, name, ...(request.origin ? { origin: request.origin } : {}), outcome })
      }
      if (answer.status !== "submitted") {
        if (answer.status === "cancelled") for (const item of providerAsks()) log(plans.get(item.name), item.name, "denied")
        throw new Error(failure(rows().map((field) => field.name), answer.status, providerAsks().length > 0))
      }

      const resolved: Record<string, string> = { ...answer.values }
      for (const item of providerAsks()) {
        const planned = plans.get(item.name)!
        const key = answer.picks[item.name] ?? planned.source.selected!
        try {
          const read = await broker.read(planned, key, request.signal)
          resolved[item.name] = read.value
          // A name rule (GITHUB_TOKEN) is a configured secret like the `secrets` option: shell commands may name it.
          if (nameRule(item.name, settings.rules)) redactor.set(item.name, read.value)
          else redactor.track(item.name, read.value)
          if (answer.remember && !read.account.confirmEveryUse) {
            await saved.add({ account: read.account.id, item: read.candidate.item?.id, itemTitle: read.candidate.item?.title, field: planned.itemField, origin: nameRule(item.name, settings.rules)?.ref ? undefined : request.origin, name: item.name, via: request.via })
            changed()
          }
          log(planned, item.name, answer.auto ? "rule" : answer.remember && !planned.source.candidates.find((entry) => entry.key === key)?.confirm ? "always" : "allowed", key)
        } catch (error) {
          log(planned, item.name, "error", key)
          if (isLocked(error)) throw new Error(`${planned.source.candidates.find((entry) => entry.key === key)?.label ?? error.account} locked before it could be read. Ask again.`)
          throw error
        }
      }
      const typedValues = Object.fromEntries(Object.entries(answer.values))
      const values = remember({ ...request, wanted: request.wanted }, typedValues)
      return { ...values, ...Object.fromEntries(providerAsks().map((item) => [item.name, resolved[item.name]!])) }
    }

    async function configured(name: string) {
      const source = settings.secrets.get(name)!
      if (source === "") throw new Error(`${name} is empty in the opencode-blindfold secrets option, for example because its {env:...} variable isn't set.`)
      if (!source.startsWith(ONEPASSWORD_PREFIX)) return source
      // A 1Password account of blindfold-providers that is already unlocked serves it; otherwise `op read` with the app integration off.
      for (const account of registered().filter((item) => item.kind === "1password")) {
        try {
          if ((await account.status()).state !== "unlocked") continue
          const { item, field } = await account.resolve(source)
          return await account.read(item, field)
        } catch {
          continue
        }
      }
      return readOnePassword(name, source, settings.onepassword.account)
    }

    const originInput = (value: unknown, required: boolean) => {
      if (value === undefined && !required) return undefined
      const origin = typeof value === "string" ? originOf(value) : undefined
      if (!origin) throw new Error("`origin` must be the page's http(s) URL, e.g. https://accounts.google.com")
      return origin
    }

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: NAMESPACE,
        description: "Secrets provided by the user without revealing their values to the agent.",
      })
      editor.add({
        name: GET_TOOL,
        description: getDescription(settings),
        input: {
          type: "object",
          properties: {
            name: NAME_INPUT,
            fields: {
              type: "array",
              minItems: 1,
              maxItems: MAX_FIELDS,
              description: "Several inputs asked in one card, instead of `name`; returns an object keyed by name",
              items: FIELD_ITEMS,
            },
            origin: { type: "string", description: "The page's URL. A login kept in a password manager for that site is offered for approval" },
            reason: { type: "string", minLength: 1, description: "Why it is needed, shown to the user if it must be entered" },
            replace: { type: "boolean", description: "Ask the user again even if it is already stored" },
          },
          additionalProperties: false,
        },
        // Code Mode hands `output` to the running code: a string for one name, an object keyed by name for `fields`. Declared
        // only there, because a tool that declares an output must return it, and a regular tool returns no value.
        ...(settings.codemode.enabled ? { output: { oneOf: [{ type: "string" }, { type: "object", additionalProperties: { type: "string" } }] } } : {}),
        // In Code Mode the value reaches only the running code. As a regular tool the result enters the chat,
        // so it confirms the secret is stored without returning it.
        options: settings.codemode.enabled
          ? { namespace: NAMESPACE, codemode: true, pinned: true }
          : { namespace: NAMESPACE, codemode: false },
        async execute(input, context) {
          const { reason, replace, origin } = input as { reason?: string; replace?: boolean; origin?: string }
          const wanted = parseFields(input as { name?: unknown; fields?: unknown })
          const names = wanted.map(({ field }) => field.name)
          const single = (input as { name?: string }).name !== undefined
          await context.progress({ title: `Secret ${names.join(", ")}` })
          const values = await obtain({
            sessionID: context.sessionID,
            callID: context.id,
            messageID: context.messageID,
            reason: reason ?? `The agent needs ${names.join(", ")}.`,
            wanted,
            replace,
            origin: originInput(origin, false),
            via: "get",
            signal: context.signal,
          })
          if (settings.codemode.enabled) return single ? { content: values[names[0]!]!, output: values[names[0]!]! } : { content: JSON.stringify(values), output: values }
          return {
            content: `Secret ${names.join(", ")} ${names.length === 1 ? "is" : "are"} stored. Blindfold secrets available: ${redactor.names().join(", ")}.`,
            metadata: { title: `Secret ${names.join(", ")}`, names },
          }
        },
      })
      // Fill is a Code Mode tool: its result is a placeholder script that only the evaluate hook below can turn into the
      // script that carries the values.
      if (settings.codemode.enabled) {
        editor.add({
          name: FILL_TOOL,
          description: [
            "Fills a login (or other fields) into the page open in a browser tab without the values ever reaching you: the user approves in a card, and the page's fields are filled and masked.",
            "Pass the returned `script` unchanged, and alone, to `tools.browser.evaluate({ tabID, script })` for the same tab; it returns a report per field (ok or why not), never a value.",
            "`origin` must be the tab's own origin; the fill is refused on any other page. A field a password manager holds for that site is offered for approval, the rest are typed by the user. `selector` (CSS) or `match` (text of the input's label, placeholder or name) picks the input when the page needs it.",
          ].join(" "),
          input: {
            type: "object",
            properties: {
              tabID: { type: "string", description: "The browser tab to fill; the same tab goes to browser.evaluate" },
              origin: { type: "string", description: "The page's URL; the fill runs only on this origin" },
              fields: {
                type: "array",
                minItems: 1,
                maxItems: MAX_FIELDS,
                items: {
                  ...FIELD_ITEMS,
                  properties: {
                    ...FIELD_ITEMS.properties,
                    selector: { type: "string", description: "CSS selector of the input on the page" },
                    match: { type: "string", description: "Text of the input's label, placeholder or name" },
                  },
                },
              },
              reason: { type: "string", minLength: 1, description: "Why, shown to the user" },
            },
            required: ["tabID", "origin", "fields"],
            additionalProperties: false,
          },
          output: { type: "object", additionalProperties: true },
          options: { namespace: NAMESPACE, codemode: true },
          async execute(input, context) {
            const { tabID, reason, fields } = input as { tabID?: unknown; origin?: unknown; reason?: string; fields?: unknown }
            if (typeof tabID !== "string" || tabID === "") throw new Error("`tabID` must be the browser tab's id.")
            const origin = originInput((input as { origin?: unknown }).origin, true)!
            const parsed = parseFields({ fields })
            const wanted: Wanted[] = parsed.map((item, index) => ({ ...item, selector: (fields as { selector?: string }[])[index]?.selector, match: (fields as { match?: string }[])[index]?.match }))
            const names = wanted.map(({ field }) => field.name)
            await context.progress({ title: `Fill ${names.join(", ")}` })
            const values = await obtain({
              sessionID: context.sessionID,
              callID: context.id,
              messageID: context.messageID,
              reason: reason ?? `The agent wants to fill ${names.join(", ")} on ${display(origin)}.`,
              wanted,
              origin,
              via: "fill",
              signal: context.signal,
            })
            const pageFields: FillField[] = wanted.map((item) => ({ name: item.field.name, kind: itemFieldOf({ name: item.field.name, field: item.field, item: item.item }), ...(item.selector ? { selector: item.selector } : {}), ...(item.match ? { label: item.match } : {}) }))
            const script = fills.issue({ sessionID: context.sessionID, tabID, origin, fields: pageFields, values: names.map((name) => values[name]!) })
            const output = { script, fields: names, origin }
            return { content: JSON.stringify(output), output }
          },
        })
      }
    })

    // The placeholder from `fill` becomes the script with the values only here, after the call was recorded: the tool runs
    // with the new input, the stored call keeps the placeholder.
    await ctx.tool.hook("execute.before", (event) => {
      if (!EVALUATE_IDS.has(event.tool)) return
      const input = event.input as { tabID?: unknown; script?: unknown } | null
      if (!input || typeof input.script !== "string") return
      const script = fills.claim(input.script, { sessionID: event.sessionID, tabID: input.tabID })
      if (script !== undefined) event.input = { ...input, script }
    })

    await ctx.tool.hook("execute.after", (event) => {
      if (redactor.size === 0 || GET_TOOL_IDS.has(event.tool)) return
      if (event.status === "completed") {
        event.result = redactor.value(event.result as Record<string, unknown>) as Result
        return
      }
      const message = redactor.text(event.error.message)
      const metadata = redactor.value(event.error.metadata)
      if (message === event.error.message && metadata === event.error.metadata) return
      const cause = redactor.text(String(event.error.error)) === String(event.error.error) ? event.error.error : undefined
      event.error = new ToolError({ message, metadata, error: cause })
    })

    const system = instructions(settings)
    await ctx.session.hook("context", (event) => {
      if (redactor.size > 0) {
        event.messages = redactor.value(event.messages)
        event.system = redactor.value(event.system)
      }
      event.system.push({ type: "text", text: system })
    })

    // Last line of defense for requests that bypass the context hook, such as compaction and titles.
    await ctx.session.hook("http.request", async (event) => {
      if (redactor.size === 0 || !event.request.body) return
      const body = await event.request.clone().text()
      const redacted = redactor.text(body)
      if (redacted === body) return
      const headers = new Headers(event.request.headers)
      headers.delete("content-length")
      event.request = new Request(event.request, { body: redacted, headers })
    })

    if (settings.shell.enabled) {
      // Commands can only read secrets they name, so naming one is what triggers approval.
      if (settings.shell.approve) {
        await ctx.permission.hook("evaluate", (event) => {
          if (event.action !== "shell" || event.effect === "deny") return
          const names = [...new Set(event.resources.flatMap((command) => mentioned(redactor.names(), command)))]
          if (names.length === 0) return
          event.effect = "ask"
          event.message = `This command can read ${names.join(", ")}`
        })
      }
      await ctx.shell.hook("create.before", (event) => {
        for (const name of mentioned(redactor.names(), event.command)) event.env[name] = redactor.get(name)
      })
    }

    return () => {
      fills.clear()
      for (const request of pending.values()) request.finish({ status: "unavailable" })
    }
  },
})
