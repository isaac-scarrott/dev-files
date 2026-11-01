/** `native.sessionID` of the newest message part that carries one: the id Claude Code names its transcript with. */
export function nativeSessionID(messages: readonly unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const found = scan(messages[index], 0)
    if (found) return found
  }
}

function scan(value: unknown, depth: number): string | undefined {
  if (!value || typeof value !== "object" || depth > 6) return
  const record = value as Record<string, unknown>
  const native = record.native
  if (native && typeof native === "object") {
    const id = (native as Record<string, unknown>).sessionID
    if (typeof id === "string" && id) return id
  }
  const children = Array.isArray(value) ? [...value].reverse() : Object.values(record)
  for (const child of children) {
    const found = scan(child, depth + 1)
    if (found) return found
  }
}
