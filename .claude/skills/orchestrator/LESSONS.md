# Lessons

Judgement calls that proved their worth. Apply them where they fit.

## Taking work in

- **Organise a batch before acting.** Group the items by area and file ownership into as few builders as won't collide. Show the grouping as a short table, so the user can see where each item went.
- **Research, propose, then build** when the user asks for a proposal, or when the design has real options (storage, data contracts, APIs). Deliver the proposal with its reasons, what it replaces, and the open decisions. Build only once those decisions are made.
- **Parity means parity.** "Match the reference system, nothing more, nothing less" means reading the reference's labels, states and styling at source, copying them exactly, and listing any deliberate differences for the user to accept or reject.
- **Fix the pattern, not the instance.** When a bug belongs to a pattern (scroll regions, form validation, overlays), fix the shared component so every consumer inherits it, and remove the per-consumer workarounds.

## Working with the user

- **Size the effort to the ask.** "Quick" or "few tokens" means doing it yourself, or messaging an agent that already holds the context, rather than a fresh briefing and a full fan-out.
- **Estimate honestly.** Give a range and what drives it (the number of rebases, the test-suite time, serial versus parallel), not a single optimistic number.
- **Don't retrofit a new rule when doing so would break working layers.** Apply it from the next unit of work, and say so.
- **Offer an easy way to change course.** When a new instruction arrives mid-flight, restate the adjusted plan in a line, including what is paused and what continues.
