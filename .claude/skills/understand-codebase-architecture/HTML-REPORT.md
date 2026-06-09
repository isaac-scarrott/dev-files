# Report craft

The report is one self-contained HTML file that opens in a browser. Beyond that you are the designer — these are principles, not a template. A map that is genuinely clear beats one that followed a recipe, so use judgement and write the HTML yourself.

## Show a shape, not a grid

This is the one that matters. A pile of boxes on a grid is the failure mode — it forces the reader to trace every line before anything makes sense. Find the system's actual shape first, then let it drive the layout:

- a request or data **flow** → lay it out as a directed flow, one main direction
- a **read-through cache, queue, or pipeline** → draw the spine and hang the rest off it
- a request **lifecycle** → a numbered sequence or a timeline
- peers with no flow → group by responsibility into a few labelled bands

Pick the single organizing idea that makes *this* system obvious at a glance and commit to it. Arrows should mostly point one way.

## Don't overload — disclose progressively

- One level at a time, but go as deep as a part earns. The opening view is the whole system in ~5–9 elements; clicking descends, and a part with real internal structure earns another level below it, and another below that — a pipeline stage worth explaining gets its own sub-steps. Stop where there's nothing left to reveal; don't force uniform depth, and don't flatten a deep part to fit a fixed number of levels.
- One line of text per element on the map. Anything longer is detail, revealed when you focus that element — never crammed onto the surface.
- Make the interaction and the way back obvious: a breadcrumb of the full path, and descents wired into browser history so Back / Forward and deep links work. The reader should never feel buried or lost, however deep they go.

## Make it scannable and crafted

- Label connections with verbs — "publishes to", "reads", "claims". The relationships carry the story.
- Demote what doesn't matter: fade or dash things that aren't real dependencies so they don't compete.
- One accent colour plus neutrals, used to *mean* something (sync vs async, store vs step), not to decorate.
- Clear type hierarchy, generous whitespace, small type-labels on cards. Schematic and editorial, not a corporate dashboard.
- Use the project's real vocabulary (CONTEXT.md / the code) for names, never invented labels.

## Keep the build simple

- Single self-contained file. A styling CDN (e.g. Tailwind) is fine; write to a temp dir and open it.
- Drill-down is a few lines of JS over a nested model you build from exploration: render the current level, click to descend, breadcrumbs to climb. The model is the substance; keep the code minimal.
- If a static diagram communicates a given system better than interaction, use that. Interaction serves clarity, not the reverse.

## Before you open it

One glance gives the gist · one organizing shape · ≤~9 things per view · verbs on the connections · names match the code · nothing overloaded.
