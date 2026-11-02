import { createSignal, createUniqueId, onCleanup, Show, type JSX } from "solid-js"
import type { IconName, Ui } from "@opencode/plugin/gui"
import { holdTop, scrollerOf } from "./anchor"

// A message the app injected into a session (a peer's, a monitor's, a scheduled run's) as a row in the style of the host's
// background-subagent row (`task-tool-surface`: 8px 12px padding, 8px radius, bg-layer-02, 13px/20px type, title 530) with
// its trailing action slot (`task-tool-action`). The header never changes when the row opens: the preview stays in layout but
// hidden, so the header keeps its width and a second click at the same spot collapses what the first opened. The content opens
// in a card below the header.

export interface InjectedMessageAction {
  icon: IconName
  /** Accessible name and tooltip. */
  label: string
  onClick(): void
}

export interface InjectedMessageRowProps {
  ui: Ui
  /** Which injected message this is (`peer`, `monitor`, `scheduler`); styles and tests key on it. */
  kind: string
  /** Leading 16px icon. */
  icon: JSX.Element
  title: string
  /** One line, ellipsized to the width of the column. */
  preview: string
  /** The body holds more than the preview shows (another line, text the preview cuts). A preview that overflows counts too, measured. */
  more?: boolean
  /** The 24px ghost icon button after the disclosure triangle; absent when the row has nothing to do. */
  action?: InjectedMessageAction
  /** Initial state. The row keeps its own after that. */
  open?: boolean
  onOpenChange?(open: boolean): void
  /** The open content; mounted only while open. */
  body: () => JSX.Element
}

export function InjectedMessageRow(props: InjectedMessageRowProps) {
  const id = `injected-body-${createUniqueId()}`
  const [open, setOpen] = createSignal(props.open ?? false)
  const [clipped, setClipped] = createSignal(false)
  const expandable = () => (props.more ?? false) || clipped()
  let root!: HTMLDivElement
  let preview!: HTMLSpanElement

  // Only a row whose body is the preview itself needs to know whether the preview is cut off. The observer's callback runs after
  // layout, so reading the widths there forces nothing; measuring on mount instead forced a layout per row while scrolling.
  // The preview is laid out in both states (hidden when open), but only the closed one tells.
  if (!props.more) {
    const measure = () => {
      if (!open()) setClipped(preview.scrollWidth > preview.clientWidth + 1)
    }
    const observer = new ResizeObserver(measure)
    onCleanup(() => observer.disconnect())
    queueMicrotask(() => observer.observe(preview))
  }

  // The host scrolls to the bottom whenever a row resizes, which would carry the clicked header out from under the pointer.
  // Hold the header at its screen position through the change (the user's decision; the host does not do this for its own
  // collapsibles). Only toggles made here are held.
  let release: (() => void) | undefined
  onCleanup(() => release?.())
  const toggle = () => {
    if (!expandable() && !open()) return
    const scroller = scrollerOf(root)
    const header = root.querySelector("[data-slot='injected-title']")
    release?.()
    release = scroller && header ? holdTop(scroller, header, root, 400) : undefined
    const next = !open()
    setOpen(next)
    props.onOpenChange?.(next)
  }

  return (
    <div ref={root} data-injected-row="" data-kind={props.kind} data-open={open()} data-expandable={expandable()}>
      <div data-slot="injected-head">
        <button type="button" data-slot="injected-trigger" aria-expanded={open()} aria-controls={id} aria-label={props.title} onClick={toggle} />
        <span data-slot="injected-icon" aria-hidden="true">{props.icon}</span>
        <span data-slot="injected-title" title={props.title}>{props.title}</span>
        <span ref={preview} data-slot="injected-preview">{props.preview}</span>
        <span data-slot="injected-tail">
          <span data-slot="injected-arrow" aria-hidden="true"><props.ui.Icon name="fill-triangle-down" size="small" /></span>
          <Show when={props.action}>
            {(action) => (
              <props.ui.Tooltip value={action().label}>
                <props.ui.IconButton class="injected-action" icon={action().icon} variant="ghost" label={`${action().label}: ${props.title}`} onClick={() => action().onClick()} />
              </props.ui.Tooltip>
            )}
          </Show>
        </span>
      </div>
      <Show when={open()}>
        <div id={id} data-slot="injected-body">{props.body()}</div>
      </Show>
    </div>
  )
}

const ROW = "[data-injected-row]"
const HEAD = `${ROW} [data-slot="injected-head"]`
const BODY = `${ROW} [data-slot="injected-body"]`
const TAIL = `${HEAD} [data-slot="injected-tail"]`
const SLOT = `[data-slot="injected-head"]:is(:hover, :focus-within, :has([data-slot="injected-trigger"]:focus-visible)) [data-slot="injected-tail"]`

