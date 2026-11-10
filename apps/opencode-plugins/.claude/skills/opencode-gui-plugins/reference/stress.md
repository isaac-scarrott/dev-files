# Stress

Plugin UI is built against kind data: short repo names, ten prompts, one subagent, a wide sidebar. Break it with the worst *realistic* data before calling it done. Adapted from Emil Kowalski's `break-ui`.

## Rules

- **Plausible or limit-backed.** Every value is something a user could produce (a 60-character repo name, an emoji-first title, a 5,000-prompt session) or a real limit of the host. Random 5,000-character strings prove nothing.
- **Change the data, not the component.** Enter through the seed (`scripts/seed-session.mjs`, the harness config), never by editing markup or CSS.
- **Mix the failures across rows**: row one long, row two one-letter, row three missing the optional field.
- **Report before fixing** when the fix is a design choice (truncate or wrap, hide or show a dash). Otherwise fix, then re-run the demo data to catch regressions.

## What to vary

Pick the axes the change touches; the data is realistic, never text-only (see Realistic data).

| Axis | Cases |
|---|---|
| Text | long repo/title/branch, emoji or CJK first, RTL, diacritics, no spaces (path, URL), empty |
| Counts | 0, 1 (plurals), 2, 99+, 5,000 prompts or sessions |
| Time | now, seconds, years ago, future, invalid |
| State | loading, empty, error, offline, every status of the host row (running, waiting, unread, archived) |
| Layout | narrowest and widest sidebar, 200% zoom, collapsed sidebar, top-tabs layout, review panel open |
| Live | streaming reply, several running subagents or shell tasks, a permission or question form appearing mid-update, a session switch mid-stream |
| Environment | dark and light, reduced motion, slow data (rows arriving late), session switch mid-update |
| Scale | hundreds of live sessions across many projects, 500+ Archived, many Snoozed, mixed statuses |
| Media | missing or broken avatar, odd aspect ratio |

## Signatures

Flex children that squish (`flex-shrink:0` on icons, avatars, times), text that overflows (`min-width:0` on the text column), badges that wrap (`white-space:nowrap`), a trailing action pushed out, wrong initials, "1 items", unformatted numbers, truncation with no way to read the full value, the last row cut mid-glyph, per-row work that grows with the list. Truncate at the end for secondary text, in the middle where items differ at the tail, and never truncate a time or a number the user compares.

## Output

One table: axis case, value, what happened, fix. Mark each row verified in the harness or inferred from CSS. A short table for a sturdy plugin is a good result.

## Realistic data

A thread is not messages. Real ones carry tool calls (bash, read, edit, write, grep, task) with large outputs and diffs, reasoning parts, code-heavy markdown, subagent children, images and thousands of parts. Seed these (`scripts/seed-session.mjs --realistic`), sized from the shape of real threads (counts and byte sizes, never their content). The sidebar needs the same: many sessions, projects, Archived and Snoozed entries in mixed states, hydrating late, going offline and back, with deleted or renamed projects.
