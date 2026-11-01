# Plugin README

Every plugin under `apps/opencode-plugins/` has a `README.md` in this shape. It is for someone deciding whether to install the plugin and who wants to know where it came from. Design reasoning stays in `DESIGN.md`.

````markdown
# <Plugin name>

<One sentence: what the user sees or gets.>

<video or screenshot: media/demo.mp4 (GitHub renders a bare link to an mp4 in the repo) or ![...](media/demo.png)>

## What it does
- 3 to 6 bullets of observable behaviour, user terms.

## Context
Why it exists, which native OpenCode surface it extends or replaces, and the one limit worth knowing.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/<name>"]
```
Kind: GUI (`gui-experimental`) or server. Restart the app for server plugins, Cmd+R for GUI.

## Options
Table of options with defaults, or "None".

## Credits
- <Project> (<licence>), <what was taken: the idea, the layout model, the interaction, code>: <link to the source file or repo>.
Omit the section when nothing was borrowed. Say "inspired by" for an idea, "adapted from" for ported logic or numbers.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Design notes: [DESIGN.md](DESIGN.md).
````

## Media

- Prefer a short video (5 to 15s, under 2 MB, mp4, no audio) of the real feature in the harness; a PNG screenshot (cropped to the feature, under 300 KB) when motion adds nothing. One hero asset, a second only when it shows a different state.
- Capture in the isolated harness with realistic data ([stress.md](stress.md)), never from the user's own app or threads. No private names, prompts or paths on screen.
- Store in `<plugin>/media/`; reference by relative path.

## Credit

Find borrowed material by reading the plugin's `DESIGN.md` and source comments for named projects (t3-code, Emil Kowalski's skills, native OpenCode source). Credit each at the grain it was used. t3-code is MIT (pingdotgg/t3code).
