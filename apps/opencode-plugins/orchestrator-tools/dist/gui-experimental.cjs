"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const n=require("solid-js/web"),q=require("@opencode/plugin/gui"),h=require("solid-js"),Q="peerMessage";function X(r){if(r.type!=="user")return;const p=r.metadata?.[Q];if(!p||typeof p!="object")return;const{sessionID:c,title:y,ref:$,text:u}=p;if(!(typeof c!="string"||typeof y!="string"||typeof $!="string"||typeof u!="string"))return{sessionID:c,title:y,ref:$,text:u}}const Z=/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;function ee(r){return r.split(Z).map((p,c)=>c%2===1?p:p.replace(/&/g,"&amp;").replace(/</g,"&lt;")).join("")}var te=n.template('<div><button type=button data-slot=peer-trigger></button><span data-slot=peer-dir aria-hidden=true><svg viewBox="0 0 16 16"fill=none><path d="M5 6.44V11H9.56M5 11L11 5"stroke=currentColor></path></svg></span><span data-slot=peer-name></span><div data-slot=peer-text></div><span data-slot=peer-tail><span data-slot=peer-arrow aria-hidden=true>');const E="[data-timeline-row='UserMessage'][data-message-id]",oe="[data-slot='session-timeline-scroll']",S="data-peer-row",e="data-peer-card",ne=`
[${S}] [data-component="user-message"] { display: none; }
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
/* 16px catalog box, vertically centred on the 20px line; the arrow's ink starts 5px inside the box, so the box sits 5px left of the 12px content edge and its ink lines up with it. */
[${e}] [data-slot="peer-dir"] { position: relative; flex: none; width: 16px; height: 16px; margin: 2px -4px 2px -5px; color: var(--v2-text-text-faint); pointer-events: none; }
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
/* The host's Markdown is 14px/22.4px with its own block margins. The row's text is the row's type (13px/20px), so the first line
   shares the title's baseline, and no block brings margin of its own: spacing between blocks is set here. */
