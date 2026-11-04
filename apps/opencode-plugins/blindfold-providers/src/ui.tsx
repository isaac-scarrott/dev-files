import type { Ui } from "@opencode/plugin/gui"
import { For, Show, createSignal, onMount, type JSX } from "solid-js"
import type { Tone } from "./checklist.js"

type T = (key: string, params?: Record<string, string>) => string

/** The host's own settings row markup, so its CSS styles it. `tone` puts a state mark before the title. */
export function Row(props: { ui: Ui; title: string; description?: JSX.Element; control?: JSX.Element; tone?: Tone; action?: string }) {
  return (
    <div data-component="settings-row" data-bfp-row={props.action}>
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title">
          <Show when={props.tone}>
            <span data-bfp-tone={props.tone} aria-hidden="true">
              <props.ui.Icon name={props.tone === "ok" ? "circle-check" : props.tone === "bad" ? "circle-x" : props.tone === "todo" ? "circle-exclamation" : "help"} size="small" />
            </span>
          </Show>
          {props.title}
        </div>
        <Show when={props.description}>
          <div data-slot="settings-row-description">{props.description}</div>
        </Show>
      </div>
      <Show when={props.control}>
        <div data-slot="settings-row-control">{props.control}</div>
      </Show>
    </div>
  )
}

export function Section(props: { title: string; description?: string; children: JSX.Element; action?: string }) {
  return (
    <section class="settings-section" aria-label={props.title} data-bfp-section={props.action}>
      <h3 class="settings-section-title">{props.title}</h3>
      <Show when={props.description}>
        <div class="text-11-regular text-v2-text-text-muted" data-bfp-section-note>
          {props.description}
        </div>
      </Show>
      <div data-component="settings-list">{props.children}</div>
    </section>
  )
}

/** A form field inside a row: label, input, and a one-line help text under it. */
export function Field(props: { label: string; help?: JSX.Element; children: JSX.Element; field: string }) {
  return (
    <div data-bfp-field={props.field}>
      <div data-bfp-label>{props.label}</div>
      {props.children}
      <Show when={props.help}>
        <div data-bfp-help>{props.help}</div>
      </Show>
    </div>
  )
}

const OPT_OUT = { autocapitalize: "off", spellcheck: "false", "data-1p-ignore": "", "data-lpignore": "true", "data-form-type": "other" } as const

/** A masked input with the eye toggle of blindfold's card. What is typed lives in the caller's signal, never in an attribute. */
export function SecretInput(props: { ui: Ui; t: T; label: string; value: string; onInput: (value: string) => void; onSubmit?: () => void; field: string; disabled?: boolean }) {
  const [shown, setShown] = createSignal(false)
  let wrap: HTMLDivElement | undefined
  onMount(() => {
    const el = wrap?.querySelector("input")
    if (!el) return
    el.setAttribute("autocomplete", "new-password")
    el.setAttribute("name", `blindfold-${props.field}`)
    for (const [name, value] of Object.entries(OPT_OUT)) el.setAttribute(name, value)
  })
  const label = () => props.t(shown() ? "hide" : "show", { label: props.label })
  return (
    <div data-bfp-input data-bfp-masked={shown() ? undefined : ""} ref={wrap}>
      <props.ui.TextInput label={props.label} value={props.value} type={shown() ? "text" : "password"} size="large" disabled={props.disabled} onInput={props.onInput} onSubmit={() => props.onSubmit?.()} />
      <div data-bfp-reveal>
        <props.ui.Tooltip value={label()} placement="top">
          <props.ui.IconButton
            icon={shown() ? "outline-eye-slash" : "outline-eye"}
            label={label()}
            size="small"
            pressed={shown()}
            disabled={props.disabled}
            onClick={() => {
              setShown(!shown())
              wrap?.querySelector("input")?.focus()
            }}
          />
        </props.ui.Tooltip>
      </div>
    </div>
  )
}

/** Plain text input with the same field wrapper; `onCommit` runs on Enter and when it loses focus with a changed value. */
export function Text(props: { ui: Ui; label: string; value: string; onInput: (value: string) => void; onCommit?: () => void; placeholder?: string; disabled?: boolean; invalid?: boolean; field: string }) {
  let wrap: HTMLDivElement | undefined
  onMount(() => {
    const el = wrap?.querySelector("input")
    if (!el) return
    el.setAttribute("name", `blindfold-${props.field}`)
    el.setAttribute("autocomplete", "off")
    for (const [name, value] of Object.entries(OPT_OUT)) el.setAttribute(name, value)
  })
  return (
    <div data-bfp-input ref={wrap} onFocusOut={() => props.onCommit?.()}>
      <props.ui.TextInput label={props.label} value={props.value} size="large" placeholder={props.placeholder} disabled={props.disabled} invalid={props.invalid} onInput={props.onInput} onSubmit={() => props.onCommit?.()} />
    </div>
  )
}

/** Sites as chips: type one and press Enter (or comma); the chip's x removes it. */
export function Chips(props: { ui: Ui; t: T; label: string; value: readonly string[]; onChange: (value: string[]) => void; placeholder: string; disabled?: boolean; field: string }) {
  const [draft, setDraft] = createSignal("")
  const commit = () => {
    const next = draft()
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item !== "" && !props.value.includes(item))
    if (next.length > 0) props.onChange([...props.value, ...next])
    setDraft("")
  }
  return (
    <div data-bfp-chips={props.field}>
      <Show when={props.value.length > 0}>
        <ul data-bfp-chip-list>
          <For each={props.value}>
            {(site) => (
              <li data-bfp-chip>
                <span>{site}</span>
                <props.ui.IconButton icon="outline-xmark" label={props.t("chip.remove", { site })} size="small" variant="ghost-muted" disabled={props.disabled} onClick={() => props.onChange(props.value.filter((item) => item !== site))} />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <div data-bfp-input onFocusOut={commit} onKeyDown={(event) => event.key === "," && (event.preventDefault(), commit())}>
        <props.ui.TextInput label={props.label} value={draft()} size="large" placeholder={props.placeholder} disabled={props.disabled} onInput={setDraft} onSubmit={commit} />
      </div>
    </div>
  )
}
