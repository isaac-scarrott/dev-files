# no-project

"No project" is a row in the new-session project picker, and a palette command ("New session without a project",
`/no-project`). Both open a draft in a shared empty folder.

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

## Decision: (b) one shared scratch folder, named "No project"

- `<server home>/Documents/No project` (next to Default Project), or an absolute `options.directory` from the `opencode.json`
  plugin entry. Home is `client.location.get().directory`, so a remote server gets its own folder.
- One shared folder, not one per thread: a folder per thread would be a new project per thread in the project list.
- Named `No project` because the host's project row and sidebar-repos both label a session by the basename of
  `project.canonical`, so these sessions read "No project" with no coupling between plugins (verified live).
- The folder is created by `experimental.file.write` of a `README.md` using an absolute path from the default location;
  a write through a location that does not exist yet fails (`LocationNotFoundError`). An existing README is never overwritten.
- The draft opens in a focused new tab through `ctx.layout.draft` with an empty prompt; nothing is sent.

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
- Search: matches title, description and the keywords scratch/none/without/empty/projectless. Hidden while the host
  already lists a project at the scratch path (the folder is a project after its first session, and then shows
  natively when searching "no project").
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
- Footer after choosing: chip "No project", path `<home>/Documents/No project`. Sidebar and Home label sessions
  "No project" (basename of the project's canonical directory).
- Observation: a `MutationObserver` on the body (childList) finds the dialog; a second on the dialog re-syncs the row after
  every host re-render. The host's `<For>` may clear the group, so every sync is idempotent.
