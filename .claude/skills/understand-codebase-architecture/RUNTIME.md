# Map runtime — you write the data, it draws the map

The bundled runtime (`assets/map.js` + `assets/map.css`, with `assets/vendor/dagre.min.js` for layout) draws the whole map: it **auto-places the boxes and routes the edges** (dagre — minimises crossings), then adds house-styled cards, drill-down, breadcrumb, browser history, and the ask chat. **You don't write HTML/CSS, and you don't position anything** — you write a `model.json` of nodes + edges and run the build. Your judgement goes into *which* parts, *how they connect*, and *how deep* — not pixels.

## Build & serve

1. Write `model.json` (schema below).
2. Build a self-contained file: `node <skill-dir>/scripts/build-map.mjs model.json "$TMPDIR/architecture-map-<timestamp>.html"`.
3. Serve it and open the served URL — see [LIVE-BRIDGE.md](LIVE-BRIDGE.md). The chat is already in the page.

## The model

```jsonc
{
  "repo": "name", "summary": "one line",
  "dir": "TB",                       // graph direction: "TB" (default) or "LR"
  "suggestions": ["Trace a request"],// optional chat starter prompts
  "nodes": [ PART, ... ],
  "edges": [ { "from": "id", "to": "id", "label": "verb", "primary": true } ]
}
```

**PART**
```jsonc
{
  "id": "read-api", "label": "GraphQL Read API", "kind": "Read API",
  "resp": "short description",              // shown on the card — write it to fit (≲90 chars)
  "tech": ["graphql-compose"],              // chips — don't repeat the kind (they render side by side)
  "file": "path/to/file.ts",                // or "files": [...] — shown in the focus view
  "points": ["one fact (file.ts:42)", "..."],  // scannable facts for the focus view — prefer this over detail
  "detail": "prose fallback for the focus view (used when points is absent)",
  "stack": "entry\n  -> hop\n    -> hop",      // optional: how a call reaches this part — rendered verbatim (monospace) in the focus view
  "primary": true,                          // accent: the spine / primary path
  "demote": true,                           // dashed + faded: NOT a real dependency
  "dir": "LR",                              // optional: direction for THIS node's children
  "children": [ PART, ... ],
  "edges": [ { "from": "...", "to": "...", "label": "..." } ]  // among the children
}
```

A node with `children` is drillable (the runtime lays the child level out the same way). Every level fills the same page template: breadcrumb (the path above), title, lede (`resp`, or the map `summary` at root), one tag row (kind + tech + files), then the body — `points` as a scannable fact list (or `detail` prose) and the `stack` call path. **Nest as deep as the logic earns** — a complex stage gets its own children, and theirs ([HTML-REPORT.md](HTML-REPORT.md): the most complex part is the deepest).

Every string renders as plain text — no markdown. Backticks show up literally, so write code names bare.

You don't set positions for the default layout. Just declare the `edges` honestly and dagre ranks and places everything; `primary: true` accents an edge, `return: true` dashes it.

## Shapes (per level)

The default is the auto-laid-out graph — you rarely need anything else.

- **(default / `flow`)** — dagre directed-graph layout. Pick orientation with `dir`: `"TB"` top-down (good for portrait / deep trees) or `"LR"` left-right (good for a pipeline). `lanes` and `layers` are accepted as aliases and behave the same; you no longer hand-assign lanes.
- **radial** — set `"shape": "radial"`; one `hub: true` node centres, the rest orbit it.
- **sequence** — set `"shape": "sequence"`; `nodes` are lifelines across the top, `edges` are time-ordered messages down (`"return": true` dashes a return). The temporal view.
- **free** — set `"shape": "free"` and give each node `x`/`y` (0–100 %); you place everything.

## Minimal example

```json
{
  "repo": "acme", "summary": "A read path in front of a worker.", "dir": "TB",
  "nodes": [
    {"id":"api","label":"Read API","kind":"entry","resp":"serves requests","primary":true,
     "children":[{"id":"h","label":"handler","kind":"module","file":"src/api/handler.ts"}]},
    {"id":"worker","label":"Worker","kind":"compute","resp":"does the work"}
  ],
  "edges": [{"from":"api","to":"worker","label":"enqueues","primary":true}]
}
```

Everything visual — placement, routing, colours, the chat — is the runtime's. Keep your effort on the right parts, honest edges, and the right depth.
