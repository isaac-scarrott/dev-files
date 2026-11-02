# file-viewer: design

Opens file paths from assistant messages in the Files plugin's side-panel tab. It extends two host behaviours and nothing else.
Research behind it: `.git/orchestration/file-viewer-research.md` (OpenCode 2.2.5, source tag `v2.2.5`).

## Decisions

Settled with the user:

1. **Reuse the host's viewer.** No new viewer, route, library or `Panel`. The Files plugin already opens image, video (ranged reads), audio, PDF, Markdown and CSV in a native side-panel tab; JSON shows as highlighted text. The plugin hands it an absolute path with `ctx.links.open`.
2. **No path policy.** No roots rule, no denylist, no real-path check. The host already opens any absolute path a message names (it lists the parent directory and reads the file from there), so a partial policy in the plugin would only look safe. The plugin expands `~` and `$HOME`, resolves relative paths against the session directory, collapses `.` and `..`, and leaves symlinks to the host. `~user` is not handled: another user's home cannot be read from the renderer or the server part reliably, so it stays declined.
3. **Home directory from a server part.** `server.ts` registers an RPC `home` that returns `os.homedir()`; the window asks once per server and keeps the answer (a failed lookup is forgotten and retried). A session on a remote server is declined, because `~` is the local machine's home. **First install needs a service restart**, because the host fixes a plugin's parts per service lifetime (host-architecture.md §3). Later rebuilds hot-reload.
4. **Spaces in inline code: a lazy DOM workaround** (`spaced-code.ts`, below). A span is marked only when the pointer reaches it, so nothing runs while rows mount or scroll. Always on; there is no option, because its measured cost is zero.
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

What it does, as narrowly as possible: nothing until the pointer reaches a span.

- Three delegated capture listeners on `document`: `pointerover` and `pointerdown` (passive) and `click`. No `MutationObserver`, no `requestAnimationFrame`, no timers, so mounting and scrolling rows costs nothing and idle costs nothing.
- The listener looks only at an event whose target is a `code` element (inline code holds text only, so the span itself is the target). It qualifies if it has no host mark yet, is not inside `pre` or a link, sits in `[data-component="markdown"]`, is 5 to 400 characters, contains whitespace, and `claim` reads it as a spaced path (`eligible`). Pure string and attribute tests, no layout reads.
- Existence is the same cached check as the `LinkHandler` (`links.target`), and `links.peek` returns a cached hit synchronously. On `pointerover` the answer arrives in 1 to 11 ms (measured), well before a click, and the mark is set: the host's own attribute `data-inline-code-kind="path"` plus `data-fv-spaced` to recognise our marks. The host's CSS (path colour, pointer, hover underline) and its click handler then treat the span like any other path, and the click arrives at our `LinkHandler`. The host reads the attribute at click time (`localLinkTarget` in `session-ui/src/components/markdown.tsx`), so a mark set on `pointerover` or `pointerdown` is seen by the click that follows. No styles, no injected nodes.
- A click that lands while the first check is still running (pointer events never came: a scripted click, a touch) is opened through `ctx.links.open` once the answer lands. The host saw an unmarked span for that click and did nothing, so nothing opens twice. A missing file, a non-primary button or a click already handled are ignored.
- A span in a part that is still streaming is declined (the host sets `data-streaming` on the markdown root). The host re-renders the part's blocks on every delta and clears the kind attribute on every span (`markInlineCode`), so a mark there flickered off on the next token (measured: never visible 50 ms after a hover). The host's own paths stay plain while a part streams too; once it completes, the next pointer event marks ours. A changed text or a disconnected node drops the stale answer. A span marked by the host itself is never touched.
- Keyboard: the host's own inline paths are not focusable either, so there is nothing to match.
- Cleanup removes every mark and the three listeners. Hot reload, `Cmd+R` and a second `setup` leave the document's listener counts unchanged and show no stale marks (verified).

**Remove this module when the host's inline code gate accepts whitespace** (or exposes a plugin-extensible gate). Then delete `spaced-code.ts`, its test and the call in `gui.ts`; the `LinkHandler` already handles spaced names.

### Performance

Harness, 300-turn seeded session (virtualised timeline, 30 code spans visible), scripted fast scroll top to bottom and back, median of 5 warm runs, two sessions per build. **bare** is the same app with the same UI plugins and no file-viewer; **observer** is the earlier `MutationObserver` version; **lazy** is this one; **no watcher** is the lazy bundle with the `watchSpacedCode` call removed, to attribute the remaining difference.

| Metric | bare | observer | lazy | no watcher |
| --- | --- | --- | --- | --- |
| scroll, script ms | 1214, 1200 | 1346 | 1262, 1258 | 1258 |
| scroll, task ms | 3127, 3067 | 3418 | 3240, 3215 | |
| scroll, observer callbacks | 174 | 520 | 174 | |
| scroll, rAF callbacks | 174 | 346 | 174 | |
| frame p95 / max ms | 9.3 / 17.5 | 16.2 / 25.1 | 9.3 / 17.6 | |
| jank frames | 0 | 1 | 0 | |
| idle 10 s, script ms | 13–27 | 13–27 | 13–27 | |
| idle 10 s, observer / timer / rAF callbacks | 0 | 0 | 0 | |
| hover sweep, script ms | 40.6 | 43.4 | 40.7 | |
| pointer events during scroll | 358 | | 358 | |
| listeners / heap MB / nodes | 563–565 / 31.7 / 2573 | 540 / 34.2 / 2511 | 542–544 / 34.1 / 2511 | |

