# Blindfold

Agents ask for a secret, or a whole login, in a card inside the chat. You type it there and the agent never sees it.

> **Credit:** a fork of [vimtor](https://github.com/vimtor)'s [opencode-blindfold](https://github.com/vimtor/opencode-plugins/tree/main/packages/opencode-blindfold) 0.5.0 (MIT, pinned at `9d1e947`). The idea, the redaction and the server side are vimtor's; the request card, the multi-field tool and the TUI prompts are ours. Please star and use the original too. See [PROVENANCE.md](PROVENANCE.md).

![A request for an email and a password, inline in the chat](media/request.png)

## What it does
- **One tool, one or several inputs.** `get({ name })` returns the value as before. `get({ fields: [{ name: "EMAIL" }, { name: "PASSWORD" }], reason })` asks for both in one card and returns an object keyed by name. The agent never gets the values in chat: Code Mode hands them to the running code only, and a shell command receives one as an environment variable only when it names it.
- **A card in the thread, not a dialog.** It sits under the tool call that asked, in the reading column, with the field labels and the agent's reason. The composer stays usable and nothing is blocked. Focus goes to the first empty field (unless you are typing in the composer). Enter submits, Escape declines, and Escape does not stop the run.
- **Masked by default.** A field is masked unless its kind is `text` or `email`, or its name reads as plain (`EMAIL`, `USERNAME`, `LOGIN`). A name like `PASSWORD`, `TOKEN`, `KEY` or `SECRET` stays masked even if the agent calls it `email`. A masked field has an eye to reveal and hide it.
- **Light checks, never your value back.** An email that cannot be one (no `@`, spaces inside) blocks Submit and says so; one with no domain ending only warns; a secret with a leading or trailing space warns. The message never repeats what you typed.
- **Quiet when done.** After you answer, the card becomes one line, `Secrets provided  EMAIL and PASSWORD`, with no values and no toast. Declined or expired requests show as a muted line. Only a failure toasts.
- **Redaction covers every field.** Each value, and its JSON, URL, base64 and hex forms, becomes `[REDACTED:NAME]` in tool results, errors, messages, system prompts and raw provider requests.
- **If the session is not on screen**, a toast says the agent is waiting and offers **Show**. A card survives scrolling a long thread, a page reload (it reappears, empty) and a switch of session.

## Context
OpenCode has no way for a plugin to raise a native form in the thread, so the card is injected next to the host's tool row (see [DESIGN.md](DESIGN.md)). Controls are the host's own `TextInput`, `Button` and `IconButton`. The TUI has no masked prompt, so there each field is asked in turn and shown as typed.

## Install
Register this checkout by absolute path in `~/.config/opencode/opencode.json` (server and Desktop) and `~/.config/opencode/cli.json` (TUI):
```json
{ "package": "/path/to/apps/opencode-plugins/blindfold", "options": { "shell": { "enabled": true, "approve": true }, "codemode": { "enabled": true } } }
```
Kind: server, TUI and GUI in one package. Restart the background service (`opencode service restart`) for the first load; Cmd+R reloads the GUI.

## Options
Unchanged from upstream; the shown values are the defaults.

| Option | Default | What it does |
|---|---|---|
| `shell.enabled` | `true` | Shell commands receive a secret they name, as an environment variable |
| `shell.approve` | `true` | Each such command needs your approval |
| `codemode.enabled` | `true` | `blindfold.get` runs in Code Mode and returns the value to the code only |
| `secrets` | none | Names the user provides up front: a plain value or `op://` reference per name |
| `1password.account` | none | Account for `op://` reads when several are signed in |

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked), `pnpm smoke`. Design notes: [DESIGN.md](DESIGN.md).

### Harness
`harness/` drives the card in the private desktop harness with a stub model (no real secret ever; the values in the scripts are fake):

```sh
node harness/stub-model.mjs        # BF_CODE_FILE=<file with the Code Mode snippet> BF_STUB_LOG=<follow-up request log>
OC_HARNESS_EXTRA_CONFIG=$PWD/harness/provider.json desktop-harness.sh start $PWD
node harness/drive.mjs             # single, multi, mask, eye, validation, Enter, Escape, redaction, DOM leaves no value
node harness/drive2.mjs            # reload, long thread, session switch, themes
```
