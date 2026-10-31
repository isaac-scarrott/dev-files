"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const c=require("solid-js/web"),U=require("@opencode/plugin/gui"),s=require("solid-js"),Et=8;function Ct(t,e,r){if(t.length===0)return-1;const n=e.find(u=>u.bottom>r+Et)??e.at(-1);if(!n)return-1;const a=t.indexOf(n.owner);if(a!==-1)return a;const l=t.findIndex(u=>u>n.owner);return l===-1?t.length-1:Math.max(0,l-1)}function It(t){return t.ids.indexOf(t.target)>=1?{kind:"probe"}:t.more?{kind:"load"}:{kind:"top"}}function $t(t,e,r){const n=t.filter(d=>d.bottom>r.top&&d.top<r.bottom),a=n.length?n:t,l=a[0],u=a.at(-1);return!l||l.owner>=e?-1:u&&u.owner<e?1:0}function At(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const r=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:r,behavior:"smooth"}}const G=3,_t=40,Lt=120,Rt=200,Pt=3,Ht=5;function dt(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const r=e.dataset.messageId;if(!r)return[];const n=e.getBoundingClientRect();return[{owner:r,prompt:e.dataset.timelineRow==="UserMessage",top:n.top,bottom:n.bottom}]})}function V(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function $(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(r=>r.dataset.messageId===e)}function Ot(t){const e=t.scroller.getBoundingClientRect();return Ct(t.ids(),dt(t.scroller),e.top+V(t.scroller))}function Nt(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}async function qt(t,e){t.loading?.(!0);try{await t.loadMore(e)}finally{t.loading?.(!1)}}function it(t,e){const r=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,r.top-n.top+t.scrollTop-V(t))}async function at(t,e,r){let n=Number.NaN,a=0,l=0;for(let u=0;u<_t&&!r.aborted;u+=1){await t.frame();const d=t.scroller.scrollTop,g=$(t.scroller,e);if(a=g&&d===n?a+1:0,l=g?0:l+1,n=d,a>=G||l>G)return}}async function Bt(t,e,r,n){const{scroller:a}=t;let l=0;for(let u=0;u<Rt&&!r.aborted;u+=1){if($(a,e))return;const d=$t(dt(a),e,a.getBoundingClientRect());if(d===0){if((l+=1)>G)return;await t.frame();continue}l=0;const g=Math.max(0,a.scrollHeight-a.clientHeight);if(d===-1&&a.scrollTop<=0||d===1&&a.scrollTop>=g)return;n.direction!==0&&d!==n.direction&&(n.step=Math.max(a.clientHeight/4,n.step/2)),n.direction=d,a.scrollTo({top:Math.min(g,Math.max(0,a.scrollTop+d*n.step)),behavior:"auto"}),await t.frame()}}async function ut(t,e,r,n=0){const{scroller:a}=t,l=It({ids:t.ids(),target:e,more:t.more()});if(l.kind==="load")return n>=Ht||(await qt(t,r),r.aborted)?void 0:ut(t,e,r,n+1);if(l.kind==="top")return a.scrollTo({top:0,behavior:"auto"}),at(t,e,r);const u={step:a.clientHeight,direction:0};for(let d=0;d<Pt&&!r.aborted;d+=1)if(await Bt(t,e,r,u),await at(t,e,r),$(a,e))return}async function Dt(t,e,r){const{scroller:n}=t,a=$(n,e);if(!a)return!1;const l=At({from:n.scrollTop,to:it(n,a),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});if(l.start!==void 0&&(n.scrollTo({top:l.start,behavior:"auto"}),await t.frame()),n.scrollTo({top:l.to,behavior:l.behavior}),l.behavior==="auto")return!0;let u=Number.NaN,d=0;for(let k=0;k<Lt&&!r.aborted;k+=1){await t.frame();const b=n.scrollTop;if(d=b===u?d+1:0,u=b,d>=G)break}if(r.aborted)return!0;const g=$(n,e);if(!g)return!0;const M=Math.min(it(n,g),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(M-n.scrollTop)>2&&n.scrollTo({top:M,behavior:l.behavior}),!0}async function Ft(t,e,r){return t.ids().includes(e)?(Nt(t.scroller),!$(t.scroller,e)&&(await ut(t,e,r),r.aborted)?"aborted":await Dt(t,e,r)?r.aborted?"aborted":"done":"none"):"none"}const z=4,zt=10,Gt=.6,lt=200,ct=240,K=t=>t.replace(/\s+/g," ").trim();function Yt(t){const e=t.metadata?.displayText,r=K(typeof e=="string"&&e?e:t.text??"");if(r)return r.length>lt?`${r.slice(0,lt)}…`:r;const n=(t.files??[]).map(u=>u.mime.startsWith("image/")?"[image]":`[${u.name??"file"}]`),a=(t.agents??[]).map(u=>`@${u.name}`),l=[...n,...a];return l.length?l.slice(0,3).join(" "):"(empty prompt)"}function jt(t){return K(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}function Ut(t){return t.length<40?"short":t.length<160?"medium":"long"}function Wt(t,e){const r=[];for(let n=0;n<t.length;n+=1){const a=t[n];if(a.type!=="user"||e&&a.id>=e)continue;let l,u=!1;for(let g=n+1;g<t.length&&t[g].type!=="user";g+=1){const M=t[g];if(M.type!=="assistant")continue;const k=M.content?.find(b=>b.type==="text"&&b.text&&K(b.text))?.text;if(k){const b=jt(k);l=b.length>ct?`${b.slice(0,ct)}…`:b;break}M.time?.completed===void 0&&!M.error&&(u=!0)}const d=Yt(a);r.push({id:a.id,title:d,snippet:l,working:!l&&u,length:Ut(d)})}return r}function Vt(t,e){const r=Math.max(0,e*Gt),n=Math.max(1,Math.floor(r/z));if(t<=n)return{pitch:t>0?Math.min(zt,Math.max(z,Math.floor(r/t))):z,ticks:Array.from({length:t},(u,d)=>({start:d,end:d}))};const a=[];for(let l=0;l<n;l+=1)a.push({start:Math.floor(l*t/n),end:Math.floor((l+1)*t/n)-1});return{pitch:z,ticks:a}}function Kt(t,e){return t.findIndex(r=>e>=r.start&&e<=r.end)}var Xt=c.template("<span style=display:contents>"),Jt=c.template('<div data-timeline-rail><div data-timeline-rail-ticks role=toolbar aria-orientation=vertical aria-label="Your prompts">'),Qt=c.template("<button type=button data-timeline-rail-tick>"),Zt=c.template("<div data-timeline-rail-card-snippet dir=auto>"),te=c.template("<div data-timeline-rail-card><div data-timeline-rail-card-body role=tooltip><div data-timeline-rail-card-title dir=auto>");const W=28,ee=44,ne="(min-width: 768px)",re=400,oe=300,ie=80,st=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,ae=()=>new Promise(t=>requestAnimationFrame(()=>t()));function le(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function ft(t,e){const r=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),a=n instanceof HTMLElement?n.getBoundingClientRect():r,l=t.querySelector("[data-timeline-row][data-message-id]"),d=(l instanceof HTMLElement?l.getBoundingClientRect().left:r.left+Math.max(0,(r.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||r.width))/2))-r.left,g=V(t);return{top:a.top-r.top+g,height:Math.max(0,a.height-g),left:Math.round((d-W)/2),show:d>=ee}}function ce(t){const[e,r]=s.createSignal(),[n,a]=s.createSignal(),[l,u]=s.createSignal(),[d,g]=s.createSignal(-1),[M,k]=s.createSignal(!1),[b,mt]=s.createSignal(!0),A=()=>t.input.session,N=()=>A().server.data.session,S=s.createMemo(()=>Wt(N().message.list(A().id),N().get(A().id)?.revert?.messageID)),q=s.createMemo(()=>S().map(o=>o.id)),X=()=>N().message.more(A().id),B=s.createMemo(()=>Vt(S().length,l()?.height??0)),Y=s.createMemo(()=>Kt(B().ticks,d()));let J,D;const Q=o=>{D=void 0;const i=J?.closest("[data-scrollable]"),f=i&&le(i);i&&f?(r(i),a(f)):o>0&&(D=requestAnimationFrame(()=>Q(o-1)))};s.onMount(()=>Q(10)),s.onCleanup(()=>{D!==void 0&&cancelAnimationFrame(D)}),s.onMount(()=>{if(typeof window.matchMedia!="function")return;const o=window.matchMedia(ne),i=()=>mt(o.matches);i(),o.addEventListener("change",i),s.onCleanup(()=>o.removeEventListener("change",i))});const pt=()=>{const o=e();if(o)return{scroller:o,ids:q,more:X,loadMore:i=>N().message.loadMore(A().id,{signal:i}),reducedMotion:st,frame:ae,loading:k}};let _;const gt=()=>{_=void 0;const o=e(),i=n();if(!t.input.active||!o||!i)return;const f=Ot({scroller:o,ids:q}),m=ft(o,i);g(f),u(x=>x&&x.top===m.top&&x.height===m.height&&x.left===m.left&&x.show===m.show?x:m)},E=()=>{_===void 0&&(_=requestAnimationFrame(gt))};s.onCleanup(()=>{_!==void 0&&cancelAnimationFrame(_)}),s.createEffect(()=>{const o=e(),i=n();if(!o||!i)return;o.addEventListener("scroll",E,{passive:!0});const f=typeof ResizeObserver=="function"?new ResizeObserver(E):void 0;f?.observe(i);const m=i.querySelector("[data-slot='session-timeline-visible']");m&&f?.observe(m),E(),s.onCleanup(()=>{o.removeEventListener("scroll",E),f?.disconnect()})}),s.createEffect(s.on([q,X,()=>t.input.active,b],E,{defer:!0}));let L;const ht=o=>{const i=q()[o],f=pt();if(!i||!f||!t.input.active)return;L?.abort();const m=new AbortController;L=m,Ft(f,i,m.signal).finally(()=>{L===m&&(L=void 0),E()})};s.onCleanup(()=>L?.abort());const[vt,bt]=s.createSignal(),[R,C]=s.createSignal("closed"),[xt,Z]=s.createSignal();let I,tt=Number.NEGATIVE_INFINITY;const et=(o,i=!1)=>{if(bt(o),R()!=="open"){if(clearTimeout(I),i||Date.now()-tt<oe){C("open");return}I=setTimeout(()=>C("open"),re)}},j=()=>{if(clearTimeout(I),I=void 0,R()!=="open"){C("closed");return}if(tt=Date.now(),st()){C("closed");return}C("closing"),I=setTimeout(()=>{R()==="closing"&&C("closed")},ie)};s.onCleanup(()=>clearTimeout(I));const nt=s.createMemo(()=>{const o=vt();if(o===void 0||R()==="closed")return;const i=B().ticks[o];return i?{tick:i,index:o,prompt:S()[i.start]}:void 0}),wt=o=>{const i=S()[o.start];return i?o.end>o.start?`${i.title} (and ${o.end-o.start} more)`:i.title:""},yt=()=>xt()??Math.max(0,Y());let T,F;const[Mt,kt]=s.createSignal(0),rt=()=>T?[...T.querySelectorAll("[data-timeline-rail-tick]")]:[];s.createEffect(()=>{const o=nt();if(!o||!T||!F)return;const i=rt()[o.index];if(!i)return;const f=T.getBoundingClientRect(),m=i.getBoundingClientRect(),x=m.top+m.height/2-f.top,p=F.offsetHeight;kt(Math.round(Math.max(0,Math.min(x-p/2,f.height-p))))});const Tt=o=>{if(o.key==="Escape"){j();return}const i=rt();if(i.length===0)return;const f=i.findIndex(x=>x===document.activeElement),m=o.key==="ArrowDown"?Math.min(i.length-1,f+1):o.key==="ArrowUp"?Math.max(0,f-1):o.key==="Home"?0:o.key==="End"?i.length-1:-1;m!==-1&&(o.preventDefault(),i[m]?.focus())},St=()=>{const o=l();return{top:`${o?.top??0}px`,height:`${o?.height??0}px`,left:`${o?.left??0}px`,"--timeline-rail-pitch":`${B().pitch}px`}};return(()=>{var o=Xt();return c.use(i=>J=i,o),c.insert(o,c.createComponent(s.Show,{get when(){return c.memo(()=>!!(t.input.active&&b()&&l()?.show&&S().length>=2))()&&n()},children:i=>c.createComponent(c.Portal,{get mount(){return i()},ref:f=>f.style.display="contents",get children(){var f=Jt(),m=f.firstChild;f.$$focusout=p=>{(!(p.relatedTarget instanceof Node)||!T?.contains(p.relatedTarget))&&(Z(void 0),j())},f.$$keydown=Tt,f.addEventListener("pointerleave",j);var x=T;return typeof x=="function"?c.use(x,f):T=f,c.insert(m,c.createComponent(s.For,{get each(){return B().ticks},children:(p,w)=>(()=>{var h=Qt();return h.$$click=()=>ht(p.start),h.addEventListener("focus",v=>{Z(w()),v.currentTarget.matches(":focus-visible")&&et(w(),!0)}),h.addEventListener("pointerenter",v=>{v.pointerType!=="touch"&&et(w())}),c.effect(v=>{var P=S()[p.start]?.length,y=Y()===w()?"":void 0,H=Y()===w()?"true":void 0,O=wt(p),ot=yt()===w()?0:-1;return P!==v.e&&c.setAttribute(h,"data-length",v.e=P),y!==v.t&&c.setAttribute(h,"data-current",v.t=y),H!==v.a&&c.setAttribute(h,"aria-current",v.a=H),O!==v.o&&c.setAttribute(h,"aria-label",v.o=O),ot!==v.i&&c.setAttribute(h,"tabindex",v.i=ot),v},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0}),h})()})),c.insert(f,c.createComponent(s.Show,{get when(){return nt()},children:p=>(()=>{var w=te(),h=w.firstChild,v=h.firstChild,P=F;return typeof P=="function"?c.use(P,h):F=h,c.insert(v,()=>p().prompt.title),c.insert(h,c.createComponent(s.Show,{get when(){return p().prompt.snippet||p().prompt.working},get children(){var y=Zt();return c.insert(y,()=>p().prompt.snippet??"Working…"),c.effect(()=>c.setAttribute(y,"data-working",p().prompt.working?"":void 0)),y}}),null),c.effect(y=>{var H=R()==="closing"?"":void 0,O=`${Mt()}px`;return H!==y.e&&c.setAttribute(w,"data-closed",y.e=H),O!==y.t&&c.setStyleProperty(w,"top",y.t=O),y},{e:void 0,t:void 0}),w})()}),null),c.effect(p=>{var w=St(),h=M()?"true":void 0;return p.e=c.style(f,w,p.e),h!==p.t&&c.setAttribute(m,"aria-busy",p.t=h),p},{e:void 0,t:void 0}),f}})})),o})()}const se=`
[data-timeline-rail] {
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${W}px;
  pointer-events: none;
}
[data-timeline-rail-ticks] {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0 0 0 8px;
  box-sizing: border-box;
  pointer-events: auto;
}
[data-timeline-rail-ticks][aria-busy="true"] { opacity: 0.6; }
[data-timeline-rail-tick] {
  appearance: none;
  display: flex;
  align-items: center;
  height: var(--timeline-rail-pitch, 10px);
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  outline: none;
}
[data-timeline-rail-tick]::before {
  content: "";
  display: block;
  height: 2px;
  width: 6px;
  border-radius: 1px;
  background: var(--v2-text-text-faint);
  transition: background-color 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
[data-timeline-rail-tick][data-length="medium"]::before { width: 10px; }
[data-timeline-rail-tick][data-length="long"]::before { width: 14px; }
@media (hover: hover) and (pointer: fine) {
  [data-timeline-rail-tick]:hover::before { background: var(--v2-text-text-muted); }
}
[data-timeline-rail-tick][data-current]::before { background: var(--v2-text-text-base); }
[data-timeline-rail-tick]:focus-visible::before {
  outline: 2px solid var(--v2-border-border-focus);
  outline-offset: 2px;
}
[data-timeline-rail-card] {
  position: absolute;
  left: ${W}px;
  padding-left: 4px;
  pointer-events: auto;
}
[data-timeline-rail-card-body] {
  box-sizing: border-box;
  width: min(320px, 40vw);
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--v2-background-bg-layer-01);
  box-shadow: var(--v2-elevation-floating);
  color: var(--v2-text-text-base);
  transform-origin: left center;
  animation: 0.12s ease-out timelineRailCardIn;
}
[data-timeline-rail-card][data-closed] [data-timeline-rail-card-body] { animation: 80ms ease-in forwards timelineRailCardOut; }
[data-timeline-rail-card-title] {
  font-size: 13px;
  line-height: 16px;
  font-weight: 530;
  letter-spacing: -0.04px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-timeline-rail-card-snippet] {
  margin-top: 4px;
  font-size: 11px;
  line-height: 14px;
  font-weight: 440;
  letter-spacing: 0.05px;
  color: var(--v2-text-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
[data-timeline-rail-card-snippet][data-working] { color: var(--v2-text-text-faint); }
@keyframes timelineRailCardIn { 0% { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
@keyframes timelineRailCardOut { 0% { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.96); } }
@media (prefers-reduced-motion: reduce) {
  [data-timeline-rail-card-body], [data-timeline-rail-card][data-closed] [data-timeline-rail-card-body] { animation: none; }
  [data-timeline-rail-tick]::before { transition: none; }
}
`,de=U.Plugin.define({setup(t){t.add(U.Style,se),t.add(U.Slot,{at:"session.header",render:e=>c.createComponent(ce,{input:e})})}});c.delegateEvents(["keydown","focusout","click"]);exports.default=de;exports.measure=ft;
