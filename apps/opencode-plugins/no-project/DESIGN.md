# no-project

"No project" is a row in the new-session project picker, and a palette command ("New session without a project",
`/no-project`). Both open a draft in a fresh empty folder, one per session.

## How 2.2.5 models a session's location

- `SessionInfo = { id, projectID, location: { directory } }`. `projectID` is derived by the server from the directory;
  `session.create` takes `location?: { directory }` and no `projectID`. The app's `ctx.layout.draft({ server, directory, prompt })`
  opens an unsent draft in a directory; the session is created on first send.
- There is no projectless session. Omitting `location` runs the session in the server's default location, its home
  directory (observed `/Users/isaac`), which is itself a project and loads home-level config and AGENTS.md.
- A directory with no VCS becomes its own project whose `canonical` is that directory. A missing directory is accepted by
  `session.create`, but file tools then fail on it.
- The app's own "Default Project" is `~/Documents/Default Project`. Settings > Default environment only picks where new
  sessions start per project; it has no "none".
- t3code (`client-runtime/src/state/projectGrouping.ts`): a thread without a project is really a project with `isScratch`,
  and all scratch projects group under one label, "No project". Same shape as the decision below.

## Decision: (b) one scratch folder per session, each named "No project"

- Each open creates `<server home>/.local/share/opencode/no-project/<uuid>/No project` (`<uuid>` = `crypto.randomUUID()`).
  Home is `client.location.get().directory`, so a remote server gets its own folders. The server half resolves the same
  directory as `XDG_DATA_HOME` (absolute) or `~/.local/share`, plus `opencode/no-project`; with a custom `XDG_DATA_HOME`
  the GUI's guess misses it, so those folders are created but never swept.
- Why per session: sessions no longer share files, AGENTS.md-less history or leftovers. Why the leaf is always
  `No project`: the host's project row and sidebar-repos label a session by the basename of `project.canonical`, so every
  folder still reads "No project" with no coupling between plugins. Cost: every folder becomes its own project and
  shows under "Other projects" in the picker (accepted).
- An absolute `options.directory` in the `opencode.json` plugin entry means one single shared folder instead (no uuid,
  no cleanup: the sweep only looks under the base dir). The picker row hides while the host lists a project at that
  pinned path; with per-session folders it never hides, since a listed folder is a past session's.
- The folder is created by `experimental.file.write` of `README.md` by absolute path from the default location. The
  write creates missing parents (checked live: three levels). A location that does not exist yet cannot be written
  through (`LocationNotFoundError`). The draft opens in a focused new tab through `ctx.layout.draft` with an empty
  prompt; nothing is sent, and the session is created on first send, so an abandoned draft leaves an empty folder.
- The old shared `~/Documents/No project` from earlier versions is left untouched and never deleted.

## Cleanup (server entry, `src/server.ts` + `src/sweep.ts`)

The HTTP API has no delete and GUI plugins cannot touch the disk, so the package also has a server plugin
(`exports["."]` -> `dist/server.js`, like orchestrator-tools; the same plugin path loads both entries). It sweeps
`<data dir>/no-project/*` at server start and every 6 hours, and on `session.deleted`. A folder is deleted when:

