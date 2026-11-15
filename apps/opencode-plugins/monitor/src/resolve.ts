import type { Named } from "./manager.js"

/** What a call's `id` argument meant: one monitor, or why none did and what this session has instead. */
export type Resolution =
  | { readonly id: string }
  | { readonly reason: "unknown" | "ambiguous"; readonly candidates: readonly Named[]; readonly own: readonly Named[] }

/**
 * `monitor.wait` and `monitor.stop` take an id, and an agent that passes the name it gave at `monitor.start` means that
 * monitor: two agents did, and were told only "No monitor with id vitest-flags". A name resolves when exactly one of the
 * caller's own monitors has it. An id always means itself, even another session's, so the refusal that says whose it is
 * still comes first.
 */
export function resolveMonitor(known: readonly Named[], given: string, session: string): Resolution {
  if (known.some((monitor) => monitor.id === given)) return { id: given }
  const own = known.filter((monitor) => monitor.session === session)
  const named = own.filter((monitor) => monitor.name === given)
  if (named.length === 1) return { id: named[0]!.id }
  return { reason: named.length > 1 ? "ambiguous" : "unknown", candidates: named, own }
}
