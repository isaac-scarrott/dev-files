import type { MountedSession } from "@opencode/plugin/gui"

// The host's own URL-safe base64 (util/src/encode.ts), which its session routes use for the server key.
function base64Encode(value: string) {
  const binary = Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join("")
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

/** The host's session route (`sessionHref` in shell/routes/session.ts). */
export const sessionHref = (server: string, sessionID: string) => `/server/${base64Encode(server)}/session/${sessionID}`

/**
 * Opens a child session in the tab that shows its parent, as the native subagent rows and the ancestor trail do
 * (`useOpenSessionRoute`: navigate to the session route). No public API navigates a tab, so this clicks an anchor to the
 * route: the app's router handles same-origin anchor clicks that carry `link`, pushing history so Back returns.
 */
export function openInCurrentTab(session: MountedSession, childID: string) {
  const anchor = document.createElement("a")
  anchor.href = sessionHref(session.server.id, childID)
  anchor.setAttribute("link", "")
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}
