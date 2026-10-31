"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const x=require("solid-js/web"),J=require("@opencode/plugin/gui"),P=require("solid-js"),X=require("@opencode/plugin/rpc"),ee='[data-component="collapsed-tool-group"][data-timeline-part-ids]',te=':scope > [data-component="collapsible"] > [data-slot="collapsible-trigger"]';function oe(r,s,i){const a=[];for(const c of r.querySelectorAll(ee)){const h=c.getAttribute("data-timeline-part-ids").split(",").filter(Boolean),g=h.filter(v=>s.has(v));if(a.push(...h.filter(v=>!s.has(v))),!g.some(v=>!i.has(v)))continue;const y=c.querySelector(te);if(y){for(const v of g)i.add(v);y.getAttribute("aria-expanded")==="false"&&y.click()}}return{unknown:a}}const G=["default-src 'none'","script-src 'unsafe-inline'","style-src 'unsafe-inline'","img-src data: blob:","font-src data:","media-src data: blob:","connect-src 'none'","frame-src 'none'","object-src 'none'","base-uri 'none'","form-action 'none'"].join("; "),re="allow-scripts",W={min:40,max:900},M=[.5,.75,1,1.25,1.5,2],ne=r=>`(function(){
var id=${JSON.stringify(r)},p=parent,raf=0,last=0;
function send(m){m.vr=id;p.postMessage(m,"*")}
function measure(){raf=0;var b=document.body;if(!b)return;var s=getComputedStyle(b);
var h=Math.ceil(b.getBoundingClientRect().height+(parseFloat(s.marginTop)||0)+(parseFloat(s.marginBottom)||0));
if(h!==last){last=h;send({type:"height",height:h})}}
function queue(){if(!raf)raf=requestAnimationFrame(measure)}
function ext(u){return /^(https?:|mailto:)/i.test(u)}
addEventListener("message",function(e){if(e.source!==p)return;var m=e.data;if(!m||m.vr!==id)return;
var r=document.documentElement;
if(m.type==="theme"){for(var k in m.vars)r.style.setProperty(k,m.vars[k]);r.style.colorScheme=m.mode;queue()}
else if(m.type==="zoom"){r.style.zoom=String(m.value);queue()}});
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;
var h=a.getAttribute("href")||"";if(h.charAt(0)==="#")return;e.preventDefault();if(ext(a.href))send({type:"open",url:a.href})},true);
document.addEventListener("submit",function(e){e.preventDefault()},true);
window.open=function(u){if(u&&ext(String(u)))send({type:"open",url:String(u)});return null};
addEventListener("load",function(){queue();send({type:"ready"})});
if(typeof ResizeObserver==="function"){var ro=new ResizeObserver(queue);ro.observe(document.documentElement);
document.addEventListener("DOMContentLoaded",function(){ro.observe(document.body);queue()})}
})();`,se=`html{background:var(--bg);color:var(--fg);font:14px/1.5 var(--font,system-ui,sans-serif)}
body{margin:12px}
code,pre,kbd{font-family:var(--mono,ui-monospace,monospace)}
img,svg,canvas,video{max-width:100%}`;function ae(r){const s=Object.entries(r.vars).filter(([i])=>/^--[a-z0-9-]+$/.test(i)&&!/[;{}<]/.test(r.vars[i])).map(([i,a])=>`${i}:${a}`);return`:root{color-scheme:${r.mode};${s.join(";")}}`}function ie(r){return`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${G}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${ae(r.theme)}${se}</style><script>${ne(r.id).replaceAll("</","<\\/")}<\/script></head><body>${r.html}</body></html>`}function le(r,s){if(!r||typeof r!="object")return;const i=r;if(i.vr===s){if(i.type==="ready")return{type:"ready"};if(i.type==="height"){const a=i.height;return typeof a!="number"||!Number.isFinite(a)?void 0:{type:"height",height:Math.min(W.max,Math.max(W.min,Math.round(a)))}}if(i.type==="open"){if(typeof i.url!="string"||i.url.length>2048)return;try{const a=new URL(i.url);return["http:","https:","mailto:"].includes(a.protocol)?{type:"open",url:a.href}:void 0}catch{return}}}}const de={"--bg":"--v2-background-bg-base","--surface":"--v2-background-bg-layer-01","--surface-2":"--v2-background-bg-layer-02","--fg":"--v2-text-text-base","--muted":"--v2-text-text-muted","--border":"--v2-border-border-base","--accent":"--v2-border-border-focus","--danger":"--v2-state-fg-danger","--warning":"--v2-state-fg-warning","--info":"--v2-state-fg-info"};function ce(r,s,i){const a={};for(const[c,h]of Object.entries(de)){const g=s(h).trim();g&&(a[c]=g)}return i.sans&&(a["--font"]=i.sans),i.mono&&(a["--mono"]=i.mono),{mode:r,vars:a}}const _=r=>`${r.mode}|${JSON.stringify(r.vars)}`,ue='[data-component="tool-part-wrapper"][data-timeline-part-id]',S="data-visual-reply",T="data-visual-reply-overlay",pe=40;function fe(r){const{doc:s}=r,i=r.schedule??(e=>{requestAnimationFrame(e)}),a=new Map,c=new Map,h=new Map,g=new Map,y=new Set,v=new Set;let m,b=r.theme(),E=_(b),k=!1,d=!1;const l=()=>[...a.values()].flatMap(e=>e.view?[e.view]:[]).concat(m?[m.view]:[]);function f(e,o){e.frame.contentWindow?.postMessage({vr:e.callID,...o},"*")}function R(e){f(e,{type:"theme",mode:b.mode,vars:b.vars}),f(e,{type:"zoom",value:g.get(e.callID)??1})}function z(e,o,t){const n=s.createElement("iframe");return n.setAttribute("sandbox",re),n.setAttribute("csp",G),n.setAttribute("referrerpolicy","no-referrer"),n.setAttribute("loading","eager"),n.title=o.title,n.setAttribute("data-visual-reply-frame",t?"overlay":"inline"),t||(n.style.height=`${h.get(e)??240}px`),n.srcdoc=ie({id:e,html:o.html,theme:b}),{callID:e,frame:n,overlay:t}}function O(e){const o=l().find(n=>n.frame.contentWindow&&n.frame.contentWindow===e.source);if(!o)return;const t=le(e.data,o.callID);if(t)if(t.type==="ready")R(o);else if(t.type==="height"){if(o.overlay||Math.abs((h.get(o.callID)??0)-t.height)<2)return;h.set(o.callID,t.height),o.frame.style.height=`${t.height}px`}else r.openExternal(t.url)}s.defaultView?.addEventListener("message",O);function D(e,o){const t=Math.min(M.at(-1),Math.max(M[0],o));g.set(e,t);for(const n of l())n.callID===e&&f(n,{type:"zoom",value:t})}function N(e,o){const t=g.get(e)??1,n=M.findIndex(p=>p>=t-1e-9),u=M[Math.min(M.length-1,Math.max(0,n+o))];D(e,u)}function V(e,o,t){return r.mountControls(e,{surface:t,title:c.get(o)?.title??"",zoomIn:()=>N(o,1),zoomOut:()=>N(o,-1),zoomReset:()=>D(o,1),primary:()=>t==="inline"?U(o):L()})}function L(){m&&(s.removeEventListener("keydown",m.keydown,!0),m.disposeControls(),m.root.remove(),m=void 0)}function U(e){const o=c.get(e);if(!o)return;L();const t=s.createElement("div");t.setAttribute(T,e),t.setAttribute("role","dialog"),t.setAttribute("aria-modal","true"),t.setAttribute("aria-label",o.title);const n=s.createElement("div");n.setAttribute("data-slot","head");const u=s.createElement("span");u.setAttribute("data-slot","title"),u.textContent=o.title;const p=s.createElement("div");p.setAttribute("data-slot","controls"),n.append(u,p);const q=V(p,e,"overlay"),w=z(e,o,!0);t.append(n,w.frame);const C=A=>{A.key==="Escape"&&(A.stopPropagation(),L())};s.addEventListener("keydown",C,!0),s.body.append(t),m={root:t,view:w,callID:e,keydown:C,disposeControls:q}}function H(e,o){c.delete(e),c.set(e,o);const t=new Set([...a.values()].map(n=>n.host.getAttribute(S)));for(const n of c.keys()){if(c.size<=pe)break;t.has(n)||c.delete(n)}}function B(e,o,t){e.body.replaceChildren(),e.view=z(o,t,!1),e.body.append(e.view.frame)}function K(e,o){const t=s.createElement("div");t.setAttribute(S,o);const n=s.createElement("div");n.setAttribute("data-slot","head");const u=s.createElement("span");u.setAttribute("data-slot","title"),u.textContent=c.get(o)?.title??"";const p=s.createElement("div");p.setAttribute("data-slot","controls"),n.append(u,p);const q=s.createElement("div");q.setAttribute("data-slot","body"),t.append(n,q),e.after(t);const w={wrapper:e,host:t,body:q,loading:!1,disposeControls:V(p,o,"inline")};a.set(e,w);const C=c.get(o);C?B(w,o,C):(w.loading=!0,r.load(o).then(A=>{k||a.get(e)!==w||A&&(H(o,A),u.textContent=A.title,B(w,o,A))}).catch(()=>{}).finally(()=>{w.loading=!1}))}function F(e){a.get(e)?.disposeControls(),a.get(e)?.host.remove(),a.delete(e)}function Y(){if(d=!1,k)return;const e=r.known(),o=new Set,t=new Set;for(const n of oe(s,e,v).unknown)y.has(n)||t.add(n);for(const n of s.querySelectorAll(ue)){const u=n.getAttribute("data-timeline-part-id");if(!e.has(u)){y.has(u)||t.add(u);continue}o.add(n);const p=a.get(n);p&&p.host.isConnected&&p.host.previousElementSibling===n&&p.host.getAttribute(S)===u||(p&&F(n),K(n,u))}for(const n of[...a.keys()])o.has(n)||F(n);for(const n of s.querySelectorAll(`[${S}]`))[...a.values()].some(p=>p.host===n)||n.remove();if(t.size){for(const n of t)y.add(n);r.unknown?.([...t])}}const Z=new s.defaultView.MutationObserver(e=>{const o=t=>t instanceof Element&&(t.hasAttribute(S)||t.hasAttribute(T));e.every(t=>[...t.addedNodes,...t.removedNodes].every(o))||j()});function j(){d||k||(d=!0,i(Y))}function Q(e){if(e)for(const o of e)y.delete(o);else y.clear();j()}for(const e of s.querySelectorAll(`[${S}],[${T}]`))e.remove();return Z.observe(s.body,{childList:!0,subtree:!0}),j(),{scan:j,recheck:Q,refreshTheme(){const e=r.theme(),o=_(e);if(o!==E){b=e,E=o;for(const t of l())f(t,{type:"theme",mode:b.mode,vars:b.vars})}},count:()=>a.size,dispose(){k=!0,Z.disconnect(),s.defaultView?.removeEventListener("message",O),L();for(const e of[...a.keys()])F(e);for(const e of s.querySelectorAll(`[${S}],[${T}]`))e.remove();a.clear()}}}const $={type:"string",minLength:1},I={type:"string",minLength:1},me=X.Rpc.define({id:"visual-replies",methods:{get:{input:{type:"object",properties:{callID:$},required:["callID"],additionalProperties:!1},output:{type:"object",properties:{callID:$,sessionID:I,title:{type:"string"},html:{type:"string"},created:{type:"number"}},required:["callID","sessionID","title","html","created"],additionalProperties:!1},errors:{not_found:{type:"object",properties:{callID:$},required:["callID"],additionalProperties:!1}}},list:{input:{type:"object",properties:{sessionID:I},required:["sessionID"],additionalProperties:!1},output:{type:"object",properties:{pages:{type:"array",items:{type:"object",properties:{callID:$,title:{type:"string"},created:{type:"number"}},required:["callID","title","created"],additionalProperties:!1}}},required:["pages"],additionalProperties:!1}}},events:{published:{schema:{type:"object",properties:{sessionID:I,callID:$},required:["sessionID","callID"],additionalProperties:!1}}}}),ve=`
[data-visual-reply] {
  margin: 8px 0;
  border: 1px solid var(--v2-border-border-muted);
  border-radius: 8px;
  background: var(--v2-background-bg-layer-01);
  overflow: hidden;
}
[data-visual-reply] > [data-slot='head'],
[data-visual-reply-overlay] > [data-slot='head'] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  color: var(--v2-text-text-muted);
  font-size: 12px;
}
[data-visual-reply] [data-slot='title'],
[data-visual-reply-overlay] [data-slot='title'] {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-visual-reply] [data-slot='controls'],
[data-visual-reply-overlay] [data-slot='controls'] {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 150ms ease-out;
}
[data-visual-reply]:hover [data-slot='controls'],
[data-visual-reply]:focus-within [data-slot='controls'],
[data-visual-reply-overlay] [data-slot='controls'] {
  opacity: 1;
}
[data-visual-reply] iframe {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
}
[data-visual-reply-overlay] {
  position: fixed;
  inset: 24px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--v2-border-border-base);
  border-radius: 12px;
  background: var(--v2-background-bg-base);
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.45);
  overflow: hidden;
}
[data-visual-reply-overlay] iframe {
  flex: 1;
  width: 100%;
  border: 0;
}
@media (prefers-reduced-motion: reduce) {
  [data-visual-reply] [data-slot='controls'] { transition: none; }
}
`,he=J.Plugin.define({i18n:{en:{expand:"Expand",close:"Close",zoomIn:"Zoom in",zoomOut:"Zoom out",zoomReset:"Reset zoom"}},setup(r){r.add(J.Style,ve);const s=new Set,i=new Set,a=document,c=a.documentElement,h=()=>r.client.rpc(me),g=()=>{const d=getComputedStyle(c);return ce(r.appearance.mode(),l=>d.getPropertyValue(l),{sans:getComputedStyle(a.body).fontFamily,mono:r.appearance.font("mono")})},y=(d,l)=>{const f=(R,z,O)=>x.createComponent(r.ui.Tooltip,{value:z,placement:"bottom",get children(){return x.createComponent(r.ui.IconButton,{icon:R,label:z,size:"small",onClick:O})}});return x.render(()=>[x.memo(()=>f("outline-magnifier-minus",r.t("zoomOut"),l.zoomOut)),x.memo(()=>f("outline-reset",r.t("zoomReset"),l.zoomReset)),x.memo(()=>f("outline-magnifier-plus",r.t("zoomIn"),l.zoomIn)),x.memo(()=>x.memo(()=>l.surface==="inline")()?f("outline-expand",r.t("expand"),l.primary):f("close-small",r.t("close"),l.primary))],d)};let v;const m=fe({doc:a,known:()=>s,theme:g,mountControls:y,openExternal:d=>r.system.openExternal(d),load:async d=>{const l=await h().get({callID:d},{signal:r.signal}).catch(()=>{});return l?{title:l.title,html:l.html}:void 0},unknown:()=>{clearTimeout(v),v=setTimeout(()=>E(!0),250)}});async function b(d){try{const{pages:l}=await h().list({sessionID:d},{signal:r.signal});for(const f of l)s.add(f.callID);i.add(d),m.scan()}catch{}}function E(d){for(const l of r.sessions.list())(d||!i.has(l.id))&&b(l.id)}P.createEffect(()=>{r.sessions.list(),E(!1)}),P.createEffect(()=>{r.appearance.mode(),requestAnimationFrame(()=>m.refreshTheme())});const k=new MutationObserver(()=>m.refreshTheme());return k.observe(c,{attributes:!0,attributeFilter:["class","style","data-theme","data-color-scheme"]}),P.createEffect(()=>{const d=h().events.on("published",l=>{const f=l.data;s.add(f.callID),i.add(f.sessionID),m.recheck([f.callID])});P.onCleanup(d)}),()=>{clearTimeout(v),k.disconnect(),m.dispose()}}});exports.default=he;
