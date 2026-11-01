# Side panel experiment

A pinned panel in the side region with a heading, a line of text and a click counter.

## What it does
- Registers one pinned "Experiment" tab in the side region, built from the host's `Button`.
- Nothing else. It exists to check the `Panel` registry and its manifest, and does nothing useful.

## Context
The original pinned counter-panel experiment, kept as a minimal `Panel` example. It has no typecheck or test script, and keeps its original manifest and Bun lockfile beside a pnpm lockfile.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/sidepanel"]
```
Kind: GUI (`gui-experimental`). Cmd+R for GUI.

## Options
None.

## Development
`pnpm exec vite build` (dist is tracked). There is no typecheck or test script.
