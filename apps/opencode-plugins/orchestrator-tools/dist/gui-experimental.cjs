"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const n=require("solid-js/web"),T=require("@opencode/plugin/gui"),f=require("solid-js");function Z(r){for(let i=r.parentElement;i;i=i.parentElement){const{overflowY:d}=getComputedStyle(i);if((d==="auto"||d==="scroll")&&i.scrollHeight>i.clientHeight)return i}}function ee(r,i,d,h){const b=i.getBoundingClientRect().top,w=performance.now();let g=0,y=!1;const O=()=>{const E=i.getBoundingClientRect().top-b;Math.abs(E)>.01&&(r.scrollTop+=E)},m=new ResizeObserver(O);m.observe(d);const u=()=>{y||(y=!0,cancelAnimationFrame(g),m.disconnect())},$=()=>{y||(O(),performance.now()-w<h?g=requestAnimationFrame($):u())};return $(),u}const te="peerMessage";function oe(r){if(r.type!=="user")return;const i=r.metadata?.[te];if(!i||typeof i!="object")return;const{sessionID:d,title:h,ref:b,text:w}=i;if(!(typeof d!="string"||typeof h!="string"||typeof b!="string"||typeof w!="string"))return{sessionID:d,title:h,ref:b,text:w}}const ne=/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;function re(r){return r.split(ne).map((i,d)=>d%2===1?i:i.replace(/&/g,"&amp;").replace(/</g,"&lt;")).join("")}var ie=n.template('<div><button type=button data-slot=peer-trigger></button><span data-slot=peer-dir aria-hidden=true><svg viewBox="0 0 16 16"fill=none><path d="M5 6.44V11H9.56M5 11L11 5"stroke=currentColor></path></svg></span><span data-slot=peer-name></span><div data-slot=peer-text></div><span data-slot=peer-tail><span data-slot=peer-arrow aria-hidden=true>');const B="[data-timeline-row='UserMessage'][data-message-id]",ae="[data-slot='session-timeline-scroll']",_="data-peer-row",e="data-peer-card",se=28,le=`
[${_}] [data-component="user-message"] { display: none; }
[${e}] {
  position: relative; box-sizing: border-box; display: flex; align-items: flex-start; gap: 8px;
  width: fit-content; max-width: 100%; min-width: 0; padding: 8px 12px;
  border-radius: 8px; background: var(--v2-background-bg-layer-02);
  font: 440 13px/20px var(--v2-font-family-sans, inherit); letter-spacing: -0.04px; color: var(--v2-text-text-base);
}
[${e}] [data-slot="peer-trigger"] {
  position: absolute; inset: 0; z-index: 0; margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent;
}
[${e}]:not([data-expandable="true"]) [data-slot="peer-trigger"] { display: none; }
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
/* The trailing slot is the host task-tool-action, copied: collapsed it takes no room (width 0, and a negative margin cancels
   the row's 8px gap), and on hover or focus it grows, fades in and slides from 4px left over 150ms ease, so the row's width grows
   the way the host row's does (+18px for a bare chevron). The 24px button's 4px side padding hangs outside the 16px slot (overflow-clip-margin), so its chevron sits exactly where
   the host's does. With the expand triangle in front the slot is 34px (16 triangle + 2 + 16 chevron). */
