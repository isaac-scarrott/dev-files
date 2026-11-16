import { For, Show, createSignal, type JSX } from "solid-js"
import type { Row } from "./rows.js"
import { formatAge } from "./rows.js"

/** The panel's view of a ctx: only what it draws with, so a unit test can pass a stand-in. */
export interface PanelContext {
  readonly ui: {
    Button(props: {
      readonly children: JSX.Element
      readonly variant?: "neutral" | "contrast" | "ghost" | "ghost-muted" | "danger"
      readonly size?: "small" | "normal" | "large"
      readonly disabled?: boolean
      readonly onClick?: (event: MouseEvent) => void
    }): JSX.Element
  }
  t(key: string): string
}

export interface RowActions {
  open(row: Row): void
  allow(row: Row): void
  reject(row: Row): void
  choose(row: Row, value: string): void
  answer(row: Row, text: string): void
  dismiss(row: Row): void
}

export type RankedRow = Row & { readonly cost: number }

/**
 * Every ask waiting for Isaac, most expensive first: where it comes from, what it asks, how long it waited, how often it was
 * asked and how many idle sessions sit behind it. Answering happens here, in place, so the session need not be opened.
 */
export function InboxPanel(props: { ctx: PanelContext; rows: () => readonly RankedRow[]; actions: RowActions }) {
  return (
    <div data-inbox-panel>
      <Show when={props.rows().length === 0}>
        <div data-inbox-empty>{props.ctx.t("empty")}</div>
      </Show>
      <For each={props.rows()}>
        {(row) => <InboxRow ctx={props.ctx} row={row} actions={props.actions} />}
      </For>
    </div>
  )
}

function InboxRow(props: { ctx: PanelContext; row: RankedRow; actions: RowActions }) {
  const [text, setText] = createSignal("")
  const submit = () => {
    const value = text().trim()
    if (!value) return
    setText("")
    props.actions.answer(props.row, value)
  }
  return (
    <div data-inbox-row data-kind={props.row.kind}>
      <div data-inbox-head>
        <span data-inbox-project title={props.row.project}>
          {props.row.project}
        </span>
        <span data-inbox-title title={props.row.title}>
          {props.row.title}
        </span>
      </div>
      <div data-inbox-ask>{props.row.text}</div>
      <Show when={props.row.options !== undefined && props.row.options.length > 0}>
        <div data-inbox-options>
          <For each={props.row.options}>{(option) => <button type="button" data-inbox-option onClick={() => setText(option)}>{option}</button>}</For>
        </div>
      </Show>
      <div data-inbox-meta>
        <span data-inbox-age>{formatAge(props.row.ageMin * 60_000)}</span>
        <Show when={props.row.asks > 1}>
          <span data-inbox-reask>×{props.row.asks} asked</span>
        </Show>
        <Show when={props.row.waiters > 0}>
          <span data-inbox-blocked>blocks {props.row.waiters}</span>
        </Show>
      </div>
      <div data-inbox-actions>
        <Show when={props.row.kind === "permission"}>
          <props.ctx.ui.Button size="small" onClick={() => props.actions.allow(props.row)}>
            {props.ctx.t("allowOnce")}
          </props.ctx.ui.Button>
          <props.ctx.ui.Button size="small" variant="danger" onClick={() => props.actions.reject(props.row)}>
            {props.ctx.t("reject")}
          </props.ctx.ui.Button>
        </Show>
        <Show when={props.row.kind === "form" && props.row.field !== undefined && props.row.field.options.length > 0}>
          <For each={props.row.field?.options ?? []}>
            {(option) => (
              <props.ctx.ui.Button size="small" onClick={() => props.actions.choose(props.row, option.value)}>
                {option.label}
              </props.ctx.ui.Button>
            )}
          </For>
        </Show>
        <Show when={props.row.kind === "ask"}>
          <input
            data-inbox-answer-input
            type="text"
            value={text()}
            placeholder={props.ctx.t("answerPlaceholder")}
            onInput={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              submit()
            }}
          />
          <props.ctx.ui.Button size="small" disabled={text().trim().length === 0} onClick={submit}>
            {props.ctx.t("answer")}
          </props.ctx.ui.Button>
          <props.ctx.ui.Button size="small" variant="ghost" onClick={() => props.actions.dismiss(props.row)}>
            {props.ctx.t("dismiss")}
          </props.ctx.ui.Button>
        </Show>
        <props.ctx.ui.Button size="small" variant="ghost" onClick={() => props.actions.open(props.row)}>
          {props.ctx.t("open")}
        </props.ctx.ui.Button>
      </div>
    </div>
  )
}

/** The panel's own layout, in the app's tokens; the buttons come from the host and keep its look. */
export const inboxCss = `
[data-inbox-panel] {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  font-family: var(--v2-font-family-sans, inherit);
  font-size: 13px;
  line-height: 18px;
  color: var(--v2-text-text-base);
}
[data-inbox-empty] {
  padding: 16px;
  font-size: 12px;
  color: var(--v2-text-text-faint);
}
[data-inbox-row] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--v2-border-border-base);
}
[data-inbox-row][data-kind='permission'] {
  box-shadow: inset 3px 0 0 var(--v2-state-fg-warning);
}
[data-inbox-head] {
  display: flex;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
  line-height: 14px;
  color: var(--v2-text-text-muted);
}
[data-inbox-project] {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-inbox-title] {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-inbox-title]::before {
  content: "· ";
}
[data-inbox-ask] {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
[data-inbox-options] {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
[data-inbox-option] {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--v2-border-border-base);
  background: var(--v2-background-bg-layer-01);
  font-size: 11px;
  line-height: 16px;
  color: var(--v2-text-text-muted);
}
[data-inbox-meta] {
  display: flex;
  gap: 8px;
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--v2-text-text-faint);
}
[data-inbox-actions] {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
[data-inbox-answer-input] {
  flex: 1 1 140px;
  min-width: 100px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--v2-border-border-base);
  border-radius: 6px;
  background: var(--v2-background-bg-base);
  color: var(--v2-text-text-base);
  font: inherit;
  font-size: 12px;
}
[data-inbox-answer-input]:focus-visible {
  outline: 2px solid var(--v2-background-bg-accent);
  outline-offset: 1px;
}
`
