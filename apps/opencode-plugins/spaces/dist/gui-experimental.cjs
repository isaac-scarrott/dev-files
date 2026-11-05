"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const f=require("@opencode/plugin/gui"),c=require("effect"),$=require("solid-js"),k=1,h=["🌱","🌿","🍀","🌼","🪴","🌻","🌵","🍃","🌸","🌾"];function C(e){const r=Math.max(0,e.spaces.length-1),i=Math.trunc(Number.isFinite(e.active)?e.active:0);return Math.min(Math.max(0,i),r)}function E(e=0){return{version:k,active:0,spaces:[{id:"sp_default",name:"Sessions",emoji:h[0]}],assigned:[],drafts:[]}}function y(e,r=Math.random){for(let i=0;i<50;i+=1){const n=`sp_${Math.floor(r()*2176782336).toString(36).padStart(6,"0")}`;if(!e.some(m=>m.id===n))return n}return`sp_${Date.now().toString(36)}`}function x(e,r){return{...e,spaces:[...e.spaces,r],active:e.spaces.length}}function w(e){const r=new Set(e.map(i=>i.emoji));return h.find(i=>!r.has(i))??"🌱"}function N(e,r){return{...e,active:Math.min(Math.max(0,Math.trunc(r)),Math.max(0,e.spaces.length-1))}}function q(e,r){const i=e.spaces.findIndex(n=>n.id===r);return i<0?e:N(e,i)}function A(e){const r=E();if(!e||!Array.isArray(e.spaces)||e.spaces.length===0)return r;const i=e.spaces.filter(t=>!!t&&typeof t.id=="string"&&t.id!=="").map((t,p)=>({id:t.id,name:typeof t.name=="string"&&t.name.trim()!==""?t.name:`Space ${p+1}`,emoji:typeof t.emoji=="string"&&t.emoji!==""?t.emoji:h[p%h.length],...typeof t.accent=="string"?{accent:t.accent}:{},...t.lastSession&&typeof t.lastSession.server=="string"&&typeof t.lastSession.id=="string"?{lastSession:t.lastSession}:{}}));if(i.length===0)return r;const n=new Set(i.map(t=>t.id)),m=(Array.isArray(e.assigned)?e.assigned:[]).filter(t=>!!t&&typeof t.server=="string"&&typeof t.id=="string"&&typeof t.space=="string"&&n.has(t.space)).map((t,p)=>({...t,at:Number.isFinite(t.at)?t.at:p})).slice(-2e3),l=(Array.isArray(e.drafts)?e.drafts:[]).filter(t=>!!t&&typeof t.tab=="string"&&typeof t.space=="string"&&n.has(t.space)).slice(-50);return{version:k,active:C({active:e.active??0,spaces:i}),spaces:i,assigned:m,drafts:l}}const I=`
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
`;function D(e){if(!(!e||e==="muted")&&(e==="info"||e==="success"||e==="warning"||e==="danger"))return`var(--v2-state-fg-${e})`}const P="data-spaces-strip",L="data-spaces-dot",M="data-spaces-track",j="data-spaces-add",T=e=>{const i=e.querySelector('[data-slot="vertical-tabs-mount"]')?.firstElementChild;return i instanceof e.defaultView.HTMLElement?i:void 0};function _(e,r,i){let n,m=!0,l=[],t=0;const p=()=>{if(!n)return;const a=m&&l.length>=2;n.toggleAttribute("data-spaces-empty",!a);const s=n.querySelector(`[${M}]`),o=n.querySelector(`[${j}]`);!s||!o||(s.replaceChildren(...l.map((d,v)=>{const u=e.createElement("button");u.type="button",u.setAttribute(L,d.id),u.setAttribute("role","tab"),u.textContent=d.emoji,u.setAttribute("aria-label",d.name),u.setAttribute("aria-selected",String(v===t)),u.setAttribute("title",d.name),u.classList.toggle("spaces-dot-active",v===t);const S=i(d);return S&&u.style.setProperty("--spaces-accent",S),u.addEventListener("click",b=>{b.preventDefault(),b.stopPropagation(),r.select(v)}),u})),o.hidden=!a)},g=()=>{const a=e.createElement("div");a.setAttribute(P,""),a.setAttribute("role","tablist"),a.setAttribute("aria-label","Spaces");const s=e.createElement("div");s.setAttribute(M,"");const o=e.createElement("button");return o.type="button",o.setAttribute(j,""),o.setAttribute("aria-label","New space"),o.title="New space",o.textContent="+",o.addEventListener("click",d=>{d.preventDefault(),d.stopPropagation(),r.create()}),a.replaceChildren(s,o),a};return{place(){const a=T(e),s=a?.querySelector('[data-slot="vertical-tabs-footer"]');return a?(n||(n=g()),(n.parentElement!==a||s&&n.nextElementSibling!==s)&&a.insertBefore(n,s??null),p(),!0):(n?.remove(),!1)},update(a,s){l=a,t=Math.max(0,Math.min(s,Math.max(0,a.length-1))),p()},enabled(a){m=a,a?this.place():n?.remove(),p()},dispose(){n?.remove(),n=void 0}}}const O=c.Schema.Struct({id:c.Schema.String,name:c.Schema.String,emoji:c.Schema.String,accent:c.Schema.optional(c.Schema.String),lastSession:c.Schema.optional(c.Schema.Struct({server:c.Schema.String,id:c.Schema.String}))}),z=c.Schema.Struct({server:c.Schema.String,id:c.Schema.String,space:c.Schema.String,at:c.Schema.Number}),F=c.Schema.Struct({tab:c.Schema.String,space:c.Schema.String}),R=c.Schema.Struct({version:c.Schema.Number,active:c.Schema.Number,spaces:c.Schema.Array(O),assigned:c.Schema.Array(z),drafts:c.Schema.Array(F)}),J=f.Plugin.define({stores:{spaces:f.Store.global(R,E())}}),K=f.Plugin.define({...J,setup(e){e.add(f.Style,I);const r=()=>A(e.stores.spaces.value),i=a=>{e.stores.spaces.update(s=>{const o=a(A(s));s.version=o.version,s.active=o.active,s.spaces=o.spaces,s.assigned=o.assigned,s.drafts=o.drafts})},n=_(document,{select(a){i(s=>({...s,active:Math.max(0,Math.min(a,s.spaces.length-1))}))},create(){m()}},a=>D(a.accent)),m=()=>{const a=r(),s=y(a.spaces),o=w(a.spaces);i(d=>x(d,{id:s,name:`Space ${d.spaces.length+1}`,emoji:o}))};let l,t;const p=()=>{l!==void 0&&(clearInterval(l),l=void 0);const a=n.place()?document.querySelector('[data-slot="vertical-tabs-mount"]'):void 0;t?.disconnect(),t=void 0,a&&(t=new MutationObserver(()=>{document.querySelector("[data-spaces-strip]")||g()}),t.observe(a,{childList:!0}),n.place())},g=()=>{n.place()?p():l===void 0&&(l=setInterval(()=>{n.place()&&p()},400))};g(),$.onCleanup(()=>{l!==void 0&&clearInterval(l),t?.disconnect(),n.dispose()}),f.createKeyed(()=>e.stores.spaces.value,()=>{const a=r();n.update(a.spaces.map(s=>({id:s.id,name:s.name,emoji:s.emoji,...s.accent?{accent:s.accent}:{}})),a.active)}),n.update(r().spaces.map(a=>({id:a.id,name:a.name,emoji:a.emoji,...a.accent?{accent:a.accent}:{}})),r().active),e.add(f.Command,()=>({id:"spaces.new",title:"New space…",section:"general",keywords:"spaces group sessions arc",async run(){const a=r(),s=await e.dialogs.prompt({title:"Name this space",placeholder:`Space ${a.spaces.length+1}`});if(s===void 0)return;const o=y(a.spaces);i(d=>x(d,{id:o,name:s.trim()===""?`Space ${d.spaces.length+1}`:s.trim(),emoji:w(d.spaces)}))}})),e.add(f.Command,()=>{if(!(r().spaces.length<2))return{id:"spaces.switch",title:"Switch space…",section:"general",keywords:"spaces",async run(){const s=r(),o=await e.dialogs.select({title:"Switch space",options:s.spaces.map(d=>({title:`${d.emoji}  ${d.name}`,value:d.id}))});o!==void 0&&i(d=>q(d,o))}}})}});exports.default=K;
