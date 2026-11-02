# visual-replies: design

Agents show a chart, table, diagram or mock-up as an **OpenCode artifact**, and this plugin renders it inline under the tool call and in a side-panel tab. One artifact, two views.

## Decisions

Settled with the user (2026-11-01, after the artifact spike):

1. **Depends on `experimental.artifacts: true`.** The host's artifact tools and routes only exist with it; the README documents the config line. Experimental: the host says it "may change without notice", so the plugin is pinned to 2.2.5 and the harness run below is its smoke test.
2. **Cleanup is the agent's job.** The hooked prompt tells it to `artifact_delete` a quick mock-up when done or superseded and to keep long-running ones. Artifacts are not deleted with their session (verified in 2.2.5) and a server plugin has no artifact API, so there is no automatic sweep.
3. **`artifact_update` is a compact row.** `Updated <title>` in the host's own tool-row markup (computed style identical to the host's row next to it, harness check), clicking it opens the panel. The first card re-renders the latest version; an update never becomes a second full card.
4. **Local images are gone.** No `images` embedding: the prompt asks for inline SVG or `data:` URIs.
5. **Single-file HTML for v1.** A card and the panel show the artifact's entry file only (`srcdoc` cannot resolve siblings). The prompt says so.
6. **Id mapping under Code Mode.** The prompt asks the agent to `return` the tool result from `execute`; the time-window match is the fallback.

Plugin decisions:

