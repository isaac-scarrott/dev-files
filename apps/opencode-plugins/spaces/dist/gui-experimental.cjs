"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const g=require("@opencode/plugin/gui"),o=require("effect"),E=require("solid-js"),k=1,v=["🌱","🌿","🍀","🌼","🪴","🌻","🌵","🍃","🌸","🌾"];function C(e){const c=Math.max(0,e.spaces.length-1),r=Math.trunc(Number.isFinite(e.active)?e.active:0);return Math.min(Math.max(0,r),c)}function $(e=0){return{version:k,active:0,spaces:[{id:"sp_default",name:"Sessions",emoji:v[0]}],assigned:[],drafts:[]}}function y(e,c=Math.random){for(let r=0;r<50;r+=1){const n=`sp_${Math.floor(c()*2176782336).toString(36).padStart(6,"0")}`;if(!e.some(f=>f.id===n))return n}return`sp_${Date.now().toString(36)}`}function x(e,c){return{...e,spaces:[...e.spaces,c],active:e.spaces.length}}function A(e){const c=new Set(e.map(r=>r.emoji));return v.find(r=>!c.has(r))??"🌱"}function N(e,c){return{...e,active:Math.min(Math.max(0,Math.trunc(c)),Math.max(0,e.spaces.length-1))}}function q(e,c){const r=e.spaces.findIndex(n=>n.id===c);return r<0?e:N(e,r)}function w(e){const c=$();if(!e||!Array.isArray(e.spaces)||e.spaces.length===0)return c;const r=e.spaces.filter(t=>!!t&&typeof t.id=="string"&&t.id!=="").map((t,u)=>({id:t.id,name:typeof t.name=="string"&&t.name.trim()!==""?t.name:`Space ${u+1}`,emoji:typeof t.emoji=="string"&&t.emoji!==""?t.emoji:v[u%v.length],...typeof t.accent=="string"?{accent:t.accent}:{},...t.lastSession&&typeof t.lastSession.server=="string"&&typeof t.lastSession.id=="string"?{lastSession:t.lastSession}:{}}));if(r.length===0)return c;const n=new Set(r.map(t=>t.id)),f=(Array.isArray(e.assigned)?e.assigned:[]).filter(t=>!!t&&typeof t.server=="string"&&typeof t.id=="string"&&typeof t.space=="string"&&n.has(t.space)).map((t,u)=>({...t,at:Number.isFinite(t.at)?t.at:u})).slice(-2e3),p=(Array.isArray(e.drafts)?e.drafts:[]).filter(t=>!!t&&typeof t.tab=="string"&&typeof t.space=="string"&&n.has(t.space)).slice(-50);return{version:k,active:C({active:e.active??0,spaces:r}),spaces:r,assigned:f,drafts:p}}const I=`
[data-spaces-strip] {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 28px;
  margin: 2px 8px 2px;
  padding: 0 2px;
  flex: 0 0 auto;
}
[data-spaces-strip][data-spaces-empty] {
  display: none;
}
[data-spaces-track] {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
[data-spaces-track]::-webkit-scrollbar {
  display: none;
}
[data-spaces-dot] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  font-family: var(--v2-font-family-sans, inherit);
  font-size: 13px;
  line-height: 1;
  opacity: 0.55;
  transition: opacity 140ms ease, background-color 140ms ease, border-color 140ms ease;
}
[data-spaces-dot]:hover {
  opacity: 0.85;
  background: var(--v2-overlay-simple-overlay-hover, rgba(127, 127, 127, 0.12));
}
[data-spaces-dot].spaces-dot-active {
  opacity: 1;
  background: var(--v2-background-bg-layer-02, rgba(127, 127, 127, 0.16));
  border-color: var(--spaces-accent, var(--v2-border-border-base, rgba(127, 127, 127, 0.35)));
}
[data-spaces-add] {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--v2-text-text-faint, inherit);
  font-family: var(--v2-font-family-sans, inherit);
  font-size: 15px;
  line-height: 1;
  opacity: 0;
  transition: opacity 140ms ease;
}
[data-spaces-strip]:hover [data-spaces-add],
[data-spaces-add]:focus-visible {
  opacity: 0.7;
}
[data-spaces-add]:hover {
  opacity: 1;
  background: var(--v2-overlay-simple-overlay-hover, rgba(127, 127, 127, 0.12));
}
@media (prefers-reduced-motion: reduce) {
  [data-spaces-dot], [data-spaces-add] { transition: none; }
}
`;function D(e){if(!(!e||e==="muted")&&(e==="info"||e==="success"||e==="warning"||e==="danger"))return`var(--v2-state-fg-${e})`}const P="data-spaces-strip",L="data-spaces-dot",M="data-spaces-track",j="data-spaces-add",T=e=>{const r=e.querySelector('[data-slot="vertical-tabs-mount"]')?.firstElementChild;return r instanceof e.defaultView.HTMLElement?r:void 0};function _(e,c,r){let n,f=!0,p=[],t=0;const u=()=>{if(!n)return;const d=f&&p.length>=2;n.toggleAttribute("data-spaces-empty",!d);const s=n.querySelector(`[${M}]`),a=n.querySelector(`[${j}]`);!s||!a||(s.replaceChildren(...p.map((i,l)=>{const m=e.createElement("button");m.type="button",m.setAttribute(L,i.id),m.setAttribute("role","tab"),m.textContent=i.emoji,m.setAttribute("aria-label",i.name),m.setAttribute("aria-selected",String(l===t)),m.setAttribute("title",i.name),m.classList.toggle("spaces-dot-active",l===t);const S=r(i);return S&&m.style.setProperty("--spaces-accent",S),m.addEventListener("click",b=>{b.preventDefault(),b.stopPropagation(),c.select(l)}),m})),a.hidden=!d)},h=()=>{const d=e.createElement("div");d.setAttribute(P,""),d.setAttribute("role","tablist"),d.setAttribute("aria-label","Spaces");const s=e.createElement("div");s.setAttribute(M,"");const a=e.createElement("button");return a.type="button",a.setAttribute(j,""),a.setAttribute("aria-label","New space"),a.title="New space",a.textContent="+",a.addEventListener("click",i=>{i.preventDefault(),i.stopPropagation(),c.create()}),d.replaceChildren(s,a),d};return{place(){const d=T(e),s=d?.querySelector('[data-slot="vertical-tabs-footer"]');return d?(n||(n=h()),(n.parentElement!==d||s&&n.nextElementSibling!==s)&&d.insertBefore(n,s??null),u(),!0):(n?.remove(),!1)},update(d,s){p=d,t=Math.max(0,Math.min(s,Math.max(0,d.length-1))),u()},enabled(d){f=d,d?this.place():n?.remove(),u()},dispose(){n?.remove(),n=void 0}}}const O=o.Schema.Struct({id:o.Schema.String,name:o.Schema.String,emoji:o.Schema.String,accent:o.Schema.optional(o.Schema.String),lastSession:o.Schema.optional(o.Schema.Struct({server:o.Schema.String,id:o.Schema.String}))}),z=o.Schema.Struct({server:o.Schema.String,id:o.Schema.String,space:o.Schema.String,at:o.Schema.Number}),F=o.Schema.Struct({tab:o.Schema.String,space:o.Schema.String}),R=o.Schema.Struct({version:o.Schema.Number,active:o.Schema.Number,spaces:o.Schema.Array(O),assigned:o.Schema.Array(z),drafts:o.Schema.Array(F)}),J=g.Plugin.define({stores:{spaces:g.Store.global(R,$())}}),K=g.Plugin.define({...J,setup(e){e.add(g.Style,I);const c=()=>w(e.stores.spaces.value),r=s=>{e.stores.spaces.update(a=>{const i=s(w(a));a.version=i.version,a.active=i.active,a.spaces=i.spaces,a.assigned=i.assigned,a.drafts=i.drafts})},n=_(document,{select(s){r(a=>({...a,active:Math.max(0,Math.min(s,a.spaces.length-1))}))},create(){f()}},s=>D(s.accent)),f=()=>{const s=c(),a=y(s.spaces),i=A(s.spaces);r(l=>x(l,{id:a,name:`Space ${l.spaces.length+1}`,emoji:i}))};let p,t;const u=()=>{p!==void 0&&(clearInterval(p),p=void 0);const s=n.place()?document.querySelector('[data-slot="vertical-tabs-mount"]'):void 0;t?.disconnect(),t=void 0,s&&(t=new MutationObserver(()=>{document.querySelector("[data-spaces-strip]")||h()}),t.observe(s,{childList:!0}),n.place())},h=()=>{n.place()?u():p===void 0&&(p=setInterval(()=>{n.place()&&u()},400))};h(),E.onCleanup(()=>{p!==void 0&&clearInterval(p),t?.disconnect(),n.dispose()});const d=()=>{const s=c();n.update(s.spaces.map(a=>({id:a.id,name:a.name,emoji:a.emoji,...a.accent?{accent:a.accent}:{}})),s.active)};g.createKeyed(()=>{const s=e.stores.spaces.value;return`${(Array.isArray(s.spaces)?s.spaces:[]).map(i=>`${i?.id}:${i?.name}:${i?.emoji}:${i?.accent??""}`).join("|")}#${s.active}`},()=>d()),d(),e.add(g.Command,()=>({id:"spaces.new",title:"New space…",section:"general",keywords:"spaces group sessions arc",async run(){const s=c(),a=await e.dialogs.prompt({title:"Name this space",placeholder:`Space ${s.spaces.length+1}`});if(a===void 0)return;const i=y(s.spaces);r(l=>x(l,{id:i,name:a.trim()===""?`Space ${l.spaces.length+1}`:a.trim(),emoji:A(l.spaces)}))}})),e.add(g.Command,()=>{if(!(c().spaces.length<2))return{id:"spaces.switch",title:"Switch space…",section:"general",keywords:"spaces",async run(){const a=c(),i=await e.dialogs.select({title:"Switch space",options:a.spaces.map(l=>({title:`${l.emoji}  ${l.name}`,value:l.id}))});i!==void 0&&r(l=>q(l,i))}}})}});exports.default=K;
