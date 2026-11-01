"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const w=require("solid-js/web"),k=require("@opencode/plugin/gui"),m=require("solid-js"),C='[data-component="session-composer-lane"]',N='[data-slot="session-chat-panel"]';function L(e=document){const n=Array.from(e.querySelectorAll(C));return n.length>1?n.find(i=>i.getClientRects().length>0):n[0]}const _=45,q=120;function O(e,n,i=L){let r=0,a=0,d=0,g=!1;const h=new Set,l=new MutationObserver(()=>{!e.isConnected&&!r&&s()}),u=o=>{const c=[o.parentElement,o.closest(N)?.parentElement];for(const p of c)!p||h.has(p)||(h.add(p),l.observe(p,{childList:!0}))},f=()=>{const o=i();return o?(e.parentElement!==o&&o.append(e),u(o),g||(g=!0,n?.()),!0):!1},s=()=>{a=0,d=0,r=requestAnimationFrame(t)},t=()=>{r=0,!(e.isConnected?++d>=_:!f()&&++a>q)&&(r=requestAnimationFrame(t))};return s(),()=>{cancelAnimationFrame(r),l.disconnect(),e.remove()}}const z=5,R=2e4,E=(e,n)=>typeof e=="number"&&Number.isFinite(e)&&e>0?e:n;function P(e){return{ttlMs:E(e?.cacheTtlMinutes,z)*6e4,minTokens:E(e?.minTokens,R)}}function x(e){if(typeof e=="number")return Number.isFinite(e)?e:void 0;if(e instanceof Date)return e.getTime();if(typeof e=="string"){const n=Date.parse(e);return Number.isNaN(n)?void 0:n}if(e&&typeof e=="object"&&"epochMillis"in e)return x(e.epochMillis)}function U(e){return e.input+e.output+e.reasoning+e.cache.read+e.cache.write}function j(e){return x(e.time?.completed)??x(e.time?.streamed)??x(e.time?.created)}function K(e){const n=e.messages;let i=!1,r;for(let f=n.length-1;f>=0;f--){const s=n[f];if(s){if(s.type==="user")return{};if(s.type==="compaction"&&s.status==="completed"&&(i=!0),s.type==="assistant"){if(!s.tokens)return{};r=s;break}}}const a=r?.tokens;if(!r||!a)return{};const d=U(a);if(d<e.config.minTokens)return{};if(i)return{notice:{kind:"compacted"}};if(a.cache.read+a.cache.write===0)return{};const g=j(r);if(g===void 0)return{};const h=g+e.config.ttlMs;if(e.now>=h)return{notice:{kind:"expired",tokens:d}};const l=e.selection,u=r.model;return l&&u&&(l.providerID!==u.providerID||l.modelID!==u.id||(l.variant??"")!==(u.variant??""))?{notice:{kind:"model",tokens:d}}:{expiresAt:h}}function G(e,n){return new Intl.NumberFormat(n,{notation:"compact",maximumFractionDigits:0}).format(e).toLocaleLowerCase(n)}const J=.4,D=2*Math.PI/J;function $(e){return 1-(1+D*e)*Math.exp(-D*e)}const W=.01,A=(()=>{let e=0;for(;1-$(e)>W;)e+=.001;return e})();function M(e,n=24){return`linear(${Array.from({length:n+1},(r,a)=>{const d=a===n?1:$(a/n*A);return Number(e(d).toFixed(4))}).join(", ")})`}const Y=e=>e,B=e=>e*e,H=e=>Math.max(0,(e-.6)/.4),I=M(Y),Q=M(B),V=M(H),v=`${A.toFixed(3)}s`,X=`
[data-cache-warning] {
  --cw-tuck: 14px;
  position: relative;
  z-index: 0;
  display: block;
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  margin-inline: 14px;
  border-width: 0.5px;
  margin-bottom: calc(-10px - var(--cw-tuck));
  padding: 6px 12px calc(var(--cw-tuck) + 4px);
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
  transition: transform ${v} ${I}, opacity ${v} ${Q};
}
[data-cache-warning][data-state="closing"] {
  transition: transform ${v} ${I}, opacity ${v} ${V};
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
`;var Z=w.template("<span data-cache-warning-lead>");const S=e=>e&&"tokens"in e?e.tokens:0,ee=k.Plugin.define({i18n:{en:{"expired.lead":"Cache expired","expired.rest":"next message re-reads ~{{tokens}} tokens","model.lead":"Cache reset","model.rest":"model changed · next message re-reads ~{{tokens}} tokens","compacted.lead":"Cache reset","compacted.rest":"compacted · next message writes a new cache"}},setup(e){const n=P(e.options);e.add(k.Style,X);const i=m.createMemo(()=>e.sessions.current()),r=m.createMemo(()=>i()?.key),a=()=>{const t=i();return t?.id?t.server.data.session.message.list(t.id):[]};let d=performance.now();m.createMemo(t=>{const o=a().length>0?r():void 0;return o!==t&&(d=performance.now()),o});const g=m.createMemo(()=>{const t=e.screen.current()?.composer.model();return t&&{providerID:t.providerID,modelID:t.modelID,variant:t.variant}},void 0,{equals:(t,o)=>t?.providerID===o?.providerID&&t?.modelID===o?.modelID&&(t?.variant??"")===(o?.variant??"")}),[h,l]=m.createSignal(0),u=m.createMemo(()=>(h(),K({messages:a(),now:Date.now(),config:n,selection:g()}))),f=m.createMemo(()=>u().notice,void 0,{equals:(t,o)=>t?.kind===o?.kind&&S(t)===S(o)});k.createKeyed(()=>u().expiresAt,t=>{let o;const c=()=>{const p=t-Date.now();p>0?o=setTimeout(c,Math.min(p,2147483647)):l(y=>y+1)};c(),m.onCleanup(()=>clearTimeout(o))});const s=new Set;m.onCleanup(()=>s.forEach(t=>t())),k.createKeyed(()=>r()&&f()?r():void 0,t=>{s.forEach(F=>F());const o=performance.now()-d>250,c=document.createElement("div");c.setAttribute("data-cache-warning",""),c.setAttribute("data-dock-surface","tray"),c.setAttribute("role","status"),c.setAttribute("data-state",o?"closed":"rest");const p=w.render(()=>w.createComponent(te,{notice:f,get locale(){return e.locale.locale},get t(){return e.t}}),c),y=O(c,()=>{o&&requestAnimationFrame(()=>c.getAttribute("data-state")==="closed"&&c.setAttribute("data-state","open"))});let T;const b=()=>{s.delete(b),clearTimeout(T),y(),p()};m.onCleanup(()=>{if(e.signal.aborted||r()!==t||!c.isConnected)return b();c.setAttribute("data-state","closing"),s.add(b),T=setTimeout(b,A*1e3+50)})})}});function te(e){const n=m.createMemo(i=>{const r=e.notice();if(!r)return i;const a={tokens:"tokens"in r?G(r.tokens,e.locale()):""};return{lead:e.t(`${r.kind}.lead`,a),rest:e.t(`${r.kind}.rest`,a)}});return[(()=>{var i=Z();return w.insert(i,()=>n()?.lead),i})()," · ",w.memo(()=>n()?.rest)]}exports.default=ee;
