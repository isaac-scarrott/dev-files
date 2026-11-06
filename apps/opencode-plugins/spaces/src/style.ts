// One row above the sidebar's footer: a dot per space, quiet until there are two. Only our own nodes are styled, and only
// through tokens the host defines, so light/dark and future themes follow without our guessing colours.

export const css = `
/* Filtering: the filter marks rows, this rule is what hides them. Scoped to the sidebar list, so nothing else can match. */
[data-slot="vertical-tabs"] [data-tab-key][data-spaces-hidden] {
  display: none !important;
}
[data-spaces-strip] {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 28px;
  margin: 2px 8px 2px;
  padding: 0 2px;
  flex: 0 0 auto;
}
[data-spaces-strip][data-spaces-empty] {
  display: none;
}
[data-spaces-track] {
  display: flex;
  align-items: center;
  gap: 2px;
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
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  font-family: var(--v2-font-family-sans, inherit);
  font-size: 13px;
  line-height: 1;
  opacity: 0.55;
  transition: opacity 140ms ease, background-color 140ms ease, border-color 140ms ease;
}
[data-spaces-dot]:hover {
  opacity: 0.85;
  background: var(--v2-overlay-simple-overlay-hover, rgba(127, 127, 127, 0.12));
}
[data-spaces-dot].spaces-dot-active {
  opacity: 1;
  background: var(--v2-background-bg-layer-02, rgba(127, 127, 127, 0.16));
  border-color: var(--spaces-accent, var(--v2-border-border-base, rgba(127, 127, 127, 0.35)));
}
[data-spaces-add] {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--v2-text-text-faint, inherit);
  font-family: var(--v2-font-family-sans, inherit);
  font-size: 15px;
  line-height: 1;
  opacity: 0;
  transition: opacity 140ms ease;
}
[data-spaces-strip]:hover [data-spaces-add],
[data-spaces-add]:focus-visible {
  opacity: 0.7;
}
[data-spaces-add]:hover {
  opacity: 1;
  background: var(--v2-overlay-simple-overlay-hover, rgba(127, 127, 127, 0.12));
}
@media (prefers-reduced-motion: reduce) {
  [data-spaces-dot], [data-spaces-add] { transition: none; }
}
`

/** The accent token names a space may carry, mapped to the host's own foreground tokens. */
export function accentColor(accent: string | undefined): string | undefined {
  if (!accent || accent === "muted") return undefined
  if (accent === "info" || accent === "success" || accent === "warning" || accent === "danger") return `var(--v2-state-fg-${accent})`
  return undefined
}
