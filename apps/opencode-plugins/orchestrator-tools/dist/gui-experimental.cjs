"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const r=require("solid-js/web"),D=require("@opencode/plugin/gui"),c=require("solid-js"),K="peerMessage";function N(n){if(n.type!=="user")return;const l=n.metadata?.[K];if(!l||typeof l!="object")return;const{sessionID:u,title:x,ref:m,text:d}=l;if(!(typeof u!="string"||typeof x!="string"||typeof m!="string"||typeof d!="string"))return{sessionID:u,title:x,ref:m,text:d}}const U=/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;function V(n){return n.split(U).map((l,u)=>u%2===1?l:l.replace(/&/g,"&amp;").replace(/</g,"&lt;")).join("")}var Y=r.template('<div><button type=button data-slot=peer-trigger></button><span data-slot=peer-dir aria-hidden=true><svg viewBox="0 0 16 16"fill=none><path d="M5 6.44V11H9.56M5 11L11 5"stroke=currentColor></path></svg></span><span data-slot=peer-name></span><div data-slot=peer-text></div><span data-slot=peer-tail><span data-slot=peer-arrow aria-hidden=true>');const G="[data-timeline-row='UserMessage'][data-message-id]",y="data-peer-row",e="data-peer-card",Q=`
[${y}] [data-component="user-message"] { display: none; }
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
/* One text element for both states: it is the first line in both, so it cannot move. Only its height changes, in one frame, as the host's collapsibles do. */
[${e}] [data-slot="peer-text"] {
  position: relative; flex: 1 1 0%; min-width: 0; height: 20px; overflow: hidden; pointer-events: none; user-select: none; overflow-wrap: anywhere;
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
[${e}]:not([data-open="true"]) [data-slot="peer-text"] [data-slot="markdown-copy-button"] { display: none; }
[${e}]:not([data-open="true"]) [data-slot="peer-text"] [data-markdown-block]:first-child > :first-child {
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
`;let X=0;const Z=D.Plugin.define({i18n:{en:{open:"Open session"}},setup(n){n.add(D.Style,Q);const l=c.getOwner(),u=c.createMemo(()=>{const t=new Map;for(const o of n.sessions.list())for(const p of o.server.data.session.message.list(o.id)){const i=N(p);i&&t.set(p.id,{peer:i,server:o.server.id})}return t}),x=t=>n.tabs.open({server:t.server,id:t.peer.sessionID},{focus:!0}),m=t=>{const o=()=>t.located.peer,p=`peer-text-${++X}`,[i,g]=c.createSignal(!1),[O,H]=c.createSignal(!1);let _,v;const $=()=>{if(i())return;const s=v.querySelectorAll("[data-markdown-block] > *"),a=s[0];a&&H(s.length>1||a.scrollHeight>a.clientHeight+1||a.scrollWidth>a.clientWidth+1)},q=new ResizeObserver($),E=new MutationObserver($);c.onCleanup(()=>{q.disconnect(),E.disconnect()}),queueMicrotask(()=>{q.observe(v),E.observe(v,{childList:!0,subtree:!0}),$(),document.fonts?.ready.then($)});const L=()=>g(!i()),B=s=>{if(!O())return;const a=s.target;a.closest(".peer-open, a, button:not([data-slot='peer-trigger'])")||i()&&a.closest("[data-slot='peer-text']")||L()};return(()=>{var s=Y(),a=s.firstChild,F=a.nextSibling,k=F.nextSibling,h=k.nextSibling,R=h.nextSibling,J=R.firstChild,T=_;typeof T=="function"?r.use(T,s):_=s,r.spread(s,r.mergeProps({[e]:""},{get"data-open"(){return i()},get"data-expandable"(){return O()},onClick:B}),!1,!0),r.setAttribute(a,"aria-controls",p),r.insert(k,()=>o().title);var z=v;return typeof z=="function"?r.use(z,h):v=h,r.setAttribute(h,"id",p),r.insert(h,r.createComponent(n.ui.Markdown,{get text(){return V(o().text)}})),r.insert(J,r.createComponent(n.ui.Icon,{name:"fill-triangle-down",size:"small"})),r.insert(R,r.createComponent(n.ui.Tooltip,{get value(){return n.t("open")},get children(){return r.createComponent(n.ui.IconButton,{class:"peer-open",icon:"arrow-up-right",variant:"ghost",get label(){return`${n.t("open")} ${o().title}`},onClick:()=>x(t.located)})}}),null),r.effect(f=>{var I=i(),W=o().title,j=o().title;return I!==f.e&&r.setAttribute(a,"aria-expanded",f.e=I),W!==f.t&&r.setAttribute(a,"aria-label",f.t=W),j!==f.a&&r.setAttribute(k,"title",f.a=j),f},{e:void 0,t:void 0,a:void 0}),s})()};for(const t of document.querySelectorAll("[data-peer-mount]"))t.remove();const d=new Map,A=t=>{d.get(t)?.(),d.delete(t),t.remove()},P=()=>{for(const t of[...d.keys()])t.isConnected||A(t)};let b,w=!1;const C=()=>{if(b=void 0,w)return;P();const t=u();for(const o of document.querySelectorAll(G)){const p=t.get(o.dataset.messageId??"");if(!p||o.querySelector(`[${e}]`))continue;const i=o.querySelector("[data-slot='session-turn-message-content']");if(!i)continue;o.setAttribute(y,"");const g=document.createElement("div");g.setAttribute("data-peer-mount",""),g.style.display="contents",i.append(g),d.set(g,c.runWithOwner(l,()=>r.render(()=>r.createComponent(m,{located:p}),g)))}},S=()=>{w||(b??=requestAnimationFrame(C))};c.createEffect(()=>{u(),S()});const M=new MutationObserver(t=>{!w&&t.some(o=>o.addedNodes.length>0)&&C()});M.observe(document.body,{childList:!0,subtree:!0}),S(),c.onCleanup(()=>{w=!0,M.disconnect(),b!==void 0&&cancelAnimationFrame(b);for(const t of[...d.keys()])A(t);for(const t of document.querySelectorAll(`[${y}]`))t.removeAttribute(y)})}});exports.default=Z;
