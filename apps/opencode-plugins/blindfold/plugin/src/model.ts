import { batch, createMemo, createSignal } from "solid-js"
import { check, normalize, type Check, type Field } from "./fields.js"
import type { SecretResolved } from "./rpc.js"

/** `provided`, `declined` and `expired` are final; the card shows a one-line row for them and no input. */
export type Phase = "open" | "sending" | "provided" | "declined" | "expired"

export interface Io {
  /** Sends the values; false when the server no longer has the request (answered elsewhere or expired). */
  submit(values: Record<string, string>): Promise<boolean>
  cancel(): Promise<boolean>
  /** Sending failed; the card stays open with what was typed. */
  failed(): void
}

/**
 * What one open request holds: the typed values, which fields are revealed or touched, and the phase. Values live only
 * here (never in an attribute or the DOM beyond the live input) and are emptied the moment the request is answered.
 */
export function createModel(fields: readonly Field[], io: Io) {
  const [phase, setPhase] = createSignal<Phase>("open")
  const [values, setValues] = createSignal<Record<string, string>>({})
  const [revealed, setRevealed] = createSignal<Record<string, boolean>>({})
  const [touched, setTouched] = createSignal<Record<string, boolean>>({})

  const value = (name: string) => values()[name] ?? ""
  const verdict = (field: Field): Check => check(field.kind, normalize(field.kind, value(field.name)))
  const filled = (field: Field) => normalize(field.kind, value(field.name)) !== ""
  const ready = createMemo(() => fields.every((field) => filled(field) && verdict(field).level !== "invalid"))

  const clear = () => batch(() => {
    setValues({})
    setRevealed({})
  })

  function settle(status: SecretResolved["status"]) {
    if (phase() !== "open" && phase() !== "sending") return
    clear()
    setPhase(status === "submitted" ? "provided" : status === "cancelled" ? "declined" : "expired")
  }

  return {
    phase,
    fields,
    value,
    set: (name: string, text: string) => setValues({ ...values(), [name]: text }),
    revealed: (name: string) => revealed()[name] === true,
    toggle: (name: string) => setRevealed({ ...revealed(), [name]: !revealed()[name] }),
    touched: (name: string) => touched()[name] === true,
    touch: (name: string) => setTouched({ ...touched(), [name]: true }),
    verdict,
    filled,
    ready,
    /** The first field still empty or invalid: where focus goes, and where Enter moves on to. */
    next: (after?: string) => {
      const from = after === undefined ? 0 : fields.findIndex((field) => field.name === after) + 1
      return [...fields.slice(from), ...fields.slice(0, from)].find((field) => !filled(field) || verdict(field).level === "invalid")?.name
    },
    async submit() {
      if (phase() !== "open") return
      if (!ready()) {
        setTouched(Object.fromEntries(fields.map((field) => [field.name, true])))
        return
      }
      const answer = Object.fromEntries(fields.map((field) => [field.name, normalize(field.kind, value(field.name))]))
      setPhase("sending")
      const accepted = await io.submit(answer).catch(() => undefined)
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
