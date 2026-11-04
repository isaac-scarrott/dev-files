# Orchestrator tools

Tools that let an agent start other sessions, message them, wait on them and read their results.

> **Credit:** the tool set is inspired by [t3-code](https://github.com/pingdotgg/t3code)'s (MIT) orchestrator MCP server and the message wrapper by Claude Code's cross-session format (Anthropic); the peer row is styled after [OpenCode](https://github.com/anomalyco/opencode)'s (MIT) subagent row. No code was copied from the first two.

## What it does
- `orchestrate_delegate_task`: create a child session, send one prompt, wait a bounded time and return its final reply. The usual entry point.
- `orchestrate_create_session`: create one or more sessions, each with its own prompt, as children of the caller (default) or as independent top-level sessions.
- `orchestrate_send_message`: message a peer by ref, unique title or session id. The receiver gets `<cross-session-message from="TITLE [REF]">…</cross-session-message>` as a user message and answers by calling `send_message` with `to` = the `from` value: the receiver's normal reply is shown only to its own user, never to the sender. The message reaches the receiver right away, whether it is idle or busy, and the result says it was delivered.
- A message from a peer is drawn as a left-aligned grey row in the style of the host's subagent row, not as the user's bubble: the agent icon, the sender's title, the message's first line, and an Open-session chevron on hover. Opening it shows the whole message in a card below the header; the header stays under the pointer. It is the shared row from [`native-ui`](../native-ui), also used by [`monitor`](../monitor) and [`scheduler`](../scheduler).
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
Kind: server and GUI. Restart the background service (`scripts/opencode-safe-restart.sh` in dev-files).

The host works out a plugin's parts (server, GUI) once, when the service starts. A service that started before this package had its `./gui-experimental` export keeps loading only the server half after an update: messages still arrive, but as the user's own gray bubble with the raw `<cross-session-message>` tag and the reply trailer, and the Extensions → Plugins row has no Reload/switch. Rebuilding, editing the config or the app's Reload does not fix it; restarting the service does. Object-style (`{ "package": …, "options": … }`) and plain-path registrations load the GUI half the same way.

## Options
| Option | Default | |
|---|---|---|
| `maxChildren` | `8` | children one session may create |
| `maxDepth` | `3` | nesting depth of created sessions |
| `maxConcurrent` | `4` | sessions running at once |
| `models` | any | restricts `model` to a list of `provider/model` ids |
| `defaultWaitMs` | `120000` | how long delegate and wait calls wait when the call gives no timeout |
| `maxWaitMs` | `600000` | longest wait one call may ask for |
| `maxWaitSessions` | `16` | sessions one `orchestrate_wait_for_sessions` call may wait on |
| `maxReadChars` | `20000` | message characters `orchestrate_read_session` returns in one call |
| `messageLimit` | `5` | most recent messages `orchestrate_read_session` returns when the call gives no `limit` |
| `scope` | `"tree"` | `"tree"`: sessions the caller is an ancestor of, ones it created through these tools, and its siblings; `"project"`: any session in the caller's project; `"all"`: any session on the server |
| `assertSubagentPermission` | `true` | `false` skips the `subagent` permission check before creating |

## Credits
- t3-code (MIT, pingdotgg/t3code): inspired by the tool set of its orchestrator MCP server (create, message, wait, read, stop). Nothing is copied.
- Claude Code: inspired by its cross-session message format, the `<cross-session-message from="…">` wrapper with a reply-by-sender flow, so models trained on it use it as is. The implementation is this plugin's own.
- [OpenCode](https://github.com/anomalyco/opencode) (MIT): the peer-message row's classes and layout follow the host's subagent row, from the desktop app's renderer source (2.2.5).

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Tests run against a fake plugin context. For a live check, start a standalone server with throwaway XDG dirs whose `opencode.json` lists this package. Design notes: [DESIGN.md](DESIGN.md).
