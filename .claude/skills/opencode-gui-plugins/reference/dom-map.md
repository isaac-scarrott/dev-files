# App DOM map (OpenCode Desktop 2.2.5)

These are internal implementation details, not stable SDK contracts. Verify selectors after an app update. The installed app's source maps supplied the evidence below.

## Sidebar tabs

| Selector / attribute | Meaning |
| --- | --- |
| `[data-tab-key]` | Outer tab wrapper; value joins to `ctx.tabs.list()[].key` |
| `[data-titlebar-tab]` | Inner tab; carries `data-status` and `data-orientation` |
| `[data-slot='tab-link']` | Link containing avatar, injected repo badge, title |
| `[data-slot='project-avatar-slot']` | App-owned project thumbnail |
| `[data-slot='tab-title']` | App-owned session title; keep intact so rename works |
| `[data-slot='tab-status']` | Native status marks |
| `[data-mark='attention']` | Pending permission or question mark |
| `[data-mark='unread']` | Blue unread dot |
| `[data-slot='vertical-tabs-scroll']` | Sidebar scrolling region with top/bottom mask fades |

For two-line labels inject a sibling immediately before the title. Scope grid rules with `:has(> [data-sidebar-repo])`; use `minmax(0, 1fr)` and `min-width: 0` so truncation works. Existing sidebar plugin is the tested example in `apps/opencode-plugins/sidebar-repos`.

Repo and branch are separate concepts: join with ` · ` because branch names contain `/`. Middle truncation measures available width using a canvas with the element's computed font; retain the complete label in `title`. Recompute on resize. An end-only CSS ellipsis loses the branch tail.

Fades are masks on both the scroll region and vertical tab link. To remove them override both `mask-image` and `-webkit-mask-image` with `none !important`.

### Status semantics

Tabs expose `busy`, `attention`, `unread`, not an error state. Busy keeps the native ActivityRing; unread keeps its blue dot. Errors become unread notifications — an error-specific icon needs additional error/notification plumbing.

Attention combines permissions and forms. Sync and read `session.server.data.session.permission` and `.form`; permission wins when both exist. Current plugin renders Phosphor warning-triangle (`!`) for permission, question-mark (`?`) for form, hiding only the native attention dot. Observe `data-status` as well as tab key and orientation so icons update when the app changes status.

Source evidence: `app/src/shell/layout/project-avatar-state.ts`, `useSessionTabAvatarState`.

## Chat timeline

| Selector | Meaning |
| --- | --- |
| `[data-slot='session-timeline-scroll']` | Outer ScrollView wrapper |
| `[data-slot='session-timeline-scroll'] > .scroll-view__viewport[data-scrollable]` | Actual scrolling viewport; owns scroll metrics, scroll events and keyboard focus |
| `[data-timeline-key]` | Keyed wrapper created by the virtualizer |
| `[data-timeline-row='UserMessage']` | User message row |
| `[data-component='user-message']` | User message body component |
| `[data-slot='user-message-text']` | Text without metadata/actions |

Timeline rows are virtualized. A DOM-only scan sees mounted rows, not all prior messages. Treat a missing candidate as an unknown history target, not proof no previous message exists. Resolve full-history navigation through the host's timeline/data APIs after verifying their versioned types; avoid asserting that a DOM-only prototype is complete.

Cached timelines can remain mounted while hidden. A connected element is not necessarily the routed timeline: check visibility and session identity on a switch. Ignore empty measurement boxes. Re-evaluate after scroll, timeline mutations and geometry changes; observe the container's size, not just the window.

A fixed jump pill uses viewport coordinates from `getBoundingClientRect()`. Keep `translateX(-50%)` in every transform state when centering by `left`; otherwise entrance and pressed states jump sideways. Fit the pill to the timeline width, not only the whole window. Avoid observing its own label writes as timeline mutations.

Source evidence: `app/src/session/timeline/virtualizer.tsx`, `ui/src/components/scroll-view.tsx`, `session-ui/src/timeline/session-timeline-row.tsx`, `session-ui/src/message/message-content.tsx`.

## Theme tokens observed in 2.2.5

- Surfaces: `--v2-background-bg-base`, `--v2-background-bg-layer-01` through `-04`.
- Text: `--v2-text-text-base`, `--v2-text-text-muted`, `--v2-text-text-faint`.
- Borders: `--v2-border-border-muted`, `--v2-border-border-base`, `--v2-border-border-focus`.
- Status: `--v2-state-fg-warning`, `--v2-state-fg-danger`, `--v2-state-fg-info`.
