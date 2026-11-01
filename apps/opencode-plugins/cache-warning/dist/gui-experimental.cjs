"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const y=require("solid-js/web"),v=require("@opencode/plugin/gui"),g=require("solid-js"),j=require("@opencode/plugin/rpc"),R='[data-component="session-composer-lane"]',z='[data-slot="session-chat-panel"]';function P(e=document){const t=Array.from(e.querySelectorAll(R));return t.length>1?t.find(n=>n.getClientRects().length>0):t[0]}const U=45,W=120;function K(e,t,n=P){let o=0,i=0,a=0,s=!1;const f=new Set,u=new MutationObserver(()=>{!e.isConnected&&!o&&m()}),c=r=>{const d=[r.parentElement,r.closest(z)?.parentElement];for(const l of d)!l||f.has(l)||(f.add(l),u.observe(l,{childList:!0}))},p=()=>{const r=n();return r?(e.parentElement!==r&&r.append(e),c(r),s||(s=!0,t?.()),!0):!1},m=()=>{i=0,a=0,o=requestAnimationFrame(h)},h=()=>{o=0,!(e.isConnected?++a>=U:!p()&&++i>W)&&(o=requestAnimationFrame(h))};return m(),()=>{cancelAnimationFrame(o),u.disconnect(),e.remove()}}function G(e){for(let t=e.length-1;t>=0;t--){const n=_(e[t],0);if(n)return n}}function _(e,t){if(!e||typeof e!="object"||t>6)return;const n=e,o=n.native;if(o&&typeof o=="object"){const a=o.sessionID;if(typeof a=="string"&&a)return a}const i=Array.isArray(e)?[...e].reverse():Object.values(n);for(const a of i){const s=_(a,t+1);if(s)return s}}const J=65*6e4,Y={"5m":5*6e4,"1h":60*6e4};function B(e,t,n){return!n||t-n.at>J?e.ttlMs:Y[n.ttl]}function w(e){if(typeof e=="number")return Number.isFinite(e)?e:void 0;if(e instanceof Date)return e.getTime();if(typeof e=="string"){const t=Date.parse(e);return Number.isNaN(t)?void 0:t}if(e&&typeof e=="object"&&"epochMillis"in e)return w(e.epochMillis)}function H(e){return e.input+e.output+e.reasoning+e.cache.read+e.cache.write}function Q(e){return w(e.time?.created)??w(e.time?.streamed)??w(e.time?.completed)}function M(e){return e&&e!=="default"?e:""}function S(e,t){return e.startsWith(`${t}/`)?e.slice(t.length+1):e}function V(e){const t=e.messages;let n=!1,o;for(let p=t.length-1;p>=0;p--){const m=t[p];if(m){if(m.type==="user")return{};if(m.type==="compaction"&&m.status==="completed"&&(n=!0),m.type==="assistant"){if(!m.tokens){if(w(m.time?.completed)===void 0)return{};continue}o=m;break}}}const i=o?.tokens;if(!o||!i)return{};const a=H(i);if(a<e.config.minTokens)return{};if(n)return{notice:{kind:"compacted"}};if(i.cache.read+i.cache.write===0)return{};const s=Q(o);if(s===void 0)return{};const f=s+B(e.config,s,e.learned);if(e.now>=f)return{notice:{kind:"expired",tokens:a}};const u=e.selection,c=o.model;return u&&c&&(u.providerID!==c.providerID||S(u.modelID,u.providerID)!==S(c.id,c.providerID)||M(u.variant)!==M(c.variant))?{notice:{kind:"model",tokens:a}}:{expiresAt:f}}function X(e){for(let t=e.length-1;t>=0;t--){const n=e[t];if(n?.type==="assistant"&&n.tokens)return n}}function Z(e,t){return new Intl.NumberFormat(t,{notation:"compact",maximumFractionDigits:0}).format(e).toLocaleLowerCase(t)}function ee(e,t,n){const o=()=>{const a=e(),s=X(t());return a&&s?.id?`${a}
${s.id}`:void 0},i=v.createLatest(o,async(a,s)=>{const[f]=a.split(`
`),u=G(t()),c=await n({sessionID:f,...u?{nativeSessionID:u}:{}},s);return{key:a,learned:c.ttl&&typeof c.at=="number"?{ttl:c.ttl,at:c.at}:void 0}});return()=>i.latest?.key===o()?i.latest?.learned:void 0}function te(e,t,n,o=n*8+2e3){let i=0,a,s,f=!1;const u=()=>{f||(f=!0,cancelAnimationFrame(i),clearTimeout(a),clearTimeout(s),e.removeEventListener("transitionend",c),e.removeEventListener("transitioncancel",c),t())},c=p=>{p.target===e&&p.propertyName==="opacity"&&u()};return e.addEventListener("transitionend",c),e.addEventListener("transitioncancel",c),i=requestAnimationFrame(()=>{a=setTimeout(u,n)}),s=setTimeout(u,o),u}const ne=5,re=2e4,L=(e,t)=>typeof e=="number"&&Number.isFinite(e)&&e>0?e:t;function oe(e){return{ttlMs:L(e?.cacheTtlMinutes,ne)*6e4,minTokens:L(e?.minTokens,re)}}const $={type:"string",minLength:1},ie=j.Rpc.define({id:"cache-warning",methods:{learn:{input:{type:"object",properties:{sessionID:$,nativeSessionID:$},required:["sessionID"],additionalProperties:!1},output:{type:"object",properties:{ttl:{type:"string",enum:["5m","1h"]},at:{type:"number"}},additionalProperties:!1}}},events:{}}),ae=.4,F=2*Math.PI/ae;function q(e){return 1-(1+F*e)*Math.exp(-F*e)}const se=.01,D=(()=>{let e=0;for(;1-q(e)>se;)e+=.001;return e})();function I(e,t=24){return`linear(${Array.from({length:t+1},(o,i)=>{const a=i===t?1:q(i/t*D);return Number(e(a).toFixed(4))}).join(", ")})`}const ce=e=>e,de=e=>e*e,le=e=>Math.max(0,(e-.6)/.4),N=I(ce),ue=I(de),me=I(le),x=`${D.toFixed(3)}s`,fe=`
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
  transition: transform ${x} ${N}, opacity ${x} ${ue};
}
[data-cache-warning][data-state="closing"] {
  transition: transform ${x} ${N}, opacity ${x} ${me};
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
`;var pe=y.template("<span data-cache-warning-lead>");const C=e=>e&&"tokens"in e?e.tokens:0,ge=v.Plugin.define({i18n:{en:{"expired.lead":"Cache expired","expired.rest":"next message re-reads ~{{tokens}} tokens","model.lead":"Cache reset","model.rest":"model changed · next message re-reads ~{{tokens}} tokens","compacted.lead":"Cache reset","compacted.rest":"compacted · next message writes a new cache"}},setup(e){const t=oe(e.options);e.add(v.Style,fe);const n=g.createMemo(()=>e.sessions.current()),o=g.createMemo(()=>n()?.key),i=()=>{const r=n();return r?.id?r.server.data.session.message.list(r.id):[]},a=ee(()=>n()?.id,i,(r,d)=>e.client.rpc(ie).learn(r,{signal:d}));let s=performance.now();g.createMemo(r=>{const d=i().length>0?o():void 0;return d!==r&&(s=performance.now()),d});const f=g.createMemo(()=>{const r=e.screen.current()?.composer.model();return r&&{providerID:r.providerID,modelID:r.modelID,variant:r.variant}},void 0,{equals:(r,d)=>r?.providerID===d?.providerID&&r?.modelID===d?.modelID&&(r?.variant??"")===(d?.variant??"")}),[u,c]=g.createSignal(0),p=g.createMemo(()=>(u(),V({messages:i(),now:Date.now(),config:t,selection:f(),learned:a()}))),m=g.createMemo(()=>p().notice,void 0,{equals:(r,d)=>r?.kind===d?.kind&&C(r)===C(d)});v.createKeyed(()=>p().expiresAt,r=>{let d;const l=()=>{const b=r-Date.now();b>0?d=setTimeout(l,Math.min(b,2147483647)):c(A=>A+1)};l(),g.onCleanup(()=>clearTimeout(d))});const h=new Set;g.onCleanup(()=>h.forEach(r=>r())),v.createKeyed(()=>o()&&m()?o():void 0,r=>{h.forEach(O=>O());const d=performance.now()-s>250,l=document.createElement("div");l.setAttribute("data-cache-warning",""),l.setAttribute("data-dock-surface","tray"),l.setAttribute("role","status"),l.setAttribute("data-state",d?"closed":"rest");const b=y.render(()=>y.createComponent(he,{notice:m,get locale(){return e.locale.locale},get t(){return e.t}}),l),A=K(l,()=>{d&&requestAnimationFrame(()=>l.getAttribute("data-state")==="closed"&&l.setAttribute("data-state","open"))});let E=()=>{},T=!1;const k=()=>{T||(T=!0,h.delete(k),E(),A(),b())};g.onCleanup(()=>{if(e.signal.aborted||o()!==r||!l.isConnected)return k();l.setAttribute("data-state","closing"),h.add(k),E=te(l,k,D*1e3+50)})})}});function he(e){const t=g.createMemo(n=>{const o=e.notice();if(!o)return n;const i={tokens:"tokens"in o?Z(o.tokens,e.locale()):""};return{lead:e.t(`${o.kind}.lead`,i),rest:e.t(`${o.kind}.rest`,i)}});return[(()=>{var n=pe();return y.insert(n,()=>t()?.lead),n})()," · ",y.memo(()=>t()?.rest)]}exports.default=ge;
