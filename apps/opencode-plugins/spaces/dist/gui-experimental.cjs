"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const b=require("@opencode/plugin/gui"),u=require("effect"),K=require("solid-js"),E="data-spaces-hidden",I='[data-slot="vertical-tabs"] [data-tab-key]';function R(e,a){const r=e.defaultView;let s,d;const c=()=>{s=void 0;const l=a();for(const S of e.querySelectorAll(I)){const i=S.getAttribute("data-tab-key");i!==null&&S.toggleAttribute(E,l.has(i))}},n=()=>{s===void 0&&(s=r.requestAnimationFrame(c))};return{start(l){d?.disconnect(),d=new MutationObserver(n),d.observe(l,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["data-tab-key"]}),n()},poke:n,applyNow(){s!==void 0&&(r.cancelAnimationFrame(s),s=void 0),c()},stop(){d?.disconnect(),d=void 0,s!==void 0&&(r.cancelAnimationFrame(s),s=void 0);for(const l of e.querySelectorAll(I))l.removeAttribute(E)}}}const T=1,M=2e3,j=["🌱","🌿","🍀","🌼","🪴","🌻","🌵","🍃","🌸","🌾"];function P(e){return e.spaces[0].id}function z(e,a){const r=a.key?e.drafts.find(d=>d.tab===a.key):void 0;if(r)return r.space;const s=a.session;if(s){const d=e.assigned.find(c=>c.server===s.server&&c.id===s.id);if(d)return d.space}return P(e)}function $(e){const a=Math.max(0,e.spaces.length-1),r=Math.trunc(Number.isFinite(e.active)?e.active:0);return Math.min(Math.max(0,r),a)}function _(e=0){return{version:T,active:0,spaces:[{id:"sp_default",name:"Sessions",emoji:j[0]}],assigned:[],drafts:[]}}function q(e,a=Math.random){for(let r=0;r<50;r+=1){const s=`sp_${Math.floor(a()*2176782336).toString(36).padStart(6,"0")}`;if(!e.some(d=>d.id===s))return s}return`sp_${Date.now().toString(36)}`}function D(e,a){return{...e,spaces:[...e.spaces,a],active:e.spaces.length}}function N(e){const a=new Set(e.map(r=>r.emoji));return j.find(r=>!a.has(r))??"🌱"}function V(e,a){return{...e,active:Math.min(Math.max(0,Math.trunc(a)),Math.max(0,e.spaces.length-1))}}function H(e,a){const r=e.spaces.findIndex(s=>s.id===a);return r<0?e:V(e,r)}function C(e,a,r,s){if(!e.spaces.some(l=>l.id===r))return e;const c=[...e.assigned.filter(l=>l.server!==a.server||l.id!==a.id),{...a,space:r,at:s}],n=c.length>M?c.sort((l,S)=>l.at-S.at).slice(c.length-M):c;return{...e,assigned:n}}function J(e,a,r){if(!e.spaces.some(d=>d.id===r))return e;const s=e.drafts.filter(d=>d.tab!==a);return{...e,drafts:[...s,{tab:a,space:r}].slice(-50)}}function B(e,a){return{...e,spaces:e.spaces.map(r=>r.id===a.space?{...r,lastSession:{server:a.server,id:a.id}}:r)}}function F(e){const a=_();if(!e||!Array.isArray(e.spaces)||e.spaces.length===0)return a;const r=e.spaces.filter(n=>!!n&&typeof n.id=="string"&&n.id!=="").map((n,l)=>({id:n.id,name:typeof n.name=="string"&&n.name.trim()!==""?n.name:`Space ${l+1}`,emoji:typeof n.emoji=="string"&&n.emoji!==""?n.emoji:j[l%j.length],...typeof n.accent=="string"?{accent:n.accent}:{},...n.lastSession&&typeof n.lastSession.server=="string"&&typeof n.lastSession.id=="string"?{lastSession:n.lastSession}:{}}));if(r.length===0)return a;const s=new Set(r.map(n=>n.id)),d=(Array.isArray(e.assigned)?e.assigned:[]).filter(n=>!!n&&typeof n.server=="string"&&typeof n.id=="string"&&typeof n.space=="string"&&s.has(n.space)).map((n,l)=>({...n,at:Number.isFinite(n.at)?n.at:l})).slice(-M),c=(Array.isArray(e.drafts)?e.drafts:[]).filter(n=>!!n&&typeof n.tab=="string"&&typeof n.space=="string"&&s.has(n.space)).slice(-50);return{version:T,active:$({active:e.active??0,spaces:r}),spaces:r,assigned:d,drafts:c}}function G(e,a,r,s,d){let c=e;const n=new Set(a.map(i=>i.key)),l=c.drafts.filter(i=>!n.has(i.tab));l.length>0&&(c={...c,drafts:c.drafts.filter(i=>n.has(i.tab))});const S=c.spaces[$(c)].id;for(const i of a){if(c.drafts.some(v=>v.tab===i.key)||i.session&&c.assigned.some(v=>v.server===i.session.server&&v.id===i.session.id))continue;if(i.session&&l.length>0){const v=l[l.length-1];l.pop(),c=C(c,i.session,v.space,s),d.add(i.key);continue}const g=!d.has(i.key)&&r.has(i.key)?P(c):S;c=i.session?C(c,i.session,g,s):J(c,i.key,g),d.add(i.key)}return c}function U(e,a){const r=e.spaces[$(e)].id;return a.filter(s=>z(e,s)!==r).map(s=>s.key)}function W(e,a){return e.spaces.find(r=>r.id===a)?.lastSession}const X=`
/* Filtering: the filter marks rows, this rule is what hides them. Scoped to the sidebar list, so nothing else can match. */
[data-slot="vertical-tabs"] [data-tab-key][data-spaces-hidden] {
  display: none !important;
}
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
`;function Q(e){if(!(!e||e==="muted")&&(e==="info"||e==="success"||e==="warning"||e==="danger"))return`var(--v2-state-fg-${e})`}const Y="data-spaces-strip",Z="data-spaces-dot",L="data-spaces-track",O="data-spaces-add",ee=e=>{const r=e.querySelector('[data-slot="vertical-tabs-mount"]')?.firstElementChild;return r instanceof e.defaultView.HTMLElement?r:void 0};function te(e,a,r){let s,d=!0,c=[],n=0;const l=()=>{if(!s)return;const i=d&&c.length>=2;s.toggleAttribute("data-spaces-empty",!i);const g=s.querySelector(`[${L}]`),v=s.querySelector(`[${O}]`);!g||!v||(g.replaceChildren(...c.map((h,A)=>{const y=e.createElement("button");y.type="button",y.setAttribute(Z,h.id),y.setAttribute("role","tab"),y.textContent=h.emoji,y.setAttribute("aria-label",h.name),y.setAttribute("aria-selected",String(A===n)),y.setAttribute("title",h.name),y.classList.toggle("spaces-dot-active",A===n);const k=r(h);return k&&y.style.setProperty("--spaces-accent",k),y.addEventListener("click",w=>{w.preventDefault(),w.stopPropagation(),a.select(A)}),y})),v.hidden=!i)},S=()=>{const i=e.createElement("div");i.setAttribute(Y,""),i.setAttribute("role","tablist"),i.setAttribute("aria-label","Spaces");const g=e.createElement("div");g.setAttribute(L,"");const v=e.createElement("button");return v.type="button",v.setAttribute(O,""),v.setAttribute("aria-label","New space"),v.title="New space",v.textContent="+",v.addEventListener("click",h=>{h.preventDefault(),h.stopPropagation(),a.create()}),i.replaceChildren(g,v),i};return{place(){const i=ee(e),g=i?.querySelector('[data-slot="vertical-tabs-footer"]');return i?(s||(s=S()),(s.parentElement!==i||g&&s.nextElementSibling!==g)&&i.insertBefore(s,g??null),l(),!0):(s?.remove(),!1)},update(i,g){c=i,n=Math.max(0,Math.min(g,Math.max(0,i.length-1))),l()},enabled(i){d=i,i?this.place():s?.remove(),l()},dispose(){s?.remove(),s=void 0}}}const se=u.Schema.Struct({id:u.Schema.String,name:u.Schema.String,emoji:u.Schema.String,accent:u.Schema.optional(u.Schema.String),lastSession:u.Schema.optional(u.Schema.Struct({server:u.Schema.String,id:u.Schema.String}))}),ae=u.Schema.Struct({server:u.Schema.String,id:u.Schema.String,space:u.Schema.String,at:u.Schema.Number}),re=u.Schema.Struct({tab:u.Schema.String,space:u.Schema.String}),ne=u.Schema.Struct({version:u.Schema.Number,active:u.Schema.Number,spaces:u.Schema.Array(se),assigned:u.Schema.Array(ae),drafts:u.Schema.Array(re)}),ie=b.Plugin.define({stores:{spaces:b.Store.global(ne,_())}}),oe=b.Plugin.define({...ie,setup(e){e.add(b.Style,X);const a=()=>F(e.stores.spaces.value),r=t=>{e.stores.spaces.update(o=>{const p=t(F(o));o.version=p.version,o.active=p.active,o.spaces=p.spaces,o.assigned=p.assigned,o.drafts=p.drafts})},s=te(document,{select(t){r(o=>({...o,active:Math.max(0,Math.min(t,o.spaces.length-1))}))},create(){v()}},t=>Q(t.accent)),d=R(document,()=>new Set(U(a(),S()))),c=new Set,n=new Set;let l=!1;const S=()=>e.tabs.list().map(t=>({key:t.key,...t.active?{active:!0}:{},...t.session?{session:{server:t.session.server.id,id:t.session.id}}:{}})),i=()=>{const t=S();if(!l){for(const f of t)c.add(f.key);l=!0}const o=a(),p=G(o,t,c,Date.now(),n);p!==o&&r(()=>p),d.poke()},g=()=>document.querySelector('[data-slot="vertical-tabs"]'),v=()=>{const t=a(),o=q(t.spaces),p=N(t.spaces);r(f=>D(f,{id:o,name:`Space ${f.spaces.length+1}`,emoji:p}))};let h,A;const y=()=>{h!==void 0&&(clearInterval(h),h=void 0);const t=s.place()?document.querySelector('[data-slot="vertical-tabs-mount"]'):void 0,o=g();o&&d.start(o),i(),A?.disconnect(),A=void 0,t&&(A=new MutationObserver(()=>{document.querySelector("[data-spaces-strip]")||k()}),A.observe(t,{childList:!0}),s.place())},k=()=>{s.place()?y():h===void 0&&(h=setInterval(()=>{s.place()&&y()},400))};k(),K.onCleanup(()=>{h!==void 0&&clearInterval(h),A?.disconnect(),d.stop(),s.dispose()});const w=()=>{const t=a();s.update(t.spaces.map(o=>({id:o.id,name:o.name,emoji:o.emoji,...o.accent?{accent:o.accent}:{}})),t.active)};b.createKeyed(()=>{const t=e.stores.spaces.value;return`${(Array.isArray(t.spaces)?t.spaces:[]).map(p=>`${p?.id}:${p?.name}:${p?.emoji}:${p?.accent??""}`).join("|")}#${t.active}`},()=>w()),w(),b.createKeyed(()=>{const t=e.stores.spaces.value,o=Array.isArray(t.spaces)?t.spaces:[],p=Array.isArray(t.assigned)?t.assigned:[],f=Array.isArray(t.drafts)?t.drafts:[],x=e.tabs.list();return[o.map(m=>m?.id).join("|"),t.active,p.map(m=>`${m?.server}/${m?.id}=${m?.space}`).join("|"),f.map(m=>`${m?.tab}=${m?.space}`).join("|"),x.map(m=>`${m.key}:${m.active?"a":""}:${m.session?`${m.session.server.id}/${m.session.id}`:""}`).join("|")].join("#")},()=>i()),b.createKeyed(()=>{const t=e.stores.spaces.value,o=Array.isArray(t.spaces)?t.spaces:[];return`${o[$({active:t.active,spaces:o})]?.id??""}`},t=>{if(!t)return;const o=W(a(),t);if(!o)return;const p=e.tabs.list().find(f=>f.session?.server.id===o.server&&f.session?.id===o.id);p&&!p.active&&e.tabs.focus(p.key)}),b.createKeyed(()=>{const t=e.sessions.current();return t?`${t.server.id}/${t.id}`:""},()=>{const t=e.sessions.current();if(!t)return;const o=a(),p=o.spaces[$(o)].id,f=o.assigned.find(m=>m.server===t.server.id&&m.id===t.id);if(!f||f.space!==p)return;const x=o.spaces.find(m=>m.id===p)?.lastSession;x?.server===t.server.id&&x?.id===t.id||r(m=>B(m,{server:t.server.id,id:t.id,space:p}))}),i(),e.add(b.Command,()=>({id:"spaces.new",title:"New space…",section:"general",keywords:"spaces group sessions arc",async run(){const t=a(),o=await e.dialogs.prompt({title:"Name this space",placeholder:`Space ${t.spaces.length+1}`});if(o===void 0)return;const p=q(t.spaces);r(f=>D(f,{id:p,name:o.trim()===""?`Space ${f.spaces.length+1}`:o.trim(),emoji:N(f.spaces)}))}})),e.add(b.Command,()=>{if(!(a().spaces.length<2))return{id:"spaces.switch",title:"Switch space…",section:"general",keywords:"spaces",async run(){const o=a(),p=await e.dialogs.select({title:"Switch space",options:o.spaces.map(f=>({title:`${f.emoji}  ${f.name}`,value:f.id}))});p!==void 0&&r(f=>H(f,p))}}})}});exports.default=oe;
