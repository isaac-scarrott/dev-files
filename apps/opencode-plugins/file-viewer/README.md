# File viewer

Turns file paths in assistant messages into links that open in a side-panel viewer. **Work in progress: the detection engine is built; nothing is wired into the window yet.**

## What it does
- Reads inline code and link destinations in a message and decides whether each is a file path: `~/Movies/x.mp4`, `docs/a.md:12`, `video.mp4#t=72`, `file:///tmp/a%20b.png`, paths with spaces, Unicode, Windows forms.
- Refuses URLs, versions, dates, globs, shell substitutions and hostile input (traversal, control and bidi characters).
- Opens only files that exist under the project directory or `~`, never secrets (`.ssh`, `.aws`, `.env`, keys), and never follows a symlink out of those roots.

## Context
OpenCode 2.2.5 already links inline code and opens images, video, audio, PDF, Markdown and CSV in a side-panel tab, but it refuses `~` paths and applies no path policy. This plugin fills those gaps. See [DESIGN.md](DESIGN.md) for the decisions and the open questions.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/file-viewer"]
```
Kind: GUI (`gui-experimental`). It registers nothing yet.

## Options
None.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Design notes: [DESIGN.md](DESIGN.md).
