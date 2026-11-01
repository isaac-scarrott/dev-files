import { onCleanup } from "solid-js"

/**
 * Use as a `ref` on a looping indicator so every instance on screen shares one phase and pauses while hidden. Must run in
 * the component's owner: the observers belong to this spinner and disconnect with it.
 *
 * ResizeObserver delivers after style and layout but before paint, so a spinner that mounts or leaves `display: none`
 * (which restarts its CSS animation) paints its first frame already in phase.
 *
 * Spinners scrolled or clipped out of view, under a `display: none` or `content-visibility: hidden` ancestor, or sized
 * to nothing get `data-offscreen`, which their CSS uses to pause. Coming back, they resume and re-pin to the shared
 * phase. `visibility: hidden` and `opacity: 0` still count as visible.
 */
export function syncSpinPhase(el: Element) {
  const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => pinVisible(el))
  const visibility =
    typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver((entries) => {
          const entry = entries.at(-1)
          if (!entry) return
          el.toggleAttribute("data-offscreen", !entry.isIntersecting)
          pinVisible(el)
        })
  resize?.observe(el)
  visibility?.observe(el)
  // Turning reduced motion back off restarts the animation without resizing anything.
  const controller = new AbortController()
  el.addEventListener("animationstart", () => pinVisible(el), { signal: controller.signal })
  onCleanup(() => {
    resize?.disconnect()
    visibility?.disconnect()
    controller.abort()
  })
}

// Setting the start time of a paused CSS animation resumes it and makes it ignore `animation-play-state` from then on,
// so a paused spinner is left alone until it is visible. `getAnimations` flushes style, so a spinner that has just
// lost `data-offscreen` is running again by the time it is pinned.
function pinVisible(el: Element) {
  if (el.hasAttribute("data-offscreen")) return

  pinSpinPhase(el)
}

// Starting every infinite loop at the document timeline's origin puts all instances of one animation in phase.
export function pinSpinPhase(el: {
  getAnimations(
    options: GetAnimationsOptions,
  ): { startTime: CSSNumberish | null; effect: { getTiming(): EffectTiming } | null }[]
}) {
  el.getAnimations({ subtree: true })
    .filter((animation) => animation.effect?.getTiming().iterations === Infinity && animation.startTime !== 0)
    .forEach((animation) => {
      animation.startTime = 0
    })
}
