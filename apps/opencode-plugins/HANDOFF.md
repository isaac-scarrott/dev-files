# OpenCode Desktop plugins — handoff (2026-10-31)

## Stop point

User requested: capture plugin knowledge as an installed skill, move plugins into
`~/git/dev-files`, then **pause all work for a different session**.
Those packaging tasks are complete. Resume features only when the user asks.

User clarified to use existing `master`, with no new branches. A briefly created
empty `main` branch was removed; work is on `master`, nothing pushed.
Unrelated dirty edits (notch-usage, orchestration
skills, Claude settings) were left alone. No OpenCode app bundle or t3code code changed.

## Entry points

- Skill: `~/.config/opencode/skills/opencode-gui-plugins/SKILL.md` (canonical source
  is `dev-files/.claude/skills/opencode-gui-plugins`, also linked to Claude/Codex).
- Plugins and checks: [README.md](README.md). Registration:
  `dev-files/.config/opencode/opencode.json` (home config is symlinked there).
- All three original directories under `/Users/isaac/opencode-*` were moved here;
  package names and therefore plugin identities were preserved.
- SDK/app target: 2.2.5. Bundle rebuilds are watched per current V2 docs; Plugins
  Reload is available if the running version appears stale.

## Sidebar feature

`sidebar-repos/src/gui.ts` and `badges.ts`: thumbnail + muted repo · branch first
line; session title beneath; middle ellipsis/full tooltip; both fade masks removed.
52px rows, grid 14/16px, 6px gap. User has not visually confirmed the final spacing.
Native unread dot and busy ActivityRing retained. Phosphor `?` = form/question,
warning `!` = permission; there is no tab error state (errors become unread).
Renaming must keep working: injected sibling label, never rewrite session titles.

## Message jump — prototype, not UI-verified

User wants their nearest previous sent message relative to scroll position, not
necessarily their newest message by time, pinned at the top and smoothly animated.
`message-jump/src/jump.ts` picks the last mounted user row whose bottom is above
the viewport top. `gui.ts` injects a fixed pill and scrolls its target into view.

Verified: typecheck, four pure/DOM-fixture tests, production build. Test fixture
types were corrected at the Happy DOM boundary; one assertion incorrectly expected
a partly visible row and was corrected to match the fully-above contract.

Unverified/known limitations to address before declaring the feature finished:

- Virtualization: DOM queries cannot find prior user messages that have unmounted.
  Full-history behavior requires verified host timeline/data integration.
- Cached hidden timelines may stay connected; adoption currently only checks for a
  disconnected container, so session switches need explicit testing/fixing.
- Pill positioning only refreshes for a changed target/entrance; visible-pill resize
  and sidebar/pane geometry changes can leave it stale. Width is viewport-bound.
- Keyboard accessibility: pill starts `tabIndex=-1`; check focus behavior. Reduced
  motion's pressed state still has a scale rule. Initial append may skip entrance.
- Global child-list observer and scrollIntoView under the virtualizer need live
  performance/navigation checks. Observer includes its own DOM changes.

These were surfaced during handoff review; feature work intentionally paused rather
than silently treating the prototype as complete.

## Animation reference

User requested relevant Emil Kowalski skills from
https://github.com/emilkowalski/skills/tree/main/skills . Downloads currently live
in `/tmp/emil-skills/`: animate, animation-vocabulary, animation-performance,
find-animation-opportunities, emil-design-eng, improve-animations. Re-fetch if gone.
Applied guidance: subtle transform/opacity motion, 180ms entrance/120ms exit,
`cubic-bezier(0.23, 1, 0.32, 1)`, small offset and 0.97 scale, reduced-motion branch.

## Pending: settle and snooze

User explicitly: all features are **OpenCode Desktop plugins**, never t3code
implementation. t3code only supplies the behavior reference. Nothing built yet.

Research source: `/Users/isaac/git/t3code`:

- `packages/client-runtime/src/state/threadSettled.ts`: effective snooze, early wake,
  presets, custom duration/date validation; sibling `threadSnoozed.test.ts` and
  `customSnooze.test.ts` provide cases.
- `apps/web/src/components/Sidebar.tsx`, `Sidebar.logic.ts`, `Sidebar.snooze.ts`:
  active/working/pinned/snoozed/settled sections and wake timer.
- `apps/web/src/hooks/useThreadActions.ts`, `useThreadActionMenu.ts`:
  settle/unsettle, snooze/unsnooze and undo.
- `apps/server/src/orchestration-v2/Orchestrator.ts`,
  `ThreadSettlementService.ts`: authoritative persistence and wake behavior.

Reference semantics:

- Settle is distinct from archive/delete: moves a thread from active to settled;
  clears pin/snooze; new work reactivates it. Clarify OpenCode mapping before building.
- Snooze accepts duration (minutes/hours/days) or specific local date/time.
- Presets: 1h, 3h, evening 18:00, tomorrow 09:00, next Monday 09:00; calendar/DST-safe.
- Snooze hides without pausing work; wake at time, on new work, or early when the
  session needs the user (permission/question/error/completion after snoozing).
- Decline snooze while already waiting on the user. Provide wake and undo actions.
- t3 persists server-side; determine what OpenCode's actual SDK can support. Plugin
  local storage must not be described as synced/server-authoritative state.
- Scope per-session state by server + session (`SessionRef.key`), not session id alone.

## Verification and tooling

- Sidebar: typecheck, 13 tests, build pass.
- Message jump: typecheck, 4 tests, build pass.
- Sidepanel experiment: build pass; no test/typecheck scripts.
- `bash -n install.sh`; `scripts/test-install.sh`: 207 passed, 0 failed.
- Skill references, all three installed links, config paths and bundle exports checked.
- No lint scripts exist in these packages. No live UI verification in this final phase.
- Only the new skill's entries were applied through install.sh's own `link_one`/
  LINKS mechanism. Full bootstrap was avoided: it vendors files, regenerates MCP,
  and deploys the unrelated dirty notch app.
- Public registry `.npmrc` needed despite npm_config_registry prefix. pnpm shim
  resolves per directory; pnpm 12 uses `allowBuilds` for esbuild. Keep command exit
  statuses intact (piping to tail previously hid install errors).

Suggested skills next session: `opencode`, `opencode-gui-plugins`; re-read Emil's
animation/design skills for UI work. Use orchestration only if delegating.
