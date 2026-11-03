import type { Ui } from "@opencode/plugin/gui"
import { For, Show, createUniqueId, onMount } from "solid-js"
import type { Model, UnlockMethod } from "./model.js"
import { UNLOCK_INPUTS } from "./model.js"
import type { RequestedField } from "./rpc.js"

export interface CardProps {
  ui: Ui
  t: (key: string, params?: Record<string, string>) => string
  model: Model
  reason: string
  /** The page the secrets are for, and whether they are filled into it or returned to the running code. */
  origin?: string
  via?: "get" | "fill"
}

/** "Email", "Email and Password", "Email, Key and Password". */
export const list = (names: readonly string[], and: string) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`

/** Where focus may go without taking text the user is typing: not into a composer that already holds some. */
export function mayTakeFocus(doc: Document) {
  const active = doc.activeElement as HTMLElement | null
  if (!active || active === doc.body) return true
  const typed = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? active.value : active.isContentEditable ? (active.textContent ?? "") : ""
  return typed === ""
}

/** The origin as a site: `accounts.google.com`, or the whole origin when it is not https. */
export const site = (origin: string) => (origin.startsWith("https://") ? origin.slice("https://".length) : origin)

/** "Fill PASSWORD for accounts.google.com from Personal (1Password)?" Names and labels only. */
export function title(props: CardProps) {
  const { t, model } = props
  const names = list(model.fields.map((field) => (model.isProvider(field) ? field.name : field.label)), t("and"))
  if (model.providers().length === 0) return t("title", { names: list(model.fields.map((field) => field.label), t("and")) })
  const base = props.origin ? t(props.via === "fill" ? "fill" : "use", { names, site: site(props.origin) }) : t("useNamed", { names })
  const accounts = [...new Set(model.providers().map((field) => model.candidate(field)?.label).filter((label): label is string => !!label))]
  return accounts.length === 1 ? t("from", { title: base, account: accounts[0]! }) : t("ask", { title: base })
}

function FieldRow(props: CardProps & { field: RequestedField; onEnter: (name: string) => void }) {
  const { ui, t, model, field } = props
  const id = createUniqueId()
  let wrap: HTMLDivElement | undefined
  const input = () => wrap?.querySelector("input") ?? undefined
  const level = () => (model.touched(field.name) ? model.verdict(field) : { level: "ok" as const })
  const hint = () => {
    const result = level()
    return result.message ? t(`hint.${result.message}`) : (field.source?.hint ?? "")
  }

  onMount(() => {
    const el = input()
    if (!el) return
    el.setAttribute("aria-describedby", `${id}-hint`)
    el.setAttribute("autocomplete", field.masked ? "new-password" : "off")
    el.setAttribute("autocapitalize", "off")
    el.setAttribute("spellcheck", "false")
    el.setAttribute("data-1p-ignore", "")
    el.setAttribute("data-lpignore", "true")
    el.setAttribute("data-form-type", "other")
    el.setAttribute("name", `blindfold-${field.name.toLowerCase()}`)
  })

  const reveal = () => model.revealed(field.name)
  return (
    <div data-slot="field" data-field={field.name}>
      <div data-slot="label" id={`${id}-label`}>
        {field.label}
      </div>
      <div data-slot="input" data-masked={field.masked && !reveal() ? "" : undefined} ref={wrap} onFocusOut={() => model.touch(field.name)}>
        <ui.TextInput
          label={field.label}
          value={model.value(field.name)}
          type={field.masked && !reveal() ? "password" : "text"}
          size="large"
          invalid={level().level === "invalid"}
          disabled={model.phase() === "sending"}
          class={field.masked ? "blindfold-masked" : undefined}
          onInput={(text) => model.set(field.name, text)}
          onSubmit={() => props.onEnter(field.name)}
        />
        <Show when={field.masked}>
          <div data-slot="reveal">
            <ui.Tooltip value={reveal() ? t("hide", { label: field.label }) : t("show", { label: field.label })} placement="top">
              <ui.IconButton
                icon={reveal() ? "outline-eye-slash" : "outline-eye"}
                label={reveal() ? t("hide", { label: field.label }) : t("show", { label: field.label })}
                size="small"
                pressed={reveal()}
                disabled={model.phase() === "sending"}
                onClick={() => {
                  model.toggle(field.name)
                  input()?.focus()
                }}
              />
            </ui.Tooltip>
          </div>
        </Show>
      </div>
      <div data-slot="hint" id={`${id}-hint`} data-level={level().level} aria-live="polite">
        {hint()}
      </div>
    </div>
  )
}

const UNLOCK_LABEL = { password: "unlock.password", token: "unlock.token", clientId: "unlock.clientId", clientSecret: "unlock.clientSecret" } as const

/** A locked account: one masked input per credential its unlock takes, and Unlock. Nothing typed here is kept or shown again. */
function UnlockForm(props: CardProps & { account: string; label: string; method: UnlockMethod }) {
  const { ui, t, model } = props
  const inputs = UNLOCK_INPUTS[props.method]
  const last = inputs[inputs.length - 1]!
  const go = () => void model.unlock(props.account, props.method)
  return (
    <div data-slot="unlock" data-account={props.account}>
      <For each={inputs}>
        {(name) => (
          <div data-slot="unlock-input" data-unlock={name}>
            <div data-slot="label">{t(UNLOCK_LABEL[name])}</div>
            <ui.TextInput
              label={t(UNLOCK_LABEL[name])}
              value={model.secret(props.account, name)}
              type="password"
              size="large"
              disabled={model.unlocking() !== undefined}
              class="blindfold-masked"
              onInput={(text) => model.setSecret(props.account, name, text)}
              onSubmit={() => (name === last ? go() : undefined)}
            />
          </div>
        )}
      </For>
      <div data-slot="unlock-foot">
        <span data-slot="hint" data-level="invalid" aria-live="polite">
          {model.unlockError(props.account) ?? ""}
        </span>
        <ui.Button variant="neutral" busy={model.unlocking() === props.account} disabled={!model.unlockable(props.account, props.method) || model.unlocking() !== undefined} onClick={go}>
          {t("unlock", { account: props.label })}
        </ui.Button>
      </div>
    </div>
  )
}

/** A field a password manager can serve: who it would come from, a choice when several can, and the unlock when one is locked. */
function ProviderRow(props: CardProps & { field: RequestedField }) {
  const { ui, t, model, field } = props
  const source = field.source!
  const picked = () => model.candidate(field)
  const detail = (item: { account: string; label: string; item?: { title: string } }) => (item.item ? `${item.label} · ${item.item.title}` : item.label)
  return (
    <div data-slot="field" data-field={field.name} data-provider="">
      <div data-slot="label">{field.label}</div>
      <Show
        when={source.candidates.length > 1}
        fallback={
          <div data-slot="source" data-state={picked()?.state}>
            <ui.Icon name={picked()?.state === "locked" ? "lock" : "check"} size="small" />
            <span data-slot="source-text">{picked()?.state === "locked" ? t("isLocked", { account: picked()!.label }) : t("fromAccount", { detail: detail(picked()!) })}</span>
          </div>
        }
      >
        <div role="radiogroup" aria-label={t("choose", { label: field.label })} data-slot="choices">
          <For each={source.candidates}>
            {(item) => (
              <button type="button" role="radio" aria-checked={model.selectedKey(field) === item.key} data-slot="choice" data-state={item.state} disabled={model.phase() === "sending"} onClick={() => model.choose(field.name, item.key)}>
                <span data-slot="choice-dot" />
                <span data-slot="choice-text">{detail(item)}</span>
                <Show when={item.state === "locked"}>
                  <span data-slot="choice-note">{t("locked")}</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={picked()?.state === "locked" && picked()!.methods.length > 0}>
        <UnlockForm {...props} account={picked()!.account} label={picked()!.label} method={picked()!.methods[0]!} />
      </Show>
    </div>
  )
}

/** The answered request as the host's own one-line tool row, so it reads as part of the thread. */
function Settled(props: Pick<CardProps, "t" | "model">) {
  const names = () => props.model.summary() || list(props.model.fields.map((field) => field.name), props.t("and"))
  return (
    <div data-component="tool-part-wrapper" data-blindfold-row={props.model.phase()} role="status">
      <div data-component="collapsible" data-variant="normal" class="tool-collapsible" data-compact="true" data-rail="false" data-has-action="true">
        <button type="button" data-slot="collapsible-trigger" tabindex="-1" aria-disabled="true">
          <div data-component="tool-trigger">
            <div data-slot="basic-tool-tool-trigger-content">
              <div data-slot="basic-tool-tool-info">
                <div data-slot="basic-tool-tool-info-structured">
                  <div data-slot="basic-tool-tool-info-main">
                    <span data-slot="basic-tool-tool-title">{props.t(`row.${props.model.phase()}`)}</span>
                    <span data-slot="basic-tool-tool-arg">{names()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}

export function RequestCard(props: CardProps) {
  const { ui, t, model } = props
  const titleId = createUniqueId()
  let root: HTMLDivElement | undefined
  const inputOf = (name: string) => root?.querySelector<HTMLInputElement>(`[data-field="${name}"] input`) ?? undefined

  const enter = (name: string) => {
    if (model.ready()) return void model.submit()
    const next = model.next(name)
    if (next) inputOf(next)?.focus()
    model.touch(name)
  }
  const provider = () => model.providers().length > 0
  const locked = () => model.providers().map((field) => model.candidate(field)).find((item) => item?.state === "locked")
  const busy = () => model.phase() === "sending"

  onMount(() => {
    // Escape inside the card declines; it must not also reach the app's own Escape (which stops the running session).
    root?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      void model.cancel()
    })
  })

  return (
    <div data-blindfold-card data-phase={model.phase()} ref={root}>
      <Show when={model.phase() === "open" || model.phase() === "sending"} fallback={<Settled t={t} model={model} />}>
        <div role="group" aria-labelledby={titleId} data-slot="card">
          <div data-slot="head">
            <ui.Icon name="lock" size="small" />
            <span id={titleId} data-slot="title">
              {title(props)}
            </span>
          </div>
          <p data-slot="reason">{props.reason}</p>
          <div data-slot="fields">
            <For each={model.fields}>{(field) => (model.isProvider(field) ? <ProviderRow {...props} field={field} /> : <FieldRow {...props} field={field} onEnter={enter} />)}</For>
          </div>
          <div data-slot="foot">
            <span data-slot="note">{locked() ? t("unlockFirst", { account: locked()!.label }) : provider() ? t("noteProvider") : t("note")}</span>
            <div data-slot="actions">
              <Show
                when={provider()}
                fallback={
                  <>
                    <ui.Button variant="neutral" disabled={busy()} onClick={() => void model.cancel()}>
                      {t("cancel")}
                    </ui.Button>
                    <ui.Button variant="contrast" disabled={!model.ready()} busy={busy()} onClick={() => void model.submit()}>
                      {t("submit")}
                    </ui.Button>
                  </>
                }
              >
                <ui.Button variant="neutral" disabled={busy()} onClick={() => void model.cancel()}>
                  {t("deny")}
                </ui.Button>
                <ui.Button variant="neutral" disabled={!model.ready() || busy()} onClick={() => void model.submit(true)}>
                  {t("always")}
                </ui.Button>
                <ui.Button variant="contrast" disabled={!model.ready()} busy={busy()} onClick={() => void model.submit()}>
                  {t("allow")}
                </ui.Button>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
