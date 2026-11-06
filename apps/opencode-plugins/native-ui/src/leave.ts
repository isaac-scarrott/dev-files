/**
 * Calls `done` once, when the exit transition on `host` has actually finished. A timer set when the exit begins is the
 * wrong clock: the app can hold the main thread for a few hundred ms while it renders a sent message, the timer fires
 * with the stall, and the tray is removed before its first animated frame. So the end is the transition's own event
 * (`transitionend` on the opacity track, or `transitioncancel`); the timers are only backstops, one that starts after
 * the first frame that painted the closing state, and one hard cap for a window that paints no frames.
 */
export function afterExit(host: HTMLElement, done: () => void, ms: number, cap = ms * 8 + 2000) {
  let frame = 0
  let backstop: ReturnType<typeof setTimeout> | undefined
  let hard: ReturnType<typeof setTimeout> | undefined
  let over = false

  const end = () => {
    if (over) return
    over = true
    cancelAnimationFrame(frame)
    clearTimeout(backstop)
    clearTimeout(hard)
    host.removeEventListener("transitionend", ended)
    host.removeEventListener("transitioncancel", ended)
    done()
  }

  const ended = (event: Event) => {
    if (event.target === host && (event as TransitionEvent).propertyName === "opacity") end()
  }

  host.addEventListener("transitionend", ended)
  host.addEventListener("transitioncancel", ended)
  frame = requestAnimationFrame(() => {
    backstop = setTimeout(end, ms)
  })
  hard = setTimeout(end, cap)

  return end
}
