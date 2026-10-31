# orchestrator-tools

OpenCode 2.2.5 server plugin. Adds `orchestrate_*` tools so an agent can create other sessions, send them prompts,
wait for them, read their results and stop them. The usual shape is `orchestrate_delegate_task`: one child session,
one prompt, one bounded wait, the child's final reply back.

See `DESIGN.md` for the scope rules, limits and the permission model.

## Setup

```json
{
  "plugins": [
    {
      "package": "/path/to/dev-files/apps/opencode-plugins/orchestrator-tools",
      "options": { "maxChildren": 8, "maxDepth": 3, "maxConcurrent": 4 }
    }
  ]
}
```

All options are optional. `models` restricts the `model` input to a list of `provider/model` ids. `scope: "project"`
lets the tools reach any session in the caller's project instead of only the caller's children, siblings and
sessions it created. `assertSubagentPermission: false` skips the `subagent` permission check before creating.

## Tools

- `orchestrate_create_session`: create one or more sessions, each with its own prompt. `mode: "child"` (default)
  makes them children of the caller; `mode: "independent"` makes top-level sessions.
- `orchestrate_send_message`: queue a follow-up (`delivery: "queue"`) or steer a running session (`"steer"`).
- `orchestrate_read_session`: status plus the last N messages and the final assistant text, size-capped.
- `orchestrate_wait_for_sessions`: wait for all or any of up to 16 sessions, bounded by a timeout.
- `orchestrate_interrupt_session`: stop a session's current run.
- `orchestrate_list_sessions`: the caller's children, siblings, or (with `scope: "project"`) project sessions.
- `orchestrate_delegate_task`: create a child, send the prompt, wait, return the result.

A child gets only the prompt and the optional `context` text, never the caller's history. `clientRequestId` makes a
create, delegate or send idempotent across retries.

## Develop

```sh
npm_config_registry=https://registry.npmjs.org pnpm install
pnpm typecheck
pnpm test
pnpm build   # emits dist/, which is committed
```

Tests run against a fake plugin context. For a live check, start a standalone server with throwaway XDG dirs whose
`opencode.json` lists this package, then call the tools from a session there.
