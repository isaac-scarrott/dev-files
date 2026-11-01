"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const x=require("solid-js/web"),b=require("@opencode/plugin/gui"),m=require("solid-js"),R='[data-component="session-composer-lane"]',K='[data-slot="session-chat-panel"]';function P(e=document){const n=Array.from(e.querySelectorAll(R));return n.length>1?n.find(r=>r.getClientRects().length>0):n[0]}const U=45,j=120;function W(e,n,r=P){let t=0,a=0,i=0,f=!1;const h=new Set,s=new MutationObserver(()=>{!e.isConnected&&!t&&l()}),c=g=>{const T=[g.parentElement,g.closest(K)?.parentElement];for(const v of T)!v||h.has(v)||(h.add(v),s.observe(v,{childList:!0}))},p=()=>{const g=r();return g?(e.parentElement!==g&&g.append(e),c(g),f||(f=!0,n?.()),!0):!1},l=()=>{a=0,i=0,t=requestAnimationFrame(w)},w=()=>{t=0,!(e.isConnected?++i>=U:!p()&&++a>j)&&(t=requestAnimationFrame(w))};return l(),()=>{cancelAnimationFrame(t),s.disconnect(),e.remove()}}function G(e,n,r,t=r*8+2e3){let a=0,i,f,h=!1;const s=()=>{h||(h=!0,cancelAnimationFrame(a),clearTimeout(i),clearTimeout(f),e.removeEventListener("transitionend",c),e.removeEventListener("transitioncancel",c),n())},c=p=>{p.target===e&&p.propertyName==="opacity"&&s()};return e.addEventListener("transitionend",c),e.addEventListener("transitioncancel",c),a=requestAnimationFrame(()=>{i=setTimeout(s,r)}),f=setTimeout(s,t),s}const J=5,Q=2e4,C=(e,n)=>typeof e=="number"&&Number.isFinite(e)&&e>0?e:n;function Y(e){return{ttlMs:C(e?.cacheTtlMinutes,J)*6e4,minTokens:C(e?.minTokens,Q)}}function k(e){if(typeof e=="number")return Number.isFinite(e)?e:void 0;if(e instanceof Date)return e.getTime();if(typeof e=="string"){const n=Date.parse(e);return Number.isNaN(n)?void 0:n}if(e&&typeof e=="object"&&"epochMillis"in e)return k(e.epochMillis)}function B(e){return e.input+e.output+e.reasoning+e.cache.read+e.cache.write}function H(e){return k(e.time?.created)??k(e.time?.streamed)??k(e.time?.completed)}function L(e){return e&&e!=="default"?e:""}function N(e,n){return e.startsWith(`${n}/`)?e.slice(n.length+1):e}function V(e){const n=e.messages;let r=!1,t;for(let p=n.length-1;p>=0;p--){const l=n[p];if(l){if(l.type==="user")return{};if(l.type==="compaction"&&l.status==="completed"&&(r=!0),l.type==="assistant"){if(!l.tokens){if(k(l.time?.completed)===void 0)return{};continue}t=l;break}}}const a=t?.tokens;if(!t||!a)return{};const i=B(a);if(i<e.config.minTokens)return{};if(r)return{notice:{kind:"compacted"}};if(a.cache.read+a.cache.write===0)return{};const f=H(t);if(f===void 0)return{};const h=f+e.config.ttlMs;if(e.now>=h)return{notice:{kind:"expired",tokens:i}};const s=e.selection,c=t.model;return s&&c&&(s.providerID!==c.providerID||N(s.modelID,s.providerID)!==N(c.id,c.providerID)||L(s.variant)!==L(c.variant))?{notice:{kind:"model",tokens:i}}:{expiresAt:h}}function X(e,n){return new Intl.NumberFormat(n,{notation:"compact",maximumFractionDigits:0}).format(e).toLocaleLowerCase(n)}const Z=250,ee=1500;function te(e,n={set:(r,t)=>setTimeout(r,t),clear:r=>clearTimeout(r)}){let r,t;const a=()=>{n.clear(t),t=void 0};return{watch(i,f){if(a(),!i){r=void 0;return}i!==r&&(t=n.set(()=>{t=void 0,r=i,e(i)},f?Z:ee))},stop:a}}const ne=.4,q=2*Math.PI/ne;function O(e){return 1-(1+q*e)*Math.exp(-q*e)}const re=.01,D=(()=>{let e=0;for(;1-O(e)>re;)e+=.001;return e})();function $(e,n=24){return`linear(${Array.from({length:n+1},(t,a)=>{const i=a===n?1:O(a/n*D);return Number(e(i).toFixed(4))}).join(", ")})`}const oe=e=>e,ae=e=>e*e,ie=e=>Math.max(0,(e-.6)/.4),_=$(oe),se=$(ae),ce=$(ie),E=`${D.toFixed(3)}s`,de=`
[data-component="session-composer-lane"]:has(> [data-cache-warning]) {
  flex-wrap: wrap-reverse;
}
[data-cache-warning] {
  --cw-tuck: 14px;
  position: relative;
  z-index: 0;
  display: block;
  box-sizing: border-box;
  flex: 0 0 100%;
  order: -1;
  min-width: 0;
  width: 100%;
  margin-inline: 0;
  border-width: 0.5px;
  margin-bottom: calc(-10px - var(--cw-tuck));
  padding: 6px calc(16px - 0.5px) calc(var(--cw-tuck) + 4px);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  font-size: 13px;
  font-weight: 440;
  line-height: var(--line-height-compact);
  text-wrap: pretty;
  color: var(--v2-text-text-muted);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  transform: translateY(calc(100% - var(--cw-tuck)));
  opacity: 0;
  transition: none;
}
[data-cache-warning][data-state="open"] {
  transform: none;
  opacity: 1;
  transition: transform ${E} ${_}, opacity ${E} ${se};
}
[data-cache-warning][data-state="closing"] {
  transition: transform ${E} ${_}, opacity ${E} ${ce};
}
[data-cache-warning][data-state="rest"] {
  transform: none;
  opacity: 1;
}
[data-cache-warning] [data-cache-warning-lead] {
  font-weight: 530;
  color: var(--v2-text-text-base);
}
:root[data-motion="reduce"] [data-cache-warning] {
  transform: none;
  transition: opacity 150ms linear !important;
}
@media (prefers-reduced-motion: reduce) {
  [data-cache-warning] {
    transform: none;
    transition: opacity 150ms linear !important;
  }
}
`;var le=x.template("<span data-cache-warning-lead>");const ue=e=>e?`${e.providerID}/${e.modelID}/${e.variant??""}`:"",M=e=>e&&"tokens"in e?e.tokens:0,me=b.Plugin.define({i18n:{en:{"expired.lead":"Cache expired","expired.rest":"next message re-reads ~{{tokens}} tokens","model.lead":"Cache reset","model.rest":"model changed · next message re-reads ~{{tokens}} tokens","compacted.lead":"Cache reset","compacted.rest":"compacted · next message writes a new cache"}},setup(e){const n=Y(e.options);e.add(b.Style,de);const r=m.createMemo(()=>e.sessions.current()),t=m.createMemo(()=>r()?.key),a=()=>{const o=r();return o?.id?o.server.data.session.message.list(o.id):[]},i=m.createMemo(()=>{const o=e.screen.current()?.composer.model();return o&&{providerID:o.providerID,modelID:o.modelID,variant:o.variant}},void 0,{equals:(o,d)=>o?.providerID===d?.providerID&&o?.modelID===d?.modelID&&(o?.variant??"")===(d?.variant??"")}),[f,h]=m.createSignal(0),s=m.createMemo(()=>(f(),V({messages:a(),now:Date.now(),config:n,selection:i()}))),c=m.createMemo(()=>s().notice,void 0,{equals:(o,d)=>o?.kind===d?.kind&&M(o)===M(d)}),[p,l]=m.createSignal();let w=!1;const g=te(o=>{w=!0,l(o),w=!1});m.onCleanup(g.stop),b.createKeyed(()=>a().length>0&&t()?`${t()}|${ue(i())}|${c()?.kind??""}`:void 0,()=>g.watch(t(),i()!==void 0),{otherwise:()=>(g.watch(void 0,!1),l(void 0))});const T=m.createMemo(()=>t()&&p()===t()?c():void 0,void 0,{equals:(o,d)=>o?.kind===d?.kind&&M(o)===M(d)});b.createKeyed(()=>s().expiresAt,o=>{let d;const u=()=>{const y=o-Date.now();y>0?d=setTimeout(u,Math.min(y,2147483647)):h(I=>I+1)};u(),m.onCleanup(()=>clearTimeout(d))});const v=new Set;m.onCleanup(()=>v.forEach(o=>o())),b.createKeyed(()=>t()&&T()?t():void 0,o=>{v.forEach(z=>z());const d=!w,u=document.createElement("div");u.setAttribute("data-cache-warning",""),u.setAttribute("data-dock-surface","tray"),u.setAttribute("role","status"),u.setAttribute("data-state",d?"closed":"rest");const y=x.render(()=>x.createComponent(fe,{notice:T,get locale(){return e.locale.locale},get t(){return e.t}}),u),I=W(u,()=>{d&&requestAnimationFrame(()=>u.getAttribute("data-state")==="closed"&&u.setAttribute("data-state","open"))});let S=()=>{},F=!1;const A=()=>{F||(F=!0,v.delete(A),S(),I(),y())};m.onCleanup(()=>{if(e.signal.aborted||t()!==o||!u.isConnected)return A();u.setAttribute("data-state","closing"),v.add(A),S=G(u,A,D*1e3+50)})})}});function fe(e){const n=m.createMemo(r=>{const t=e.notice();if(!t)return r;const a={tokens:"tokens"in t?X(t.tokens,e.locale()):""};return{lead:e.t(`${t.kind}.lead`,a),rest:e.t(`${t.kind}.rest`,a)}});return[(()=>{var r=le();return x.insert(r,()=>n()?.lead),r})()," · ",x.memo(()=>n()?.rest)]}exports.default=me;
