"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const a=require("solid-js/web"),k=require("@opencode/plugin/gui"),v=require("solid-js"),ne=require("@opencode/plugin/rpc"),_=1,T=Symbol.for(`opencode-plugins.notify.v${_}`),se=["needs-you","error","done","info"],E=()=>globalThis;function C(e){const t=E()[T];if(t||!e)return t;const i={v:_,publishers:new Map,sinks:[]};return E()[T]=i,i}function oe(){const e=C(!1);e&&e.publishers.size===0&&e.sinks.length===0&&delete E()[T]}function ie(e,t={}){const i=C(!0);i.publishers.set(e,(i.publishers.get(e)??0)+1);const r=i.owners??=new Map;for(const c of t.owns??[]){const d=r.get(c)??new Map;d.set(e,(d.get(e)??0)+1),r.set(c,d)}let s=!1;return()=>{if(s)return;s=!0;const c=C(!1);if(!c)return;const d=(c.publishers.get(e)??0)-1;d>0?c.publishers.set(e,d):c.publishers.delete(e);for(const f of t.owns??[]){const n=c.owners?.get(f);if(!n)continue;const p=(n.get(e)??0)-1;p>0?n.set(e,p):n.delete(e),n.size===0&&c.owners?.delete(f)}oe()}}function U(){const e=C(!1)?.sinks??[];for(let t=e.length-1;t>=0;t--)if(e[t].accepts.includes(_))return e[t]}const re=200,ae=500,ce=200,O=(e,t)=>e.length>t?`${e.slice(0,t-1)}…`:e,le={done:"success","needs-you":"warning",error:"error",info:"info"},de=e=>typeof e=="string"&&se.includes(e),ue=e=>e==="info"||e==="success"||e==="warning"||e==="error",x=e=>typeof e=="string"&&e.length>0?e:void 0,fe=(e,t,i)=>`${e}:${t}:${i?`${i.server}/${i.session}`:"-"}`;function pe(e,t,i=Date.now(),r){if(typeof e!="object"||e===null)return;const s=e,c=x(s.title);if(!c)return;const d=de(s.kind)?s.kind:"info",f=s.target,n=x(f?.server)??r,p=x(f?.session),g=n&&p?{server:n,session:p}:void 0,m=s.action,u=x(m?.message),w=m?.type==="open-message"&&u?{type:"open-message",message:u}:g?{type:"open-session"}:void 0,y=x(s.body);return{v:_,kind:d,severity:ue(s.severity)?s.severity:le[d],target:g,title:O(c,re),body:y?O(y,ae):void 0,source:t,key:O(x(s.key)??fe(t,d,g),ce),action:w,persistent:s.persistent===!0,at:typeof s.at=="number"&&Number.isFinite(s.at)?s.at:i}}const F=new WeakMap,ge=new Set(["needs-you","error","done"]),be="opencode:notification-focus",me="opencode-plugins.notify.fallback",D="opencode-plugins.notify.fallback",ve=200;function he(){if(typeof document>"u"||typeof navigator>"u"||!navigator.locks)return;const e=navigator.locks,t=new Set,i=r=>{if(t.has(r))return!1;t.add(r);try{const s=JSON.parse(localStorage.getItem(D)??"[]"),c=Array.isArray(s)?s.filter(d=>typeof d=="string"):[];if(c.includes(r))return!1;localStorage.setItem(D,JSON.stringify([...c,r].slice(-ve)))}catch{}return!0};return async r=>document.hasFocus()?!0:await e.query().then(c=>(c.held??[]).some(d=>d.name===be),()=>!1)?!1:e.request(me,async()=>i(r)).catch(()=>!0)}function we(e,t){if(!ge.has(t.kind))return"none";const i=e.tabs&&t.target,r=t.target,s=F.get(e)??new Map;F.set(e,s),s.get(t.key)?.dismiss();const c=()=>e.toast.show({title:t.title,description:t.body,variant:t.kind==="error"?"error":t.kind==="done"?"success":"default",persistent:t.persistent,actions:i&&r?[{label:"Open",run:()=>e.tabs.open({server:r.server,id:r.session},{focus:!0})}]:void 0}),d=he();if(!d)return s.set(t.key,c()),"fallback";const f={dismiss(){}};return s.set(t.key,f),d(`${e.id}\0${t.key}\0${t.at}`).then(n=>{s.get(t.key)===f&&(n?s.set(t.key,c()):s.delete(t.key))},()=>{}),"fallback"}function ye(e,t){const i=pe(t,e.id);return i?ke(e,i):"none"}function ke(e,t){const i=U();if(i)try{return i.publish(t),"hub"}catch{}try{return we(e,t)}catch{return"none"}}function xe(e,t){const i=U();try{i?.clear(e.id,t)}catch{}const r=F.get(e);r?.get(t)?.dismiss(),r?.delete(t)}const $e=new Set(["question","mcp-elicitation","websearch.provider"]),R=e=>{const t=e?.time;return typeof t?.updated=="number"&&Number.isFinite(t.updated)?t.updated:0},V=e=>e.replace(/\s+/g," ").trim(),Me=e=>{if(e.message)return V(e.message);const t=e.action??"permission",i=e.resources?.join(", ");return i?`${t} ${i}`:t},Se=e=>{const t=e.fields?.[0];return V(t?.description??t?.title??e.title??"Question")},Ae=e=>{if(e.fields?.length!==1)return;const t=e.fields[0];return{key:t.key,options:t.options??[],custom:t.custom===!0}};function Ce(e,t){const i=t.session!==void 0?[t.session]:[...new Set([...e.session.permission.sessions?.()??[],...e.session.form.sessions?.()??[]])],r=[];for(const s of i){const c=e.session.root(s),d=R(e.session.get(s));for(const f of e.session.permission.list(s)??[])r.push({server:t.server,session:s,root:c,kind:"permission",id:f.id,text:Me(f),createdAt:d})}for(const s of i){const c=e.session.root(s),d=R(e.session.get(s));for(const f of e.session.form.list(s)??[]){const n=f.metadata?.kind;$e.has(n)&&r.push({server:t.server,session:s,root:c,kind:"form",id:f.id,text:Se(f),createdAt:d,formKind:typeof n=="string"?n:void 0,field:Ae(f)})}}return r}function _e(e,t){return Promise.all([e.session.permission.sync(t),e.session.form.sync(t)]).then(()=>{})}function Ie(e){let t,i=Number.NEGATIVE_INFINITY;const r=new Map,s=c=>{const d=r.get(c);if(d)return d;const f=new Set;return r.set(c,f),f};return{consider(c){if(!c.top)return t=void 0,r.clear(),{notify:!1,reason:"none",passed:[]};const d=c.blocked??(c.top.blocked?[{id:c.top.id,ageMin:c.top.ageMin}]:[]),f=new Set(d.map(g=>g.id));for(const g of[...r.keys()])f.has(g)||r.delete(g);const n=[];for(const g of d)for(const m of e.escalateMin)g.ageMin<m||s(g.id).has(m)||n.includes(m)||n.push(m);const p=c.top.id!==t;if(!p&&n.length===0)return{notify:!1,reason:"none",passed:[]};if(c.now-i<e.everyMs)return{notify:!1,reason:"throttled",passed:n.sort((g,m)=>g-m)};for(const g of d)for(const m of e.escalateMin)g.ageMin>=m&&s(g.id).add(m);return t=c.top.id,i=c.now,{notify:!0,reason:p?"top":"escalate",passed:n.sort((g,m)=>g-m)}}}}const A={notifyEveryMin:10,escalateMin:[15,60],rememberAnsweredH:24,reaskWeight:30},X="inbox option";function N(e,t,i,r){const s=e[t];if(s===void 0)return i;if(typeof s!="number"||!Number.isFinite(s)||s<r)throw new Error(`${X} ${t} must be a number of at least ${r}`);return s}function qe(e,t,i){const r=e[t];if(r===void 0)return[...i];if(!Array.isArray(r)||r.length===0||r.some(s=>typeof s!="number"||!Number.isFinite(s)||s<=0))throw new Error(`${X} ${t} must be a non-empty array of minutes`);return[...r].sort((s,c)=>s-c)}function je(e={}){return{notifyEveryMin:N(e,"notifyEveryMin",A.notifyEveryMin,1),escalateMin:qe(e,"escalateMin",A.escalateMin),rememberAnsweredH:N(e,"rememberAnsweredH",A.rememberAnsweredH,1),reaskWeight:N(e,"reaskWeight",A.reaskWeight,0)}}function Y(e){return e.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,"").replace(/\s+/g," ").trim()}const Oe="host";function Ne(e){const t=[],i=new Set,r=n=>{i.add(n.key),e.seen.has(n.key)||e.seen.set(n.key,e.now),t.push({...n,ageMin:Math.max(0,(e.now-n.createdAt)/6e4)})},s=(n,p)=>e.session(n,p),c=(n,p)=>e.family(n,p).filter(g=>g!==p&&s(n,g)?.running!==!0).length,d=new Map;for(const n of e.requests){if(n.kind!=="form"||n.formKind!=="question")continue;const p=`${n.root}\0${Y(n.text)}`;d.set(p,(d.get(p)??0)+1)}for(const n of e.requests){if(n.kind==="form"&&n.formKind!=="question")continue;const p=`${Oe}:${n.server}:${n.kind}:${n.id}`,g=s(n.server,n.session),m=n.kind==="form"?d.get(`${n.root}\0${Y(n.text)}`)??1:1;r({key:p,server:n.server,session:n.session,root:n.root,project:g?.project??"",title:g?.title??"",kind:n.kind,id:n.id,text:n.text,createdAt:e.firstSeen.get(p)??e.now,asks:m,blocked:n.kind==="permission"||n.kind==="form",waiters:c(n.server,n.session),...n.field!==void 0?{field:n.field}:{}})}const f=e.builtin??"";for(const n of e.asks){const p=s(f,n.session),g=p?.running===!0;r({key:`ask:${n.id}`,server:f,session:n.session,root:n.root,project:p?.project??"",title:p?.title??"",kind:"ask",id:String(n.id),text:n.question,createdAt:n.createdAt,asks:n.asks,blocked:n.blocking&&!g,waiters:c(f,n.session),...n.options!==void 0&&n.options.length>0?{options:n.options}:{},askId:n.id})}for(const n of[...e.seen.keys()])i.has(n)||e.seen.delete(n);return t}const K=6e4,P=60*K,L=24*P;function Te(e){const t=Math.max(0,e);return t<K?"now":t<P?`${Math.floor(t/K)}m`:t<L?`${Math.floor(t/P)}h`:`${Math.floor(t/L)}d`}var Ee=a.template("<div data-inbox-empty>"),Fe=a.template("<div data-inbox-panel>"),Ke=a.template("<div data-inbox-options>"),Pe=a.template("<span data-inbox-reask>×<!> asked"),ze=a.template("<span data-inbox-blocked>blocks "),De=a.template("<input data-inbox-answer-input type=text>"),Re=a.template("<div data-inbox-row><div data-inbox-head><span data-inbox-project></span><span data-inbox-title></span></div><div data-inbox-ask></div><div data-inbox-meta><span data-inbox-age></span></div><div data-inbox-actions>"),Ye=a.template("<button type=button data-inbox-option>");function Le(e){return(()=>{var t=Fe();return a.insert(t,a.createComponent(v.Show,{get when(){return e.rows().length===0},get children(){var i=Ee();return a.insert(i,()=>e.ctx.t("empty")),i}}),null),a.insert(t,a.createComponent(v.For,{get each(){return e.rows()},children:i=>a.createComponent(Be,{get ctx(){return e.ctx},row:i,get actions(){return e.actions}})}),null),t})()}function Be(e){const[t,i]=v.createSignal(""),r=()=>{const s=t().trim();s&&(i(""),e.actions.answer(e.row,s))};return(()=>{var s=Re(),c=s.firstChild,d=c.firstChild,f=d.nextSibling,n=c.nextSibling,p=n.nextSibling,g=p.firstChild,m=p.nextSibling;return a.insert(d,()=>e.row.project),a.insert(f,()=>e.row.title),a.insert(n,()=>e.row.text),a.insert(s,a.createComponent(v.Show,{get when(){return a.memo(()=>e.row.options!==void 0)()&&e.row.options.length>0},get children(){var u=Ke();return a.insert(u,a.createComponent(v.For,{get each(){return e.row.options},children:w=>(()=>{var y=Ye();return y.$$click=()=>i(w),a.insert(y,w),y})()})),u}}),p),a.insert(g,()=>Te(e.row.ageMin*6e4)),a.insert(p,a.createComponent(v.Show,{get when(){return e.row.asks>1},get children(){var u=Pe(),w=u.firstChild,y=w.nextSibling;return y.nextSibling,a.insert(u,()=>e.row.asks,y),u}}),null),a.insert(p,a.createComponent(v.Show,{get when(){return e.row.waiters>0},get children(){var u=ze();return u.firstChild,a.insert(u,()=>e.row.waiters,null),u}}),null),a.insert(m,a.createComponent(v.Show,{get when(){return e.row.kind==="permission"},get children(){return[a.createComponent(e.ctx.ui.Button,{size:"small",onClick:()=>e.actions.allow(e.row),get children(){return e.ctx.t("allowOnce")}}),a.createComponent(e.ctx.ui.Button,{size:"small",variant:"danger",onClick:()=>e.actions.reject(e.row),get children(){return e.ctx.t("reject")}})]}}),null),a.insert(m,a.createComponent(v.Show,{get when(){return a.memo(()=>e.row.kind==="form"&&e.row.field!==void 0)()&&e.row.field.options.length>0},get children(){return a.createComponent(v.For,{get each(){return e.row.field?.options??[]},children:u=>a.createComponent(e.ctx.ui.Button,{size:"small",onClick:()=>e.actions.choose(e.row,u.value),get children(){return u.label}})})}}),null),a.insert(m,a.createComponent(v.Show,{get when(){return e.row.kind==="ask"},get children(){return[(()=>{var u=De();return u.$$keydown=w=>{w.key==="Enter"&&(w.preventDefault(),r())},u.$$input=w=>i(w.currentTarget.value),a.effect(()=>a.setAttribute(u,"placeholder",e.ctx.t("answerPlaceholder"))),a.effect(()=>u.value=t()),u})(),a.createComponent(e.ctx.ui.Button,{size:"small",get disabled(){return t().trim().length===0},onClick:r,get children(){return e.ctx.t("answer")}}),a.createComponent(e.ctx.ui.Button,{size:"small",variant:"ghost",onClick:()=>e.actions.dismiss(e.row),get children(){return e.ctx.t("dismiss")}})]}}),null),a.insert(m,a.createComponent(e.ctx.ui.Button,{size:"small",variant:"ghost",onClick:()=>e.actions.open(e.row),get children(){return e.ctx.t("open")}}),null),a.effect(u=>{var w=e.row.kind,y=e.row.project,M=e.row.title;return w!==u.e&&a.setAttribute(s,"data-kind",u.e=w),y!==u.t&&a.setAttribute(d,"title",u.t=y),M!==u.a&&a.setAttribute(f,"title",u.a=M),u},{e:void 0,t:void 0,a:void 0}),s})()}const He=`
[data-inbox-panel] {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  font-family: var(--v2-font-family-sans, inherit);
  font-size: 13px;
  line-height: 18px;
  color: var(--v2-text-text-base);
}
[data-inbox-empty] {
  padding: 16px;
  font-size: 12px;
  color: var(--v2-text-text-faint);
}
[data-inbox-row] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--v2-border-border-base);
}
[data-inbox-row][data-kind='permission'] {
  box-shadow: inset 3px 0 0 var(--v2-state-fg-warning);
}
[data-inbox-head] {
  display: flex;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
  line-height: 14px;
  color: var(--v2-text-text-muted);
}
[data-inbox-project] {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-inbox-title] {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-inbox-title]::before {
  content: "· ";
}
[data-inbox-ask] {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
[data-inbox-options] {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
[data-inbox-option] {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--v2-border-border-base);
  background: var(--v2-background-bg-layer-01);
  font-size: 11px;
  line-height: 16px;
  color: var(--v2-text-text-muted);
}
[data-inbox-meta] {
  display: flex;
  gap: 8px;
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--v2-text-text-faint);
}
[data-inbox-actions] {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
[data-inbox-answer-input] {
  flex: 1 1 140px;
  min-width: 100px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--v2-border-border-base);
  border-radius: 6px;
  background: var(--v2-background-bg-base);
  color: var(--v2-text-text-base);
  font: inherit;
  font-size: 12px;
}
[data-inbox-answer-input]:focus-visible {
  outline: 2px solid var(--v2-background-bg-accent);
  outline-offset: 1px;
}
`;a.delegateEvents(["input","keydown","click"]);function We(e,t){return Math.max(0,e.ageMin)*(e.blocked?1:.25)*(1+Math.max(0,e.waiters))+t*Math.max(0,e.asks-1)}function Ue(e,t){return e.map(i=>({...i,cost:We(i,t)})).sort((i,r)=>r.cost-i.cost||i.createdAt-r.createdAt||i.key.localeCompare(r.key))}const Ve={type:"object",properties:{id:{type:"number"},answer:{type:"string"}},required:["id","answer"],additionalProperties:!1},Xe={type:"object",properties:{id:{type:"number"}},required:["id"],additionalProperties:!1},B={type:"object",properties:{ok:{type:"boolean"}},required:["ok"],additionalProperties:!1},Je={type:"object",properties:{id:{type:"number"},session:{type:"string"},root:{type:"string"},question:{type:"string"},options:{type:"array",items:{type:"string"}},ref:{type:"string"},blocking:{type:"boolean"},createdAt:{type:"number"},lastAskedAt:{type:"number"},asks:{type:"number"}},required:["id","session","root","question","blocking","createdAt","lastAskedAt","asks"],additionalProperties:!1},H=ne.Rpc.define({id:"inbox",methods:{list:{input:{type:"object",properties:{},additionalProperties:!1},output:{type:"object",properties:{asks:{type:"array",items:Je}},required:["asks"],additionalProperties:!1}},answer:{input:Ve,output:B},dismiss:{input:Xe,output:B}},events:{changed:{schema:{type:"object",properties:{id:{type:"number"}},additionalProperties:!1}}}}),W="inbox:top",Ge=e=>e.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??"",Qe=k.Plugin.define({i18n:{en:{title:"Inbox",empty:"Nothing is waiting for you.",allowOnce:"Allow once",reject:"Reject",answer:"Answer",answerPlaceholder:"Your answer…",dismiss:"Dismiss",open:"Open",notifyTitle:"Inbox · {{count}} waiting",couldNotAnswer:"Could not answer that",couldNotOpen:"Could not answer the request"}},setup(e){const t=je(e.options);v.onCleanup(ie(e.id,{owns:["host-requests"]})),e.add(k.Style,He);const i=()=>e.servers.list().map(o=>e.servers.get(o)).find(o=>o?.builtin)?.id,r=o=>e.servers.get(o)?.data,s=new Set;k.createKeyed(()=>e.servers.list().flatMap(o=>{const l=e.servers.get(o)?.connected?r(o):void 0;return l?l.session.list().map(b=>`${o}\0${b.id}`):[]}),o=>{for(const l of o){if(s.has(l))continue;const b=l.indexOf("\0"),h=l.slice(0,b),j=l.slice(b+1),z=e.servers.get(h)?.connected?r(h):void 0;z&&(s.add(l),_e(z,j).catch(()=>s.delete(l)))}});const[c,d]=v.createSignal([]),f=()=>e.client.rpc?.(H);k.createKeyed(()=>e.client,o=>{const l=o.rpc?.(H);if(!l)return;const b=()=>{l.list({}).then(h=>{e.signal.aborted||d(h.asks)}).catch(()=>{})};v.onCleanup(l.events.on("changed",b)),b()});const n=(o,l)=>{const b=e.servers.get(o)?.connected?r(o):void 0;if(!b)return;const h=b.session.get(l);if(!h)return;const j=b.project.get(h.projectID);return{title:h.title??"",project:Ge(j?.canonical??""),root:b.session.root(l),running:b.session.status(l)==="running"}},p=(o,l)=>{const b=e.servers.get(o)?.connected?r(o):void 0;return b?b.session.family(l):[]},g=v.createMemo(()=>e.servers.list().flatMap(o=>{const l=e.servers.get(o)?.connected?r(o):void 0;return l?Ce(l,{server:o}):[]})),[m,u]=v.createSignal(Date.now()),w=setInterval(()=>u(Date.now()),6e4);v.onCleanup(()=>clearInterval(w));const y=new Map,M=new Map,J=v.createMemo(()=>Ne({now:m(),builtin:i(),requests:g(),asks:c(),session:n,family:p,firstSeen:y,seen:M})),$=v.createMemo(()=>Ue(J(),t.reaskWeight)),G=Ie({everyMs:t.notifyEveryMin*6e4,escalateMin:t.escalateMin});let I=!1;const Q=()=>{const o=$(),l=o[0],b=G.consider({now:Date.now(),...l?{top:{id:l.key,blocked:l.blocked,ageMin:l.ageMin}}:{},blocked:o.filter(h=>h.blocked).map(h=>({id:h.key,ageMin:h.ageMin}))});if(!l){I&&xe(e,W),I=!1;return}b.notify&&(I=!0,ye(e,{kind:"needs-you",key:W,persistent:!0,title:e.t("notifyTitle",{count:o.length}),body:[[l.project,l.title].filter(Boolean).join(" · "),l.text].filter(Boolean).join(" — "),target:{server:l.server,session:l.session}}))};k.createKeyed(()=>$().map(o=>`${o.key}:${o.blocked?1:0}:${Math.floor(o.ageMin)}`).join("|"),()=>Q());const S=o=>{e.signal.aborted||(console.warn("inbox: request failed:",o),e.toast.show({title:e.t("couldNotOpen"),description:o instanceof Error?o.message:String(o),variant:"error"}))},Z={open:o=>e.tabs.open({server:o.server,id:o.session},{focus:!0}),allow:o=>{r(o.server)?.session.permission.reply({sessionID:o.session,requestID:o.id,decision:"once"}).catch(S)},reject:o=>{r(o.server)?.session.permission.reply({sessionID:o.session,requestID:o.id,decision:"reject"}).catch(S)},choose:(o,l)=>{const b=o.field;b&&r(o.server)?.session.form.reply({sessionID:o.session,formID:o.id,answer:{[b.key]:l}}).catch(S)},answer:(o,l)=>{const b=f();!b||o.askId===void 0||b.answer({id:o.askId,answer:l}).catch(h=>{e.signal.aborted||(console.warn("inbox: could not answer:",h),e.toast.show({title:e.t("couldNotAnswer"),description:h instanceof Error?h.message:String(h),variant:"error"}))})},dismiss:o=>{const l=f();!l||o.askId===void 0||l.dismiss({id:o.askId}).catch(S)}};let q;const ee=o=>({id:"inbox",title:`Inbox · ${o}`,pinned:!0,closable:!1,draggable:!1}),te=()=>{const o=$().length;if(q?.count===o)return q.value;const l=ee(o);return q={count:o,value:l},l};e.add(k.Panel,{id:"inbox",region:"side",list:()=>[te()],render:()=>a.createComponent(Le,{ctx:e,rows:$,actions:Z})}),e.add(k.TitlebarItem,()=>{const o=$().length;return o>0?{id:"inbox",label:String(o),title:e.t("title"),icon:"notifications"}:void 0})}});exports.default=Qe;
