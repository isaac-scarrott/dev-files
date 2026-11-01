import { SETTLE, easing, fadeIn, fadeOut, move } from "./spring"

const enter = easing(move)
const fade = easing(fadeIn)
const retract = easing(fadeOut)
const seconds = `${SETTLE.toFixed(3)}s`

/**
 * The tray is the host's own `data-dock-surface="tray"` (surface, border, radius, clip), turned upside down: the host
 * hangs its tray under a shell, this one stands on the composer, so the bottom corners are squared and the last 14px
 * (0.875rem, the host's `margin-top: -0.875rem`) tuck under the composer, which paints above it (z-70 against 0).
 * It sits in the host's composer lane, the out-of-flow row the app's pills use, so it never moves the composer.
 */
export const styles = `
[data-cache-warning] {
  --cw-tuck: 14px;
  position: relative;
  z-index: 0;
  display: block;
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  margin-inline: 14px;
  border-width: 0.5px;
  margin-bottom: calc(-10px - var(--cw-tuck));
  padding: 6px 12px calc(var(--cw-tuck) + 4px);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  font-size: 13px;
  font-weight: 440;
  line-height: var(--line-height-compact);
  text-wrap: pretty;
  color: var(--v2-text-text-muted);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  transform: translateY(calc(100% - var(--cw-tuck)));
  opacity: 0;
  transition: none;
}
[data-cache-warning][data-state="open"] {
  transform: none;
  opacity: 1;
  transition: transform ${seconds} ${enter}, opacity ${seconds} ${fade};
}
[data-cache-warning][data-state="closing"] {
  transition: transform ${seconds} ${enter}, opacity ${seconds} ${retract};
}
[data-cache-warning][data-state="rest"] {
  transform: none;
  opacity: 1;
}
[data-cache-warning] [data-cache-warning-lead] {
  font-weight: 530;
  color: var(--v2-text-text-base);
}
:root[data-motion="reduce"] [data-cache-warning] {
  transform: none;
  transition: opacity 150ms linear !important;
}
@media (prefers-reduced-motion: reduce) {
  [data-cache-warning] {
    transform: none;
    transition: opacity 150ms linear !important;
  }
}
`
