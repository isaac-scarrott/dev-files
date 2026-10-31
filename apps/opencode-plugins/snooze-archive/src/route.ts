// The host's URL-safe base64 (util/src/encode.ts), which its session routes use for the server key.
function base64Encode(value: string) {
  const binary = Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join("")
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

export const sessionHref = (server: string, sessionID: string) => `/server/${base64Encode(server)}/session/${sessionID}`

// Shows a session in the current tab, as the native subagent rows do (navigate to the session route). No public API
// navigates a tab, and `tabs.open` would add the session to the normal list; the app's router handles same-origin
// anchor clicks that carry `link`.
export function openInCurrentTab(doc: Document, server: string, sessionID: string) {
  const anchor = doc.createElement("a")
  anchor.href = sessionHref(server, sessionID)
  anchor.setAttribute("link", "")
  anchor.hidden = true
  doc.body.append(anchor)
  anchor.click()
  anchor.remove()
}
