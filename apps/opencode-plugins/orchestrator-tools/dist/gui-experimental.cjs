"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const r=require("solid-js/web"),G=require("@opencode/plugin/gui"),c=require("solid-js");function V(n){for(let o=n.parentElement;o;o=o.parentElement){const{overflowY:l}=getComputedStyle(o);if((l==="auto"||l==="scroll")&&o.scrollHeight>o.clientHeight)return o}}function Q(n,o,l,h){const x=o.getBoundingClientRect().top,p=performance.now();let b=0,w=!1;const f=()=>{const k=o.getBoundingClientRect().top-x;Math.abs(k)>.01&&(n.scrollTop+=k)},g=new ResizeObserver(f);g.observe(l);const $=()=>{w||(w=!0,cancelAnimationFrame(b),g.disconnect())},y=()=>{w||(f(),performance.now()-p<h?b=requestAnimationFrame(y):$())};return y(),$}const X="peerMessage";function Z(n){if(n.type!=="user")return;const o=n.metadata?.[X];if(!o||typeof o!="object")return;const{sessionID:l,title:h,ref:x,text:p}=o;if(!(typeof l!="string"||typeof h!="string"||typeof x!="string"||typeof p!="string"))return{sessionID:l,title:h,ref:x,text:p}}const ee=/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;function te(n){return n.split(ee).map((o,l)=>l%2===1?o:o.replace(/&/g,"&amp;").replace(/</g,"&lt;")).join("")}var re=r.template('<div><button type=button data-slot=peer-trigger></button><span data-slot=peer-dir aria-hidden=true><svg viewBox="0 0 16 16"fill=none><path d="M5 6.44V11H9.56M5 11L11 5"stroke=currentColor></path></svg></span><span data-slot=peer-name></span><div data-slot=peer-text></div><span data-slot=peer-tail><span data-slot=peer-arrow aria-hidden=true>');const oe="[data-timeline-row='UserMessage'][data-message-id]",q="data-peer-row",e="data-peer-card",E=200,ne=`
[${q}] [data-component="user-message"] { display: none; }
[${e}] {
  position: relative; box-sizing: border-box; display: flex; align-items: flex-start; gap: 8px;
  width: fit-content; max-width: 100%; min-width: 0; padding: 8px 12px;
  border-radius: 8px; background: var(--v2-background-bg-layer-02);
  font: 440 13px/20px var(--v2-font-family-sans, inherit); letter-spacing: -0.04px; color: var(--v2-text-text-base);
}
[${e}] [data-slot="peer-trigger"] {
  position: absolute; inset: 0; z-index: 0; margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent; cursor: pointer;
}
[${e}]:not([data-expandable="true"]) [data-slot="peer-trigger"] { display: none; }
[${e}][data-expandable="true"] { cursor: pointer; }
[${e}][data-open="true"] [data-slot="peer-text"] { cursor: text; }
[${e}]:has([data-slot="peer-trigger"]:focus-visible) { outline: 1px solid var(--v2-text-text-accent); outline-offset: 2px; }
[${e}] [data-slot="peer-trigger"]:focus-visible { outline: none; }
[${e}] [data-slot="peer-dir"] { position: relative; flex: none; width: 16px; height: 16px; margin-top: 2px; color: var(--v2-text-text-faint); pointer-events: none; }
[${e}] [data-slot="peer-dir"] svg { display: block; width: 16px; height: 16px; }
[${e}] [data-slot="peer-name"] {
  position: relative; flex: 0 1 auto; min-width: 0; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 530; pointer-events: none;
}
/* One text element for both states: it is the first line in both, so it cannot move. Only its height changes. */
[${e}] [data-slot="peer-text"] {
  position: relative; flex: 1 1 0%; min-width: 0; height: 20px; overflow: hidden; interpolate-size: allow-keywords;
  transition: height ${E}ms cubic-bezier(0.23, 1, 0.32, 1); pointer-events: none; user-select: none; overflow-wrap: anywhere;
}
[${e}][data-open="true"] [data-slot="peer-text"] { height: auto; pointer-events: auto; user-select: text; }
[${e}] [data-slot="peer-text"] [data-markdown-block] > * { margin: 0; }
[${e}] [data-slot="peer-text"] [data-markdown-block] > * + * { margin-top: 8px; }
[${e}] [data-slot="peer-text"] :is(p, li, h1, h2, h3, h4, h5, h6) { font: inherit; letter-spacing: inherit; }
[${e}] [data-slot="peer-text"] :is(ul, ol) { padding-inline-start: 18px; }
[${e}] [data-slot="peer-text"] li { margin: 0; padding: 0; }
[${e}] [data-slot="peer-text"] li + li { margin-top: 2px; }
[${e}] [data-slot="peer-text"] li > p { margin: 0; }
/* A code block has no vertical padding here: its first line sits where the clamped line sits, so opening cannot move it. */
[${e}] [data-slot="peer-text"] pre { margin: 0; padding: 0 8px; border-radius: 4px; line-height: 20px; white-space: pre-wrap; }
[${e}][data-clamped="true"] [data-slot="peer-text"] [data-slot="markdown-copy-button"] { display: none; }
[${e}][data-clamped="true"] [data-slot="peer-text"] [data-markdown-block]:first-child > :first-child {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; line-clamp: 1; overflow: hidden;
}
/* The trailing slot has a fixed width, so revealing its buttons never re-wraps the text. */
[${e}] [data-slot="peer-tail"] { position: relative; flex: none; display: flex; align-items: center; gap: 2px; height: 20px; margin-right: -4px; }
[${e}] [data-slot="peer-arrow"] {
  display: flex; align-items: center; justify-content: center; width: 16px; height: 20px; color: var(--v2-text-text-faint);
  pointer-events: none; opacity: 0; transition: opacity 150ms ease;
}
[${e}] [data-slot="peer-arrow"] svg { transform: rotate(-90deg); transition: transform 150ms ease; }
[${e}][data-expandable="true"]:is(:hover, :has([data-slot="peer-trigger"]:focus-visible)) [data-slot="peer-arrow"],
[${e}][data-open="true"] [data-slot="peer-arrow"] { opacity: 1; }
[${e}][data-open="true"] [data-slot="peer-arrow"] svg { transform: rotate(0); }
[${e}]:not([data-expandable="true"]) [data-slot="peer-arrow"] { visibility: hidden; }
[${e}] .peer-open { position: relative; z-index: 1; margin-block: -2px; opacity: 0; }
[${e}]:is(:hover, :focus-within) .peer-open, [${e}][data-open="true"] .peer-open { opacity: 1; }
@media (hover: none) { [${e}] .peer-open, [${e}] [data-slot="peer-arrow"] { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { [${e}] [data-slot="peer-text"], [${e}] [data-slot="peer-arrow"] svg { transition: none; } }
`;let ae=0;const ie=G.Plugin.define({i18n:{en:{open:"Open session"}},setup(n){n.add(G.Style,ne);const o=c.getOwner(),l=c.createMemo(()=>{const t=new Map;for(const a of n.sessions.list())for(const u of a.server.data.session.message.list(a.id)){const d=Z(u);d&&t.set(u.id,{peer:d,server:a.server.id})}return t}),h=t=>n.tabs.open({server:t.server,id:t.peer.sessionID},{focus:!0}),x=t=>{const a=()=>t.located.peer,u=`peer-text-${++ae}`,[d,m]=c.createSignal(!1),[z,W]=c.createSignal(!0),[H,J]=c.createSignal(!1);let A,C,_,R;const M=()=>{if(d()||!z())return;const s=C.querySelectorAll("[data-markdown-block] > *"),i=s[0];i&&J(s.length>1||i.scrollHeight>i.clientHeight+1||i.scrollWidth>i.clientWidth+1)},I=new ResizeObserver(M),j=new MutationObserver(M);c.onCleanup(()=>{I.disconnect(),j.disconnect(),_?.(),clearTimeout(R)}),queueMicrotask(()=>{I.observe(C),j.observe(C,{childList:!0,subtree:!0}),M(),document.fonts?.ready.then(M)});const K=()=>{const s=!d(),i=V(A),O=A.querySelector("[data-slot='peer-name']");_?.(),clearTimeout(R),s?W(!1):R=setTimeout(()=>W(!0),E+20),m(s),i&&O&&(_=Q(i,O,A,E+60))},N=s=>{if(!H())return;const i=s.target;i.closest(".peer-open, a, button:not([data-slot='peer-trigger'])")||d()&&i.closest("[data-slot='peer-text']")||K()};return(()=>{var s=re(),i=s.firstChild,O=i.nextSibling,T=O.nextSibling,S=T.nextSibling,B=S.nextSibling,U=B.firstChild,D=A;typeof D=="function"?r.use(D,s):A=s,r.spread(s,r.mergeProps({[e]:""},{get"data-open"(){return d()},get"data-clamped"(){return z()},get"data-expandable"(){return H()},onClick:N}),!1,!0),r.setAttribute(i,"aria-controls",u),r.insert(T,()=>a().title);var F=C;return typeof F=="function"?r.use(F,S):C=S,r.setAttribute(S,"id",u),r.insert(S,r.createComponent(n.ui.Markdown,{get text(){return te(a().text)}})),r.insert(U,r.createComponent(n.ui.Icon,{name:"fill-triangle-down",size:"small"})),r.insert(B,r.createComponent(n.ui.Tooltip,{get value(){return n.t("open")},get children(){return r.createComponent(n.ui.IconButton,{class:"peer-open",icon:"arrow-up-right",variant:"ghost",get label(){return`${n.t("open")} ${a().title}`},onClick:()=>h(t.located)})}}),null),r.effect(v=>{var P=d(),L=a().title,Y=a().title;return P!==v.e&&r.setAttribute(i,"aria-expanded",v.e=P),L!==v.t&&r.setAttribute(i,"aria-label",v.t=L),Y!==v.a&&r.setAttribute(T,"title",v.a=Y),v},{e:void 0,t:void 0,a:void 0}),s})()};for(const t of document.querySelectorAll("[data-peer-mount]"))t.remove();const p=new Map,b=t=>{p.get(t)?.(),p.delete(t),t.remove()},w=()=>{for(const t of[...p.keys()])t.isConnected||b(t)};let f,g=!1;const $=()=>{if(f=void 0,g)return;w();const t=l();for(const a of document.querySelectorAll(oe)){const u=t.get(a.dataset.messageId??"");if(!u||a.querySelector(`[${e}]`))continue;const d=a.querySelector("[data-slot='session-turn-message-content']");if(!d)continue;a.setAttribute(q,"");const m=document.createElement("div");m.setAttribute("data-peer-mount",""),m.style.display="contents",d.append(m),p.set(m,c.runWithOwner(o,()=>r.render(()=>r.createComponent(x,{located:u}),m)))}},y=()=>{g||(f??=requestAnimationFrame($))};c.createEffect(()=>{l(),y()});const k=new MutationObserver(t=>{!g&&t.some(a=>a.addedNodes.length>0)&&$()});k.observe(document.body,{childList:!0,subtree:!0}),y(),c.onCleanup(()=>{g=!0,k.disconnect(),f!==void 0&&cancelAnimationFrame(f);for(const t of[...p.keys()])b(t);for(const t of document.querySelectorAll(`[${q}]`))t.removeAttribute(q)})}});exports.default=ie;
