// A cheap fingerprint of a session's message list, for "did something arrive that could change my chip": a wake or notice
// (a new user message), a tool call finishing (the last assistant message gets its completion time or another part). Reads
// the last few messages only, never the whole conversation, so it costs the same on a 5,000-message session.

interface MessageLike {
  readonly id?: string
  readonly time?: { readonly completed?: number }
  readonly content?: readonly unknown[]
}

const TAIL = 4

export function messageSignature(messages: readonly unknown[]): string {
  const tail = messages.slice(-TAIL) as readonly MessageLike[]
  return `${messages.length}|${tail.map((m) => `${m.id ?? ""}.${m.time?.completed ?? ""}.${Array.isArray(m.content) ? m.content.length : ""}`).join("|")}`
}
