# file-viewer: design

Opens file paths from assistant messages in the Files plugin's side-panel tab. It extends two host behaviours and nothing else.
Research behind it: `.git/orchestration/file-viewer-research.md` (OpenCode 2.2.5, source tag `v2.2.5`).

## Decisions

Settled with the user:

1. **Reuse the host's viewer.** No new viewer, route, library or `Panel`. The Files plugin already opens image, video (ranged reads), audio, PDF, Markdown and CSV in a native side-panel tab; JSON shows as highlighted text. The plugin hands it an absolute path with `ctx.links.open`.
2. **No path policy.** No roots rule, no denylist, no real-path check. The host already opens any absolute path a message names (it lists the parent directory and reads the file from there), so a partial policy in the plugin would only look safe. The plugin expands `~` and `$HOME`, resolves relative paths against the session directory, collapses `.` and `..`, and leaves symlinks to the host. `~user` is not handled: another user's home cannot be read from the renderer or the server part reliably, so it stays declined.
3. **Home directory from a server part.** `server.ts` registers an RPC `home` that returns `os.homedir()`; the window asks once per server and keeps the answer (a failed lookup is forgotten and retried). A session on a remote server is declined, because `~` is the local machine's home. **First install needs a service restart**, because the host fixes a plugin's parts per service lifetime (host-architecture.md §3). Later rebuilds hot-reload.
4. **Spaces in inline code: a scoped DOM fallback** (`spaced-code.ts`, below). Can be switched off with the plugin option `spacedCode: false`.
5. **Timestamps are parsed but ignored.** `file.mp4#t=72` and `@1:12` open the file; nothing seeks.
6. **Relative paths keep the host's fuzzy search.** The plugin declines everything it cannot resolve exactly, so `docs/a.md` (no spaces) never reaches it, and a spaced name that is not found at the exact path falls back to the host (`ctx.links.exists/open` with our own origin). Relative paths use the directory the Files API reports (`files.root`, the session's directory, which is the worktree for a worktree session).

## How it fits the host

The host links an inline code span or a link only if its `LinkHandler.exists` says the file is there, and opens it with `LinkHandler.open`. The Files plugin's handler has priority 0 and matches everything.

`gui.ts` adds one `LinkHandler` with **priority 5**:

