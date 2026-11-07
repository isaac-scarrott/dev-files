# Model picker

The Search models dialog lists providers A to Z and, inside each, models by output price, with no Recent section.

> **Credit:** the result rows and the sticky-header fade are cloned from [OpenCode](https://github.com/anomalyco/opencode)'s (MIT) own model dialog (2.2.5).

![The model picker: provider sections A to Z, models sorted by price, then a search](media/demo.gif)

[Full-quality video](media/demo.mp4)

## What it does
- Providers run A to Z by name. Favorites stays above them.
- Models inside a provider run by output price per million tokens, highest first, ties by name. A model with no price counts as 0.
- A favorite is listed twice: in Favorites, and under its provider with the rest of them. Losing the star leaves just the provider copy.
- No Recent section. A model you used recently stays under its provider instead of moving out.
- Works from every entry point (composer pill, `Cmd+'`, "Choose model", `/model`). Search, Enter, the variants flyout and favoriting behave as in the host.

## Context
This replaces the results list of OpenCode's own model dialog. The host keeps running underneath, hidden, so selection, favorites and hidden models stay its own; the plugin draws a second list from clones of its rows. It depends on the dialog's markup, and steps aside if that changes: the host's list is hidden only while the pane can read it in full, and is shown again (the pane removed) when an update makes it unreadable. Dialogs are looked for only beside the app root, so a streaming reply costs the plugin nothing. Prices need the model list for the open session's directory, so until it loads the order falls back to name.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/model-picker"]
```
Kind: GUI (`gui-experimental`). Cmd+R for GUI.

## Options
`rank` (optional): stand-in prices for models the catalog leaves unpriced, by provider and a substring of the model key or name. The default ranks the Claude Agent provider's families, since the claude CLI gives them no price:
```json
{ "package": "/path/to/apps/opencode-plugins/model-picker", "options": { "rank": { "claude-agent": { "fable": 100, "opus": 75, "sonnet": 15, "haiku": 5 } } } }
```
A provider you list replaces its default entry. Highest first.

## Credits
- [OpenCode](https://github.com/anomalyco/opencode) (MIT): the result-row markup (cloned at run time from the host's rows) and `fadeHeaders`, copied from the model dialog in the desktop app's renderer source (2.2.5).

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Tests use the real 2.2.5 dialog in `test/fixtures` ([README](test/fixtures/README.md)). Design notes: [DESIGN.md](DESIGN.md).
