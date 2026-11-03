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
  /** The text behind a preview that was reworded for reading; shown as the header's tooltip. */
  previewTitle?: string
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
  let main!: HTMLSpanElement
  let tail!: HTMLSpanElement

  // Whether the text is cut off decides the fade (every row) and, for a row whose body is the preview itself, whether it expands.
  // Like the host's, the clip box (`main`) cuts the text, and the trailing slot takes room from it on hover, so the width compared
  // is the one at rest: the box plus what the slot has taken so far. The observer's callback runs after layout, so reading the
  // widths there forces nothing; measuring on mount instead forced a layout per row while scrolling. The text is laid out in both
  // states (hidden when open), but only the closed one tells.
  const measure = () => {
    if (open()) return
    const taken = tail.getBoundingClientRect().width + (parseFloat(getComputedStyle(tail).marginInlineStart) || 0)
    setClipped(main.scrollWidth > main.clientWidth + taken + 1)
  }
  const observer = new ResizeObserver(measure)
  onCleanup(() => observer.disconnect())
  queueMicrotask(() => observer.observe(main))

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
    <div ref={root} data-injected-row="" data-kind={props.kind} data-open={open()} data-expandable={expandable()} data-clipped={clipped()} data-action={props.action ? "" : undefined}>
      <div data-slot="injected-head" title={props.previewTitle}>
        <button type="button" data-slot="injected-trigger" aria-expanded={open()} aria-controls={id} aria-label={props.title} onClick={toggle} />
        <span data-slot="injected-icon" aria-hidden="true">{props.icon}</span>
        <span ref={main} data-slot="injected-main">
          <span data-slot="injected-title" title={props.title}>{props.title}</span>
          <span data-slot="injected-preview">{props.preview}</span>
        </span>
        <span ref={tail} data-slot="injected-tail">
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
const FOLLOWED = `[data-timeline-key^="user-message:"]:has(+ [data-timeline-key^="turn-gap:"] + [data-timeline-key^="user-message:"])`
const HEAD = `${ROW} [data-slot="injected-head"]`
const BODY = `${ROW} [data-slot="injected-body"]`
const TAIL = `${HEAD} [data-slot="injected-tail"]`
const SLOT = `[data-slot="injected-head"]:is(:hover, :focus-within, :has([data-slot="injected-trigger"]:focus-visible)) [data-slot="injected-tail"]`