- `match(link)`: the text is a `~` or `$HOME` path, or a name with spaces and a known extension (`claim` in `expand.ts`), and the link is not ours (`origin !== ctx.id`), not `exact`/`background` (palette, agent previews) and has no `base` (links inside a previewed document). Everything else is declined, so the host behaves exactly as before.
- `exists(link)`: expand, then `files.exists(path)` (the host's own parent-directory listing, nothing read), cached like the host's check (60 s hit, 5 s miss, 512 entries). If the exact file is missing, answer with the host's own check (`ctx.links.exists({...link, origin: ctx.id})`).
- `open(link)`: the same lookup, then `ctx.links.open({...link, href: absolute + #L.., origin: ctx.id})`, which the Files handler opens; when nothing exact exists, the original link goes to the host unchanged.

What the host did before this plugin, and what it does with it, measured in the harness (control run, then with the plugin; same seeded message):

| Text in a message | Host alone | With the plugin |
| --- | --- | --- |
| `` `~/dir/video.mp4` `` (also png, pdf, md, csv, json) | plain code, not clickable | link, opens in the Files tab; the video loads (readyState 4, 3 s) and plays |
| `[x](~/dir/readme.md)` | link that does nothing | opens |
| `` `$HOME/dir/shot.png` `` | plain code | opens |
| `` `~/dir/My Video.mp4` `` (space) | plain code | link, opens |
| `` `docs/My Notes.md` `` (space, relative) | plain code | link, opens |
| `` `docs/plain.md` ``, absolute path | link, opens | unchanged |
| missing file (`~/dir/missing.mp4`, `docs/Missing Notes.md`) | plain code | plain code |
| `npm run build`, `ffplay ~/x.mp4` | plain code | plain code |
| inside a fenced block | plain | plain |

## Spaced inline code (workaround)

`spaced-code.ts` **is a workaround against a host limit, not a feature.** The host offers an inline code span to the link handlers only if its text has no whitespace (`inlineCodeKind` in `session-ui/src/components/markdown-inline-code-kind.ts`), so no `LinkHandler` ever sees `` `~/Movies/My Video.mp4` ``.

What it does, as narrowly as possible:

- One `MutationObserver` on `document.body` with `childList` + `subtree` and an `attributes` filter of `data-inline-code-kind`. It reads added nodes with `getElementsByTagName("code")` (a live collection, no selector matching), keeps `code` whose parent is not `pre` and which sits in `[data-component="markdown"]`, and queues them.
- A queue flushed in one `requestAnimationFrame`, at most 150 spans per frame, longer batches continue next frame.
- A span qualifies only if it has no host mark yet, is not inside a link, is 5 to 400 characters, contains whitespace, and parses as a path with a known extension that is not a shell command (`eligible`). Existence is the same cached check as above.
- It then sets the host's own attribute `data-inline-code-kind="path"` (plus `data-fv-spaced` to recognise its own marks). The host's CSS (path colour, pointer, hover underline) and its click handler then treat the span like any other path, and the click arrives at our `LinkHandler`: **no listener of our own**, no styles, no injected nodes.
- If the host re-renders a block and drops the attribute, the attribute observer re-queues the span and a cached answer restores the mark in the same frame. A changed text or a disconnected node drops the stale answer.
- Cleanup removes every mark, disconnects the observer and cancels the frame. Hot reload, `Cmd+R` and a second `setup` leave the counts unchanged (verified).

**Remove this module when the host's inline code gate accepts whitespace** (or exposes a plugin-extensible gate). Then delete `spaced-code.ts`, its test, the `spacedCode` option and the call in `gui.ts`; the `LinkHandler` already handles spaced names.

### Performance

Harness, 300-turn seeded session (virtualised timeline, 30 code spans visible), scripted fast scroll top to bottom and back (122 frames), median of 5 warm runs, bare app (same UI plugins, no file-viewer) vs with:

| Metric | bare | with | delta |
| --- | --- | --- | --- |
| idle 10 s, task ms | 1 | 1 | 0 |
| scroll, script ms | 142 | 162 | +20 (+14%) |
| scroll, layout ms | 23 | 26 | +3 |
| scroll, style ms | 77 | 72 | -5 |
| scroll, task ms | 392 | 435 | +43 |
| long tasks, heap, nodes | 0, 36 MB, 1151 | 0, 38 MB, 1152 | none |

Hill climb: the first version used a selector query over every added node (script +28 ms). Switching to `getElementsByTagName` and a cheap parent check brought it to +20. A variant with the observer callback emptied measured 159, and a variant with no observer at all 145 (= bare), so **the remaining cost is the browser delivering mutation records for the rows a scroll mounts, not our callback**, and the LinkHandler alone is free. That is over the 3% bar in `performance.md` for fast scroll of a very long session. It cannot be narrowed further without the observer missing rows, so the option `spacedCode: false` removes it entirely. Idle cost is zero (no timers, no observer callbacks without a DOM change).

## Modules

| File | Job |
| --- | --- |
| `gui.ts` | Registers the `LinkHandler`, asks the server part for the home directory, starts the DOM fallback. |
| `server.ts`, `rpc.ts` | Server part: RPC `home` → `os.homedir()`. Emitted by `tsc` to `dist/server.js`; the GUI bundle is added beside it. |
| `expand.ts` | `claim` (does the plugin take this text), `expand` (absolute path and `#L` selection). Pure. |
| `links.ts` | `createLinks(deps)`: exact existence check through the host's Files API, cache, remote-server guard. |
| `spaced-code.ts` | The DOM workaround above. |
| `detect.ts`, `kinds.ts`, `types.ts` | Path grammar: `parseSpan` is what `claim` uses. |
| `markdown.ts`, prose scanning in `detect.ts` | Complete and tested, **not used by the plugin** (the host scans markdown itself). Kept as the engine for a future DOM-free scan; delete if unused. |
| `policy.ts` | `normalizeAbsolute`, `join`, `isAbsolute` only. |

## Not done

`~user` expansion; timestamps seeking; JSON tree or CSV sort (host viewers as they are); Windows `~` (`%USERPROFILE%` expands via the same home answer but is untested on Windows).

## Detection model

`detectPaths(text, {origin})`. The origin decides how strictly the text is read.

| Origin | Meaning | Reading |
| --- | --- | --- |
| `code` (default) | whole text of an inline code span | The whole text is one path or nothing. Spaces allowed unless it reads like a command. |
| `href` | a markdown destination as written | Same, plus one `decodeURIComponent`, as the host does. `%2e%2e` becomes a real `..` here. |
| `decoded-href` | the `Link.href` a `LinkHandler` receives | Same, no decoding; a leftover `%2e%2e` was double encoded and is refused. |
| `prose` | free text | Tokenised; returns every path-looking token with a range. Used for shell output, diffs and as the DOM fallback. |

Where the text comes from decides what is scanned (`scanMarkdown`): inline code, link and image destinations, autolinks, definitions
and HTML attributes are scanned; **fenced code, indented code and prose are not** (user decision). `prose: true` opts prose in.

Every result is `Candidate`: `path` (suffix removed, unescaped, `file://` decoded, `\` → `/`, diff prefix removed), `form`, `ext`,
`viewerKind`, `line/column/endLine/endColumn`, `time`, `page`, `anchor`, `quoted`, `confidence`, `alternatives`, and the source range.
Detection is syntax only. Existence is the host's Files API (`links.ts`).

### Decisions in the grammar

- **Confidence** `high | medium | low`. Spans keep `low` (an existence check follows); prose keeps `medium` and up. `and/or`, `src/utils`,
  `/api/users`, `@scope/pkg`, `Next.js` are `low`: they parse, but prose never returns them.
- **Forms**: `tilde` (`~`), `tilde-user` (`~root`, parsed but declined by `claim`), `env` (`$HOME`, `${HOME}`, `%USERPROFILE%`; `claim` takes only HOME and USERPROFILE),
  `absolute`, `relative-dot`, `relative`, `bare`, `windows`, `unc` (always refused), `file-url`.
- **Extension rule**: a bare word needs a known extension or known file name (`Dockerfile`, `README`, `.gitignore`). `Foo.Bar.baz`,
  `console.error`, `e.g`, `user@example.com`, `1.2.3`, `v2.0.1`, `3.14` are refused. A path with a slash or a strong start (`~`, `/`, `./`, drive)
  may have an unknown or no extension at lower confidence. `v1.2.mp4` and `report.final.pdf` are files (last extension wins); `a.tar.gz` is `gz`.
- **Not paths**: any `scheme://` except `file:`, `mailto:` `tel:` `data:` `javascript:`..., `git@host:path` (scp), `localhost:3000/x`, scheme-less
  domains with a slash (`example.com/a.png`, first label set ends in a common TLD such as `com org net io dev app ai`), `//cdn.x.com/a.png`.
  Cost: a real folder named `foo.com/` without `./` is read as a domain.
- **Globs and shell**: `*`, `?`, `{a,b}` refuse the token; `$(...)`, backticks and `$VAR` mid-path refuse it; `< > | "` refuse it.
- **Suffixes** (stripped from `path`, reported as fields): `:12`, `:12:3`, `:12-20`, `:12:3-20:8`, `#L10`, `#L10-L20`, `#L10C5-L12C3`, `file.ts(12,3)`;
  media: `#t=72`, `#t=1:12`, `#t=1m12s`, `#t=72,90` (first), `@1:12`, ` @1:12`, and for audio/video `:72` or `:1:12` mean time, not line;
  `#page=3`; any other `#anchor` after a file with an extension. A line of 0 or above 10 000 000 is dropped, a reversed range is swapped.
- **Wrappers and trailing punctuation**: quotes, backticks, `<>`, `()`, `[]` are stripped; trailing `. , ; : ! ? …` are stripped; a trailing
  `)`/`]` is stripped only when unbalanced, so `Photo (1).png` and `app/(auth)/[id]/page.tsx` survive.
- **Spaces**: in a code span or link the whole text is the path (`Final Report.pdf`) unless its first word is a shell verb (`open`, `ffplay`, `cat`...),
  a later word is a flag (`-o`) or a shell operator. In prose, spaces need quotes, a `\ ` escape, `<...>` after `](`, a strong start
  (`~/Movies/My Video.mp4` looks ahead up to 6 words for a known extension, shortest reading first, longer ones kept in `alternatives`), or a macOS
  capture prefix (`Screenshot ... AM.png`, `Screen Recording`, also with U+202F before AM/PM).
- **Quotes in prose**: an opening quote must follow whitespace or an opening mark, and a closing `'` followed by a letter is an apostrophe. If a
  quoted run is not one path (`"open a.png"`), tokens inside are scanned.
- **Prose tokens** also: `--out=./o.mp4`, `OUT=build/a.png` (value after `=`), comma lists `a.png,b.png` split when every piece is a known file
  (a real name with a comma and no space is split; accepted risk), `[label](dest)` destination as its own token, diff headers (`a/` and `b/` stripped, original kept as alternative).
- **Hostile text**: null byte, other control characters, newline, bidi overrides (U+202A-E, U+2066-9), zero-width characters (U+200B/C, U+2060, U+FEFF)
  refuse the candidate (`gpj.png` spoofing). U+200D stays for emoji. `%2e%2e`, `%2f`, `%5c`, `%00` in a segment are refused (encoded traversal). Spans
  above 4096 characters and segments above 255 are refused without scanning.
- **Unicode**: any letter, emoji, CJK, RTL is a path character. Paths are handed to the host as written; the host's listing check decides (APFS ignores the normalization form).
- **Windows**: detected (`C:\x`, `C:/x`, mixed slashes, `file:///C:/x`), not claimed by the plugin (the host handles them). `C:foo` (drive-relative) and `\\server\share` are refused.
- **Time**: all scans are single pass with bounded look-ahead (quote search 1024 characters, spaced reading 6 words, line start 512), no nested quantifiers.
  36 hostile inputs of 80 000 characters scale linearly in the tests.

### Markdown scanning

CommonMark rules where they matter: a code span closes on the next backtick run of the same length; one padding space is trimmed; `\`` is escaped;
a fence is three or more backticks or tildes, closes on the same character with at least the same length, an unclosed fence runs to the end, a backtick
fence cannot have a backtick in its info string; indented code needs a blank line before it and is ignored inside a list. Link destinations support
`<...>` with spaces, balanced parentheses, titles; raw `src`/`href`/`data` of `img a video audio source embed track link object iframe`.
CRLF is handled. Not handled: setext or HTML block context, nested emphasis edge cases (irrelevant to paths).

## Test corpus

`pnpm test`: 485 tests. `detect.test.ts` 273 span cases; `prose.test.ts` 78 prose cases + range invariants + 36 performance/ReDoS inputs;
`markdown.test.ts` 65; `expand.test.ts` (claim and expansion), `links.test.ts` (cache, remote server, missing home), `spaced-code.test.ts` (happy-dom: marking, scoping, re-marking, cleanup, frame budget). The earlier roots, denylist and real-path tests were removed with that code.

