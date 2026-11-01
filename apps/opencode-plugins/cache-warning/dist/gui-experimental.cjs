"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const v=require("solid-js/web"),k=require("@opencode/plugin/gui"),f=require("solid-js"),_='[data-component="session-composer-lane"]',q='[data-slot="session-chat-panel"]';function O(e=document){const t=Array.from(e.querySelectorAll(_));return t.length>1?t.find(i=>i.getClientRects().length>0):t[0]}const z=45,R=120;function P(e,t,i=O){let r=0,a=0,m=0,p=!1;const g=new Set,d=new MutationObserver(()=>{!e.isConnected&&!r&&s()}),l=o=>{const c=[o.parentElement,o.closest(q)?.parentElement];for(const h of c)!h||g.has(h)||(g.add(h),d.observe(h,{childList:!0}))},u=()=>{const o=i();return o?(e.parentElement!==o&&o.append(e),l(o),p||(p=!0,t?.()),!0):!1},s=()=>{a=0,m=0,r=requestAnimationFrame(n)},n=()=>{r=0,!(e.isConnected?++m>=z:!u()&&++a>R)&&(r=requestAnimationFrame(n))};return s(),()=>{cancelAnimationFrame(r),d.disconnect(),e.remove()}}function U(e,t,i,r=i*8+2e3){let a=0,m,p,g=!1;const d=()=>{g||(g=!0,cancelAnimationFrame(a),clearTimeout(m),clearTimeout(p),e.removeEventListener("transitionend",l),e.removeEventListener("transitioncancel",l),t())},l=u=>{u.target===e&&u.propertyName==="opacity"&&d()};return e.addEventListener("transitionend",l),e.addEventListener("transitioncancel",l),a=requestAnimationFrame(()=>{m=setTimeout(d,i)}),p=setTimeout(d,r),d}const j=5,K=2e4,D=(e,t)=>typeof e=="number"&&Number.isFinite(e)&&e>0?e:t;function W(e){return{ttlMs:D(e?.cacheTtlMinutes,j)*6e4,minTokens:D(e?.minTokens,K)}}function w(e){if(typeof e=="number")return Number.isFinite(e)?e:void 0;if(e instanceof Date)return e.getTime();if(typeof e=="string"){const t=Date.parse(e);return Number.isNaN(t)?void 0:t}if(e&&typeof e=="object"&&"epochMillis"in e)return w(e.epochMillis)}function G(e){return e.input+e.output+e.reasoning+e.cache.read+e.cache.write}function J(e){return w(e.time?.created)??w(e.time?.streamed)??w(e.time?.completed)}function I(e){return e&&e!=="default"?e:""}function F(e,t){return e.startsWith(`${t}/`)?e.slice(t.length+1):e}function Y(e){const t=e.messages;let i=!1,r;for(let u=t.length-1;u>=0;u--){const s=t[u];if(s){if(s.type==="user")return{};if(s.type==="compaction"&&s.status==="completed"&&(i=!0),s.type==="assistant"){if(!s.tokens){if(w(s.time?.completed)===void 0)return{};continue}r=s;break}}}const a=r?.tokens;if(!r||!a)return{};const m=G(a);if(m<e.config.minTokens)return{};if(i)return{notice:{kind:"compacted"}};if(a.cache.read+a.cache.write===0)return{};const p=J(r);if(p===void 0)return{};const g=p+e.config.ttlMs;if(e.now>=g)return{notice:{kind:"expired",tokens:m}};const d=e.selection,l=r.model;return d&&l&&(d.providerID!==l.providerID||F(d.modelID,d.providerID)!==F(l.id,l.providerID)||I(d.variant)!==I(l.variant))?{notice:{kind:"model",tokens:m}}:{expiresAt:g}}function B(e,t){return new Intl.NumberFormat(t,{notation:"compact",maximumFractionDigits:0}).format(e).toLocaleLowerCase(t)}const H=.4,$=2*Math.PI/H;function N(e){return 1-(1+$*e)*Math.exp(-$*e)}const Q=.01,A=(()=>{let e=0;for(;1-N(e)>Q;)e+=.001;return e})();function T(e,t=24){return`linear(${Array.from({length:t+1},(r,a)=>{const m=a===t?1:N(a/t*A);return Number(e(m).toFixed(4))}).join(", ")})`}const V=e=>e,X=e=>e*e,Z=e=>Math.max(0,(e-.6)/.4),L=T(V),ee=T(X),te=T(Z),x=`${A.toFixed(3)}s`,ne=`
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
  transition: transform ${x} ${L}, opacity ${x} ${ee};
}
[data-cache-warning][data-state="closing"] {
  transition: transform ${x} ${L}, opacity ${x} ${te};
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
`;var re=v.template("<span data-cache-warning-lead>");const S=e=>e&&"tokens"in e?e.tokens:0,oe=k.Plugin.define({i18n:{en:{"expired.lead":"Cache expired","expired.rest":"next message re-reads ~{{tokens}} tokens","model.lead":"Cache reset","model.rest":"model changed · next message re-reads ~{{tokens}} tokens","compacted.lead":"Cache reset","compacted.rest":"compacted · next message writes a new cache"}},setup(e){const t=W(e.options);e.add(k.Style,ne);const i=f.createMemo(()=>e.sessions.current()),r=f.createMemo(()=>i()?.key),a=()=>{const n=i();return n?.id?n.server.data.session.message.list(n.id):[]};let m=performance.now();f.createMemo(n=>{const o=a().length>0?r():void 0;return o!==n&&(m=performance.now()),o});const p=f.createMemo(()=>{const n=e.screen.current()?.composer.model();return n&&{providerID:n.providerID,modelID:n.modelID,variant:n.variant}},void 0,{equals:(n,o)=>n?.providerID===o?.providerID&&n?.modelID===o?.modelID&&(n?.variant??"")===(o?.variant??"")}),[g,d]=f.createSignal(0),l=f.createMemo(()=>(g(),Y({messages:a(),now:Date.now(),config:t,selection:p()}))),u=f.createMemo(()=>l().notice,void 0,{equals:(n,o)=>n?.kind===o?.kind&&S(n)===S(o)});k.createKeyed(()=>l().expiresAt,n=>{let o;const c=()=>{const h=n-Date.now();h>0?o=setTimeout(c,Math.min(h,2147483647)):d(y=>y+1)};c(),f.onCleanup(()=>clearTimeout(o))});const s=new Set;f.onCleanup(()=>s.forEach(n=>n())),k.createKeyed(()=>r()&&u()?r():void 0,n=>{s.forEach(C=>C());const o=performance.now()-m>250,c=document.createElement("div");c.setAttribute("data-cache-warning",""),c.setAttribute("data-dock-surface","tray"),c.setAttribute("role","status"),c.setAttribute("data-state",o?"closed":"rest");const h=v.render(()=>v.createComponent(ae,{notice:u,get locale(){return e.locale.locale},get t(){return e.t}}),c),y=P(c,()=>{o&&requestAnimationFrame(()=>c.getAttribute("data-state")==="closed"&&c.setAttribute("data-state","open"))});let E=()=>{},M=!1;const b=()=>{M||(M=!0,s.delete(b),E(),y(),h())};f.onCleanup(()=>{if(e.signal.aborted||r()!==n||!c.isConnected)return b();c.setAttribute("data-state","closing"),s.add(b),E=U(c,b,A*1e3+50)})})}});function ae(e){const t=f.createMemo(i=>{const r=e.notice();if(!r)return i;const a={tokens:"tokens"in r?B(r.tokens,e.locale()):""};return{lead:e.t(`${r.kind}.lead`,a),rest:e.t(`${r.kind}.rest`,a)}});return[(()=>{var i=re();return v.insert(i,()=>t()?.lead),i})()," · ",v.memo(()=>t()?.rest)]}exports.default=oe;