[${e}] [data-slot="peer-tail"] {
  position: relative; flex: none; display: flex; align-items: center; gap: 2px; box-sizing: border-box; height: 20px;
  width: 0; margin-inline: -8px 0; opacity: 0; color: var(--v2-text-text-faint); transform: translate(-4px); overflow: clip; overflow-clip-margin: 4px;
  transition: width 150ms, margin-inline-start 150ms, opacity 150ms, color 150ms, transform 150ms;
}
:root[data-motion="reduce"] [${e}] [data-slot="peer-tail"], :root[data-motion="reduce"] [${e}] [data-slot="peer-arrow"] svg { transition: none; }
[${e}]:is(:hover, :focus-within, :has([data-slot="peer-trigger"]:focus-visible)) [data-slot="peer-tail"],
[${e}][data-open="true"] [data-slot="peer-tail"] { opacity: 1; transform: none; width: 16px; margin-inline: -6px 0; }
[${e}][data-expandable="true"]:is(:hover, :focus-within, :has([data-slot="peer-trigger"]:focus-visible)) [data-slot="peer-tail"],
[${e}][data-open="true"] [data-slot="peer-tail"] { width: 34px; margin-inline: -6px 0; }
[${e}] [data-slot="peer-arrow"] { display: flex; flex: none; align-items: center; justify-content: center; width: 16px; height: 20px; color: var(--v2-text-text-faint); pointer-events: none; }
[${e}] [data-slot="peer-arrow"] svg { transform: rotate(-90deg); transition: transform 150ms ease; }
[${e}][data-open="true"] [data-slot="peer-arrow"] svg { transform: rotate(0); }
[${e}]:not([data-expandable="true"]) [data-slot="peer-arrow"] { display: none; }
[${e}] .peer-open { position: relative; flex: none; z-index: 1; margin: -2px -4px; transition: none; color: var(--v2-text-text-faint); }
@media (hover: none) { [${e}] [data-slot="peer-tail"] { opacity: 1; transform: none; width: 16px; margin-inline: -6px 0; } [${e}][data-expandable="true"] [data-slot="peer-tail"] { width: 34px; } }
`,de=T.Plugin.define({i18n:{en:{open:"Open session"}},setup(r){r.add(T.Style,le);const i=f.getOwner(),d=f.createMemo(()=>{const t=new Map;for(const o of r.sessions.list())for(const s of o.server.data.session.message.list(o.id)){const p=oe(s);p&&t.set(s.id,{id:s.id,peer:p,server:o.server.id})}return t}),h=new Set,b=t=>r.tabs.open({server:t.server,id:t.peer.sessionID},{focus:!0}),w=t=>{const o=()=>t.located.peer,s=`peer-text-${f.createUniqueId()}`,[p,c]=f.createSignal(h.has(t.located.id)),[x,F]=f.createSignal(!1);let S,q;const R=()=>{if(p())return;const l=q.querySelectorAll("[data-markdown-block] > *"),a=l[0];a&&F(l.length>1||a.scrollHeight>a.clientHeight+1||a.scrollWidth>a.clientWidth+1)},L=new ResizeObserver(R),P=new MutationObserver(R);f.onCleanup(()=>{L.disconnect(),P.disconnect()}),queueMicrotask(()=>{L.observe(q),P.observe(q,{childList:!0,subtree:!0}),R(),document.fonts?.ready.then(R)});let H;f.onCleanup(()=>H?.());const G=()=>{const l=Z(S),a=S.querySelector("[data-slot='peer-name']");H?.(),l&&a&&(H=ee(l,a,S,400));const C=!p();C?h.add(t.located.id):h.delete(t.located.id),c(C)},Q=l=>{if(!x())return;const a=l.target;if(!a.closest(".peer-open, a, button:not([data-slot='peer-trigger'])")){if(p()&&a.closest("[data-slot='peer-text']")){const C=S.getBoundingClientRect().top+se;if(l.clientY>C||getSelection()?.toString())return}G()}};return(()=>{var l=ie(),a=l.firstChild,C=a.nextSibling,W=C.nextSibling,M=W.nextSibling,K=M.nextSibling,X=K.firstChild,Y=S;typeof Y=="function"?n.use(Y,l):S=l,n.spread(l,n.mergeProps({[e]:""},{get"data-open"(){return p()},get"data-expandable"(){return x()},onClick:Q}),!1,!0),n.setAttribute(a,"aria-controls",s),n.insert(W,()=>o().title);var N=q;return typeof N=="function"?n.use(N,M):q=M,n.setAttribute(M,"id",s),n.insert(M,n.createComponent(r.ui.Markdown,{get text(){return re(o().text)}})),n.insert(X,n.createComponent(r.ui.Icon,{name:"fill-triangle-down",size:"small"})),n.insert(K,n.createComponent(r.ui.Tooltip,{get value(){return r.t("open")},get children(){return n.createComponent(r.ui.IconButton,{class:"peer-open",icon:"chevron-right",variant:"ghost",get label(){return`${r.t("open")} ${o().title}`},onClick:()=>b(t.located)})}}),null),n.effect(v=>{var U=p(),J=o().title,V=o().title;return U!==v.e&&n.setAttribute(a,"aria-expanded",v.e=U),J!==v.t&&n.setAttribute(a,"aria-label",v.t=J),V!==v.a&&n.setAttribute(W,"title",v.a=V),v},{e:void 0,t:void 0,a:void 0}),l})()};for(const t of document.querySelectorAll("[data-peer-mount]"))t.remove();const g=new Map,y=t=>{g.get(t)?.(),g.delete(t),t.remove()},O=()=>{for(const t of[...g.keys()])t.isConnected||y(t)};let m,u=!1;const $=(t,o)=>{const s=o.get(t.dataset.messageId??"");if(!s||t.querySelector(`[${e}]`))return!0;const p=t.querySelector("[data-slot='session-turn-message-content']");if(!p)return!1;t.setAttribute(_,"");const c=document.createElement("div");return c.setAttribute("data-peer-mount",""),c.style.display="contents",p.append(c),g.set(c,f.runWithOwner(i,()=>n.render(()=>n.createComponent(w,{located:s}),c))),!0},E=()=>{if(m=void 0,u)return;O();const t=d();if(t.size!==0)for(const o of k)for(const s of o.querySelectorAll(B))$(s,t)},z=()=>{u||(m??=requestAnimationFrame(E))},k=new Set,D=new MutationObserver(t=>{if(u)return;const o=d();if(o.size===0)return;let s=!1;for(const p of t)for(const c of p.addedNodes){if(c.nodeType!==1)continue;const x=c;if(x.matches(B))s||=!$(x,o);else if(x.firstElementChild)for(const F of x.querySelectorAll(B))s||=!$(F,o)}s&&z()});let A;const j=t=>{if(A=void 0,!u){for(const o of k)o.isConnected||k.delete(o);for(const o of document.querySelectorAll(ae))k.has(o)||(k.add(o),D.observe(o,{childList:!0,subtree:!0}),z());t>0&&(A=requestAnimationFrame(()=>j(t-1)))}},I=()=>{A===void 0&&!u&&(A=requestAnimationFrame(()=>j(12)))};T.createKeyed(d,z),T.createKeyed(()=>r.sessions.current()?.key,I,{otherwise:I}),I(),f.onCleanup(()=>{u=!0,D.disconnect(),k.clear(),m!==void 0&&cancelAnimationFrame(m),A!==void 0&&cancelAnimationFrame(A);for(const t of[...g.keys()])y(t);for(const t of document.querySelectorAll(`[${_}]`))t.removeAttribute(_)})}});exports.default=de;
