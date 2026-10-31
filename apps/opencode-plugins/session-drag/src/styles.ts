// The ghost is positioned with `transform`, so its entrance scales with the separate `scale` property.
export const styles = `
[data-session-drag-ghost] {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483000;
  max-width: 280px;
  pointer-events: none;
  white-space: nowrap;
  transform-origin: 0 50%;
  opacity: 1;
  scale: 1;
  will-change: transform, opacity;
  transition: opacity 120ms cubic-bezier(0.23, 1, 0.32, 1), scale 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
[data-session-drag-ghost][data-state="enter"] { opacity: 0; scale: 0.97; }
[data-session-drag-ghost][data-state="leave"] { opacity: 0; }
html[data-session-drag], html[data-session-drag] * {
  cursor: default !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}
@media (prefers-reduced-motion: reduce) {
  [data-session-drag-ghost][data-state="enter"] { scale: 1; }
}
`
