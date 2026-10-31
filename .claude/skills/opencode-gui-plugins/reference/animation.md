# Animation (Emil Kowalski's rules, applied to plugin DOM)

Source: https://github.com/emilkowalski/skills/tree/main/skills (`animate`, `animation-performance`, `improve-animations`, `emil-design-eng`). Re-read `animate` for components not covered here (dropdown, toast, drawer, stagger, drag).

## Gate first

| How often the user triggers it | Decision |
| --- | --- |
| Keyboard-initiated, or 100+ times a day | No motion |
| Tens of times a day (hover, list navigation) | Near-imperceptible, or none |
| Occasional (accordion, popover, pill) | Standard motion |
| Rare (first run, success) | Delight allowed |

Name the purpose (feedback, spatial consistency, state change, preventing a jarring jump) before writing CSS. No named purpose, no animation. Never animate on first paint, on startup hydration, or on count/label updates; only on a user-caused or state-caused change the user is watching.

## Ingredients

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for entrances, exits and reveals; `cubic-bezier(0.77, 0, 0.175, 1)` for on-screen movement. Never `ease-in`, never the built-in `ease-out`.
- Press 100-160ms, small popovers/tooltips 125-200ms, accordions and dropdowns 150-250ms. Stay under 300ms.
- Properties: `transform` and `opacity`. Start entrances at `scale(0.97)` plus `opacity: 0`, never `scale(0)`. Name properties in `transition`; never `transition: all`.
- CSS transitions for anything the user can retrigger (they retarget from the current value; keyframes restart). Set `transform-origin` at the trigger for popovers.
- Gate hover motion with `@media (hover: hover) and (pointer: fine)`.
- `prefers-reduced-motion: reduce` ships with the animation: keep opacity, drop movement.

## Accordion (the one place height is tolerated)

Animate a wrapper's `grid-template-rows` between `0fr` and `1fr` (inner element `overflow: hidden; min-height: 0`) together with `opacity`, rather than a measured or `max-height` value. Put any scroll cap on an inner list, not the wrapper. Rotate the chevron with the same curve and duration.

```css
[data-group-body] { display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden;
  transition: grid-template-rows 200ms var(--ease-out), opacity 150ms var(--ease-out), visibility 0s 200ms; }
[data-group][data-open] > [data-group-body] { grid-template-rows: 1fr; opacity: 1; visibility: visible; transition-delay: 0s; }
[data-group-body] > div { min-height: 0; overflow: hidden; }
[data-group-chevron] { transition: transform 200ms var(--ease-out); }
[data-group][data-open] [data-group-chevron] { transform: rotate(90deg); }
```

Delayed `visibility` keeps collapsed content out of the tab order and accessibility tree once the close finishes; keep `aria-expanded` on the toggle in step with the state, not the animation.

## Injected nodes

- Set the initial state, force a frame (`requestAnimationFrame`), then flip the attribute; otherwise the browser skips the transition.
- Rows that appear or leave: fade plus 4px translate, 30-80ms stagger only for a batch the user just caused.
- Verify at 2-5x duration or in the DevTools animation inspector; feel cannot be judged from code, so say what was and was not watched live.