/** Register once with `ctx.add(Style, injectedMessageRowCss)`. Host tokens only; both themes follow. No pointer cursor (the app reserves it for links). */
export const injectedMessageRowCss = `
[data-injected-host] [data-component="user-message"] { display: none; }
${ROW} { display: flex; flex-direction: column; align-items: flex-start; box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0; }
${HEAD} {
  position: relative; box-sizing: border-box; display: flex; align-items: flex-start; gap: 8px;
  width: fit-content; max-width: 100%; min-width: 0; padding: 8px 12px;
  border-radius: 8px; background: var(--v2-background-bg-layer-02);
  font: 440 13px/20px var(--v2-font-family-sans, inherit); letter-spacing: -0.04px; color: var(--v2-text-text-base);
}
${HEAD} [data-slot="injected-trigger"] { position: absolute; inset: 0; z-index: 0; margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent; }
${ROW}:not([data-expandable="true"]) [data-slot="injected-trigger"] { display: none; }
${HEAD}:has([data-slot="injected-trigger"]:focus-visible) { outline: 1px solid var(--v2-text-text-accent); outline-offset: 2px; }
${HEAD} [data-slot="injected-trigger"]:focus-visible { outline: none; }
/* 16px box centred on the 20px line; a drawn icon's ink starts 5px inside the box (the host's dithered agent icon fills it), so the box sits 5px left of the 12px content edge for the arrow-like ones. */
${HEAD} [data-slot="injected-icon"] { position: relative; flex: none; width: 16px; height: 16px; margin: 2px 0; color: var(--v2-text-text-faint); pointer-events: none; }
${HEAD} [data-slot="injected-icon"] > * { display: block; width: 16px; height: 16px; }
${HEAD} [data-slot="injected-title"] { position: relative; flex: 0 1 auto; min-width: 0; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 530; pointer-events: none; }
${HEAD} [data-slot="injected-preview"] { position: relative; flex: 1 1 0%; min-width: 0; height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; user-select: none; }
/* Open: the preview keeps its width but is not drawn (and leaves the accessibility tree), so the header is the same box as closed. */
${ROW}[data-open="true"] [data-slot="injected-preview"] { visibility: hidden; }
/* The trailing slot is the host task-tool-action, copied: collapsed it takes no room (width 0, and a negative margin cancels the row's
   8px gap), and on hover or focus it grows, fades in and slides from 4px left over 150ms ease. The 24px button's 4px side padding hangs
   outside the 16px slot (overflow-clip-margin), so its icon sits exactly where the host's chevron does. With the triangle in front the slot is 34px. */
${TAIL} {
  position: relative; flex: none; display: flex; align-items: center; gap: 2px; box-sizing: border-box; height: 20px;
  width: 0; margin-inline: -8px 0; opacity: 0; color: var(--v2-text-text-faint); transform: translate(-4px); overflow: clip; overflow-clip-margin: 4px;
  transition: width 150ms, margin-inline-start 150ms, opacity 150ms, color 150ms, transform 150ms;
}
:root[data-motion="reduce"] ${TAIL}, :root[data-motion="reduce"] ${HEAD} [data-slot="injected-arrow"] svg { transition: none; }
${ROW} ${SLOT}, ${ROW}[data-open="true"] [data-slot="injected-tail"] { opacity: 1; transform: none; width: 16px; margin-inline: -6px 0; }
${ROW}[data-expandable="true"] ${SLOT}, ${ROW}[data-open="true"] [data-slot="injected-tail"] { width: 34px; margin-inline: -6px 0; }
${HEAD} [data-slot="injected-arrow"] { display: flex; flex: none; align-items: center; justify-content: center; width: 16px; height: 20px; color: var(--v2-text-text-faint); pointer-events: none; }
${HEAD} [data-slot="injected-arrow"] svg { transform: rotate(-90deg); transition: transform 150ms ease; }
${ROW}[data-open="true"] [data-slot="injected-arrow"] svg { transform: rotate(0); }
${ROW}:not([data-expandable="true"]) [data-slot="injected-arrow"] { display: none; }
${HEAD} .injected-action { position: relative; flex: none; z-index: 1; margin: -2px -4px; transition: none; color: var(--v2-text-text-faint); }
@media (hover: none) { ${TAIL} { opacity: 1; transform: none; width: 16px; margin-inline: -6px 0; } ${ROW}[data-expandable="true"] ${TAIL} { width: 34px; } }
/* The content card below the header: the host's card surface, selectable text. */
${BODY} {
  box-sizing: border-box; align-self: stretch; margin-top: 4px; padding: 12px 14px; min-width: 0;
  border: 1px solid var(--v2-border-border-base); border-radius: 8px; background: var(--v2-background-bg-base);
  font: 440 13px/20px var(--v2-font-family-sans, inherit); letter-spacing: -0.04px; color: var(--v2-text-text-base);
  overflow-wrap: anywhere; user-select: text; cursor: text;
}
/* The host's Markdown is 14px/22.4px with its own block margins; the card uses the row's type and sets spacing between blocks itself. */
${BODY} [data-component="markdown"] { margin: 0; padding: 0; font: inherit; letter-spacing: inherit; }
${BODY} :is(p, ul, ol, blockquote, pre, table, hr, h1, h2, h3, h4, h5, h6, [data-component="markdown-code"]) { margin: 0; }
${BODY} :is(p, ul, ol, blockquote, pre, table, hr, h1, h2, h3, h4, h5, h6, [data-component="markdown-code"]) + :is(p, ul, ol, blockquote, pre, table, hr, h1, h2, h3, h4, h5, h6, [data-component="markdown-code"]) { margin-top: 8px; }
${BODY} :is(p, li, h1, h2, h3, h4, h5, h6) { font: inherit; letter-spacing: inherit; }
${BODY} :is(ul, ol) { padding-inline-start: 18px; }
${BODY} li { margin: 0; padding: 0; }
${BODY} li + li { margin-top: 2px; }
${BODY} li > p { margin: 0; }
`
