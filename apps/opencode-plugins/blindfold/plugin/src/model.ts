import { batch, createMemo, createSignal } from "solid-js"
import type { Candidate } from "./broker.js"
import { check, normalize, type Check } from "./fields.js"
import type { RequestedField, SecretResolved } from "./rpc.js"

/** `provided`, `declined` and `expired` are final; the card shows a one-line row for them and no input. */
export type Phase = "open" | "sending" | "provided" | "declined" | "expired"

/** The credentials an unlock takes, by the name each has in the `unlock` call. */
export type UnlockKey = "password" | "token" | "clientId" | "clientSecret"
export type UnlockMethod = "masterPassword" | "serviceAccount" | "apiKey"

/** What each unlock method asks the user for, in order. Every one is masked. */
export const UNLOCK_INPUTS: Record<UnlockMethod, readonly UnlockKey[]> = {
  masterPassword: ["password"],
  serviceAccount: ["token"],
  apiKey: ["clientId", "clientSecret", "password"],
}

export interface Io {
  /** Sends the typed values and the chosen candidates; false when the server no longer has the request (answered elsewhere or expired). `remember` is "Always allow". */
  submit(values: Record<string, string>, extra?: { picks: Record<string, string>; remember: boolean }): Promise<boolean>
  /** Deny, or Cancel on a card with no provider row. */
  cancel(): Promise<boolean>
  /** Sends an unlock; `error` is the vendor's first line when it failed. */
  unlock?(account: string, method: UnlockMethod, input: Partial<Record<UnlockKey, string>>): Promise<{ accepted: boolean; error?: string }>
  /** Sending failed; the card stays open with what was typed. */
  failed(): void
}

/**
 * What one open request holds: the typed values, the chosen account per provider field, which fields are revealed or touched,
 * and the phase. Values live only here (never in an attribute or the DOM beyond the live input) and are emptied the moment the
 * request is answered. Unlock secrets are emptied the moment they are sent.
 */
