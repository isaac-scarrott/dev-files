import { springDuration, springEasing, springRest } from "./spring"

const GLIDE = "agents-dock-glide"
const SLIDE = "agents-dock-slide"
const FADE = "agents-dock-fade"
/** The host fades its side content in with this curve over 150ms. */
const FADE_MS = 150
const FADE_EASE = "cubic-bezier(.22, 1, .36, 1)"
/** How far the window travels while it enters or leaves. */
const SLIDE_PX = 16

const computed = (el: Element) => (el.ownerDocument.defaultView ?? window).getComputedStyle(el)

/** The host's frame loop takes its first spring step as one 60Hz frame, so its first painted frame is already that far in. */
const FIRST_STEP_MS = 1000 / 60

/**
 * The host times its spring by the panel's travel; its panel is at least 400px wide and 0.3s from 480px up. The window
 * only reserves 328px, but both are timed as the panel is, so the chat moves exactly as it does for the review panel.
 */
const PANEL_TRAVEL = 480

const spring = () => {
  const duration = springDuration(PANEL_TRAVEL)
  return { easing: springEasing(duration), ms: Math.ceil(springRest(duration) * 1000) }
}

/** The host's own test: `data-motion` on the root wins, then the media query. */
export function motionReduced(doc: Document = document) {
  const setting = doc.documentElement.getAttribute("data-motion")
  if (setting === "reduce") return true
  if (setting === "full") return false
  return doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

/** The chat's moving parts: the timeline's content under the sticky header, and the composer's column. */
export function glideTargets(card: Element): HTMLElement[] {
  const viewport = card.querySelector("[data-slot=session-timeline-scroll] > .scroll-view__viewport")
  const timeline = viewport ? [...viewport.children].filter((el) => !el.matches(".sticky, .session-header-fade, .shrink-0")) : []
  const composer = card.querySelector(":scope > div:has(form) > div.shrink-0.items-center")
  return [...timeline, ...(composer ? [...composer.children] : [])] as HTMLElement[]
}

const offsetOf = (el: HTMLElement) => {
  const value = parseFloat(computed(el).translate)
  return Number.isFinite(value) ? value : 0
}

/**
 * The chat's end padding changes by `delta` px at once (one layout, like the host's own panel which lands its final layout
 * first), and the content is moved back to where it was and glides to its new place: a `translate` Web Animation on the
 * same spring as the host's panel. Nothing is laid out per frame. Call it BEFORE the new padding is written, so the
 * current offsets (an interrupted glide) are read from a clean tree, and write the padding in the same task.
 */
export function glide(card: Element, delta: number) {
  if (!delta) return () => {}
  const targets = glideTargets(card)
  if (motionReduced(card.ownerDocument) || typeof targets[0]?.animate !== "function") return () => {}
  const sign = computed(card).direction === "rtl" ? -1 : 1
  // The centre of a centred column moves by half the padding change.
  const jump = (delta / 2) * sign
  const { easing, ms } = spring()
  const starts = targets.map((el) => offsetOf(el) + jump)
  return () => {
    targets.forEach((el, i) => {
      el.getAnimations().filter((a) => a.id === GLIDE).forEach((a) => a.cancel())
      el.animate({ translate: [`${starts[i]}px 0`, "0px 0"] }, { id: GLIDE, duration: ms, delay: -FIRST_STEP_MS, easing, fill: "backwards" })
    })
  }
}

const frameOf = (el: HTMLElement) => {
  const style = computed(el)
  const matrix = /matrix\(([^)]*)\)/.exec(style.transform)
  return { x: matrix ? parseFloat(matrix[1].split(",")[4]) || 0 : 0, opacity: Number(style.opacity) || 0 }
}

/**
 * The window enters or leaves: a slide on the same spring as the chat's glide, and the host's 150ms fade. Resolves when the fade is over, so a leaving window can be unmounted. Starting again
 * mid-way continues from where the window is.
 */
export function present(el: HTMLElement, shown: boolean, fresh = false): Promise<void> {
  // No Web Animations (a test DOM): a leaving window stays as long as its exit used to take.
  if (typeof el.animate !== "function") return shown ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, 270))
  const now = fresh ? { x: SLIDE_PX, opacity: 0 } : frameOf(el)
  el.getAnimations().filter((a) => a.id === SLIDE || a.id === FADE).forEach((a) => a.cancel())
  const end = shown ? { x: 0, opacity: 1 } : { x: SLIDE_PX, opacity: 0 }
  if (!motionReduced(el.ownerDocument)) {
    const { easing, ms } = spring()
    el.animate([{ transform: `translateX(${now.x}px)` }, { transform: `translateX(${end.x}px)` }], { id: SLIDE, duration: ms, delay: -FIRST_STEP_MS, easing, fill: "backwards" })
  }
  // While leaving, the stylesheet already says hidden; the fade holds the window visible until it is over.
  const hold = shown ? {} : { visibility: "visible" }
  const fade = el.animate([{ opacity: now.opacity, ...hold }, { opacity: end.opacity, ...hold }], { id: FADE, duration: FADE_MS, easing: FADE_EASE, fill: "backwards" })
  return fade.finished.then(() => {}, () => {})
}
