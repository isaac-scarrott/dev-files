/** Quiet time the session's inputs must hold before its first tray may show. */
export const QUIET = 250
/** The longest a session waits for the composer to report its model before the tray stops waiting for it. */
export const CAP = 1500

export interface Timers {
  set: (callback: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

/**
 * When a session may first show a tray. On first load (app start, Cmd+R, opening a session) the host fills in its state
 * in steps: the messages arrive, and the composer reports a fallback model for a few milliseconds before the session's
 * own. A forecast taken in between is not true yet, and a tray built from it flashes in and retracts. So a session
 * settles only after `QUIET` ms in which none of its inputs changed, or `CAP` ms when the composer has reported no
 * model yet (a composer that never reports one must not hide an expired cache forever). After it has settled, changes
 * are the user's or the clock's and show at once.
 *
 * `watch(key, resolved)` is called whenever an input changes; `key` is the session (undefined: none), `resolved` is
 * whether the composer has reported a model. `onSettle(key)` runs once per session visit.
 */
export function settler(onSettle: (key: string) => void, timers: Timers = { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle as never) }) {
  let settled: string | undefined
  let timer: unknown

  const cancel = () => {
    timers.clear(timer)
    timer = undefined
  }

  return {
    watch(key: string | undefined, resolved: boolean) {
      cancel()
      if (!key) {
        settled = undefined
        return
      }
      if (key === settled) return
      timer = timers.set(() => {
        timer = undefined
        settled = key
        onSettle(key)
      }, resolved ? QUIET : CAP)
    },
    stop: cancel,
  }
}
