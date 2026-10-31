# visual-replies

Agents reply with a self-contained HTML page (chart, table, diagram, mockup) that renders inline in the OpenCode Desktop timeline.

- Server part: tool `publish_html` (`title`, `html`, optional local `images` embedded as data URIs), a system instruction, and the `visual-replies` RPC (`get`, `list`, `published` event). Pages are stored in plugin storage under the tool call id and deleted with their session.
- GUI part: finds the tool row (`[data-component="tool-part-wrapper"][data-timeline-part-id]`, the id is the tool call id) and inserts a card with a sandboxed iframe after it. The iframe has `sandbox="allow-scripts"` (opaque origin), a `csp` attribute and a CSP meta that block all network; the page talks to the app only through validated `postMessage` (height, ready, open link).
- Theme: `--bg --surface --surface-2 --fg --muted --border --accent --danger --warning --info --font --mono` follow the app's light/dark tokens.

Register by absolute path in `~/.config/opencode/opencode.json` `plugins`. Checks: `pnpm typecheck && pnpm test && pnpm build`.
