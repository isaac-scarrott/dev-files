# Plugin README

Every plugin under `apps/opencode-plugins/` has a `README.md` in this shape. It is for someone deciding whether to install the plugin and who wants to know where it came from. Design reasoning stays in `DESIGN.md`.

````markdown
# <Plugin name>

<One sentence: what the user sees or gets.>

![alt text](media/demo.gif) or ![alt text](media/demo.png), then for motion: [Full-quality video](media/demo.mp4)

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

- GitHub plays nothing from a repo-relative mp4 link or `<video>` tag (the sanitizer drops it), so motion ships as an animated GIF embedded with `![alt](media/demo.gif)`, which plays inline on the page, plus the mp4 as a link. Make it: `ffmpeg -i demo.mp4 -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 demo.gif`; keep the GIF under 2 MB.
- Prefer a short recording (5 to 15s, mp4, no audio, under 2 MB) of the real feature in the harness; a PNG screenshot (cropped to the feature, under 300 KB) when motion adds nothing. One hero asset, a second only when it shows a different state.
- Capture in the isolated harness with realistic data ([stress.md](stress.md)), never from the user's own app or threads. No private names, prompts or paths on screen. `scripts/seed-demo.mjs` seeds invented projects, a 12-prompt session, 34 archived sessions and subagents (point a provider at a server that never finishes a reply to make them genuinely run). Record by CDP `Page.startScreencast` frames with their timestamps, encode with ffmpeg (`libx264 -crf 30 -an`), draw a cursor dot, and strip `title` attributes so native tooltips do not show.
- Store in `<plugin>/media/`; reference by relative path.

## Credit

Find borrowed material by reading the plugin's `DESIGN.md` and source comments for named projects (t3-code, Emil Kowalski's skills, native OpenCode source). Credit each at the grain it was used. t3-code is MIT (pingdotgg/t3code).
