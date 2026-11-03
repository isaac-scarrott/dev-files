# blindfold: design

A fork of vimtor's opencode-blindfold 0.5.0. Agents use secrets they never see. This fork asks for several inputs in one step and asks in the thread, not in a dialog.

## Decisions

Settled with the user (2026-11-03):

1. **Full fork.** No `vendor.manifest` lines, no sed transform. All code is ours; the MIT `LICENSE` and `LICENSE.root` stay, and `PROVENANCE.md` records `vimtor/opencode-plugins@9d1e947`. The package path and the server `id` stay `blindfold`, so the registration in `opencode.json` and its options (`shell`, `codemode`, `secrets`, `1password`) work unchanged.
2. **Multi-field.** `get({ fields: [{ name, label?, kind?, replace? }], reason?, replace? })` returns an object keyed by name (Code Mode); `get({ name, reason, replace })` is unchanged and returns the string. One step, one request, one card.
   - `kind` is `text`, `email` or `secret`. It defaults from the name: a secret word (`PASSWORD`, `PASSWD`, `PASS`, `PWD`, `TOKEN`, `KEY`, `SECRET`, `PASSPHRASE`, `CREDENTIAL(S)`, as a whole `_`-word, or `PASSWORD`/`TOKEN`/`SECRET` inside a run-together name) means `secret`; `EMAIL`/`MAIL` means `email`; `USER`/`USERNAME`/`LOGIN` means `text`; anything else is `secret`. A secret word wins over an email or user word (`EMAIL_PASSWORD` is masked).
   - **Masked unless the kind says plain.** A field is masked if its kind is `secret`, or if its name looks secret and the kind is not explicitly `text`. So an agent that labels `PASSWORD` as `email` still gets a masked input; only `kind: "text"` unmasks it. (`fields.ts`, `resolveField`.)
   - **Per-field store**, same semantics as upstream: a stored value is returned without asking, `replace` (per call or per field) asks again, and only the missing or replaced fields are shown. A field configured in the `secrets` option is never asked.
   - **Redaction covers every field**, plain ones too, with the existing encodings. A short plain value such as a three-letter username is redacted wherever it occurs in tool output, as any short secret would be; that is the price of covering every field.
