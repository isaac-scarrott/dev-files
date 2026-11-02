# Visual replies

Agents answer with a chart, table, diagram or mock-up that renders inline in the timeline, and opens in a side-panel tab.

> **Credit:** The pages are OpenCode's own experimental artifacts (`artifact_create`, `artifact_update`, `artifact_delete`, `experimental.artifacts`; anomalyco/opencode, MIT). This plugin renders them in the chat and a panel and tells the agent how to use them.

![A funnel chart in a card under the Execute row, and the same artifact open in the side panel](media/demo.png)

## What it does
- Shows each artifact the agent creates as a card under its tool row: zoom, expand to a full-window view, and **Open in panel** (the same artifact in a side tab).
- When the agent updates an artifact, the first card shows the latest version and a compact "Updated <title>" row appears under the update call. Click it to open the panel.
- Opens the collapsed "Used N Execute" row once so the card is visible (Code Mode folds the tool call into Execute). Close it and it stays closed.
- Uses the app's light and dark colours and fonts through variables (`--bg`, `--fg`, `--accent`, `--font` and others); cards and the panel re-theme live.
- Adds a short instruction for the agent: when to use artifacts, one self-contained `index.html`, the theme variables, and to delete one-off mock-ups when it is done with them.
- A card keeps showing what an artifact looked like after the agent deletes it.

## Context
Agent replies are text. OpenCode 2.2.5 ships artifact tools but no timeline view for them, so the GUI part inserts a card after the tool row (the host has no timeline extension point) and a panel tab. Pages run in a sandbox: **no network** (fetch, images, fonts, scripts from elsewhere, forms), no storage, no access to the app, and a page cannot navigate away. A page cannot open a link on its own: a click asks first, in the app's dialog, and only Confirm opens it. See [DESIGN.md](DESIGN.md) "Isolation" for what is enforced where and what was tested. Limits: single-file HTML (only the entry file is shown) and desktop only.

## Install
Needs OpenCode with artifacts turned on, in `~/.config/opencode/opencode.json`:
```json
"experimental": { "artifacts": true },
"plugins": ["/path/to/apps/opencode-plugins/visual-replies"]
```
Kind: GUI (`gui-experimental`, including a main-process part) and server in one package. Restart the app for the server and main parts, Cmd+R for GUI. Artifacts are an experimental OpenCode feature and may change in a release.

Upgrading from the `publish_html` version: that tool and its page storage are gone. Pages it published are no longer shown (their calls appear as ordinary tool rows) and stay in the plugin's storage until you delete them by hand.

## Options
None.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). The isolated-app harness and attack page are in `harness/`. Design notes: [DESIGN.md](DESIGN.md).
