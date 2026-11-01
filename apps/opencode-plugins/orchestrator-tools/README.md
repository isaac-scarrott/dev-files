# Orchestrator tools

Tools that let an agent start other sessions, message them, wait on them and read their results.

## What it does
- `orchestrate_delegate_task`: create a child session, send one prompt, wait a bounded time and return its final reply. The usual entry point.
- `orchestrate_create_session`: create one or more sessions, each with its own prompt, as children of the caller (default) or as independent top-level sessions.
- `orchestrate_send_message`: message a peer by ref, unique title or session id. The receiver gets `<cross-session-message from="TITLE [REF]">…</cross-session-message>` as a user message and answers by calling `send_message` with `to` = the `from` value: the receiver's normal reply is shown only to its own user, never to the sender. The message reaches the receiver right away, whether it is idle or busy, and the result says it was delivered.
- A message from a peer is drawn as its own card in the receiving chat, not as the user's gray bubble: a left-aligned soft blue-gray bubble with a `From <title>` pill on its top edge and a footer (reply arrow to open the sender's session, a `…` menu with Open session and Copy text). The user's own messages are untouched, including text that merely looks like the tag: only a message the plugin sent carries the `peerMessage` metadata the card needs. The timeline rail does not count peer messages as prompts.
- `orchestrate_list_peers`: reachable sessions as `name [ref]` with relation (parent, child, sibling, other), state and directory.
- `orchestrate_read_session`, `orchestrate_wait_for_sessions` (up to 16, all or any), `orchestrate_interrupt_session` and `orchestrate_list_sessions` cover reading, waiting, stopping and listing.
- A child gets only the prompt and optional `context` text, never the caller's history. `clientRequestId` makes create, delegate and send safe to retry.

## Context
OpenCode 2.2.5 has subagents but gives an agent no way to drive or talk to other sessions. With Code Mode on (the default) the tools are reached through `execute` as `tools.orchestrate.<name>()`. By default they reach only the caller's children, siblings, parent and sessions it created; `scope` widens that. The permission model and limits are in `DESIGN.md`.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": [{
  "package": "/path/to/apps/opencode-plugins/orchestrator-tools",
  "options": { "maxChildren": 8, "maxDepth": 3, "maxConcurrent": 4 }
}]
```
Kind: server and GUI. Restart the background service (quit the app, then `opencode-cli service restart`, or `opencode service restart`).

The host works out a plugin's parts (server, GUI) once, when the service starts. A service that started before this package had its `./gui-experimental` export keeps loading only the server half after an update: messages still arrive, but as the user's own gray bubble with the raw `<cross-session-message>` tag and the reply trailer, and the Extensions → Plugins row has no Reload/switch. Rebuilding, editing the config or the app's Reload does not fix it; restarting the service does. Object-style (`{ "package": …, "options": … }`) and plain-path registrations load the GUI half the same way.

## Options
| Option | Default | |
|---|---|---|
| `maxChildren` | `8` | children one session may create |
| `maxDepth` | `3` | nesting depth of created sessions |
| `maxConcurrent` | `4` | sessions running at once |
| `models` | any | restricts `model` to a list of `provider/model` ids |
| `scope` | children, siblings, created | `"project"` reaches any session in the caller's project, `"all"` any session on the server |
| `assertSubagentPermission` | `true` | `false` skips the `subagent` permission check before creating |

## Credits
- t3-code (MIT, pingdotgg/t3code): inspired by the tool set of its orchestrator MCP server (create, message, wait, read, stop). Nothing is copied.
- Claude Code: inspired by its cross-session message format, the `<cross-session-message from="…">` wrapper with a reply-by-sender flow, so models trained on it use it as is. The implementation is this plugin's own.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Tests run against a fake plugin context. For a live check, start a standalone server with throwaway XDG dirs whose `opencode.json` lists this package. Design notes: [DESIGN.md](DESIGN.md).
