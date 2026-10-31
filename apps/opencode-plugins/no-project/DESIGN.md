# no-project

Command "New session without a project" (palette, `/no-project`) opens a draft in a shared empty folder.

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

`Command` only (palette, featured, `/no-project`; rebind in Settings > Shortcuts). `session.location.menu` is the menu of an
already open session's location and `MenuItem` has no new-session menu in 2.2.5, so neither fits.
