# visual-replies

Agents reply with a self-contained HTML page (chart, table, diagram, mockup) that renders inline in the OpenCode Desktop timeline.

- Server part: tool `publish_html` (`title`, `html`, optional local `images` embedded as data URIs), a system instruction, and the `visual-replies` RPC (`get`, `list`, `published` event). Pages are stored in plugin storage under the tool call id and deleted with their session.
- GUI part: finds the tool row (`[data-component="tool-part-wrapper"][data-timeline-part-id]`, the id is the tool call id) and inserts a card with a sandboxed iframe after it. The iframe has `sandbox="allow-scripts"` (opaque origin), a `csp` attribute and a CSP meta that block all network; the page talks to the app only through validated `postMessage` (height, ready, open link).
- Auto-open: the host folds finished `execute` calls into a collapsed "Used N Execute" row (`[data-component="collapsed-tool-group"][data-timeline-part-ids]`, ids stay in the DOM while closed) and mounts the tool rows, and so our card, only once it opens. `src/groups.ts` clicks that row's own trigger once per page id when it holds a published page, so the host's expand motion and open state apply. A row the reader closes stays closed; a reload opens it once more. No public registry or setting controls tool-group disclosure in 2.2.5.
- Theme: `--bg --surface --surface-2 --fg --muted --border --accent --danger --warning --info --font --mono` follow the app's light/dark tokens.

Register by absolute path in `~/.config/opencode/opencode.json` `plugins`. Checks: `pnpm typecheck && pnpm test && pnpm build`.
