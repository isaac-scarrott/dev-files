/** The message metadata key `send_message` sets and the desktop card reads. Only the server side writes it. */
export const PEER_KEY = "peerMessage"

export type PeerMessage = { readonly sessionID: string; readonly title: string; readonly ref: string; readonly text: string }

/** The sender behind a user message the plugin delivered, or undefined for a message the user typed. */
export function peerOf(message: { readonly type?: string; readonly metadata?: Readonly<Record<string, unknown>> }): PeerMessage | undefined {
  if (message.type !== "user") return undefined
  const value = message.metadata?.[PEER_KEY]
  if (!value || typeof value !== "object") return undefined
  const { sessionID, title, ref, text } = value as Record<string, unknown>
  if (typeof sessionID !== "string" || typeof title !== "string" || typeof ref !== "string" || typeof text !== "string") return undefined
  return { sessionID, title, ref, text }
}