3. **Inline, not a takeover.** A card in the chat timeline attached to the tool call, never a modal. Submit and Cancel; Enter submits and Escape declines while focus is in the card; focus goes to the first empty field; the composer stays usable. When answered it collapses to one muted line (`Secrets provided  EMAIL and PASSWORD`), declined and expired are muted; no success toast (own actions are silent).
4. **TUI** keeps working with whatever the terminal can do: one prompt per field in order, a counter in the description, an empty or clearly invalid answer reopens the prompt. The terminal prompt has no masked mode, so every field is shown as typed there (upstream's TUI was the same for a single secret).
5. **Out of scope now, follow-ups:** (a) a 1Password backend that fills `EMAIL`/`PASSWORD` fields from an item (the existing `secrets` option with `op://` references per name stays as upstream has it); (b) a screenshot-masking fill helper that types a stored value into a page without it entering a screenshot.

## Host facts (OpenCode 2.2.5)

- **No native way to ask.** The host has a `Form` schema (`@opencode/schema/form`, string fields with `format: "email"`, `required`, `hidden`) but it backs provider sign-in only; the SDK gives a server plugin no way to raise a session form, and the GUI has no timeline extension point (host-architecture §8). So the card is DOM next to the host's row, as `visual-replies` does it.
- **Code Mode runs the call.** The model calls `execute`; the nested `blindfold.get` runs in the server plugin. A Code Mode tool that declares an `output` schema must return `output` (result without it fails: "Tool did not return its declared output"; with `output` and no schema: "declared output without an output schema"). So the tool declares `output` (`oneOf` string, object of strings) only when Code Mode is on, and returns `{ content, output }`. A regular tool declares none and returns a confirmation.
- **What the timeline looks like while the call runs.** The running `execute` sits inside the host's folded row `[data-component="collapsed-tool-group"][data-timeline-part-ids="<callID>,<partID>"]`, itself inside `[data-slot="session-turn-assistant-content"]`, which carries `aria-hidden="true"` while the turn works. The call's own id (`Tool.Context.id`) is the first id in that list.
- **Server plugin reload ends pending requests.** Any rebuild of `dist` reloads the server entry too; a request that was pending becomes `unavailable`. A window that missed the `resolved` event keeps its card open until you press a button, which answers `expired`. Seen only in development.
- **Per-location instances.** Server plugins run per location, so an RPC call carries `location`. The GUI learns it from the `requested` event, or from the open tabs' sessions when it asks again after a reload.

## Protocol (`rpc.ts`)

`requested { requestID, sessionID, callID, messageID, reason, fields[{ name, label, kind, masked }] }`, `resolved { requestID, status }` (`submitted | cancelled | timeout | unavailable`), `ack`, `submit { requestID, values }` (exactly the asked names, none empty, else `accepted: false`), `cancel`, and `list` (the pending requests, so a reloaded window shows its card again). Values travel only in `submit`, never in an event, a log or an error.

Server (`server.ts`) behaviour kept from upstream: 10 minute prompt timeout, 5 second ack timeout (no window or TUI answered: `unavailable`). Changed: the prompt queue is per session (a card waiting in one session no longer holds up another's), and stopping the run closes the open request as `cancelled` (an inline card must not stay open for a call nobody waits on).

## Placement (`anchor.ts`)

Only the routed session's timeline is used (`ctx.sessions.current()`, and the one with layout boxes: cached timelines of other sessions stay mounted). The card goes after, in order: the tool row with the call's part id; the folded group listing it; (an open card only) the newest tool row or group; the end of the newest assistant message. The call id is the nested call's own and so may not be in the DOM; the GUI also asks `message.list` for the running tool parts of the request's message and tries those ids. The card is placed after the **outermost `aria-hidden` ancestor**, so assistive technology can reach it. An answered row is shown only next to its own call, never at a fallback.

A `MutationObserver` on `<body>` re-places the card when the virtualizer unmounts and remounts its row; it runs only while a card or row exists, coalesced on one frame. The card's Solid root and its typed values live outside the DOM, so a card taken out of the page with its row and put back keeps what was typed. A card of another session is taken out of the page; if it stays unseen for 800 ms a persistent toast offers **Show** (`ctx.tabs.focus`).

## Look

All controls are the host's own (`ctx.ui.TextInput` with `type="password"`, `Button` neutral and contrast, `IconButton` with `outline-eye` / `outline-eye-slash` and `pressed`, `Icon lock`, `Tooltip`). The chrome reuses `visual-replies`' card tokens (border-muted, radius 8, bg-layer-01, 13px). The answered row is the host's own tool-row markup (`tool-part-wrapper` > `collapsible[data-compact][data-rail][data-has-action]` > `button[data-slot=collapsible-trigger]`, inert) so the host's CSS styles it. The parity spec (`parity.spec.mjs`, style layer): 33 PASS, 0 FAIL, 8 N/A with a reason each (input, button and card have no second native instance to measure; the row differs only in width, which follows its words, and in the muted opacity of declined rows).

## Security properties

- Values live in one Solid signal per card and are emptied the moment the request is answered, declined, expired or settled elsewhere. Nothing is written into an attribute; after an answer no `input` remains.
- No value in any log, error, toast, model context or tool result: the service log and the stored messages are checked in the harness (below). The validation message is chosen by the kind of problem and never carries the value.
- Inputs set `autocomplete="new-password"` (masked) or `off`, `spellcheck=false` and password-manager opt-outs, so the browser does not offer to save them.
- Escape inside the card is stopped before the app sees it, so declining does not also stop the session.
- Focus is taken only when the composer is not holding text, so typing in the composer is never redirected into a secret field.

## Known limits

- A card is a DOM injection: it depends on `session-turn-assistant-content`, `collapsed-tool-group`, `data-timeline-part-id(s)` and `tool-part-wrapper`. A host update can move them; `anchor.test.ts` pins the shapes and the harness would show a card at the fallback place.
- The answered row lives only in the window that showed it, and is gone after a reload.
- One window of several answers; the others' cards become the answered row on `resolved`.
- Not measured: performance **with a card open** (the profile below is the plugin idle). The work while open is one `querySelectorAll` per coalesced DOM mutation batch.
- Redacting a very short plain value (one or two characters) rewrites those characters in all output.

## Verification (2026-11-03, OpenCode 2.2.5, private harness, fake values)

- Unit: `pnpm test` 53 tests (server 31, of which 20 are upstream's suite ported to node:test; fields 6, model 9, anchor 7). Typecheck, `node apps/opencode-plugins/lint.mjs`, `node apps/opencode-plugins/smoke.mjs` pass.
- Harness `drive.mjs`, 24 checks: inline not modal, anchored to the call (group), two fields with Email plain and Password masked with an eye, focus in the first empty field, composer usable and not leaking into the card, no value in the DOM while typing or after submit, invalid email blocks Submit and warns without echoing, reveal and hide, Enter submits and the card becomes the one-line row, no toast, the model request and the stored messages and the service log hold no value (`[REDACTED:EMAIL]`, `[REDACTED:PASSWORD]` instead), single-name call returns a string, Escape and Cancel decline and the run carries on.
- Harness `drive2.mjs`, 12 checks: reload with a request open shows the card again empty and it still answers, a long thread (wheel scroll away and back: the card leaves and returns in place, typed text kept), session switch (card leaves, toast with Show, Show returns), light and dark shots.
- Keyboard and ARIA: tab order Email, Password, Show Password, Cancel, then the composer; group named by its title; inputs described by their hint; Submit disabled while incomplete; Escape on the eye button declines.
- End to end through the real Code Mode `execute` runtime with a stub model: `tools.blindfold.get` returned `{ EMAIL, PASSWORD }` to the code, and the model's next request saw only `[REDACTED:...]`.
- Performance, `scripts/perf.mjs`, plugin idle against the null plugin, realistic thread, median of 3 (hover re-run with 7): all eight scenarios inside the bars (open +8 ms script, reopen 0, idle 0, scroll −2, type −19, switch −5, stream −6, hover +2; the first hover run read +13 against a bar of 10 and passed on the 7-run repeat). No new long tasks or jank frames.

## Follow-ups

- 1Password backend that fills fields from an item (decision 5a); screenshot-masking fill helper (5b).
- Performance with a card open; the answered row across a reload (it could be re-derived from the tool part's result).
- A `resolved`-style notice when the server plugin reloads, so stale cards close themselves.
