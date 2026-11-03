// Every selector this plugin aims at the app's toast markup, and the only file that names it (`style.test.ts` fails when
// any other source file does). 2.2.5 markup, read from the live DOM and checked by `parity.spec.mjs`:
//
//   ol.toast-v2-region[data-sonner-toaster]          the region; solid-sonner's stylesheet sets its font
//     li.toast-v2.toast-v2--{default,success,error}[data-sonner-toast]
//         [data-expanded][data-front][data-visible][data-removed][data-swipe-out]   solid-sonner state, set per card
//         [style="--toasts-before: n; --front-toast-height: …"]                     solid-sonner geometry
//       button[data-close-button]                    always first
//       div[data-icon] > svg > use[href="#opencode-v2-icon-<name>"]   only when the toast has an icon
//       div[data-content] > [data-title] + [data-description]
//       div[data-slot="toast-v2-actions"] > button[data-component="button-v2"][data-variant="neutral"] …
//
// A change in any of it fails the probe, not the user.

/** The region, and a card inside it: one extra class beats solid-sonner's `[data-sonner-toast]`, which is injected after the app's stylesheet. */
export const REGION = ".toast-v2-region"
export const CARD_CLASS = ".toast-v2"
export const CARD = `${REGION} ${CARD_CLASS}`

/** Beats solid-sonner's removal rules, which carry up to five attributes and are injected after the app's stylesheet. */
export const CARD_STRONG = ".toast-v2-region.toast-v2-region .toast-v2.toast-v2"

/** Both set by solid-sonner; the region carries the font, the card the motion. */
export const REGION_FONT_HOOK = "[data-sonner-toaster]"

/** Depends on: the title and description are direct children of `[data-content]`. */
export const CONTENT = "[data-content]"
export const TITLE = "[data-title]"
export const DESCRIPTION = "[data-description]"
export const GLYPH = "[data-icon]"
export const CLOSE = "[data-close-button]"

/** Depends on: the buttons of a toast are `button-v2`s in this slot, in the order the plugin passed them. */
export const ACTIONS = '[data-slot="toast-v2-actions"]'
export const BUTTON = '[data-component="button-v2"]'

/** solid-sonner state attributes. */
export const STATE = {
  collapsedBehind: '[data-expanded="false"][data-front="false"]',
  expanded: '[data-expanded="true"]',
  front: '[data-front="true"]',
  hidden: '[data-visible="false"]',
  removed: '[data-removed="true"]',
  notSwiped: '[data-swipe-out="false"]',
} as const

/** A toast with a glyph (the host lays it out in three columns); `:has()` on the card itself. */
export const HAS_GLYPH = `:has(> ${GLYPH})`

/**
 * The one hook on a kind: the `notifications` plugin draws a waiting request with the `notifications` glyph, and the host adds no
 * id, class or data attribute to a toast. Only the primary button of such a toast turns to the contrast button.
 */
export const NEEDS_YOU = `:has(> ${GLYPH} use[href$="icon-notifications"])`

/** What each selector above needs, for the probe: one toast shaped so that it matches. */
export const PROBES: readonly { readonly name: string; readonly selector: string; readonly shape: "text" | "glyph" | "actions" | "needs-you" | "stack" }[] = [
  { name: "region", selector: REGION, shape: "text" },
  { name: "region font hook", selector: `${REGION}${REGION_FONT_HOOK}`, shape: "text" },
  { name: "card", selector: CARD, shape: "text" },
  { name: "content", selector: `${CARD} > ${CONTENT}`, shape: "text" },
  { name: "title", selector: `${CARD} ${CONTENT} > ${TITLE}`, shape: "text" },
  { name: "description", selector: `${CARD} ${CONTENT} > ${DESCRIPTION}`, shape: "text" },
  { name: "close", selector: `${CARD} > ${CLOSE}`, shape: "text" },
  { name: "glyph", selector: `${CARD} > ${GLYPH}`, shape: "glyph" },
  { name: "actions", selector: `${CARD} ${ACTIONS} > ${BUTTON}`, shape: "actions" },
  { name: "needs-you glyph", selector: `${CARD}${NEEDS_YOU}`, shape: "needs-you" },
  { name: "state: front", selector: `${CARD}${STATE.front}`, shape: "text" },
  { name: "state: collapsed behind", selector: `${CARD}${STATE.collapsedBehind}`, shape: "stack" },
  { name: "state: hidden", selector: `${CARD}${STATE.hidden}`, shape: "stack" },
]
