export const css = `
[data-visual-reply] {
  margin: 8px 0;
  border: 1px solid var(--v2-border-border-muted);
  border-radius: 8px;
  background: var(--v2-background-bg-layer-01);
  overflow: hidden;
}
[data-visual-reply] > [data-slot='head'],
[data-visual-reply-overlay] > [data-slot='head'] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  color: var(--v2-text-text-muted);
  font-size: 12px;
}
[data-visual-reply] [data-slot='title'],
[data-visual-reply-overlay] [data-slot='title'] {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-visual-reply] [data-slot='controls'],
[data-visual-reply-overlay] [data-slot='controls'] {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 150ms ease-out;
}
[data-visual-reply]:hover [data-slot='controls'],
[data-visual-reply]:focus-within [data-slot='controls'],
[data-visual-reply-overlay] [data-slot='controls'] {
  opacity: 1;
}
[data-visual-reply] iframe {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
}
[data-visual-reply-overlay] {
  position: fixed;
  inset: 24px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--v2-border-border-base);
  border-radius: 12px;
  background: var(--v2-background-bg-base);
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.45);
  overflow: hidden;
}
[data-visual-reply-overlay] iframe {
  flex: 1;
  width: 100%;
  border: 0;
}
@media (prefers-reduced-motion: reduce) {
  [data-visual-reply] [data-slot='controls'] { transition: none; }
}
`
