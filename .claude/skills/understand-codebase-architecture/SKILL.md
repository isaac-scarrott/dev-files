---
name: understand-codebase-architecture
description: Build an interactive onboarding map of a codebase's architecture as a self-contained HTML report — click a box to drill into a subsystem, breadcrumbs to climb back, detail behind clicks so nothing overloads. Use when the user wants the generated visual artifact: a "map", "diagram", "visualise the architecture", "onboard me to", or "lay of the land" for how a codebase fits together. A bare "explain/help me understand X" usually wants a chat answer, not a file — only reach for this skill when the user wants the interactive map, and confirm first if the intent is unclear. By default it is served live behind a tiny local server, so the user can ask the map questions in the browser and get answers back in the session; it falls back to a plain static file only when needed. Describes architecture, does not judge or improve it (use improve-codebase-architecture for that).
---

# Understand Codebase Architecture

Build a **live, interactive map** of how an unfamiliar codebase fits together — the major parts, how they connect, where each one's code lives — served locally so the user can ask the map questions and you answer back in this session.

You are the cartographer. These files are a **framework, not a template**: they say what a good map *is* and how it goes wrong, and leave the *how* to you. Lean on that — a map you designed for this system beats one stamped from a mould, and it gets better as you do.

This is the descriptive counterpart to `improve-codebase-architecture`. Describe the system; don't grade it or propose refactors unless asked.

## Vocabulary

Plain and structural: **system → subsystem → module**. Boxes are **parts**; lines are **connections**, labelled with verbs ("reads", "publishes to", "claims"). Each part has a one-line **responsibility**; everything longer lives behind a click. Use the project's own nouns, never invented ones.

## Process

**1 · Scope.** Confirm the user wants the artifact, not a chat answer — a bare "explain X" usually wants prose; only build the map when they want the interactive thing (ask if unsure), and stop if there's no repo to explore. If the target is vague, ask up to ~3 quick questions via the question tool (breadth · purpose · depth).

**2 · Ground in the real vocabulary.** It lives in several places — `CONTEXT.md` and `docs/adr/`, the `README` and workspace/manifest files (package names, boundaries), `git log` over the area, and the code itself as ground truth. The map's names come from there, not from you.

**3 · Explore.** Use `Explore` subagents (one per candidate subsystem when the repo is large) to find the entry points, the major parts, how they connect, and where each lives. **Read *into* the logic-heavy parts** — a multi-step generation, an algorithm, a branchy state machine — not just up to their boundary. Depth starts here: the map is worth most where the logic is.

**4 · Find the shape.** Decide the one organizing idea that makes *this* system obvious — its flow, its spine, its lifecycle, its layers — and commit to it. It will be *drawn as a map* (placed parts + connectors), never a stacked list.

**5 · Build.** You author a `model.json` — the data, the shape, the depth — and the bundled runtime draws everything. Write the model (schema + layouts in [RUNTIME.md](RUNTIME.md)) guided by the craft in [HTML-REPORT.md](HTML-REPORT.md), then build a self-contained file into the OS temp dir (`$TMPDIR`, then `/tmp`, or `%TEMP%`): `node <skill-dir>/scripts/build-map.mjs model.json "$TMPDIR/architecture-map-<timestamp>.html"`. You don't write the map's HTML/CSS/JS — the runtime gives every map the same chrome (cards, connectors, drill-down, breadcrumb, history, chat). Don't open it yet.

**6 · Serve it live — the default.** Start the bundled bridge and open the **served `http://127.0.0.1:<port>` URL it prints — never the `file://` path** (the chat is dead there), then enter the listen loop so the user can ask the map questions and you answer here. See [LIVE-BRIDGE.md](LIVE-BRIDGE.md). Fall back to a plain static file only when Node is unavailable or the user wants a shareable artifact — and say the chat won't work then.

**7 · Tend it.** Answer questions (over the bridge or in chat), fix parts the user flags, and drill a leaf deeper when asked.

## What's bundled, and what isn't

Bundled code is the deterministic machinery so you never re-write it: the **runtime** that draws every map ([`assets/map.js`](assets/) + `map.css`), the **build** step ([`scripts/build-map.mjs`](scripts/)), and the **live bridge** (server + watcher in [`scripts/`](scripts/)). What is *not* bundled — and is the judgement this skill exists to exercise — is everything in the `model.json`: which parts matter, the shape that makes the system obvious, and how deep to go. The chrome stays constant so maps are consistent; the thinking is yours, and it sharpens as the model does.