[${e}] [data-slot="peer-text"] [data-component="markdown"] { margin: 0; padding: 0; font: inherit; letter-spacing: inherit; }
[${e}] [data-slot="peer-text"] :is(p, ul, ol, blockquote, pre, table, hr, h1, h2, h3, h4, h5, h6, [data-component="markdown-code"]) { margin: 0; }
[${e}] [data-slot="peer-text"] :is(p, ul, ol, blockquote, pre, table, hr, h1, h2, h3, h4, h5, h6, [data-component="markdown-code"]) + :is(p, ul, ol, blockquote, pre, table, hr, h1, h2, h3, h4, h5, h6, [data-component="markdown-code"]) { margin-top: 8px; }
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
[${e}] .peer-open { position: relative; z-index: 1; margin-block: -2px; opacity: 0; transition: none; color: var(--v2-text-text-faint); }
[${e}]:is(:hover, :focus-within) .peer-open, [${e}][data-open="true"] .peer-open { opacity: 1; }
@media (hover: none) { [${e}] .peer-open, [${e}] [data-slot="peer-arrow"] { opacity: 1; } }
`,re=q.Plugin.define({i18n:{en:{open:"Open session"}},setup(r){r.add(q.Style,ne);const p=h.getOwner(),c=h.createMemo(()=>{const t=new Map;for(const o of r.sessions.list())for(const i of o.server.data.session.message.list(o.id)){const a=X(i);a&&t.set(i.id,{peer:a,server:o.server.id})}return t}),y=t=>r.tabs.open({server:t.server,id:t.peer.sessionID},{focus:!0}),$=t=>{const o=()=>t.located.peer,i=`peer-text-${h.createUniqueId()}`,[a,l]=h.createSignal(!1),[f,_]=h.createSignal(!1);let F,b;const A=()=>{if(a())return;const d=b.querySelectorAll("[data-markdown-block] > *"),s=d[0];s&&_(d.length>1||s.scrollHeight>s.clientHeight+1||s.scrollWidth>s.clientWidth+1)},W=new ResizeObserver(A),j=new MutationObserver(A);h.onCleanup(()=>{W.disconnect(),j.disconnect()}),queueMicrotask(()=>{W.observe(b),j.observe(b,{childList:!0,subtree:!0}),A(),document.fonts?.ready.then(A)});const J=()=>l(!a()),V=d=>{if(!f())return;const s=d.target;s.closest(".peer-open, a, button:not([data-slot='peer-trigger'])")||a()&&s.closest("[data-slot='peer-text']")||J()};return(()=>{var d=te(),s=d.firstChild,Y=s.nextSibling,T=Y.nextSibling,w=T.nextSibling,D=w.nextSibling,G=D.firstChild,L=F;typeof L=="function"?n.use(L,d):F=d,n.spread(d,n.mergeProps({[e]:""},{get"data-open"(){return a()},get"data-expandable"(){return f()},onClick:V}),!1,!0),n.setAttribute(s,"aria-controls",i),n.insert(T,()=>o().title);var P=b;return typeof P=="function"?n.use(P,w):b=w,n.setAttribute(w,"id",i),n.insert(w,n.createComponent(r.ui.Markdown,{get text(){return ee(o().text)}})),n.insert(G,n.createComponent(r.ui.Icon,{name:"fill-triangle-down",size:"small"})),n.insert(D,n.createComponent(r.ui.Tooltip,{get value(){return r.t("open")},get children(){return n.createComponent(r.ui.IconButton,{class:"peer-open",icon:"chevron-right",variant:"ghost",get label(){return`${r.t("open")} ${o().title}`},onClick:()=>y(t.located)})}}),null),n.effect(g=>{var H=a(),K=o().title,B=o().title;return H!==g.e&&n.setAttribute(s,"aria-expanded",g.e=H),K!==g.t&&n.setAttribute(s,"aria-label",g.t=K),B!==g.a&&n.setAttribute(T,"title",g.a=B),g},{e:void 0,t:void 0,a:void 0}),d})()};for(const t of document.querySelectorAll("[data-peer-mount]"))t.remove();const u=new Map,I=t=>{u.get(t)?.(),u.delete(t),t.remove()},N=()=>{for(const t of[...u.keys()])t.isConnected||I(t)};let k,x=!1;const C=(t,o)=>{const i=o.get(t.dataset.messageId??"");if(!i||t.querySelector(`[${e}]`))return!0;const a=t.querySelector("[data-slot='session-turn-message-content']");if(!a)return!1;t.setAttribute(S,"");const l=document.createElement("div");return l.setAttribute("data-peer-mount",""),l.style.display="contents",a.append(l),u.set(l,h.runWithOwner(p,()=>n.render(()=>n.createComponent($,{located:i}),l))),!0},U=()=>{if(k=void 0,x)return;N();const t=c();if(t.size!==0)for(const o of m)for(const i of o.querySelectorAll(E))C(i,t)},M=()=>{x||(k??=requestAnimationFrame(U))},m=new Set,R=new MutationObserver(t=>{if(x)return;const o=c();if(o.size===0)return;let i=!1;for(const a of t)for(const l of a.addedNodes){if(l.nodeType!==1)continue;const f=l;if(f.matches(E))i||=!C(f,o);else if(f.firstElementChild)for(const _ of f.querySelectorAll(E))i||=!C(_,o)}i&&M()});let v;const z=t=>{if(v=void 0,!x){for(const o of m)o.isConnected||m.delete(o);for(const o of document.querySelectorAll(oe))m.has(o)||(m.add(o),R.observe(o,{childList:!0,subtree:!0}),M());t>0&&(v=requestAnimationFrame(()=>z(t-1)))}},O=()=>{v===void 0&&!x&&(v=requestAnimationFrame(()=>z(12)))};q.createKeyed(c,M),q.createKeyed(()=>r.sessions.current()?.key,O,{otherwise:O}),O(),h.onCleanup(()=>{x=!0,R.disconnect(),m.clear(),k!==void 0&&cancelAnimationFrame(k),v!==void 0&&cancelAnimationFrame(v);for(const t of[...u.keys()])I(t);for(const t of document.querySelectorAll(`[${S}]`))t.removeAttribute(S)})}});exports.default=re;