export function createModel(initial: readonly RequestedField[], io: Io) {
  const [phase, setPhase] = createSignal<Phase>("open")
  const [rows, setRows] = createSignal<readonly RequestedField[]>(initial)
  const [values, setValues] = createSignal<Record<string, string>>({})
  const [revealed, setRevealed] = createSignal<Record<string, boolean>>({})
  const [touched, setTouched] = createSignal<Record<string, boolean>>({})
  const [chosen, setChosen] = createSignal<Record<string, string>>({})
  const [secrets, setSecrets] = createSignal<Record<string, string>>({})
  const [unlocking, setUnlocking] = createSignal<string | undefined>(undefined)
  const [unlockFailed, setUnlockFailed] = createSignal<Record<string, string>>({})
  const [summary, setSummary] = createSignal("")

  const isProvider = (field: RequestedField) => field.source?.state === "choose"
  const typed = () => rows().filter((field) => !isProvider(field))
  const providers = () => rows().filter(isProvider)

  const value = (name: string) => values()[name] ?? ""
  const verdict = (field: RequestedField): Check => check(field.kind, normalize(field.kind, value(field.name)))
  const filled = (field: RequestedField) => normalize(field.kind, value(field.name)) !== ""

  /** The candidate chosen for a provider field: the user's pick, else the server's selection. */
  const key = (field: RequestedField) => chosen()[field.name] ?? field.source?.selected
  const candidate = (field: RequestedField): Candidate | undefined => field.source?.candidates.find((item) => item.key === key(field))
  const providersReady = () => providers().every((field) => candidate(field)?.state === "ready")
  const ready = createMemo(() => typed().every((field) => filled(field) && verdict(field).level !== "invalid") && providersReady())

  /** Fields offered the same candidates are one choice: a login's email and password come from the same account. */
  const signature = (field: RequestedField) => field.source?.candidates.map((item) => item.key).join("|") ?? ""
  const clearSecrets = () => setSecrets({})
  const clear = () =>
    batch(() => {
      setValues({})
      setRevealed({})
      clearSecrets()
    })

  function settle(status: SecretResolved["status"]) {
    if (phase() !== "open" && phase() !== "sending") return
    describe()
    clear()
    setPhase(status === "submitted" ? "provided" : status === "cancelled" ? "declined" : "expired")
  }

  /** "PASSWORD from Personal (1Password), EMAIL typed": what the answered row says. Names and labels only. */
  function describe() {
    const parts = rows().map((field) => {
      const picked = isProvider(field) ? candidate(field) : undefined
      return picked ? `${field.name} (${picked.label})` : field.name
    })
    setSummary(parts.join(", "))
  }

  return {
    phase,
    get fields() {
      return rows()
    },
    typed,
    providers,
    isProvider,
    value,
    set: (name: string, text: string) => setValues({ ...values(), [name]: text }),
    revealed: (name: string) => revealed()[name] === true,
    toggle: (name: string) => setRevealed({ ...revealed(), [name]: !revealed()[name] }),
    touched: (name: string) => touched()[name] === true,
    touch: (name: string) => setTouched({ ...touched(), [name]: true }),
    verdict,
    filled,
    ready,
    candidate,
    selectedKey: key,
    /** Whether the field leads its group: the one that shows the choice and the unlock. */
    leads: (field: RequestedField) => providers().find((item) => signature(item) === signature(field)) === field,
    choose(name: string, next: string) {
      const field = providers().find((item) => item.name === name)
      if (!field) return
      const same = providers().filter((item) => signature(item) === signature(field))
      setChosen({ ...chosen(), ...Object.fromEntries(same.map((item) => [item.name, next])) })
    },
    summary,
    /** The first typed field still empty or invalid: where focus goes, and where Enter moves on to. */
    next: (after?: string) => {
      const fields = typed()
      const from = after === undefined ? 0 : fields.findIndex((field) => field.name === after) + 1
      return [...fields.slice(from), ...fields.slice(0, from)].find((field) => !filled(field) || verdict(field).level === "invalid")?.name
    },
    /** The server changed the rows (an account was unlocked). Typed text stays; a choice stays if its account is still offered. */
    update(next: readonly RequestedField[]) {
      if (phase() !== "open") return
      const keep: Record<string, string> = {}
      for (const field of next) {
        const before = chosen()[field.name]
        const account = before?.split(":")[0]
        const same = field.source?.candidates.find((item) => item.key === before) ?? field.source?.candidates.find((item) => item.account === account)
        if (same) keep[field.name] = same.key
      }
      batch(() => {
        setRows(next)
        setChosen(keep)
        clearSecrets()
        setUnlockFailed({})
      })
    },
    secret: (account: string, input: UnlockKey) => secrets()[`${account}/${input}`] ?? "",
    setSecret: (account: string, input: UnlockKey, text: string) => setSecrets({ ...secrets(), [`${account}/${input}`]: text }),
    unlocking,
    unlockError: (account: string) => unlockFailed()[account],
    /** True when every input the method takes has text. */
    unlockable: (account: string, method: UnlockMethod) => UNLOCK_INPUTS[method].every((input) => (secrets()[`${account}/${input}`] ?? "") !== ""),
    async unlock(account: string, method: UnlockMethod) {
      if (phase() !== "open" || unlocking() || !io.unlock) return
      const input = Object.fromEntries(UNLOCK_INPUTS[method].map((name) => [name, secrets()[`${account}/${name}`] ?? ""])) as Partial<Record<UnlockKey, string>>
      if (Object.values(input).some((text) => text === "")) return
      setUnlocking(account)
      // What was typed is gone before the answer comes back, whatever it is.
      clearSecrets()
      setUnlockFailed({ ...unlockFailed(), [account]: "" })
      const reply = await io.unlock(account, method, input).catch(() => undefined)
      setUnlocking(undefined)
      if (!reply) return void io.failed()
      if (reply.error) setUnlockFailed({ ...unlockFailed(), [account]: reply.error })
    },
    async submit(remember = false) {
      if (phase() !== "open") return
      if (!ready()) {
        setTouched(Object.fromEntries(typed().map((field) => [field.name, true])))
        return
      }
      const answer = Object.fromEntries(typed().map((field) => [field.name, normalize(field.kind, value(field.name))]))
      const picks = Object.fromEntries(providers().map((field) => [field.name, key(field)!]))
      describe()
      setPhase("sending")
      const accepted = await io.submit(answer, { picks, remember }).catch(() => undefined)
      if (accepted === undefined) {
        setPhase("open")
        io.failed()
        return
      }
      clear()
      if (phase() === "sending") setPhase(accepted ? "provided" : "expired")
    },
    async cancel() {
      if (phase() !== "open") return
      describe()
      setPhase("sending")
      const accepted = await io.cancel().catch(() => undefined)
      if (accepted === undefined) {
        setPhase("open")
        io.failed()
        return
      }
      clear()
      if (phase() === "sending") setPhase(accepted ? "declined" : "expired")
    },
    settle,
  }
}

export type Model = ReturnType<typeof createModel>