1. no session was ever created in it (or its session was deleted) and the folder is older than 24h;
2. every session in it is archived and the newest archive is more than 7 days old (exactly 7d is kept);
3. its session was deleted: removed at once from the event, when no other session still lists that directory
   (the event's `location.directory`, else a directory learned from earlier listings; else rule 1 applies).

Never deleted: a folder with any live session, however many files it holds.

Safety: sessions are matched by `location.directory == <base>/<uuid>/No project` (relative path must be exactly
`<uuid>/No project[/...]`; `..` escapes do not match), listing live and archived sessions across all pages. Any listing
failure, repeated cursor or runaway paging rejects the sweep and deletes nothing. Only real directories named as a UUID
directly under the base, with a real `No project` directory child, are removed (no symlink followed, realpath must stay
under the real base). Concurrent sweeps share one run. A server with no home and no absolute `XDG_DATA_HOME` logs a
warning and skips cleanup. Deletions are logged (`no-project: deleted scratch folder <uuid>`).

## Entry points

1. **The project picker** (primary). The picker is a host dialog (`.new-session-location`, source `new-session/location/dialog.tsx`)
   opened by the footer project chip, the "Open project" command and the project-search entry; all share it. 2.2.5 has
   no registry for it (`session.location.menu` is the menu of an open session), so `picker.ts` injects one row.
2. **Command** `new` (palette, featured, `/no-project`; rebind in Settings > Shortcuts). Kept as the route that works
   outside the picker.

## The picker row

- Placement: directly above "Add project", after the host's separator. When nothing precedes "Add project" the row
  brings its own separator (`data-no-project-separator`). Only the top-level projects step carries it: not the
  worktree step, the server step or "Other projects".
- Markup is the host's: `command-palette-row palette-menu-row` with `data-size="compact"`, a `command-palette-row-main`
  holding the catalog `folder` icon (`ctx.ui.Icon`, class `command-palette-row-icon`) and a `command-palette-row-text`
  with title "No project" and a faint "Scratch folder" description. The host's CSS, not ours, styles it; computed
  styles match the project and "Add project" rows (height 28, padding, radius, 13px/530 title, active fill).
- Search: matches title, description and the keywords scratch/none/without/empty/projectless. Hidden only while the host
  lists a project at a pinned `options.directory`.
- Highlight: the host's typeahead keeps its active row in private state, so a foreign row cannot join it. The row takes
  part by hand: capture-phase arrows step into and out of it (leaving it hands the highlight back with a synthetic
  `mousemove` carrying movement, which the host reads as the pointer entering a row), pointer moves over it highlight it,
  and any move of the host's highlight clears it. Enter selects it. `data-active` / `aria-selected` /
  `aria-activedescendant` follow the host's.
- Selection: closes the dialog with an Escape keydown on the search input (the host then restores composer focus), then
  reopens the draft in the scratch folder. A plugin cannot change a draft's directory (`tabs.updateDraft` is internal;
  `ctx.layout.draft` always opens a new tab), so the picker's draft is replaced: the new draft takes its prompt text
  (composer editor `innerText`; attachments are not carried), is moved to its tab position, and the old tab is closed,
  which keeps it under recently closed tabs.
- Footer after choosing: chip "No project", path `<home>/.local/share/opencode/no-project/<uuid>/No project`. Sidebar and Home label sessions
  "No project" (basename of the project's canonical directory).
- Observation: a `MutationObserver` on the body (childList) finds the dialog; a second on the dialog re-syncs the row after
  every host re-render. The host's `<For>` may clear the group, so every sync is idempotent.

## Decisions

- **The command** (`/no-project`, palette) uses public APIs (`Command`, `slash`) and covers the whole job.
- **The picker row**: project-picker rows have no extension point ([host-architecture.md §8](../../../.claude/skills/opencode-gui-plugins/reference/host-architecture.md#8-public-and-internal-boundary)), so the row is DOM injected into the picker dialog and removed on cleanup. It costs a body observer and a few document listeners for one dialog; dropping it and keeping the command is a standing option.
- **The server sweep** is path-safe by design: `lstat`, `realpath`, a UUID check, a base-directory check and a refusal of symlinks before anything is deleted.

## Performance

Not measured yet. Method and bars: [performance.md](../../../.claude/skills/opencode-gui-plugins/reference/performance.md) (seeded 500-prompt session, bare vs plugin, three runs, median). Fill the table below when measured.

Standing cost, read from the source (not measured):
- A body-wide observer and four document listeners for the picker row (`src/picker.ts`), alive for the whole window although the row shows in one dialog.
- The server sweep runs on an interval (`src/server.ts`); it touches only the scratch base directory.

| Scenario | Bare | With plugin | Delta | Bar | Result |
| --- | --- | --- | --- | --- | --- |
| idle | | | | zero callbacks | not measured |
| streaming reply | | | | within 3% scripting | not measured |
| 10 session switches | | | | within 3% scripting | not measured |