- **Package and id stay `visual-replies`** so the registered absolute path keeps working.
- **Server part = one `context` hook** carrying the prompt, added only while the host's artifact tools exist (`ctx.tool.list()` has `opencode_artifact_create`; the hook event's own `tools` is just the model's visible catalog and does not list them). No tool, no storage, no RPC, no `session.deleted` cleanup. Built to `dist/server.js` (not raw TS), public `Plugin` import only.
- **Match the host.** The compact row reuses the host's `tool-part-wrapper` / `collapsible` / `basic-tool-*` markup, so its CSS applies and nothing is restyled here. The card's controls reveal on hover with no transition, as the host reveals row actions; the panel and card do not animate on load or on update. Earlier versions used `ease-out` 150ms for that reveal: removed.
- **Card chrome** (head, zoom, expand overlay) is unchanged from the earlier plugin; buttons are `ctx.ui` `IconButton` + `Tooltip`; `sidebar` icon for "Open in panel".
- **The agent can delete what a card shows.** A card placed from a create call carries the page its own tool input held, so it keeps rendering after `artifact_delete` (the Code Mode `execute` part keeps the nested call's input in `metadata.toolCalls`). Its "Open in panel" button then shows "This artifact was deleted".

## Host facts (OpenCode 2.2.5, read from the tag and verified in the harness)

- No host UI for service artifacts: `gui-plugins/src/file/artifact-view.tsx` is the viewer for workspace files. The panel here is a user `Panel`.
- `artifact_*` tools are registered `codemode: true`: with Code Mode on (default) the model calls them inside `execute`. The persisted part has `state.input.code`, the returned value as text, and `metadata.toolCalls: [{tool: "opencode.artifact_create", input}]`; no artifact id.
- The view route needs a Basic auth header, so an iframe `src=url` cannot work; the GUI client (`ctx.client.experimental.artifacts.get/list`, `ctx.client.message.list`) is already authenticated.
- Files are stored raw: the host injects no theme variables; `srcdoc` wrapping does.
- A server plugin cannot create, read, update or delete artifacts (`ctx.experimental.artifact` only registers providers) and has no server URL, so a `publish_html` wrapper is impossible.

## Placement (`src/ids.ts`)

Per finished tool part, from `message.list` and `artifacts.list({sessionID})`:

| Part | Card / row | Artifact id from |
| --- | --- | --- |
| `artifact_create` (Code Mode off) | card | `art_…` in the result text |
| `artifact_update` (Code Mode off) | row | `input.id` |
| `execute` with nested create | card per call | an id the model returned in the result text, else an artifact created while the call ran (±300ms, closest to a call's own window first), else none |
| `execute` with nested update | row, once per artifact | `input.id` |

Rules: an id named outright (a result, a returned value, an update's target) is never taken by another call's window; pass 1 takes artifacts created *inside* a call, pass 2 lets a call that found none take one just outside its window. A card with no id renders from its call's input. Finished parts with no placement are remembered (`settled`) so only still-running parts are asked again (1s, 2s, 4s … six times).

`artifacts.list`'s `time.updated` per artifact drives refresh: when it changes the live card reloads in place and the panel reloads.

## Isolation

The page is agent-authored code, so it is treated as hostile. Layers, outermost first:

1. **Sandbox** `allow-scripts` only: opaque origin; no top navigation, popups, forms, modals, same-origin.
2. **CSP** in a meta placed first in the wrapped document and in the iframe's `csp` attribute: `default-src 'none'`; scripts/styles inline only; images/fonts/media `data:`/`blob:` only; `connect-src`, `frame-src`, `child-src`, `worker-src`, `manifest-src`, `prefetch-src`, `object-src`, `base-uri`, `form-action` all `'none'`; no `unsafe-eval`. `navigate-to 'none'` is listed but Chromium implements no `navigate-to`.
3. **Bridge** (runs first in the page): cancels every Navigation API navigation, deletes WebRTC (ICE servers reach the network outside CSP), neuters `window.open`, forms and link clicks. A link click becomes an `open` message only from a trusted (user) event.
4. **Main-process veto** (`main(ctx)` in the GUI bundle, `src/guard.ts`): `will-frame-navigate` is vetoed for any subframe whose document is `about:srcdoc` and that goes anywhere but a new `about:srcdoc`. This is what stops `<meta http-equiv=refresh>`, which neither CSP nor the Navigation API stops in Chromium (the harness leaked `GET /meta-refresh?d=…` before this layer existed). Main-frame navigations and the app's other frames are not touched.
5. **Backstop**: every document of ours announces itself with `ready` on load; a load nothing answers within a second is replaced by a stub page.
6. **Links**: a page can only *ask* to open a link. After a real user input (`navigator.userActivation.isActive`), one question at a time, the app's own confirm dialog shows the URL; only a click on its button opens it. The page controls its focus and its messages, so neither proves intent. Back-off is per artifact: after each decline the pause triples (3s, 9s, 27s … cap 12 min), so one noisy page never slows another's links.

The 28-check harness run (`harness/drive.mjs`, below) puts a page with every exit the audit and CSP list know of in a card and a TCP+UDP listener on 127.0.0.1: fetch, XHR, `img`, CSS `@import`/`url()`/`@font-face`, `<link rel=stylesheet|prefetch|preconnect|dns-prefetch>`, `<script src>`, iframe, object, `sendBeacon`, WebSocket, EventSource, workers (URL and blob), WebRTC STUN, `window.open`, form submit, link and `target=_blank` clicks, `top.location`/`parent.location`, `<meta refresh>`, `location.href/assign/replace`, `navigation.navigate`, and forged `open` messages carrying its real signed id with `window.focus()` spam. **The listener recorded nothing.** The only thing the forged messages ever raised was the app's own confirm dialog (declined). A real click on a link in another card raises the dialog showing the URL, opens nothing before Confirm, and after Confirm the browser reaches the listener once.

Not covered: DNS-only leaks cannot be tested against a local listener (`dns-prefetch`/`preconnect` to an unresolvable host name); `default-src 'none'` and the veto are the mitigations, and a connection to `127.0.0.1:<port>` (tested) is not made. A page can still draw anything in its own box, including a fake-looking prompt.

## Panel

`ctx.add(Panel, {region: "side"})`, tab id = artifact id (key `visual-replies:<artifact id>`), opened with `ctx.layout.open`. It reads the artifact through the client, builds the same wrapped `srcdoc`, and follows theme changes by message (no reload), so a mode flip re-themes it live. A deleted artifact shows a text state; a failed read shows "Could not load this page." It is a desktop-only tab (no mobile view in v1).

## Theme

`--bg --surface --surface-2 --fg --muted --border --accent --danger --warning --info --font --mono`, read from the app's `--v2-*` tokens and pushed into every live frame when the mode or the app's colour tokens change (`createKeyed` on `ctx.appearance.mode()` plus one attribute-filtered observer on `<html>`, because the colour theme can change without the mode changing).

## Prompt (`src/instructions.ts`)

Says what the tools are for, one `index.html`, inline everything, no network (forms, links and navigation do nothing), `data:`/SVG for images, the theme variables with fallbacks, width 300 to 900px, about 100K characters, `return` the tool result from `execute`, update with the whole files map, keep the reply short, and the cleanup rule (decision 2).

## Known limits

- Auto-open: the host folds finished tool calls into collapsed "Used N …" groups (`[data-component="collapsed-tool-group"][data-timeline-part-ids]`) and mounts rows, so our cards, only once they open. `src/groups.ts` clicks the group's own trigger once per placed part id. A group the reader closes stays closed; a reload opens it once more. No public setting controls it in 2.2.5.
- The timeline virtualizes rows: cards exist only for rows near the viewport and are created and retired as it scrolls.
- DOM injection next to the host's row is unavoidable (no timeline extension point, host-architecture §8). One whole-body `MutationObserver` in `attach.ts` (filtered to nodes that are not ours, coalesced on one `requestAnimationFrame`) and one on `<html>`; not yet narrowed (cross-cutting observer diet).
- Old pages (published by `publish_html`, kept in plugin storage) are orphaned: nothing renders them, their past calls show as ordinary tool rows, and the data stays in the plugin's storage until removed by hand. The previous RPC, tool and storage are gone.
- Not measured: the performance table the skill asks for (scan cost: one `message.list` page per second at most while a tool is running; up to six pages when a session opens).

## Harness (`harness/`)

`seed.mjs` imports one session with every placement shape (direct create and update, Code Mode with a returned id, matched by window, deleted by the agent, a link page, the attack page). `attack.mjs` is the hostile page. `drive.mjs` seeds, drives the isolated app over CDP, runs 28 checks (cards after a virtual-timeline scroll, update row text and parity, no card in an error state, sandbox flags, listener silence, listener liveness, link confirm flow, panel and live re-theme, update row opens panel, Cmd+R, session switch, no duplicates, nothing of ours animating) and writes screenshots. `prompt-check.mjs` is a stub model that records the request, proving the hook with the flag on and off. Run with the skill's `desktop-harness.sh` (fresh root, `experimental.artifacts: true`).

Register by absolute path in `~/.config/opencode/opencode.json` `plugins`; `experimental.artifacts: true` too. Checks: `pnpm typecheck && pnpm test && pnpm build`.

## Performance

### Realistic thread, 2026-11-02 (`scripts/perf.mjs`)

650 assistant messages with reasoning, tool output, diffs, 26 subagent children, injected rows and attachments; Side tabs; stub model. Median of 3 runs; delta is against the `null` plugin (the host's cost of loading any plugin). Script ms is main-thread scripting in the scenario window.

| Scenario | Floor script ms | With plugin | Delta | New long tasks | New frames over 20 ms | Frame p95 ms (floor) | Result |
|---|---|---|---|---|---|---|---|
| scroll | 310 | 342 | 32 | 0 | 0 | 16.6 (16.5) | PASS |
| type | 150 | 149 | -0 | 0 | -1 | 9.2 (9.8) | PASS |
| switch | 131 | 143 | 12 | 0 | -1 | 9.3 (10.1) | PASS |
| stream | 253 | 279 | 26 | 0 | 0 | 9.2 (9.9) | PASS |
| hover | 176 | 182 | 6 | 0 | 0 | 9.2 (9.9) | PASS |
| idle | 85 | 88 | 2 | 0 | 0 | 9.2 (9.9) | PASS |
| open thread (settled, ms) | 372 | 383 | 10 | | | | PASS |
| reopen thread (settled, ms) | 48 | 46 | -3 | | | | PASS |