/** Register once with `ctx.add(Style, injectedMessageRowCss)`. Host tokens only; both themes follow. No pointer cursor (the app reserves it for links). */
export const injectedMessageRowCss = `
[data-injected-host] [data-component="user-message"] { display: none; }
/* The row stands where a user bubble would and takes its row height, so everything below it sits where it does under a bubble. The host's
   user row is the bubble (37px) + 8px margin + the 20px copy/retry footer (hover-only, but laid out) = 65px for the last message of a run
   (and the bubble's 37px alone when another user message follows, a 4px TurnGap row between them). Ours is the 36px header (13px/20px type
   like the host subagent row, against the bubble's 17px line) plus the remainder: 29px, or 1px inside a run. The host's own hidden bubble
   and footer are display:none here, so none of that is counted twice. The padding is the row's own height, so the virtualised timeline
   measures it; a margin would collapse out of the host's content box. */
${ROW} { display: flex; flex-direction: column; align-items: flex-start; box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0; padding-bottom: 29px; }
${FOLLOWED} ${ROW} { padding-bottom: 1px; }
${HEAD} {
  position: relative; box-sizing: border-box; display: flex; align-items: flex-start; gap: 8px;
  width: fit-content; max-width: calc(100% - 24px); min-width: 0; padding: 8px 12px;
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
/* Title and preview sit in one clip box, as in the host's row: both keep their natural width and the box cuts them mid-glyph (no ellipsis)
   when the row is at its cap (the container less 24px). The trailing slot takes its width from the box, so a full-width row does not
   grow on hover, its text is cut 18px earlier, and the chevron stays on the row's right edge. */
${HEAD} [data-slot="injected-main"] { position: relative; flex: 1 1 auto; display: flex; gap: 8px; min-width: 0; overflow: hidden; pointer-events: none; }
${HEAD} [data-slot="injected-title"] { flex: none; white-space: nowrap; font-weight: 530; }
${HEAD} [data-slot="injected-preview"] { flex: none; height: 20px; overflow: hidden; white-space: nowrap; user-select: none; }
/* A clipped end fades out like the host's sidebar tab titles (the tab-link mask: a 16px linear ramp ending at the clip edge,
   only on a title that overflows, not animated). The mask is on the clip box, whose edge moves 18px when the slot opens, so the ramp
   moves with it. A row that fits keeps no mask. */
${ROW}[data-clipped="true"] [data-slot="injected-main"] {
  -webkit-mask-image: linear-gradient(to right, black 0, black calc(100% - 16px), transparent 100%);
  mask-image: linear-gradient(to right, black 0, black calc(100% - 16px), transparent 100%);
}
/* Open: the preview keeps its width but is not drawn (and leaves the accessibility tree), so the header is the same box as closed. */
${ROW}[data-open="true"] [data-slot="injected-preview"] { visibility: hidden; }
/* The trailing slot is the host task-tool-action, copied: the last item of the row, so the chevron rides the row's right edge. Collapsed
   it has no width and leaves the row's 8px gap (the host's info row has the same gap: a row rests 8px wider than its text, a full-width one cuts its text 8px short of the slot), and on hover or focus it grows to 16px plus a 2px margin, fades in and slides from
   4px left over 150ms ease. The host centres a bare 16px chevron in its slot, so the chevron travels 4px (1154 to 1150 at 1300px) while
   the slot grows from the row's right edge. Ours keeps the action last (end-aligned, so a 34px slot with the triangle in front of it
   ends in the same place) and moves it 8px over the same 150ms, which makes the same 4px path whatever the slot's width. The 24px
   button's 4px side padding hangs outside the 16px slot (overflow-clip-margin), so its icon sits exactly where the host's chevron
   does. With the triangle in front of an action the slot is 34px. */
${TAIL} {
  position: relative; flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 2px; box-sizing: border-box; height: 20px;
  width: 0; margin-inline: 0; opacity: 0; color: var(--v2-text-text-faint); transform: translate(-4px); overflow: clip; overflow-clip-margin: 4px; pointer-events: none;
  transition: width 150ms, margin-inline-start 150ms, opacity 150ms, color 150ms, transform 150ms;
}
:root[data-motion="reduce"] ${TAIL}, :root[data-motion="reduce"] ${HEAD} [data-slot="injected-arrow"] svg, :root[data-motion="reduce"] ${HEAD} .injected-action { transition: none; }
${ROW} ${SLOT}, ${ROW}[data-open="true"] [data-slot="injected-tail"] { opacity: 1; transform: none; width: 16px; margin-inline: 2px 0; }
${ROW}[data-expandable="true"][data-action] ${SLOT}, ${ROW}[data-open="true"][data-action] [data-slot="injected-tail"] { width: 34px; margin-inline: 2px 0; }
${HEAD} [data-slot="injected-arrow"] { display: flex; flex: none; align-items: center; justify-content: center; width: 16px; height: 20px; color: var(--v2-text-text-faint); pointer-events: none; }
${HEAD} [data-slot="injected-arrow"] svg { transform: rotate(-90deg); transition: transform 150ms ease; }
${ROW}[data-open="true"] [data-slot="injected-arrow"] svg { transform: rotate(0); }
${ROW}:not([data-expandable="true"]) [data-slot="injected-arrow"] { display: none; }
${HEAD} .injected-action { position: relative; flex: none; z-index: 1; pointer-events: auto; margin: -2px -4px; transform: translate(8px); transition: transform 150ms; color: var(--v2-text-text-faint); }
${ROW} ${SLOT} .injected-action, ${ROW}[data-open="true"] .injected-action { transform: none; }
@media (hover: none) { ${TAIL} { opacity: 1; transform: none; width: 16px; margin-inline: 2px 0; } ${HEAD} .injected-action { transform: none; } ${ROW}[data-expandable="true"][data-action] ${TAIL} { width: 34px; } }
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
