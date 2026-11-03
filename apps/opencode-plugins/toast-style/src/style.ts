import { ACTIONS, BUTTON, CARD, CARD_CLASS, CARD_STRONG, CONTENT, DESCRIPTION, HAS_GLYPH, NEEDS_YOU, REGION, REGION_FONT_HOOK, STATE, TITLE } from "./host-markup"

/** Set on `:root` by a plugin that knows which key opens the next waiting request: shown on the front needs-you card's primary button. Unset: no hint. */
export const HINT_VAR = "--toast-style-go-next-hint"

const MOVE = "cubic-bezier(0.2, 0, 0, 1)"
const LEAVE = "cubic-bezier(0.4, 0, 1, 1)"
const PEEK = 8
const STEP = 0.04

const reduced = (scope: string) => `${scope}${CARD}, ${scope}${CARD} > * { transition: opacity 120ms linear !important; animation: none !important; }
${scope}${CARD_STRONG}${STATE.removed}${STATE.notSwiped}${STATE.front} { --y: translateY(0); }`

/**
 * The app's toast, finished: the numbers are the app's own `.toast-v2` rule, which solid-sonner's later stylesheet
 * overrides (system font, 400ms ease, 12px peek). Nothing here sets a glyph colour or replaces a glyph.
 */
export function toastCss(): string {
  return `
/* The app's font: solid-sonner puts a system stack on the region and the cards inherit it. */
${REGION}${REGION_FONT_HOOK} { font-family: var(--font-family-sans); }

/* The app's own timings (.toast-v2 declares them; solid-sonner's 400ms ease wins today). */
${CARD} { transition: transform 280ms ${MOVE}, opacity 160ms ease-out, height 280ms ${MOVE}, box-shadow 160ms ease-out; }
${CARD} > * { transition: opacity 160ms ease-out; }
${CARD} ${DESCRIPTION}:not(:empty) { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }

/* Stack: cards behind peek ${PEEK}px and shrink ${STEP * 100}% a step. */
${CARD}${STATE.collapsedBehind} { --y: translateY(calc(-1 * var(--toasts-before) * ${PEEK}px)) scale(calc(1 - var(--toasts-before) * ${STEP})); }

/* Exit: a short fade down and in. A card behind keeps its own removal path. */
${CARD_STRONG}${STATE.removed}${STATE.notSwiped} { transition: transform 160ms ${LEAVE}, opacity 160ms ${LEAVE}, height 160ms ${LEAVE}; }
${CARD_STRONG}${STATE.removed}${STATE.notSwiped}${STATE.front} { --y: translateY(6px) scale(0.98); opacity: 0; }

/* Every toast, whoever raised it: the glyph shares the title's row; the text and the buttons use the full width. */
${CARD} { column-gap: 8px; row-gap: 0; }
${CARD} > ${CONTENT} { display: contents; }
${CARD} ${TITLE} { grid-area: 1 / 1; min-width: 0; }
${CARD}${HAS_GLYPH} ${TITLE} { grid-column: 2; }
${CARD} ${DESCRIPTION} { grid-area: 2 / 1 / 3 / -1; margin-top: 2px; }
${CARD} ${ACTIONS} { grid-area: 3 / 1 / 4 / -1; margin-top: 10px; }

/* Buttons: the first is the primary (the app's neutral), the rest are quiet. */
${CARD} ${ACTIONS} ${BUTTON}:nth-child(n + 2) { color: var(--v2-text-text-muted); background-color: transparent; background-image: none; box-shadow: none; font-weight: 440; }
${CARD} ${ACTIONS} ${BUTTON}:nth-child(n + 2):hover:not(:disabled) { background-color: var(--v2-overlay-simple-overlay-hover); background-image: none; }
${CARD} ${ACTIONS} ${BUTTON}:nth-child(n + 2):active:not(:disabled) { background-color: var(--v2-overlay-simple-overlay-pressed); background-image: none; }

/* A waiting request: its button is the app's contrast button. */
${CARD}${NEEDS_YOU} ${ACTIONS} ${BUTTON}:first-child { background-color: var(--v2-background-bg-contrast); background-image: linear-gradient(180deg, var(--v2-alpha-light-20) 0%, var(--v2-alpha-light-0) 100%), linear-gradient(90deg, var(--v2-background-bg-contrast) 0%, var(--v2-background-bg-contrast) 100%); color: var(--v2-text-text-contrast); text-shadow: rgba(0, 0, 0, 0.3) 0 0.5px 0.5px; box-shadow: var(--v2-elevation-button-contrast); }
${CARD}${NEEDS_YOU} ${ACTIONS} ${BUTTON}:first-child:hover:not(:disabled) { background-image: linear-gradient(90deg, var(--v2-overlay-simple-overlay-contrast-hover) 0%, var(--v2-overlay-simple-overlay-contrast-hover) 100%), linear-gradient(180deg, var(--v2-alpha-light-20) 0%, var(--v2-alpha-light-0) 100%), linear-gradient(90deg, var(--v2-background-bg-contrast) 0%, var(--v2-background-bg-contrast) 100%); }
${CARD}${NEEDS_YOU} ${ACTIONS} ${BUTTON}:first-child:active:not(:disabled) { background-image: linear-gradient(90deg, var(--v2-overlay-simple-overlay-contrast-pressed) 0%, var(--v2-overlay-simple-overlay-contrast-pressed) 100%), linear-gradient(180deg, var(--v2-alpha-light-20) 0%, var(--v2-alpha-light-0) 100%), linear-gradient(90deg, var(--v2-background-bg-contrast) 0%, var(--v2-background-bg-contrast) 100%); }
${CARD}${STATE.front}${NEEDS_YOU} ${ACTIONS} ${BUTTON}:first-child::after { content: var(${HINT_VAR}, none); margin-left: 6px; font-size: 11px; line-height: 16px; font-weight: 440; letter-spacing: 0.02em; color: color-mix(in srgb, currentColor 70%, transparent); text-shadow: none; }

/* "+N more": the cards past the visible three, counted. */
${REGION} { counter-reset: toast-style-hidden; }
${CARD}${STATE.hidden}:not(${STATE.removed}) { counter-increment: toast-style-hidden; }
${REGION}:has(${CARD_CLASS}${STATE.hidden}:not(${STATE.removed})):not(:has(${CARD_CLASS}${STATE.expanded}))::after { content: "+" counter(toast-style-hidden) " more"; position: absolute; right: 0; bottom: calc(var(--front-toast-height, 0px) + ${(2 * PEEK) + 8}px); height: 20px; padding: 0 8px; border-radius: 10px; font-size: 12px; line-height: 20px; font-weight: 530; letter-spacing: -0.04px; color: var(--v2-text-text-muted); background: var(--v2-background-bg-layer-01); box-shadow: var(--v2-elevation-floating); pointer-events: none; }

/* No movement for people who ask for none: the fade alone. */
@media (prefers-reduced-motion: reduce) {
${reduced("")}
}
${reduced(':root[data-motion="reduce"] ')}
`
}
