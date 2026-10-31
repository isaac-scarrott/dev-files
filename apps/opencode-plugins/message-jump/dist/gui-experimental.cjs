"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const h=require("@opencode/plugin/gui"),w="[data-slot='session-timeline-scroll']",A="[data-timeline-row='UserMessage']",L="[data-slot='user-message-text']",C=16;function E(o,e=C){return o.scrollHeight-o.scrollTop-o.clientHeight>e}function M(o,e){let i;for(const a of o)a.bottom<=e&&(i=a);return i}function S(o,e=90){const i=(o.querySelector(L)?.textContent??o.textContent??"").replace(/\s+/g," ").trim();return i.length<=e?i:`${i.slice(0,e-1).trimEnd()}…`}function z(o){return[...o.querySelectorAll(A)].flatMap(e=>{const i=e.getBoundingClientRect();return i.bottom-i.top>0?[{element:e,top:i.top,bottom:i.bottom}]:[]})}const R='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z"/></svg>',k=h.Plugin.define({setup(o){if(o.add(h.Style,`
      [data-message-jump] {
        position: fixed;
        z-index: 40;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: min(520px, calc(100vw - 24px));
        height: 26px;
        padding: 0 10px 0 9px;
        border: 1px solid var(--v2-border-border-muted);
        border-radius: 999px;
        background: var(--v2-background-bg-layer-02);
        color: var(--v2-text-text-muted);
        box-shadow: 0 6px 18px -8px rgb(0 0 0 / 0.5);
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translate(-50%, -6px) scale(0.97);
        transition:
          opacity 120ms cubic-bezier(0.23, 1, 0.32, 1),
          transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
          visibility 0s 120ms;
      }
      [data-message-jump][data-visible='true'] {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translate(-50%, 0) scale(1);
        transition:
          opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
          transform 180ms cubic-bezier(0.23, 1, 0.32, 1),
          visibility 0s;
      }
      [data-message-jump][data-visible='true']:active {
        transform: translate(-50%, 0) scale(0.97);
        transition: transform 100ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      [data-message-jump]:focus-visible {
        outline: 2px solid var(--v2-border-border-focus);
        outline-offset: 2px;
      }
      [data-message-jump-icon] {
        display: block;
        flex: none;
        width: 12px;
        height: 12px;
        color: var(--v2-text-text-faint);
      }
      [data-message-jump-icon] > svg {
        display: block;
        width: 12px;
        height: 12px;
      }
      [data-message-jump-text] {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Leave room for the pill under the top edge after a jump. */
      [data-timeline-row='UserMessage'] {
        scroll-margin-block-start: 12px;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-message-jump],
        [data-message-jump][data-visible='true'] {
          transform: translate(-50%, 0);
        }
        [data-message-jump] {
          transition: opacity 120ms linear, visibility 0s 120ms;
        }
        [data-message-jump][data-visible='true'] {
          transition: opacity 120ms linear, visibility 0s;
        }
      }
    `),typeof document>"u")return;const e=document.createElement("button");e.type="button",e.tabIndex=-1,e.setAttribute("data-message-jump",""),e.innerHTML=`<span data-message-jump-icon>${R}</span><span data-message-jump-text></span>`;const i=e.querySelector("[data-message-jump-text]");let a,r,c,m=!1,b="";const u=()=>{a=void 0,e.getAttribute("data-visible")==="true"&&e.setAttribute("data-visible","false")},y=(t,l)=>{const n=`${Math.round(t.left+t.width/2)}px`,s=`${Math.round(t.top+10)}px`,d=`${n}|${s}`;d!==b&&(b=d,e.style.left=n,e.style.top=s)},j=t=>{if(!t.isConnected||!E(t))return u();const l=t.getBoundingClientRect().top,n=M(z(t),l),s=n?S(n.element):"";if(!n||!s)return u();const d=n.element!==a?.element;a=n,r=t,i.textContent!==s&&(i.textContent=s),e.title!==s&&(e.title=s),e.getAttribute("aria-label")!==s&&e.setAttribute("aria-label",`Jump to your message: ${s}`),(!m||d||e.getAttribute("data-visible")!=="true")&&y(t.getBoundingClientRect()),m||(m=!0,document.body.append(e)),e.getAttribute("data-visible")!=="true"&&e.setAttribute("data-visible","true")},p=t=>{r=t,c===void 0&&(c=requestAnimationFrame(()=>{c=void 0,r&&j(r)}))},f=t=>{const l=t.target,n=l instanceof Element?l.closest(w):null;n&&p(n)},v=()=>{r&&p(r)},g=()=>{const t=a?.element;if(!t?.isConnected)return u();t.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}),u()};e.addEventListener("click",g),document.addEventListener("scroll",f,{capture:!0,passive:!0}),window.addEventListener("resize",v);const x=new MutationObserver(()=>{if(!r?.isConnected){const t=[...document.querySelectorAll(w)].find(l=>l.clientHeight>0);if(!t)return u();r=t}p(r)});return x.observe(document.documentElement,{subtree:!0,childList:!0}),()=>{x.disconnect(),document.removeEventListener("scroll",f,{capture:!0}),window.removeEventListener("resize",v),e.removeEventListener("click",g),c!==void 0&&cancelAnimationFrame(c),e.remove()}}});exports.default=k;
