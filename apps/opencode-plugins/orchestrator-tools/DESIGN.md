# orchestrator-tools design

OpenCode 2.2.5 server plugin. Gives an agent tools to run work in other OpenCode sessions: create them, send them
prompts, wait for them, read what they produced, stop them. The behaviour reference is t3code's orchestrator MCP
server; nothing is copied from it.

## Tools

Namespace `orchestrate`. Effective tool ids are `orchestrate_<name>`; in Code Mode they are
`tools.orchestrate.<name>(input)`. All tools are exposed to Code Mode (`codemode: true`). With Code Mode on, which is
the 2.2.5 default, the model sees them only through the `execute` tool and its catalog, so the model request's tool
list has no `orchestrate_*` entry. Each tool declares a loose object output schema and returns plain JSON, which is
what lets `execute` hand the result back as a value. A tool error reaches the model as its message text.

| Tool | Input | Output |
| --- | --- | --- |
| `create_session` | `sessions: [{ prompt, title?, directory?, agent?, model?, mode?, context?, clientRequestId? }]` | `{ sessions: [SessionSummary & { reused }] }` |
| `send_message` | `{ sessionID, text, delivery?: "queue" \| "steer", clientRequestId? }` | `{ sessionID, messageID, delivery }` |
| `read_session` | `{ sessionID, limit?, offset? }` | `{ session, total, offset, messages, finalText, truncated }` |
| `wait_for_sessions` | `{ sessionIDs, timeoutMs?, mode?: "all" \| "any" }` | `{ results: [{ sessionID, state, outcome?, reason?, finalText? }], timedOut, aborted }` |
| `interrupt_session` | `{ sessionID }` | `{ sessionID, interrupted }` |
| `list_sessions` | `{ scope?: "children" \| "siblings" \| "project", limit? }` | `{ sessions: SessionSummary[] }` |
| `delegate_task` | `{ prompt, title?, directory?, agent?, model?, context?, wait?, timeoutMs?, clientRequestId? }` | `{ session, state, outcome?, reason?, result?, timedOut }` |

`SessionSummary` is `{ id, title, parentID, agent, model, directory, state: "running" | "idle", outcome, created,
updated }`. `state` is derived from `time.busy` and `time.idle` on `Session.Info`.

`mode` on `create_session` is `child` (default, `parentID` = caller) or `independent` (no parent). Independent
sessions are still recorded as created by the caller so the caller can read, wait on and interrupt them.

`delegate_task` is `create_session` with one child plus a bounded wait. When the wait times out it returns
`state: "running"` with the session id rather than failing, so the caller can wait again.

## What a child sees

A child session receives exactly one user message: the `prompt`, followed by the caller's `context` text when given.
The plugin never reads the caller's messages and never forwards them. The child starts with the agent's normal
system prompt and the plugin's own instruction text, like any session.

## Instruction hook

A `context` session hook appends a short system text that says when to use each tool. It runs when the request's
tool map has an `orchestrate_*` id or the Code Mode `execute` tool, and stays out of requests for agents that have
neither.

## Permissions

OpenCode evaluates ordered permission rules; session-level rules are evaluated after agent rules and the docs say
child sessions inherit the rules in effect when they are created. The plugin:

- Copies the caller session's `permissions` array onto every session it creates.
- Asserts the `subagent` permission for the requested agent id against the caller session before creating, with the
  tool call as `source`, so a rule that denies launching an agent also denies it here and an `ask` rule prompts the
  user. This can be turned off with `assertSubagentPermission: false`.
- Defaults the child's agent to the caller's agent and the child's model to the caller's model.

What it cannot do: narrow an agent's own configured rules. A child that runs a different agent gets that agent's
rules. Choose agents accordingly or deny their launch with a `subagent` rule.

## Scope

Every tool except `create_session` and `delegate_task` resolves its target and checks it is reachable from the
caller. A target is reachable when any of these hold:

1. It is the caller.
2. The caller is one of its ancestors (walk `parentID`, at most 32 hops).
3. The caller created it through this plugin (`metadata.orchestrator.creator`), or created one of its ancestors.
4. It shares the caller's parent (sibling).
5. Plugin option `scope` is `"project"` and it is in the caller's project.

Interrupting or messaging the caller itself is refused: the caller is mid tool call and has its own reply channel.

## Limits

Plugin options, with defaults:

| Option | Default | Meaning |
| --- | --- | --- |
| `maxChildren` | 8 | Direct children (plus independents) one session may have created |
| `maxDepth` | 3 | Deepest child depth; the root session is depth 0. Keep at or below `experimental.subagent_depth` |
| `maxConcurrent` | 4 | Children of the caller that may be running when a new one is prompted |
| `models` | unset | Allowed `provider/model` ids for `model`; unset allows any |
| `defaultWaitMs` | 120000 | Wait timeout when the tool input gives none |
| `maxWaitMs` | 600000 | Ceiling on any one wait |
| `maxWaitSessions` | 16 | Sessions one wait may cover |
| `maxReadChars` | 20000 | Character budget for the messages a read returns |
| `messageLimit` | 5 | Default number of messages a read returns (max 50) |
| `scope` | `"tree"` | `"project"` widens reachability to the caller's project |
| `assertSubagentPermission` | true | Run the `subagent` permission assertion before creating |

The plugin cannot read `experimental.subagent_depth` from its context, so `maxDepth` is a separate option.

## Idempotency

`clientRequestId` on `create_session`, `delegate_task` and `send_message` is stored in plugin storage under
`request/<callerSessionID>/<clientRequestId>` as soon as the session or message exists. A repeat with the same id
returns the same session (`reused: true`) or message id without creating again. If the stored session was deleted,
the id is forgotten and a new session is created. Everything else is read from server session data, so results
survive a restart.

## Waiting

`wait_for_sessions` and `delegate_task` subscribe to `session.execution.succeeded`, `session.execution.failed`,
`session.execution.interrupted`, `session.idle` and `session.deleted`, and poll `session.get` with backoff
(500 ms doubling to 5 s) as a fallback. The wait ends on the tool's abort signal, on the timeout, or when all (or
any) targets are done. `delegate_task` records the time it sent the prompt and only treats the child as finished
when the child went idle after that time, so the queued prompt is not mistaken for a finished run.

`session.wait` from the experimental API has no timeout, so it is not used.

## API gaps in 2.2.5

- No paged message list on the plugin session domain (`session.context` returns all messages). Paging is done in
  memory; the character budget bounds the output.
- No `session.active` on the plugin session domain; running state is derived from `time.busy` and `time.idle`.
- No way to read the effective config (`experimental.subagent_depth`) from a plugin.
- No API to narrow an agent's configured permission rules for one session; only session-level rules can be added.
- `session.wait` has no timeout and no abort.

## Safety properties

- A child finishing never touches its parent. The plugin only writes to sessions it is explicitly asked to.
- Nothing is logged. Prompts travel only to the target session.
- Recursion is bounded by `maxDepth`; fan-out by `maxChildren` and `maxConcurrent`; waits by `maxWaitMs` and the
  abort signal.
