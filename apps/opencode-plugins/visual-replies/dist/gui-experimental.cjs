"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const b=require("solid-js/web"),B=require("@opencode/plugin/gui"),T=require("solid-js"),Q=require("@opencode/plugin/rpc"),_=["default-src 'none'","script-src 'unsafe-inline'","style-src 'unsafe-inline'","img-src data: blob:","font-src data:","media-src data: blob:","connect-src 'none'","frame-src 'none'","object-src 'none'","base-uri 'none'","form-action 'none'"].join("; "),X="allow-scripts",J={min:40,max:900},C=[.5,.75,1,1.25,1.5,2],ee=r=>`(function(){
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
})();`,te=`html{background:var(--bg);color:var(--fg);font:14px/1.5 var(--font,system-ui,sans-serif)}
body{margin:12px}
code,pre,kbd{font-family:var(--mono,ui-monospace,monospace)}
img,svg,canvas,video{max-width:100%}`;function oe(r){const s=Object.entries(r.vars).filter(([i])=>/^--[a-z0-9-]+$/.test(i)&&!/[;{}<]/.test(r.vars[i])).map(([i,a])=>`${i}:${a}`);return`:root{color-scheme:${r.mode};${s.join(";")}}`}function re(r){return`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${_}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${oe(r.theme)}${te}</style><script>${ee(r.id).replaceAll("</","<\\/")}<\/script></head><body>${r.html}</body></html>`}function ne(r,s){if(!r||typeof r!="object")return;const i=r;if(i.vr===s){if(i.type==="ready")return{type:"ready"};if(i.type==="height"){const a=i.height;return typeof a!="number"||!Number.isFinite(a)?void 0:{type:"height",height:Math.min(J.max,Math.max(J.min,Math.round(a)))}}if(i.type==="open"){if(typeof i.url!="string"||i.url.length>2048)return;try{const a=new URL(i.url);return["http:","https:","mailto:"].includes(a.protocol)?{type:"open",url:a.href}:void 0}catch{return}}}}const se={"--bg":"--v2-background-bg-base","--surface":"--v2-background-bg-layer-01","--surface-2":"--v2-background-bg-layer-02","--fg":"--v2-text-text-base","--muted":"--v2-text-text-muted","--border":"--v2-border-border-base","--accent":"--v2-border-border-focus","--danger":"--v2-state-fg-danger","--warning":"--v2-state-fg-warning","--info":"--v2-state-fg-info"};function ae(r,s,i){const a={};for(const[m,h]of Object.entries(se)){const g=s(h).trim();g&&(a[m]=g)}return i.sans&&(a["--font"]=i.sans),i.mono&&(a["--mono"]=i.mono),{mode:r,vars:a}}const W=r=>`${r.mode}|${JSON.stringify(r.vars)}`,ie='[data-component="tool-part-wrapper"][data-timeline-part-id]',k="data-visual-reply",R="data-visual-reply-overlay",le=40;function de(r){const{doc:s}=r,i=r.schedule??(e=>{requestAnimationFrame(e)}),a=new Map,m=new Map,h=new Map,g=new Map,A=new Set;let v,f=r.theme(),$=W(f),w=!1,E=!1;const d=()=>[...a.values()].flatMap(e=>e.view?[e.view]:[]).concat(v?[v.view]:[]);function l(e,t){e.frame.contentWindow?.postMessage({vr:e.callID,...t},"*")}function p(e){l(e,{type:"theme",mode:f.mode,vars:f.vars}),l(e,{type:"zoom",value:g.get(e.callID)??1})}function O(e,t,o){const n=s.createElement("iframe");return n.setAttribute("sandbox",X),n.setAttribute("csp",_),n.setAttribute("referrerpolicy","no-referrer"),n.setAttribute("loading","eager"),n.title=t.title,n.setAttribute("data-visual-reply-frame",o?"overlay":"inline"),o||(n.style.height=`${h.get(e)??240}px`),n.srcdoc=re({id:e,html:t.html,theme:f}),{callID:e,frame:n,overlay:o}}function S(e){const t=d().find(n=>n.frame.contentWindow&&n.frame.contentWindow===e.source);if(!t)return;const o=ne(e.data,t.callID);if(o)if(o.type==="ready")p(t);else if(o.type==="height"){if(t.overlay||Math.abs((h.get(t.callID)??0)-o.height)<2)return;h.set(t.callID,o.height),t.frame.style.height=`${o.height}px`}else r.openExternal(o.url)}s.defaultView?.addEventListener("message",S);function L(e,t){const o=Math.min(C.at(-1),Math.max(C[0],t));g.set(e,o);for(const n of d())n.callID===e&&l(n,{type:"zoom",value:o})}function D(e,t){const o=g.get(e)??1,n=C.findIndex(u=>u>=o-1e-9),c=C[Math.min(C.length-1,Math.max(0,n+t))];L(e,c)}function N(e,t,o){return r.mountControls(e,{surface:o,title:m.get(t)?.title??"",zoomIn:()=>D(t,1),zoomOut:()=>D(t,-1),zoomReset:()=>L(t,1),primary:()=>o==="inline"?U(t):j()})}function j(){v&&(s.removeEventListener("keydown",v.keydown,!0),v.disposeControls(),v.root.remove(),v=void 0)}function U(e){const t=m.get(e);if(!t)return;j();const o=s.createElement("div");o.setAttribute(R,e),o.setAttribute("role","dialog"),o.setAttribute("aria-modal","true"),o.setAttribute("aria-label",t.title);const n=s.createElement("div");n.setAttribute("data-slot","head");const c=s.createElement("span");c.setAttribute("data-slot","title"),c.textContent=t.title;const u=s.createElement("div");u.setAttribute("data-slot","controls"),n.append(c,u);const z=N(u,e,"overlay"),y=O(e,t,!0);o.append(n,y.frame);const q=x=>{x.key==="Escape"&&(x.stopPropagation(),j())};s.addEventListener("keydown",q,!0),s.body.append(o),v={root:o,view:y,callID:e,keydown:q,disposeControls:z}}function H(e,t){m.delete(e),m.set(e,t);const o=new Set([...a.values()].map(n=>n.host.getAttribute(k)));for(const n of m.keys()){if(m.size<=le)break;o.has(n)||m.delete(n)}}function V(e,t,o){e.body.replaceChildren(),e.view=O(t,o,!1),e.body.append(e.view.frame)}function K(e,t){const o=s.createElement("div");o.setAttribute(k,t);const n=s.createElement("div");n.setAttribute("data-slot","head");const c=s.createElement("span");c.setAttribute("data-slot","title"),c.textContent=m.get(t)?.title??"";const u=s.createElement("div");u.setAttribute("data-slot","controls"),n.append(c,u);const z=s.createElement("div");z.setAttribute("data-slot","body"),o.append(n,z),e.after(o);const y={wrapper:e,host:o,body:z,loading:!1,disposeControls:N(u,t,"inline")};a.set(e,y);const q=m.get(t);q?V(y,t,q):(y.loading=!0,r.load(t).then(x=>{w||a.get(e)!==y||x&&(H(t,x),c.textContent=x.title,V(y,t,x))}).catch(()=>{}).finally(()=>{y.loading=!1}))}function F(e){a.get(e)?.disposeControls(),a.get(e)?.host.remove(),a.delete(e)}function Y(){if(E=!1,w)return;const e=r.known(),t=new Set,o=[];for(const n of s.querySelectorAll(ie)){const c=n.getAttribute("data-timeline-part-id");if(!e.has(c)){A.has(c)||o.push(c);continue}t.add(n);const u=a.get(n);u&&u.host.isConnected&&u.host.previousElementSibling===n&&u.host.getAttribute(k)===c||(u&&F(n),K(n,c))}for(const n of[...a.keys()])t.has(n)||F(n);for(const n of s.querySelectorAll(`[${k}]`))[...a.values()].some(u=>u.host===n)||n.remove();if(o.length){for(const n of o)A.add(n);r.unknown?.(o)}}const Z=new s.defaultView.MutationObserver(e=>{const t=o=>o instanceof Element&&(o.hasAttribute(k)||o.hasAttribute(R));e.every(o=>[...o.addedNodes,...o.removedNodes].every(t))||P()});function P(){E||w||(E=!0,i(Y))}function G(e){if(e)for(const t of e)A.delete(t);else A.clear();P()}for(const e of s.querySelectorAll(`[${k}],[${R}]`))e.remove();return Z.observe(s.body,{childList:!0,subtree:!0}),P(),{scan:P,recheck:G,refreshTheme(){const e=r.theme(),t=W(e);if(t!==$){f=e,$=t;for(const o of d())l(o,{type:"theme",mode:f.mode,vars:f.vars})}},count:()=>a.size,dispose(){w=!0,Z.disconnect(),s.defaultView?.removeEventListener("message",S),j();for(const e of[...a.keys()])F(e);for(const e of s.querySelectorAll(`[${k}],[${R}]`))e.remove();a.clear()}}}const M={type:"string",minLength:1},I={type:"string",minLength:1},ce=Q.Rpc.define({id:"visual-replies",methods:{get:{input:{type:"object",properties:{callID:M},required:["callID"],additionalProperties:!1},output:{type:"object",properties:{callID:M,sessionID:I,title:{type:"string"},html:{type:"string"},created:{type:"number"}},required:["callID","sessionID","title","html","created"],additionalProperties:!1},errors:{not_found:{type:"object",properties:{callID:M},required:["callID"],additionalProperties:!1}}},list:{input:{type:"object",properties:{sessionID:I},required:["sessionID"],additionalProperties:!1},output:{type:"object",properties:{pages:{type:"array",items:{type:"object",properties:{callID:M,title:{type:"string"},created:{type:"number"}},required:["callID","title","created"],additionalProperties:!1}}},required:["pages"],additionalProperties:!1}}},events:{published:{schema:{type:"object",properties:{sessionID:I,callID:M},required:["sessionID","callID"],additionalProperties:!1}}}}),ue=`
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
`,me=B.Plugin.define({i18n:{en:{expand:"Expand",close:"Close",zoomIn:"Zoom in",zoomOut:"Zoom out",zoomReset:"Reset zoom"}},setup(r){r.add(B.Style,ue);const s=new Set,i=new Set,a=document,m=a.documentElement,h=()=>r.client.rpc(ce),g=()=>{const d=getComputedStyle(m);return ae(r.appearance.mode(),l=>d.getPropertyValue(l),{sans:getComputedStyle(a.body).fontFamily,mono:r.appearance.font("mono")})},A=(d,l)=>{const p=(O,S,L)=>b.createComponent(r.ui.Tooltip,{value:S,placement:"bottom",get children(){return b.createComponent(r.ui.IconButton,{icon:O,label:S,size:"small",onClick:L})}});return b.render(()=>[b.memo(()=>p("outline-magnifier-minus",r.t("zoomOut"),l.zoomOut)),b.memo(()=>p("outline-reset",r.t("zoomReset"),l.zoomReset)),b.memo(()=>p("outline-magnifier-plus",r.t("zoomIn"),l.zoomIn)),b.memo(()=>b.memo(()=>l.surface==="inline")()?p("outline-expand",r.t("expand"),l.primary):p("close-small",r.t("close"),l.primary))],d)};let v;const f=de({doc:a,known:()=>s,theme:g,mountControls:A,openExternal:d=>r.system.openExternal(d),load:async d=>{const l=await h().get({callID:d},{signal:r.signal}).catch(()=>{});return l?{title:l.title,html:l.html}:void 0},unknown:()=>{clearTimeout(v),v=setTimeout(()=>w(!0),250)}});async function $(d){try{const{pages:l}=await h().list({sessionID:d},{signal:r.signal});for(const p of l)s.add(p.callID);i.add(d),f.scan()}catch{}}function w(d){for(const l of r.sessions.list())(d||!i.has(l.id))&&$(l.id)}T.createEffect(()=>{r.sessions.list(),w(!1)}),T.createEffect(()=>{r.appearance.mode(),requestAnimationFrame(()=>f.refreshTheme())});const E=new MutationObserver(()=>f.refreshTheme());return E.observe(m,{attributes:!0,attributeFilter:["class","style","data-theme","data-color-scheme"]}),T.createEffect(()=>{const d=h().events.on("published",l=>{const p=l.data;s.add(p.callID),i.add(p.sessionID),f.recheck([p.callID])});T.onCleanup(d)}),()=>{clearTimeout(v),E.disconnect(),f.dispose()}}});exports.default=me;