The remaining 174 observer callbacks in bare and lazy are the host's own. Lazy and no-watcher scroll identically (1258 vs 1262, within the 1227–1314 spread of runs), so the watcher's cost is zero within noise and meets the 3% bar in `performance.md`. The ~4% gap between any build with the plugin and bare is the plugin being loaded at all (the host's plugin layer and the `LinkHandler`, present on `master` before this module); it also changes the DOM (62 fewer nodes) and the heap by 2 MB. Not explained yet, outside this module. The observer version cost +11% script, a jank frame per scroll and nearly doubled the frame p95; that is what this design removes.

## Modules

| File | Job |
| --- | --- |
| `gui.ts` | Registers the `LinkHandler`, asks the server part for the home directory, starts the DOM workaround. |
| `server.ts`, `rpc.ts` | Server part: RPC `home` → `os.homedir()`. Emitted by `tsc` to `dist/server.js`; the GUI bundle is added beside it. |
| `expand.ts` | `claim` (does the plugin take this text), `expand` (absolute path and `#L` selection). Pure. |
| `links.ts` | `createLinks(deps)`: exact existence check through the host's Files API, cache, remote-server guard. |
| `spaced-code.ts` | The DOM workaround above. |
| `detect.ts`, `kinds.ts`, `types.ts` | Path grammar: `parseSpan` is what `claim` uses. A markdown scanner and a prose tokeniser once lived here too; the host scans markdown itself and the DOM workaround reads whole spans, so they were deleted (git history has them). |
| `policy.ts` | `normalizeAbsolute`, `join`, `isAbsolute` only. |

## Not done

`~user` expansion; timestamps seeking; JSON tree or CSV sort (host viewers as they are); Windows `~` (`%USERPROFILE%` expands via the same home answer but is untested on Windows).

## Detection model

`parseSpan(text, {origin})`: the whole text is one path or nothing. The origin decides how strictly it is read.

| Origin | Meaning | Reading |
| --- | --- | --- |
| `code` (default) | whole text of an inline code span | Spaces allowed unless it reads like a command. |
| `href` | a markdown destination as written | Same, plus one `decodeURIComponent`, as the host does. `%2e%2e` becomes a real `..` here. |
| `decoded-href` | the `Link.href` a `LinkHandler` receives | Same, no decoding; a leftover `%2e%2e` was double encoded and is refused. |

The host decides what is scanned (inline code and link destinations; **fenced code and prose are not**, user decision), so the plugin never scans markdown.

Every result is `Candidate`: `path` (suffix removed, unescaped, `file://` decoded, `\` → `/`), `form`, `ext`,
`viewerKind`, `line/column/endLine/endColumn`, `time`, `page`, `anchor`, `confidence`, and the source range.
Detection is syntax only. Existence is the host's Files API (`links.ts`).

### Decisions in the grammar

- **Confidence** `high | medium | low`. Spans keep `low` (an existence check follows). `and/or`, `src/utils`,
  `/api/users`, `@scope/pkg`, `Next.js` parse as `low`.
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
- **Spaces**: the whole text is the path (`Final Report.pdf`) unless its first word is a shell verb (`open`, `ffplay`, `cat`...),
  a later word is a flag (`-o`) or a shell operator.
- **Hostile text**: null byte, other control characters, newline, bidi overrides (U+202A-E, U+2066-9), zero-width characters (U+200B/C, U+2060, U+FEFF)
  refuse the candidate (`gpj.png` spoofing). U+200D stays for emoji. `%2e%2e`, `%2f`, `%5c`, `%00` in a segment are refused (encoded traversal). Spans
  above 4096 characters and segments above 255 are refused without scanning.
- **Unicode**: any letter, emoji, CJK, RTL is a path character. Paths are handed to the host as written; the host's listing check decides (APFS ignores the normalization form).
- **Windows**: detected (`C:\x`, `C:/x`, mixed slashes, `file:///C:/x`), not claimed by the plugin (the host handles them). `C:foo` (drive-relative) and `\\server\share` are refused.
- **Time**: a span is read in one pass with no nested quantifiers, and spans above 4096 characters are refused before scanning.

## Test corpus

`pnpm test`: 300 tests. `detect.test.ts` 272 (258 code-span cases, 10 href and decoded-href, suffix and confidence invariants);
`expand.test.ts` 7 (claim and expansion); `links.test.ts` 10 (cache, remote server, missing home); `spaced-code.test.ts` 11 (happy-dom: nothing on mount, marking on pointer, synchronous cached mark, scoping, pending click opens once, missing and non-primary and handled clicks ignored, stale text, re-mark after the host drops the attribute, cleanup, answer after stop). The earlier roots, denylist and real-path tests were removed with that code, and the prose and markdown tests with theirs.

