# file-viewer: design

Status: the detection engine is built and tested. No UI is wired (`src/gui.ts` registers nothing). Research behind the
architecture: `.git/orchestration/file-viewer-research.md` (OpenCode 2.2.5).

## Decisions

Settled with the user:

- Open files in a **side panel tab**, native looking.
- Formats: video (mp4 mov webm m4v), image (png jpg gif webp svg avif), audio (mp3 m4a wav ogg flac), markdown, CSV, JSON, PDF.
- Detection is for **inline code and links only**. Fenced code blocks and plain prose are not linkified.
- The file must exist. Roots are the **project directory or `~`** only; absolute paths elsewhere are refused.

Open (need the user): see "Open questions" at the end.

## What the host already does (so what the plugin adds)

2.2.5 already linkifies inline code and `[x](path)` links whose file exists, opens them in a side-panel tab, and has native
viewers for every format above except JSON (shown as highlighted text). It refuses `~` paths, never sees a path with a space in
inline code, drops `#t=` and `@1:12`, and applies no root or denylist policy. The plugin therefore does not need its own
viewer, route or library to meet the brief; it fills the detection and policy gaps and hands an absolute path to the host.

Hook: one `LinkHandler` (`priority` above the Files plugin's 0). `exists(link)` runs `parseSpan(link.href, {origin: "decoded-href"})`
then `resolve`. `open(link)` rewrites to the absolute real path and calls `ctx.links.open({...link, href, origin: ctx.id})`; `match`
returns false for our own origin so the Files plugin opens it. Not built yet; see open questions 1 to 3.

## Modules

| File | Job |
| --- | --- |
| `kinds.ts` | Extension → viewer kind, mime, size cap; known-extension and known-name sets. |
| `types.ts` | `Candidate`, `Origin`, `RejectReason`. |
| `detect.ts` | `parseSpan` (one text → one path or a reason), `detectPaths` (span or prose), suffix parsing. |
| `markdown.ts` | `scanMarkdown`: inline code, link and image destinations, `file:` autolinks, reference definitions, raw HTML `src`/`href`; fences masked. |
| `policy.ts` | Pure roots and denylist logic. No Node imports. |
| `resolve.ts` | `resolve(candidate, env, io)`: lexical path, roots, denylist, `stat`, real path re-check, kind, size. |
| `node-io.ts`, `fake-io.ts` | `FileIO` over Node (server part or tests) and an in-memory one for tests. Not bundled. |

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
Detection is syntax only. Existence and permission are `resolve`.

### Decisions in the grammar

- **Confidence** `high | medium | low`. Spans keep `low` (an existence check follows); prose keeps `medium` and up. `and/or`, `src/utils`,
  `/api/users`, `@scope/pkg`, `Next.js` are `low`: they parse, but prose never returns them.
- **Forms**: `tilde` (`~`), `tilde-user` (`~root`, refused by `resolve`), `env` (`$HOME`, `${HOME}`, `%USERPROFILE%`; only HOME, USERPROFILE and PWD expand),
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
- **Unicode**: any letter, emoji, CJK, RTL is a path character. NFC/NFD variants are tried by `resolve`.
- **Windows**: detected (`C:\x`, `C:/x`, mixed slashes, `file:///C:/x`), refused on non-Windows by `resolve`. `C:foo` (drive-relative) and `\\server\share` are refused.
- **Time**: all scans are single pass with bounded look-ahead (quote search 1024 characters, spaced reading 6 words, line start 512), no nested quantifiers.
  36 hostile inputs of 80 000 characters scale linearly in the tests.

### Markdown scanning

CommonMark rules where they matter: a code span closes on the next backtick run of the same length; one padding space is trimmed; `\`` is escaped;
a fence is three or more backticks or tildes, closes on the same character with at least the same length, an unclosed fence runs to the end, a backtick
fence cannot have a backtick in its info string; indented code needs a blank line before it and is ignored inside a list. Link destinations support
`<...>` with spaces, balanced parentheses, titles; raw `src`/`href`/`data` of `img a video audio source embed track link object iframe`.
CRLF is handled. Not handled: setext or HTML block context, nested emphasis edge cases (irrelevant to paths).

## Resolution and policy

`resolve(candidate, {cwd, home, platform, roots?, caseInsensitive?}, io)`:

1. Lexical absolute path: `~` → home, `$HOME`, `$PWD`, relative → cwd, `..` collapsed (never above `/`).
2. **Roots check on the lexical path, before any `stat`**: under cwd or home (segment-wise, NFC, case-insensitive on macOS/Windows). A root of `/` or a bare drive is unusable. Nothing outside the roots is ever probed (no network mounts, no `/proc`).
3. **Denylist on the lexical path**: `.ssh .aws .gnupg .git` anywhere; under home `.kube .docker .azure .config/{gcloud,gh,op,opencode,git} .local/share/opencode Library/{Keychains,Cookies,Mail,Messages,Safari,Containers,"Application Support"} AppData`; files `.env .env.*` (not `.example/.sample/.template/.dist`), `id_rsa* id_ed25519*`, `*.pem *.key *.p12 *.pfx *.keystore *.jks *.kdbx *.tfstate *.tfvars`, `.npmrc .netrc .pgpass .git-credentials credentials(.json) secrets.* auth.json token(s).json client_secret*.json service-account*.json known_hosts`.
4. `stat` (follows symlinks; `real` is canonical), trying as-is, NFC, NFD for each reading (at most 4 readings).
5. **Re-check on the real path**: still under a root (roots also count their own real path, e.g. `/var` → `/private/var`), not denied, same viewer kind as the requested name (`a.png → notes.json` is refused, so a symlink cannot disguise a file).
6. Size cap by kind (image 64 MB, svg 8 MB, pdf 256 MB (the host reads it whole), markdown 8 MB, csv/json 32 MB; audio and video are streamed, no cap).

Refusals: `windows-path-on-posix unc-refused other-user-home unresolved-variable outside-roots denied-location symlink-escape symlink-type-mismatch not-found permission-denied is-directory not-a-file unsupported-type too-large no-usable-root`.

SVG is only ever shown by the host as an image (`<img>`/data URL), never inline. PDF is Chromium's own viewer. Nothing here serves bytes.

## Test corpus

`pnpm test`: 481 tests. `detect.test.ts` 273 span cases; `prose.test.ts` 78 prose cases + range invariants + 36 performance/ReDoS inputs;
`markdown.test.ts` 65; `resolve.test.ts` 20 (fake file system and a real temp tree with real symlinks, traversal, and a 28-path denylist).

## Open questions

Everything below changes what gets built; the engine does not depend on the answers.

1. **Build a viewer or reuse the host's?** The host already opens every format except JSON in a native side-panel tab. Recommended: reuse
   it (LinkHandler hands an absolute path to the Files plugin) and build a plugin `Panel` only for what it lacks: video `#t=` seek, a JSON tree, CSV sort. Which of those do you want?
2. **Home directory source.** The renderer cannot expand `~`. Options: a server part returning `os.homedir()` (right for remote servers, but a
   service restart on first install); `main(ctx)` + Ipc (local servers only); or infer from the session directory. Recommended: server part.
3. **Block or decline outside the roots?** Today the host opens `/etc/passwd` or `~/.ssh/id_rsa` if a message names it. If our handler only
   declines, that stays. If it claims every local link and refuses outside the roots, we tighten the host (and break opening `/tmp/x.png`, `/Volumes/...` files). Recommended: claim and refuse for the denylist only; decline (host behaviour) for other outside paths? or the full roots rule?
4. **Spaces in inline code.** The host rejects whitespace before our handler runs, so `` `~/Movies/My Video.mp4` `` can never be linked through `LinkHandler`. Only a DOM pass can. Accept the gap (recommended), or approve the DOM fallback (one observer, scoped, delegated click)?
5. **Timestamps.** `file.mp4@1:12` and `#t=72` parse, but the built-in video viewer cannot seek. Needed? (Implies the custom panel from question 1.)
6. **Relative paths with a unique match elsewhere.** The host also resolves `a.png` anywhere in the workspace by search. Our `resolve` is exact (cwd-relative). Keep the host's fuzzy search as fallback?
7. **Project directory for relative paths.** `cwd` should be the session's directory. Confirm that sessions in a git worktree use the worktree directory as the root (not the repo root).
