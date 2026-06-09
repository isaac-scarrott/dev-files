# Map craft — the judgement behind the model

The runtime ([RUNTIME.md](RUNTIME.md)) draws the map; you decide what it draws. These are the principles for the choices you make in `model.json` — the parts, the shape, the depth. The rendering is handled and consistent; this is where your intelligence goes.

## Make it a graph, not a list

The runtime auto-lays-out the map (dagre): you declare nodes and the `edges` between them, and it ranks, places, and routes them — minimising crossings. So the work is getting the *graph* right, not positioning boxes:

- **Declare every meaningful connection as an `edge`, labelled with a verb.** Edges are what turn a pile of boxes into a readable flow; a level with nodes and no edges is just a list.
- **Pick a direction with `dir`** — `"TB"` (top-down) for deep trees, `"LR"` (left-right) for a pipeline. That's usually the only layout choice you make.
- **Mark the spine with `primary`** so the accent traces the main path and the rest reads as supporting.
- Reach for a non-default `shape` only when it genuinely fits: `radial` for a hub everything depends on, `sequence` for how a request moves over time.

## Go deepest where the logic is

- The opening level is the whole system in ~5–9 parts. A part with real internal structure gets `children`, and theirs get children — as deep as it earns. Don't force uniform depth.
- **Summarising a logic-heavy part in one line is the failure.** A generation/transform stage, an algorithm, a branchy state machine earns sub-levels down to its actual steps — what it builds, the call it makes and the schema it returns, each branch and its outcome. The most complex part should be the **deepest** in the map, never the shallowest. (`generateGuide` that builds a prompt, calls a model under a schema, and returns a skeleton is three child steps, not one sentence.)
- One line of `resp` per part on the surface; longer prose goes in `detail`, revealed when focused.

## Mark the meaning, and be honest

- **Primary path:** flag the spine parts and edges `primary: true` so the accent traces the main flow.
- **Demote non-dependencies:** `demote: true` dashes and fades a part that isn't a real dependency — name it as one in its `resp`.
- **Verbs on edges** ("reads", "publishes to", "claims") — relationships carry the story.
- **Real names + files:** names come from the code, and every leaf carries its `file`. When a connection or step is your inference rather than something you verified, say so in the `detail` — a confident wrong arrow is worse than an honest "not sure".

## Consistency is handled — don't fight it

The runtime applies the house style (`assets/map.css`) so every map reads as the same product; you don't write CSS. The one rule that's yours: **one accent, not a palette.** Encode categories with `primary`, `lane`/`layer`, and position — not invented colours. To shift the whole mood (a darker map), change `--accent` in `map.css`, not per-map hues.

## Before you build

One glance gives the gist · a shape is chosen (not a flat list) · ≤~9 parts per level · edges declared and verb-labelled · the most complex part is the deepest, not a one-liner · names match the code · honest about inference · the primary path is marked and non-deps demoted.
