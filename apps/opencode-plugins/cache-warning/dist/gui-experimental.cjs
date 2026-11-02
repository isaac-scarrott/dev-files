"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const I=require("solid-js/web"),w=require("@opencode/plugin/gui"),f=require("solid-js"),K=require("@opencode/plugin/rpc"),U='[data-component="session-composer-lane"]',W='[data-slot="session-chat-panel"]';function G(e=document){const t=Array.from(e.querySelectorAll(U));return t.length>1?t.find(n=>n.getClientRects().length>0):t[0]}const J=45,Q=120;function Y(e,t,n=G){let r=0,i=0,o=0,s=!1;const p=new Set,d=new MutationObserver(()=>{!e.isConnected&&!r&&m()}),c=h=>{const b=[h.parentElement,h.closest(W)?.parentElement];for(const v of b)!v||p.has(v)||(p.add(v),d.observe(v,{childList:!0}))},g=()=>{const h=n();return h?(e.parentElement!==h&&h.append(e),c(h),s||(s=!0,t?.()),!0):!1},m=()=>{i=0,o=0,r=requestAnimationFrame(y)},y=()=>{r=0,!(e.isConnected?++o>=J:!g()&&++i>Q)&&(r=requestAnimationFrame(y))};return m(),()=>{cancelAnimationFrame(r),d.disconnect(),e.remove()}}function B(e){for(let t=e.length-1;t>=0;t--){const n=j(e[t],0);if(n)return n}}function j(e,t){if(!e||typeof e!="object"||t>6)return;const n=e,r=n.native;if(r&&typeof r=="object"){const o=r.sessionID;if(typeof o=="string"&&o)return o}const i=Array.isArray(e)?[...e].reverse():Object.values(n);for(const o of i){const s=j(o,t+1);if(s)return s}}const H=65*6e4,V={"5m":5*6e4,"1h":60*6e4};function X(e,t,n){return!n||t-n.at>H?e.ttlMs:V[n.ttl]}function k(e){if(typeof e=="number")return Number.isFinite(e)?e:void 0;if(e instanceof Date)return e.getTime();if(typeof e=="string"){const t=Date.parse(e);return Number.isNaN(t)?void 0:t}if(e&&typeof e=="object"&&"epochMillis"in e)return k(e.epochMillis)}function Z(e){return e.input+e.output+e.reasoning+e.cache.read+e.cache.write}function ee(e){return k(e.time?.created)??k(e.time?.streamed)??k(e.time?.completed)}function N(e){return e&&e!=="default"?e:""}function C(e,t){return e.startsWith(`${t}/`)?e.slice(t.length+1):e}function te(e){const t=e.messages;let n=!1,r;for(let g=t.length-1;g>=0;g--){const m=t[g];if(m){if(m.type==="user")return{};if(m.type==="compaction"&&m.status==="completed"&&(n=!0),m.type==="assistant"){if(!m.tokens){if(k(m.time?.completed)===void 0)return{};continue}r=m;break}}}const i=r?.tokens;if(!r||!i)return{};const o=Z(i);if(o<e.config.minTokens)return{};if(n)return{};if(i.cache.read+i.cache.write===0)return{};const s=ee(r);if(s===void 0)return{};const p=s+X(e.config,s,e.learned);if(e.now>=p)return{notice:{kind:"expired",tokens:o}};const d=e.selection,c=r.model;return d&&c&&(d.providerID!==c.providerID||C(d.modelID,d.providerID)!==C(c.id,c.providerID)||N(d.variant)!==N(c.variant))?{notice:{kind:"model",tokens:o}}:{expiresAt:p}}function ne(e){for(let t=e.length-1;t>=0;t--){const n=e[t];if(n?.type==="assistant"&&n.tokens)return n}}function re(e,t){return new Intl.NumberFormat(t,{notation:"compact",maximumFractionDigits:0}).format(e).toLocaleLowerCase(t)}function oe(e,t,n){const r=()=>{const o=e(),s=ne(t());return o&&s?.id?`${o}
${s.id}`:void 0},i=w.createLatest(r,async(o,s)=>{const[p]=o.split(`
`),d=B(t()),c=await n({sessionID:p,...d?{nativeSessionID:d}:{}},s);return{key:o,learned:c.ttl&&typeof c.at=="number"?{ttl:c.ttl,at:c.at}:void 0}});return()=>i.latest?.key===r()?i.latest?.learned:void 0}function ie(e,t,n,r=n*8+2e3){let i=0,o,s,p=!1;const d=()=>{p||(p=!0,cancelAnimationFrame(i),clearTimeout(o),clearTimeout(s),e.removeEventListener("transitionend",c),e.removeEventListener("transitioncancel",c),t())},c=g=>{g.target===e&&g.propertyName==="opacity"&&d()};return e.addEventListener("transitionend",c),e.addEventListener("transitioncancel",c),i=requestAnimationFrame(()=>{o=setTimeout(d,n)}),s=setTimeout(d,r),d}const ae=5,se=2e4,_=(e,t)=>typeof e=="number"&&Number.isFinite(e)&&e>0?e:t;function ce(e){return{ttlMs:_(e?.cacheTtlMinutes,ae)*6e4,minTokens:_(e?.minTokens,se)}}const q={type:"string",minLength:1},de=K.Rpc.define({id:"cache-warning",methods:{learn:{input:{type:"object",properties:{sessionID:q,nativeSessionID:q},required:["sessionID"],additionalProperties:!1},output:{type:"object",properties:{ttl:{type:"string",enum:["5m","1h"]},at:{type:"number"}},additionalProperties:!1}}},events:{}}),le=250,ue=1500;function me(e,t={set:(n,r)=>setTimeout(n,r),clear:n=>clearTimeout(n)}){let n,r;const i=()=>{t.clear(r),r=void 0};return{watch(o,s){if(i(),!o){n=void 0;return}o!==n&&(r=t.set(()=>{r=void 0,n=o,e(o)},s?le:ue))},stop:i}}const fe=.4,O=2*Math.PI/fe;function P(e){return 1-(1+O*e)*Math.exp(-O*e)}const pe=.01,$=(()=>{let e=0;for(;1-P(e)>pe;)e+=.001;return e})();function S(e,t=24){return`linear(${Array.from({length:t+1},(r,i)=>{const o=i===t?1:P(i/t*$);return Number(e(o).toFixed(4))}).join(", ")})`}const ge=e=>e,he=e=>e*e,ve=e=>Math.max(0,(e-.6)/.4),R=S(ge),we=S(he),ye=S(ve),T=`${$.toFixed(3)}s`,be=`
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
  transition: transform ${T} ${R}, opacity ${T} ${we};
}
[data-cache-warning][data-state="closing"] {
  transition: transform ${T} ${R}, opacity ${T} ${ye};
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
`;var ke=I.template("<span data-cache-warning-lead>");const Ie=e=>e?`${e.providerID}/${e.modelID}/${e.variant??""}`:"",E=e=>e&&"tokens"in e?e.tokens:0,xe=w.Plugin.define({i18n:{en:{"expired.lead":"Cache expired","expired.rest":"next message re-reads ~{{tokens}} tokens","model.lead":"Cache reset","model.rest":"model changed · next message re-reads ~{{tokens}} tokens"}},setup(e){const t=ce(e.options);e.add(w.Style,be);const n=f.createMemo(()=>e.sessions.current()),r=f.createMemo(()=>n()?.key),i=()=>{const a=n();return a?.id?a.server.data.session.message.list(a.id):[]},o=oe(()=>n()?.id,i,(a,l)=>e.client.rpc(de).learn(a,{signal:l})),s=f.createMemo(()=>{const a=e.screen.current()?.composer.model();return a&&{providerID:a.providerID,modelID:a.modelID,variant:a.variant}},void 0,{equals:(a,l)=>a?.providerID===l?.providerID&&a?.modelID===l?.modelID&&(a?.variant??"")===(l?.variant??"")}),[p,d]=f.createSignal(0),c=f.createMemo(()=>(p(),te({messages:i(),now:Date.now(),config:t,selection:s(),learned:o()}))),g=f.createMemo(()=>c().notice,void 0,{equals:(a,l)=>a?.kind===l?.kind&&E(a)===E(l)}),[m,y]=f.createSignal();let h=!1;const b=me(a=>{h=!0,y(a),h=!1});f.onCleanup(b.stop),w.createKeyed(()=>i().length>0&&r()?`${r()}|${Ie(s())}|${g()?.kind??""}`:void 0,()=>b.watch(r(),s()!==void 0),{otherwise:()=>(b.watch(void 0,!1),y(void 0))});const v=f.createMemo(()=>r()&&m()===r()?g():void 0,void 0,{equals:(a,l)=>a?.kind===l?.kind&&E(a)===E(l)});w.createKeyed(()=>c().expiresAt,a=>{let l;const u=()=>{const A=a-Date.now();A>0?l=setTimeout(u,Math.min(A,2147483647)):d(M=>M+1)};u(),f.onCleanup(()=>clearTimeout(l))});const x=new Set;f.onCleanup(()=>x.forEach(a=>a())),w.createKeyed(()=>r()&&v()?r():void 0,a=>{x.forEach(z=>z());const l=!h,u=document.createElement("div");u.setAttribute("data-cache-warning",""),u.setAttribute("data-dock-surface","tray"),u.setAttribute("role","status"),u.setAttribute("data-state",l?"closed":"rest");const A=I.render(()=>I.createComponent(Ae,{notice:v,get locale(){return e.locale.locale},get t(){return e.t}}),u),M=Y(u,()=>{l&&requestAnimationFrame(()=>u.getAttribute("data-state")==="closed"&&u.setAttribute("data-state","open"))});let L=()=>{},F=!1;const D=()=>{F||(F=!0,x.delete(D),L(),M(),A())};f.onCleanup(()=>{if(e.signal.aborted||r()!==a||!u.isConnected)return D();u.setAttribute("data-state","closing"),x.add(D),L=ie(u,D,$*1e3+50)})})}});function Ae(e){const t=f.createMemo(n=>{const r=e.notice();if(!r)return n;const i={tokens:"tokens"in r?re(r.tokens,e.locale()):""};return{lead:e.t(`${r.kind}.lead`,i),rest:e.t(`${r.kind}.rest`,i)}});return[(()=>{var n=ke();return I.insert(n,()=>t()?.lead),n})()," · ",I.memo(()=>t()?.rest)]}exports.default=xe;
