"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const x=require("@opencode/plugin/gui"),w=require("solid-js"),L="[data-slot='session-timeline-scroll'] > .scroll-view__viewport[data-scrollable]",S="[data-timeline-row='UserMessage']",z="[data-slot='user-message-text']";function M(r,e){let t;for(const i of r)i.bottom<=e&&(!t||i.bottom>t.bottom)&&(t=i);return t}function k(r,e=90){const t=(r.querySelector(z)?.textContent??r.textContent??"").replace(/\s+/g," ").trim();return t.length<=e?t:`${t.slice(0,e-1).trimEnd()}…`}function q(r){return[...r.querySelectorAll(S)].flatMap(e=>{const t=e.getBoundingClientRect();return t.bottom-t.top>0?[{element:e,top:t.top,bottom:t.bottom}]:[]})}function R(r,e){const t=r.ownerDocument,i=t.defaultView,c=e.querySelector("[data-message-jump-text]");let a=!1,p=!1,f,d,u,l;const h=new i.MutationObserver(()=>v()),g=new i.ResizeObserver(()=>v()),m=()=>{d=void 0,a&&t.activeElement===e&&f?.focus({preventScroll:!0}),e.tabIndex=-1,e.setAttribute("aria-hidden","true"),e.setAttribute("data-visible","false"),l!==void 0&&i.cancelAnimationFrame(l),l=void 0},y=s=>{if(s===f||(h.disconnect(),g.disconnect(),f=s,!s))return;h.observe(s,{subtree:!0,childList:!0,characterData:!0});const o=s.querySelector("[data-timeline-virtual-content]");o&&g.observe(o);for(let n=s;n;n=n.parentElement)g.observe(n)},C=()=>{if(u=void 0,!a||p)return;const s=r.isConnected?r.closest(L)??void 0:void 0;y(s);const o=s?.getBoundingClientRect();if(!s||!o||o.width<=24||o.height<=0)return m();const n=M(q(s),o.top),b=n?k(n.element):"";if(!n||!b)return m();d=n.element,c.textContent!==b&&(c.textContent=b),e.title!==b&&(e.title=b);const E=`Jump to your message: ${b}`;e.getAttribute("aria-label")!==E&&e.setAttribute("aria-label",E),e.style.left=`${Math.round(o.left+o.width/2)}px`,e.style.top=`${Math.round(o.top+10)}px`,e.style.maxWidth=`${Math.min(520,o.width-24)}px`,e.tabIndex=0,e.removeAttribute("aria-hidden"),e.isConnected?l===void 0&&e.setAttribute("data-visible","true"):(t.body.append(e),l=i.requestAnimationFrame(()=>{l=void 0,a&&d&&!p&&e.setAttribute("data-visible","true")}))};function v(){a&&!p&&u===void 0&&(u=i.requestAnimationFrame(C))}const A=s=>{s.target===f&&v()},j=()=>{if(!a||!d?.isConnected||!f?.contains(d))return m();d.scrollIntoView({block:"start",behavior:i.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}),m()};return m(),e.addEventListener("click",j),{setActive(s){a===s||p||(a=s,s?(t.addEventListener("scroll",A,{capture:!0,passive:!0}),i.addEventListener("resize",v),v()):(t.removeEventListener("scroll",A,{capture:!0}),i.removeEventListener("resize",v),u!==void 0&&i.cancelAnimationFrame(u),u=void 0,y(void 0),m(),e.remove()))},dispose(){this.setActive(!1),p=!0,h.disconnect(),g.disconnect(),e.removeEventListener("click",j),e.remove()}}}const _='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z"/></svg>',$=x.Plugin.define({setup(r){r.add(x.Style,`
      [data-message-jump] {
        position: fixed;
        z-index: 40;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        box-sizing: border-box;
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
        [data-message-jump][data-visible='true'],
        [data-message-jump][data-visible='true']:active {
          transform: translate(-50%, 0);
        }
        [data-message-jump] {
          transition: opacity 120ms linear, visibility 0s 120ms;
        }
        [data-message-jump][data-visible='true'] {
          transition: opacity 120ms linear, visibility 0s;
        }
      }
    `),!(typeof document>"u")&&r.add(x.Slot,{at:"session.header",render(e){const t=document.createElement("span");t.hidden=!0;const i=document.createElement("button");i.type="button",i.setAttribute("data-message-jump",""),i.innerHTML=`<span data-message-jump-icon>${_}</span><span data-message-jump-text></span>`;const c=R(t,i);return w.createEffect(w.on(()=>[e.session.visit,e.active],([,a])=>{c.setActive(!1),c.setActive(a)})),w.onCleanup(()=>c.dispose()),t}})}});exports.default=$;
