export interface ScheduledRun {
  readonly id: string
  readonly name: string
  readonly kind: "once" | "every" | "cron"
  /** The prompt exactly as the task was created, not the escaped wrapper the model sees. */
  readonly text: string
}

/**
 * The scheduled run a user message is, or undefined for anything else. The scheduler stamps `metadata.scheduledTask` on the
 * prompts it sends (with the real task text), so a message a user typed with the same tags stays the user's bubble and nothing
 * has to be parsed out of the wrapper.
 */
export function scheduledOf(message: { readonly type?: string; readonly metadata?: Readonly<Record<string, unknown>> }): ScheduledRun | undefined {
  if (message.type !== "user") return undefined
  const stamp = message.metadata?.scheduledTask
  if (!stamp || typeof stamp !== "object") return undefined
  const { id, name, kind, text } = stamp as Record<string, unknown>
  if (typeof id !== "string" || typeof name !== "string" || typeof text !== "string") return undefined
  if (kind !== "once" && kind !== "every" && kind !== "cron") return undefined
  return { id, name, kind, text }
}
