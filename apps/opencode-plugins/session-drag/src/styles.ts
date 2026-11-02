import { LABEL_ATTR } from "./drag"

export const LABEL = "Drop to attach session"

export const styles = `
[data-session-drag-ghost] {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483000;
  max-width: 280px;
  pointer-events: none;
  white-space: nowrap;
  will-change: transform;
}
html[data-session-drag], html[data-session-drag] * {
  cursor: default !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}
/*
 * The host's dropzone overlay words every text drag as files. While our drag is active its label (the unslotted div
 * after the upload icon) is collapsed to a zero-height line and ours is drawn after it as a block with the host's 15px/24px (leading-6);
 * weight and colour are inherited from the host label. Solid keeps owning the text node.
 */
html[${LABEL_ATTR}] [data-slot="session-dropzone-content"] > div:not([data-slot]) { font-size: 0; line-height: 0; }
html[${LABEL_ATTR}] [data-slot="session-dropzone-content"] > div:not([data-slot])::after { content: "${LABEL}"; display: block; font-size: 15px; line-height: 24px; }
`
