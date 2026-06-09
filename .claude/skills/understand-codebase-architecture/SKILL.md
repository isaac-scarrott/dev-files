---
name: understand-codebase-architecture
description: Build an interactive onboarding map of a codebase's architecture as a self-contained HTML report — click a box to drill into a subsystem, breadcrumbs to climb back, detail behind clicks so nothing overloads. Use when the user wants the generated visual artifact: a "map", "diagram", "visualise the architecture", "onboard me to", or "lay of the land" for how a codebase fits together. A bare "explain/help me understand X" usually wants a chat answer, not a file — only reach for this skill when the user wants the interactive map, and confirm first if the intent is unclear. Describes architecture, does not judge or improve it (use improve-codebase-architecture for that).
---

# Understand Codebase Architecture

Produce an **onboarding map**: how the system fits together for someone new — the major parts, how they connect, and where each part's code lives. The output is a single interactive HTML file with **drill-down navigation**: the top level shows a handful of subsystems; clicking one descends into that subsystem's own diagram; breadcrumbs climb back out. Detail (files, tech, prose) lives behind clicks. The user is never shown more than one level at a time.

This is the descriptive counterpart to `improve-codebase-architecture`. That skill judges (deep/shallow, deepening opportunities). This one **describes** — stay neutral. Do not import the deep/shallow/seam/leverage lens.

## Vocabulary

Plain structural language. **System** → **Subsystem** → **Module**. Boxes are **parts**; lines between them are **connections** (label them: "calls", "publishes to", "reads from"). Each part has **responsibility** (one line), **files**, **tech**, and optional **detail** prose.

Ground the part names in the project's own words: if `CONTEXT.md` or `docs/adr/` exist, read them first and use those domain nouns (call it "the Order intake handler", not "the FooController"). Don't invent a vocabulary the codebase doesn't use.

## Process

### 1. Confirm the output, then align scope (optional)

Two self-checks before any exploring:

- **Did the user actually ask for the artifact?** A soft "help me understand" or "explain the X architecture" often just means "talk me through it here" — and the map is heavyweight (Explore agents, a generated file, a browser tab). If the intent isn't clearly "build me a map", make the **first `AskUserQuestion` option a format gate**: *interactive map* vs *just explain it in chat*. If they pick chat, abandon this skill and answer in prose — don't generate the file. Also bail early if there's no codebase in scope to explore (the named thing is a domain, not a repo you can open).
- **Is the scope clear?** If the prompt already names a clear target ("map the auth subsystem", "map the whole repo for a new hire"), skip the rest. If it's vague, ask **up to 3 structured `AskUserQuestion` prompts** — don't free-text interrogate.

Combine the format gate with these axes in one question set:

- **Breadth** — whole system, or one named subsystem?
- **Purpose** — general onboarding, understanding before a change, or tracing a specific flow?
- **Depth** — top two levels only, or drill all the way to module/file level?

### 2. Ground in the project's language

Read `CONTEXT.md` and any `docs/adr/` in scope. Harvest the domain nouns and any stated structural decisions. Use them as the part names and connection labels.

### 3. Explore

Use the Agent tool with `subagent_type=Explore` to map the structure — don't read every file yourself. Find: entry points (mains, route registrations, CLI, handlers), the major subsystems and what each owns, how they connect (calls, queues, shared stores), and where each part's code lives. Fan out one agent per candidate subsystem when the repo is large.

At every level, respect the budget: **5–9 parts per level**. If a level has more, group the overflow into a child level rather than crowding the box.

### 4. Find the shape

Before drawing anything, decide the one organizing idea that makes this system clear — its flow, its spine, its lifecycle, or its layers. The failure mode is a grid of boxes that forces the reader to trace every line. Then sketch the parts (5–9 at the top level, one line each), the connections worth showing (labelled with verbs), and what's secondary enough to demote.

### 5. Build and open the report

Write a self-contained, interactive HTML file to the OS temp dir (`$TMPDIR`, falling back to `/tmp`, or `%TEMP%` on Windows) as `<tmpdir>/architecture-map-<timestamp>.html` so nothing lands in the repo. Open it (`open` on macOS, `xdg-open` on Linux, `start` on Windows) and tell the user the absolute path.

You are the designer. Follow the craft principles in [HTML-REPORT.md](HTML-REPORT.md) — lead with the shape, disclose progressively, keep it scannable — and write the HTML yourself rather than from a fixed template.

### 6. Follow-up loop

After opening, invite questions. Then:

- **Answer questions** about any part directly in chat.
- **Correct the map** when the user says a part is wrong or mislabelled — regenerate.
- **Go deeper** — if the user wants a subsystem expanded that you left as a leaf, explore it further and add a child level.

Do not propose refactors or critique the architecture unless asked — that's `improve-codebase-architecture`'s job.
