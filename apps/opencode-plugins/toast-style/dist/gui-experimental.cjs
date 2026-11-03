"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const v=require("@opencode/plugin/gui"),s=".toast-v2-region",c=".toast-v2",t=`${s} ${c}`,l=".toast-v2-region.toast-v2-region .toast-v2.toast-v2",b="[data-sonner-toaster]",f="[data-content]",h="[data-title]",g="[data-description]",m="[data-icon]",a='[data-slot="toast-v2-actions"]',o='[data-component="button-v2"]',e={collapsedBehind:'[data-expanded="false"][data-front="false"]',expanded:'[data-expanded="true"]',front:'[data-front="true"]',hidden:'[data-visible="false"]',removed:'[data-removed="true"]',notSwiped:'[data-swipe-out="false"]'},x=`:has(> ${m})`,r=`:has(> ${m} use[href$="icon-notifications"])`,y="--toast-style-go-next-hint",$="cubic-bezier(0.2, 0, 0, 1)",i="cubic-bezier(0.4, 0, 1, 1)",d=8,p=.04,u=n=>`${n}${t}, ${n}${t} > * { transition: opacity 120ms linear !important; animation: none !important; }
${n}${l}${e.removed}${e.notSwiped}${e.front} { --y: translateY(0); }`;function w(){return`
/* The app's font: solid-sonner puts a system stack on the region and the cards inherit it. */
${s}${b} { font-family: var(--font-family-sans); }

/* The app's own timings (.toast-v2 declares them; solid-sonner's 400ms ease wins today). */
${t} { transition: transform 280ms ${$}, opacity 160ms ease-out, height 280ms ${$}, box-shadow 160ms ease-out; }
${t} > * { transition: opacity 160ms ease-out; }
${t} ${g}:not(:empty) { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }

/* Stack: cards behind peek ${d}px and shrink ${p*100}% a step. */
${t}${e.collapsedBehind} { --y: translateY(calc(-1 * var(--toasts-before) * ${d}px)) scale(calc(1 - var(--toasts-before) * ${p})); }

/* Exit: a short fade down and in. A card behind keeps its own removal path. */
${l}${e.removed}${e.notSwiped} { transition: transform 160ms ${i}, opacity 160ms ${i}, height 160ms ${i}; }
${l}${e.removed}${e.notSwiped}${e.front} { --y: translateY(6px) scale(0.98); opacity: 0; }

/* Every toast, whoever raised it: the glyph shares the title's row; the text and the buttons use the full width. */
${t} { column-gap: 6px; row-gap: 0; }
${t} > ${f} { display: contents; }
${t} ${h} { grid-area: 1 / 1; min-width: 0; }
${t}${x} ${h} { grid-column: 2; }
${t} ${g} { grid-area: 2 / 1 / 3 / -1; margin-top: 2px; }
${t} ${a} { grid-area: 3 / 1 / 4 / -1; margin-top: 10px; }

/* Buttons: the first is the primary (the app's neutral), the rest are quiet. */
${t} ${a} ${o}:nth-child(n + 2) { color: var(--v2-text-text-muted); background-color: transparent; background-image: none; box-shadow: none; font-weight: 440; }
${t} ${a} ${o}:nth-child(n + 2):hover:not(:disabled) { background-color: var(--v2-overlay-simple-overlay-hover); background-image: none; }
${t} ${a} ${o}:nth-child(n + 2):active:not(:disabled) { background-color: var(--v2-overlay-simple-overlay-pressed); background-image: none; }

/* A waiting request: its button is the app's contrast button. */
${t}${r} ${a} ${o}:first-child { background-color: var(--v2-background-bg-contrast); background-image: linear-gradient(180deg, var(--v2-alpha-light-20) 0%, var(--v2-alpha-light-0) 100%), linear-gradient(90deg, var(--v2-background-bg-contrast) 0%, var(--v2-background-bg-contrast) 100%); color: var(--v2-text-text-contrast); text-shadow: rgba(0, 0, 0, 0.3) 0 0.5px 0.5px; box-shadow: var(--v2-elevation-button-contrast); }
${t}${r} ${a} ${o}:first-child:hover:not(:disabled) { background-image: linear-gradient(90deg, var(--v2-overlay-simple-overlay-contrast-hover) 0%, var(--v2-overlay-simple-overlay-contrast-hover) 100%), linear-gradient(180deg, var(--v2-alpha-light-20) 0%, var(--v2-alpha-light-0) 100%), linear-gradient(90deg, var(--v2-background-bg-contrast) 0%, var(--v2-background-bg-contrast) 100%); }
${t}${r} ${a} ${o}:first-child:active:not(:disabled) { background-image: linear-gradient(90deg, var(--v2-overlay-simple-overlay-contrast-pressed) 0%, var(--v2-overlay-simple-overlay-contrast-pressed) 100%), linear-gradient(180deg, var(--v2-alpha-light-20) 0%, var(--v2-alpha-light-0) 100%), linear-gradient(90deg, var(--v2-background-bg-contrast) 0%, var(--v2-background-bg-contrast) 100%); }
${t}${e.front}${r} ${a} ${o}:first-child::after { content: var(${y}, none); margin-left: 6px; font-size: 11px; line-height: 16px; font-weight: 440; letter-spacing: 0.02em; color: color-mix(in srgb, currentColor 70%, transparent); text-shadow: none; }

/* "+N more": the cards past the visible three, counted. */
${s} { counter-reset: toast-style-hidden; }
${t}${e.hidden}:not(${e.removed}) { counter-increment: toast-style-hidden; }
${s}:has(${c}${e.hidden}:not(${e.removed})):not(:has(${c}${e.expanded}))::after { content: "+" counter(toast-style-hidden) " more"; position: absolute; right: 0; bottom: calc(var(--front-toast-height, 0px) + ${2*d+8}px); height: 20px; padding: 0 8px; border-radius: 10px; font-size: 12px; line-height: 20px; font-weight: 530; letter-spacing: -0.04px; color: var(--v2-text-text-muted); background: var(--v2-background-bg-layer-01); box-shadow: var(--v2-elevation-floating); pointer-events: none; }

/* No movement for people who ask for none: the fade alone. */
@media (prefers-reduced-motion: reduce) {
${u("")}
}
${u(':root[data-motion="reduce"] ')}
`}const k=v.Plugin.define({setup(n){n.add(v.Style,w())}});exports.default=k;
