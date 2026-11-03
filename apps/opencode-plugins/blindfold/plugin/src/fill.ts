import { randomBytes } from "node:crypto"
import { FILL_SOURCE } from "./fill-script.js"

export type FillField = { name: string; kind: string; selector?: string; label?: string }

type Handle = { sessionID: string; tabID: string; origin: string; fields: FillField[]; values: string[]; expires: number }

/** A handle that nobody claims is dropped after this long. */
const TTL_MS = 2 * 60_000

const PATTERN = /^\s*(["'`])\{\{blindfold:fill\/([0-9a-f]{32})\}\}\1\s*;?\s*$/

/** The text of the script that fills, with the values inside it. As secret as the values: it exists only in memory, between the hook and the page. */
export function fillScript(origin: string, fields: FillField[], values: string[]) {
  return `${FILL_SOURCE}(${JSON.stringify({ origins: [origin], fields })}, ${JSON.stringify(values)})`
}

/**
 * Fill handles: `blindfold.fill` returns a placeholder script, and the `execute.before` hook of `browser.evaluate` swaps it
 * for the script that carries the values. Measured in the private harness: the tool runs with the swapped input while the
 * stored call keeps the placeholder, so no value reaches the model, agent code or the session database.
 *
 * The placeholder is claimed only when it is the whole script, as one string literal. Embedded in anything else (agent code
 * that would send the swapped text somewhere) it stays inert and the handle stays unclaimed.
 */
export function createFills(now: () => number = Date.now) {
  const handles = new Map<string, Handle>()
  const sweep = () => {
    for (const [id, handle] of handles) if (handle.expires <= now()) handles.delete(id)
  }
  return {
    issue(handle: Omit<Handle, "expires">) {
      sweep()
      const id = randomBytes(16).toString("hex")
      handles.set(id, { ...handle, expires: now() + TTL_MS })
      return `"{{blindfold:fill/${id}}}"`
    },
    /** The script to run instead of `script`, or undefined when it is not a live handle for this session and tab. */
    claim(script: string, context: { sessionID: string; tabID: unknown }) {
      sweep()
      const match = script.match(PATTERN)
      const handle = match && handles.get(match[2]!)
      if (!handle || handle.sessionID !== context.sessionID || handle.tabID !== context.tabID) return undefined
      handles.delete(match[2]!)
      return fillScript(handle.origin, handle.fields, handle.values)
    },
    clear: () => handles.clear(),
    get size() {
      return handles.size
    },
  }
}
