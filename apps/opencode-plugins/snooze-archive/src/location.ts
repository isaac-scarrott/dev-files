/**
 * The host cannot read some of a session's data (its pending approvals) once the folder the session ran in is gone, for
 * example a deleted worktree: it answers LocationNotFoundError. Nothing can be pending in a folder that no longer exists,
 * so that answer means "no requests", not a failure.
 */
export function isLocationGone(cause: unknown): boolean {
  if (typeof cause === "string") return cause.includes("LocationNotFoundError")
  if (typeof cause !== "object" || cause === null) return false
  const record = cause as { _tag?: unknown; name?: unknown; message?: unknown }
  return record._tag === "LocationNotFoundError" || record.name === "LocationNotFoundError" || String(record.message ?? "").includes("LocationNotFoundError") || String(cause).includes("LocationNotFoundError")
}
