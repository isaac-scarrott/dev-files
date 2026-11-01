"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const r=require("solid-js/web"),S=require("@opencode/plugin/gui"),f=require("solid-js"),Q="peerMessage";function X(n){if(n.type!=="user")return;const p=n.metadata?.[Q];if(!p||typeof p!="object")return;const{sessionID:c,title:y,ref:$,text:u}=p;if(!(typeof c!="string"||typeof y!="string"||typeof $!="string"||typeof u!="string"))return{sessionID:c,title:y,ref:$,text:u}}const Z=/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;function ee(n){return n.split(Z).map((p,c)=>c%2===1?p:p.replace(/&/g,"&amp;").replace(/</g,"&lt;")).join("")}var te=r.template('<div><button type=button data-slot=peer-trigger></button><span data-slot=peer-dir aria-hidden=true><svg viewBox="0 0 16 16"fill=none><path d="M5 6.44V11H9.56M5 11L11 5"stroke=currentColor></path></svg></span><span data-slot=peer-name></span><div data-slot=peer-text></div><span data-slot=peer-tail><span data-slot=peer-arrow aria-hidden=true>');const I="[data-timeline-row='UserMessage'][data-message-id]",oe="[data-slot='session-timeline-scroll']",C="data-peer-row",e="data-peer-card",re=`
[${C}] [data-component="user-message"] { display: none; }
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
/* Instant, as the host's basic-tool-action is; the host icon button has its own opacity .15s transition, which would fade this reveal. */
[${e}] .peer-open { position: relative; z-index: 1; margin-block: -2px; opacity: 0; transition: none; }
[${e}]:is(:hover, :focus-within) .peer-open, [${e}][data-open="true"] .peer-open { opacity: 1; }
@media (hover: none) { [${e}] .peer-open, [${e}] [data-slot="peer-arrow"] { opacity: 1; } }
`,ne=S.Plugin.define({i18n:{en:{open:"Open session"}},setup(n){n.add(S.Style,re);const p=f.getOwner(),c=f.createMemo(()=>{const t=new Map;for(const o of n.sessions.list())for(const a of o.server.data.session.message.list(o.id)){const i=X(a);i&&t.set(a.id,{peer:i,server:o.server.id})}return t}),y=t=>n.tabs.open({server:t.server,id:t.peer.sessionID},{focus:!0}),$=t=>{const o=()=>t.located.peer,a=`peer-text-${f.createUniqueId()}`,[i,l]=f.createSignal(!1),[g,_]=f.createSignal(!1);let F,b;const A=()=>{if(i())return;const d=b.querySelectorAll("[data-markdown-block] > *"),s=d[0];s&&_(d.length>1||s.scrollHeight>s.clientHeight+1||s.scrollWidth>s.clientWidth+1)},W=new ResizeObserver(A),j=new MutationObserver(A);f.onCleanup(()=>{W.disconnect(),j.disconnect()}),queueMicrotask(()=>{W.observe(b),j.observe(b,{childList:!0,subtree:!0}),A(),document.fonts?.ready.then(A)});const J=()=>l(!i()),V=d=>{if(!g())return;const s=d.target;s.closest(".peer-open, a, button:not([data-slot='peer-trigger'])")||i()&&s.closest("[data-slot='peer-text']")||J()};return(()=>{var d=te(),s=d.firstChild,Y=s.nextSibling,E=Y.nextSibling,w=E.nextSibling,D=w.nextSibling,G=D.firstChild,L=F;typeof L=="function"?r.use(L,d):F=d,r.spread(d,r.mergeProps({[e]:""},{get"data-open"(){return i()},get"data-expandable"(){return g()},onClick:V}),!1,!0),r.setAttribute(s,"aria-controls",a),r.insert(E,()=>o().title);var P=b;return typeof P=="function"?r.use(P,w):b=w,r.setAttribute(w,"id",a),r.insert(w,r.createComponent(n.ui.Markdown,{get text(){return ee(o().text)}})),r.insert(G,r.createComponent(n.ui.Icon,{name:"fill-triangle-down",size:"small"})),r.insert(D,r.createComponent(n.ui.Tooltip,{get value(){return n.t("open")},get children(){return r.createComponent(n.ui.IconButton,{class:"peer-open",icon:"arrow-up-right",variant:"ghost",get label(){return`${n.t("open")} ${o().title}`},onClick:()=>y(t.located)})}}),null),r.effect(h=>{var H=i(),K=o().title,B=o().title;return H!==h.e&&r.setAttribute(s,"aria-expanded",h.e=H),K!==h.t&&r.setAttribute(s,"aria-label",h.t=K),B!==h.a&&r.setAttribute(E,"title",h.a=B),h},{e:void 0,t:void 0,a:void 0}),d})()};for(const t of document.querySelectorAll("[data-peer-mount]"))t.remove();const u=new Map,R=t=>{u.get(t)?.(),u.delete(t),t.remove()},N=()=>{for(const t of[...u.keys()])t.isConnected||R(t)};let k,v=!1;const q=(t,o)=>{const a=o.get(t.dataset.messageId??"");if(!a||t.querySelector(`[${e}]`))return!0;const i=t.querySelector("[data-slot='session-turn-message-content']");if(!i)return!1;t.setAttribute(C,"");const l=document.createElement("div");return l.setAttribute("data-peer-mount",""),l.style.display="contents",i.append(l),u.set(l,f.runWithOwner(p,()=>r.render(()=>r.createComponent($,{located:a}),l))),!0},U=()=>{if(k=void 0,v)return;N();const t=c();if(t.size!==0)for(const o of m)for(const a of o.querySelectorAll(I))q(a,t)},M=()=>{v||(k??=requestAnimationFrame(U))},m=new Set,T=new MutationObserver(t=>{if(v)return;const o=c();if(o.size===0)return;let a=!1;for(const i of t)for(const l of i.addedNodes){if(l.nodeType!==1)continue;const g=l;if(g.matches(I))a||=!q(g,o);else if(g.firstElementChild)for(const _ of g.querySelectorAll(I))a||=!q(_,o)}a&&M()});let x;const z=t=>{if(x=void 0,!v){for(const o of m)o.isConnected||m.delete(o);for(const o of document.querySelectorAll(oe))m.has(o)||(m.add(o),T.observe(o,{childList:!0,subtree:!0}),M());t>0&&(x=requestAnimationFrame(()=>z(t-1)))}},O=()=>{x===void 0&&!v&&(x=requestAnimationFrame(()=>z(12)))};S.createKeyed(c,M),S.createKeyed(()=>n.sessions.current()?.key,O,{otherwise:O}),O(),f.onCleanup(()=>{v=!0,T.disconnect(),m.clear(),k!==void 0&&cancelAnimationFrame(k),x!==void 0&&cancelAnimationFrame(x);for(const t of[...u.keys()])R(t);for(const t of document.querySelectorAll(`[${C}]`))t.removeAttribute(C)})}});exports.default=ne;
