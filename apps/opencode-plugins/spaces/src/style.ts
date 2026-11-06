// One row above the sidebar's footer: a dot per space, quiet until there are two. Only our own nodes are styled, and only
// through tokens the host defines, so light/dark and future themes follow without our guessing colours.

export const css = `
/* Filtering: the filter marks rows, this rule is what hides them. Scoped to the sidebar list, so nothing else can match. */
[data-slot="vertical-tabs"] [data-tab-key][data-spaces-hidden] {
  display: none !important;
}
[data-spaces-strip] {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 28px;
  margin: 2px 8px 2px;
  padding: 0 2px;
  flex: 0 0 auto;
}
[data-spaces-strip][data-spaces-empty] {
  display: none;
}
/* A dot being dragged lifts out of the row and follows the pointer; the dots it passes slide across to make room, so the
   order you see while dragging is the order you get on release. */
[data-spaces-strip][data-spaces-dragging] [data-spaces-dot] {
  cursor: grabbing;
  transition: transform 140ms cubic-bezier(0.2, 0, 0, 1);
}
[data-spaces-strip][data-spaces-dragging] [data-spaces-dot].spaces-dot-dragging {
  transition: none;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.22));
}
[data-spaces-track] {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
[data-spaces-track]::-webkit-scrollbar {
  display: none;
}
[data-spaces-dot] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 23px;
  height: 23px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  font-family: var(--v2-font-family-sans, inherit);
  font-size: 16px;
  line-height: 1;
  /* A space you are not in is grey and quiet; the one you are in keeps its own colours and gets no box behind it. */
  filter: grayscale(1);
  opacity: 0.4;
  transition: opacity 140ms ease, background-color 140ms ease, filter 140ms ease;
}
[data-spaces-dot]:hover {
  opacity: 0.75;
  filter: grayscale(0.5);
  background: var(--v2-overlay-simple-overlay-hover, rgba(127, 127, 127, 0.12));
}
[data-spaces-dot].spaces-dot-active {
  opacity: 1;
  filter: none;
}
[data-spaces-dot].spaces-dot-active:hover {
  background: var(--v2-overlay-simple-overlay-hover, rgba(127, 127, 127, 0.12));
}
/* The new space's slot: it exists only while a pull opens it, and fills as the pull goes on. */
[data-spaces-ghost] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  box-sizing: border-box;
  width: calc(23px * var(--spaces-pull, 0));
  height: 23px;
  margin-left: calc(6px * var(--spaces-pull, 0));
  border: 1px dashed var(--v2-border-border-base, rgba(127, 127, 127, 0.35));
  border-radius: 5px;
  background: color-mix(in srgb, var(--v2-background-bg-layer-02, rgba(127, 127, 127, 0.16)) calc(var(--spaces-pull, 0) * 100%), transparent);
  color: var(--v2-text-text-faint, inherit);
  font-family: var(--v2-font-family-sans, inherit);
  font-size: 13px;
  line-height: 1;
  opacity: calc(0.25 + var(--spaces-pull, 0) * 0.75);
  overflow: hidden;
  transition: none;
}
[data-spaces-ghost][data-spaces-armed] {
  border-style: solid;
  border-color: var(--spaces-accent, var(--v2-state-fg-info, currentColor));
}
/* The tick that says the pull crossed into the slot and out of it again: a short scale, like a detent. */
@keyframes spaces-detent {
  0% { transform: scale(1); }
  40% { transform: scale(1.18); }
  100% { transform: scale(1); }
}
[data-spaces-strip][data-spaces-tick] [data-spaces-dot]:last-of-type,
[data-spaces-strip][data-spaces-tick] [data-spaces-ghost] {
  animation: spaces-detent 160ms cubic-bezier(0.3, 0, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) {
  [data-spaces-dot] { transition: none; }
  [data-spaces-strip][data-spaces-dragging] [data-spaces-dot] { transition: none; }
  [data-spaces-strip][data-spaces-tick] [data-spaces-dot]:last-of-type,
  [data-spaces-strip][data-spaces-tick] [data-spaces-ghost] { animation: none; }
}
`

/** The accent token names a space may carry, mapped to the host's own foreground tokens. */
export function accentColor(accent: string | undefined): string | undefined {
  if (!accent || accent === "muted") return undefined
  if (accent === "info" || accent === "success" || accent === "warning" || accent === "danger") return `var(--v2-state-fg-${accent})`
  return undefined
}

/** The swipe, and what a change looks like: the list slides in from the side the swipe came from. */
export const swipeCss = `

@keyframes spaces-in-next {
  from { opacity: 0.35; transform: translateX(14px); }
  to { opacity: 1; transform: none; }
}
@keyframes spaces-in-previous {
  from { opacity: 0.35; transform: translateX(-14px); }
  to { opacity: 1; transform: none; }
}
[data-spaces-switch="next"] [data-slot="vertical-tabs-scroll"] {
  animation: spaces-in-next 160ms cubic-bezier(0.2, 0, 0, 1);
}
[data-spaces-switch="previous"] [data-slot="vertical-tabs-scroll"] {
  animation: spaces-in-previous 160ms cubic-bezier(0.2, 0, 0, 1);
}
@media (prefers-reduced-motion: reduce) {
  [data-spaces-switch] [data-slot="vertical-tabs-scroll"] { animation: none; }
  [data-spaces-strip] [data-spaces-add] { transition: none; }
}
`
