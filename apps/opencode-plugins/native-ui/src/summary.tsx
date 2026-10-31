import { Show, type JSX, type ParentProps } from "solid-js"
import type { IconName, Ui } from "@opencode/plugin/gui"

// Host source: gui-plugins/src/details (the Session details popover) and its CSS in style[data-plugin=details]:
//   <section class="session-summary-card" data-section>
//     <h2 class="session-summary-row session-summary-heading"><span dir="auto" class="session-summary-label">…</span></h2>
//     <div class="session-summary-rows">
//       <button type="button" class="session-summary-row session-service-trigger" aria-expanded aria-controls>
//         <svg/><span class="session-summary-label">…</span><span class="session-service-count">3</span><svg chevron/>
// The classes are the host's, so the card only looks right while the details plugin (built in) has registered its
// style; everything below is markup, with no CSS of its own.

export function SummaryCard(props: ParentProps<{ section?: string; ref?(el: HTMLElement): void }>) {
  return (
    <section ref={(el) => props.ref?.(el)} class="session-summary-card" data-section={props.section}>
      {props.children}
    </section>
  )
}

export function SummaryHeading(props: { children: JSX.Element }) {
  return (
    <h2 class="session-summary-row session-summary-heading">
      <span dir="auto" class="session-summary-label">{props.children}</span>
    </h2>
  )
}

export function SummaryRows(props: ParentProps) {
  return <div class="session-summary-rows">{props.children}</div>
}

export interface SummaryRowProps {
  ui: Ui
  icon?: IconName
  /** Leading content in place of a host icon (an avatar, a spinner). */
  leading?: JSX.Element
  label: string
  count?: number
  /** Set when the row opens a disclosure: aria-expanded plus the host's trailing chevron. */
  expanded?: boolean
  controls?: string
  disabled?: boolean
  onClick?(event: MouseEvent): void
  ref?(el: HTMLButtonElement): void
}

/** A row in a summary card: the host's `.session-service-trigger` button. */
export function SummaryRow(props: SummaryRowProps) {
  return (
    <button
      ref={(el) => props.ref?.(el)}
      type="button"
      class="session-summary-row session-service-trigger"
      aria-expanded={props.expanded}
      aria-controls={props.expanded === undefined ? undefined : props.controls}
      disabled={props.disabled}
      onClick={(event) => props.onClick?.(event)}
    >
      <Show when={props.icon} fallback={props.leading}>
        {(icon) => <props.ui.Icon name={icon()} />}
      </Show>
      <span class="session-summary-label">{props.label}</span>
      <Show when={props.count !== undefined}>
        <span class="session-service-count" aria-hidden="true">{props.count}</span>
      </Show>
      <Show when={props.expanded !== undefined}>
        <props.ui.Icon name="chevron-right" />
      </Show>
    </button>
  )
}
