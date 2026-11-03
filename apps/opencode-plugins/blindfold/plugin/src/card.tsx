import type { Ui } from "@opencode/plugin/gui"
import { For, Show, createUniqueId, onMount } from "solid-js"
import type { Field } from "./fields.js"
import type { Model } from "./model.js"

export interface CardProps {
  ui: Ui
  t: (key: string, params?: Record<string, string>) => string
  model: Model
  reason: string
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

function FieldRow(props: CardProps & { field: Field; onEnter: (name: string) => void }) {
  const { ui, t, model, field } = props
  const id = createUniqueId()
  let wrap: HTMLDivElement | undefined
  const input = () => wrap?.querySelector("input") ?? undefined
  const level = () => (model.touched(field.name) ? model.verdict(field) : { level: "ok" as const })
  const hint = () => {
    const result = level()
    return result.message ? t(`hint.${result.message}`) : ""
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

/** The answered request as the host's own one-line tool row, so it reads as part of the thread. */
function Settled(props: Pick<CardProps, "t" | "model">) {
  const names = () => list(props.model.fields.map((field) => field.name), props.t("and"))
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
              {t("title", { names: list(model.fields.map((field) => field.label), t("and")) })}
            </span>
          </div>
          <p data-slot="reason">{props.reason}</p>
          <div data-slot="fields">
            <For each={model.fields}>{(field) => <FieldRow {...props} field={field} onEnter={enter} />}</For>
          </div>
          <div data-slot="foot">
            <span data-slot="note">{t("note")}</span>
            <div data-slot="actions">
              <ui.Button variant="neutral" disabled={model.phase() === "sending"} onClick={() => void model.cancel()}>
                {t("cancel")}
              </ui.Button>
              <ui.Button variant="contrast" disabled={!model.ready()} busy={model.phase() === "sending"} onClick={() => void model.submit()}>
                {t("submit")}
              </ui.Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
