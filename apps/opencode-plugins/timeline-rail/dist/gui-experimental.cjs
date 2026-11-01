"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const c=require("solid-js/web"),Y=require("@opencode/plugin/gui"),v=require("solid-js");function Ot(t,e,r){const n=e.filter(l=>l.bottom>r.top&&l.top<r.bottom),i=n.find(l=>l.prompt&&t.includes(l.owner))??n[0];if(!i)return-1;const a=t.indexOf(i.owner);if(a!==-1)return a;const d=t.findIndex(l=>l>i.owner);return d===-1?t.length-1:d-1}function Ht(t,e,r){const n=t.filter(l=>l.bottom>r.top&&l.top<r.bottom),i=n.length?n:t,a=i[0],d=i.at(-1);return!a||a.owner>=e?-1:d&&d.owner<e?1:0}function Nt(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const r=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:r,behavior:"smooth"}}function qt(t){const e=Math.max(0,t.scrollHeight-t.clientHeight);return Math.min(e,Math.max(0,Math.round(t.index/Math.max(1,t.count)*t.scrollHeight)))}function Ft(t){let e=Number.POSITIVE_INFINITY,r=-1;for(const p of t.rows){if(p.bottom<=t.box.top||p.top>=t.box.bottom)continue;const g=t.indexOf.get(p.owner);g!==void 0&&(e=Math.min(e,g),r=Math.max(r,g))}if(r===-1)return;if(t.target>=e&&t.target<=r)return 0;const n=t.rows.flatMap(p=>{const g=p.prompt?t.indexOf.get(p.owner):void 0;return g===void 0?[]:[{index:g,top:p.top}]}),i=n[0],a=n.at(-1),d=i&&a&&a.index>i.index?(a.top-i.top)/(a.index-i.index):0,l=d>0?d:t.fallback;return Math.round((t.target-(e+r)/2)*l)}const z=3,Bt=40,Dt=120,zt=200,Xt=3,Ut=20,Vt=24,Yt=2,Gt=4;function K(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const r=e.dataset.messageId;if(!r)return[];const n=e.getBoundingClientRect();return[{owner:r,prompt:e.dataset.timelineRow==="UserMessage",top:n.top,bottom:n.bottom}]})}function j(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function P(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(r=>r.dataset.messageId===e)}function gt(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}function G(t,e){const r=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,r.top-n.top+t.scrollTop-j(t))}async function Kt(t,e,r){let n=Number.NaN,i=0,a=0;for(let d=0;d<Bt&&!r.aborted;d+=1){await t.frame();const l=t.scroller.scrollTop,p=P(t.scroller,e);if(i=p&&l===n?i+1:0,a=p?0:a+1,n=l,i>=z||a>z)return}}async function jt(t,e,r,n){const{scroller:i}=t;let a=0;for(let d=0;d<zt&&!r.aborted;d+=1){if(P(i,e))return;const l=Ht(K(i),e,i.getBoundingClientRect());if(l===0){if((a+=1)>z)return;await t.frame();continue}a=0;const p=Math.max(0,i.scrollHeight-i.clientHeight);if(l===-1&&i.scrollTop<=0||l===1&&i.scrollTop>=p)return;n.direction!==0&&l!==n.direction&&(n.step=Math.max(i.clientHeight/4,n.step/2)),n.direction=l,i.scrollTo({top:Math.min(p,Math.max(0,i.scrollTop+l*n.step)),behavior:"auto"}),await t.frame()}}async function Wt(t,e,r){const{scroller:n}=t,i=t.ids(),a=i.indexOf(e),d=qt({index:a,count:i.length,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});if(Math.abs(d-n.scrollTop)<Ut*n.clientHeight)return;const l=new Map(i.map((x,E)=>[x,E])),p=n.scrollHeight/Math.max(1,i.length),g=()=>Math.max(0,n.scrollHeight-n.clientHeight),I=async()=>{for(let x=0;x<Yt&&!r.aborted;x+=1)await t.frame()};n.scrollTo({top:d,behavior:"auto"}),await I();for(let x=0;x<Vt&&!r.aborted;x+=1){if(P(n,e))return;const E=Ft({rows:K(n),indexOf:l,target:a,fallback:p,box:n.getBoundingClientRect()});if(E===0)return;if(E===void 0){await I();continue}const y=Math.min(g(),Math.max(0,n.scrollTop+E));if(y===n.scrollTop)return;n.scrollTo({top:y,behavior:"auto"}),await I()}}async function Jt(t,e,r){const{scroller:n}=t;await Wt(t,e,r);const i={step:n.clientHeight,direction:0};for(let a=0;a<Xt&&!r.aborted;a+=1)if(await jt(t,e,r,i),await Kt(t,e,r),P(n,e))return}async function Qt(t,e,r){const{scroller:n}=t,i=P(n,e);if(!i)return!1;const a=Nt({from:n.scrollTop,to:G(n,i),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});a.start!==void 0&&(n.scrollTo({top:a.start,behavior:"auto"}),await t.frame());const d=async g=>{if(a.behavior==="auto")return n.scrollTo({top:g,behavior:"auto"}),!0;if(t.tween)return t.tween(g,r);n.scrollTo({top:g,behavior:a.behavior});let I=Number.NaN,x=0;for(let E=0;E<Dt&&!r.aborted;E+=1){await t.frame();const y=n.scrollTop;if(x=y===I?x+1:0,I=y,x>=z)break}return!0};if(!await d(a.to)||a.behavior==="auto"||r.aborted)return!0;const l=P(n,e);if(!l)return!0;const p=Math.min(G(n,l),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(p-n.scrollTop)>2&&await d(p),!0}const dt=["wheel","touchstart","pointerdown","keydown"];async function Zt(t,e,r){if(!t.ids().includes(e))return"none";gt(t.scroller);const n=new AbortController,i=()=>n.abort(),a=AbortSignal.any([r,n.signal]);for(const d of dt)t.scroller.addEventListener(d,i,{passive:!0});try{for(let d=0;d<Gt;d+=1){if(!P(t.scroller,e)&&(await Jt(t,e,a),a.aborted))return"aborted";if(!await Qt(t,e,a))return"none";if(a.aborted)return"aborted";const l=P(t.scroller,e);if(l&&Math.abs(G(t.scroller,l)-t.scroller.scrollTop)<=2)break}return a.aborted?"aborted":"done"}finally{for(const d of dt)t.scroller.removeEventListener(d,i)}}const te=8,ee=2,ne="calc(100vh - 18rem)",ut=200,oe=1500,mt=10,re=20,bt="User message",wt=t=>t.replace(/\s+/g," ").trim();function ie(t){const e=t.metadata?.displayText,r=wt(typeof e=="string"&&e?e:t.text??"");return r?r.length>ut?`${r.slice(0,ut)}…`:r:bt}function ae(t){return wt(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}function se(t,e){const r=[];for(const n of t)n.type==="user"&&!(e&&n.id>=e)&&r.push(n.id);return r}function le(t,e,r){const n=[];for(let i=0;i<t.length;i+=1){const a=t[i];if(a.type!=="user"||e&&a.id>=e||r&&a.id<r)continue;let d;for(let g=i+1;g<t.length&&t[g].type!=="user";g+=1)t[g].type==="assistant"&&(d=t[g]);const l=d?(d.content??[]).flatMap(g=>g.type==="text"&&g.text?[g.text]:[]).join(`
`):"",p=l.trim()?ae(l.slice(0,oe)):"";n.push({id:a.id,title:ie(a),snippet:p||void 0})}return n}function ce(t,e,r=!0){if(e.length===0)return;if(!t)return{from:e[Math.max(0,e.length-mt)],loaded:e};const n=t.loaded[0],i=!r||n===void 0?0:e.indexOf(n),a=e.indexOf(t.from),d=a!==-1?a:e.findIndex(l=>l>t.from);return d===-1?{from:e[Math.max(0,e.length-mt)],loaded:e}:{from:e[Math.max(0,d-(i>0?Math.min(i,re):0))],loaded:e}}function de(t){return`max(0px, min(${Math.max(1,(t-1)*te)}px, ${ne}))`}function ft(t,e){return e>1?t/(e-1)*100:0}function ue(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}function me(t,e,r){let n=Number.POSITIVE_INFINITY,i=-1;for(const a of e){if(!a.prompt||a.bottom<=r.top||a.top>=r.bottom)continue;const d=t.get(a.owner);d!==void 0&&(n=Math.min(n,d),i=Math.max(i,d))}return i===-1?void 0:[n,i]}const fe=t=>1-(1-t)**4;function pe(t){return Math.round(Math.min(420,180+Math.abs(t)*.12))}const pt=["wheel","touchstart","pointerdown","keydown"];async function he(t,e,r){const{scroller:n}=t,i=n.scrollTop,a=pe(e-i);let d=!1;const l=()=>{d=!0};for(const p of pt)n.addEventListener(p,l,{passive:!0});try{const p=t.now();for(;;){if(await t.frame(),d||r.aborted)return!1;const g=Math.min(1,(t.now()-p)/a);if(n.scrollTo({top:i+(e-i)*fe(g),behavior:"auto"}),g>=1)return!0}}finally{for(const p of pt)n.removeEventListener(p,l)}}var ve=c.template("<span>"),ge=c.template("<span style=display:contents>"),be=c.template("<div data-timeline-rail><div data-timeline-rail-body><button type=button data-timeline-rail-strip>"),we=c.template("<span data-timeline-rail-tick aria-hidden=true>"),xe=c.template("<span data-timeline-rail-card-snippet dir=auto>"),ye=c.template("<span data-timeline-rail-card><span data-timeline-rail-card-body role=tooltip><span data-timeline-rail-card-title dir=auto>");const xt=12,Me=40,Te=48,Se=14,Ee="(min-width: 768px)",ke=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,ht=()=>new Promise(t=>requestAnimationFrame(()=>t()));function Ie(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function yt(t,e){const r=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),i=n instanceof HTMLElement?n.getBoundingClientRect():r,a=t.querySelector("[data-timeline-row][data-message-id]"),d=a instanceof HTMLElement?a.getBoundingClientRect().left:r.left+Math.max(0,(r.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||r.width))/2),l=Math.max(0,d-r.left),p=j(t);return{top:i.top-r.top+p,height:Math.max(0,r.bottom-i.top-p),hit:Math.max(0,Math.min(Me,Math.floor(l)-xt)),persistent:l>=Te}}const vt=t=>t?.closest?.("[data-timeline-rail-card]")!=null;function $e(t){const[e,r]=v.createSignal(),[n,i]=v.createSignal(),[a,d]=v.createSignal(),[l,p]=v.createSignal(-1),[g,I]=v.createSignal(),[x,E]=v.createSignal(!0),y=()=>t.input.session,W=()=>y().server.data.session,J=()=>W().message.list(y().id),Q=()=>W().get(y().id)?.revert?.messageID,Z=v.createMemo(()=>se(J(),Q()));let X=!1,N,tt;const Mt=v.createMemo(()=>(tt!==y().id&&(tt=y().id,N=void 0,X=!1),N=ce(N,Z(),X),N)),q=v.createMemo(()=>{const o=Mt()?.from;return o?le(J(),Q(),o):[]}),F=v.createMemo(()=>q().map(o=>o.id)),Tt=v.createMemo(()=>new Map(F().map((o,s)=>[o,s]))),k=()=>q().length;let et,B;const nt=o=>{B=void 0;const s=et?.closest("[data-scrollable]"),m=s&&Ie(s);s&&m?(r(s),i(m)):o>0&&(B=requestAnimationFrame(()=>nt(o-1)))};v.onMount(()=>nt(10)),v.onCleanup(()=>{B!==void 0&&cancelAnimationFrame(B)}),v.onMount(()=>{if(typeof window.matchMedia!="function")return;const o=window.matchMedia(Ee),s=()=>E(o.matches);s(),o.addEventListener("change",s),v.onCleanup(()=>o.removeEventListener("change",s))}),v.createEffect(()=>{const o=e();if(!o)return;const s=()=>{X=!0},m=["wheel","touchmove","pointerdown","keydown"];for(const f of m)o.addEventListener(f,s,{passive:!0});v.onCleanup(()=>{for(const f of m)o.removeEventListener(f,s)})});const St=()=>{const o=e();if(o)return{scroller:o,ids:Z,reducedMotion:ke,frame:ht,tween:(s,m)=>he({scroller:o,frame:ht,now:()=>performance.now()},s,m)}};let R;const Et=()=>{R=void 0;const o=e(),s=n();if(!t.input.active||!o||!s)return;const m=K(o),f=o.getBoundingClientRect(),b={top:f.top+j(o),bottom:f.bottom},A=me(Tt(),m,b),u=yt(o,s);p(Ot(F(),m,b)),I(h=>h&&A&&h[0]===A[0]&&h[1]===A[1]?h:A),d(h=>h&&h.top===u.top&&h.height===u.height&&h.hit===u.hit&&h.persistent===u.persistent?h:u)},_=()=>{R===void 0&&(R=requestAnimationFrame(Et))};v.onCleanup(()=>{R!==void 0&&cancelAnimationFrame(R)}),v.createEffect(()=>{const o=e(),s=n();if(!o||!s)return;o.addEventListener("scroll",_,{passive:!0});const m=typeof ResizeObserver=="function"?new ResizeObserver(_):void 0;m?.observe(s);const f=s.querySelector("[data-slot='session-timeline-visible']");f&&m?.observe(f),_(),v.onCleanup(()=>{o.removeEventListener("scroll",_),m?.disconnect()})}),v.createEffect(v.on([F,()=>t.input.active,x],_,{defer:!0}));let L;const kt=o=>{const s=F()[o],m=St();if(!s||!m||!t.input.active)return;L?.abort();const f=new AbortController;L=f,Zt(m,s,f.signal).finally(()=>{L===f&&(L=void 0),_()})};v.onCleanup(()=>L?.abort());const[M,O]=v.createSignal(),[It,$t]=v.createSignal(!1),[ot,rt]=v.createSignal(!1),U=()=>{const o=M();return o===void 0||o>=k()?void 0:q()[o]},Ct=()=>U()?.title??bt;let D;const V=o=>{o!==void 0&&o>=0&&o<k()&&kt(o)},it=o=>{if(!D)return null;const s=D.getBoundingClientRect();return ue({count:k(),top:s.top,height:s.height,y:o.clientY})};let H=!1;const at=o=>{const s=f=>{f.buttons===0&&(m(),o())},m=()=>{window.removeEventListener("pointerup",s),window.removeEventListener("pointermove",s)};window.addEventListener("pointerup",s),window.addEventListener("pointermove",s)},Pt=o=>{const s=e();!s||o.defaultPrevented||o.ctrlKey||o.deltaY===0||(o.preventDefault(),gt(s),s.scrollBy({top:o.deltaY,left:o.deltaX}))},At=o=>{const s=k()-1;if(o.key==="Enter"||o.key===" "){o.preventDefault(),V(M());return}const m=M()??0,f=o.key==="ArrowDown"?Math.min(s,m+1):o.key==="ArrowUp"?Math.max(0,m-1):o.key==="Home"?0:o.key==="End"?s:-1;f!==-1&&(o.preventDefault(),O(f))},_t=()=>{const o=a();return{top:`${o?.top??0}px`,height:`${o?.height??0}px`}},Rt=o=>{l()>=0&&V(l()+o)},st=o=>{const s=o==="previous",m=s?"Previous turn":"Next turn";return c.createComponent(t.ui.Tooltip,{value:m,placement:s?"top":"bottom",get children(){var f=ve();return c.setAttribute(f,"data-timeline-rail-turn",o),c.insert(f,c.createComponent(t.ui.IconButton,{icon:"chevron-down",label:m,size:"small",variant:"ghost-muted",get disabled(){return s?l()<=0:l()<0||l()>=k()-1},onClick:()=>Rt(s?-1:1)})),f}})},Lt=o=>o===0?"0%":o===k()-1?"-100%":"-50%";return(()=>{var o=ge();return c.use(s=>et=s,o),c.insert(o,c.createComponent(v.Show,{get when(){return c.memo(()=>!!(t.input.active&&x()&&k()>=ee&&(a()?.hit??0)>0))()&&n()},children:s=>c.createComponent(c.Portal,{get mount(){return s()},ref:m=>m.style.display="contents",get children(){var m=be(),f=m.firstChild,b=f.firstChild;c.use(u=>{u.addEventListener("wheel",Pt,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>$t(!0)))},m),f.$$pointermove=u=>{u.buttons===0||H||ot()||(rt(!0),at(()=>rt(!1)))},f.$$pointerdown=()=>{H||(H=!0,at(()=>H=!1))},c.insert(f,()=>st("previous"),b),b.$$keydown=At,b.addEventListener("blur",()=>O(void 0)),b.addEventListener("focus",()=>{M()===void 0&&O(Math.max(0,l()))}),b.$$click=u=>{vt(u.target)||u.detail===0||(V(M()??it(u)??void 0),u.currentTarget.blur())},b.addEventListener("pointerleave",()=>O(void 0)),b.$$pointermove=u=>{if(u.pointerType==="touch"||u.buttons!==0&&!H)return;const h=it(u);h!==null&&h!==M()&&O(h)},b.$$mousedown=u=>{vt(u.target)||u.preventDefault()};var A=D;return typeof A=="function"?c.use(A,b):D=b,c.insert(b,c.createComponent(v.Index,{get each(){return q()},children:(u,h)=>(()=>{var T=we();return c.setAttribute(T,"data-index",h),c.effect(S=>{var w=M()!==void 0&&Math.abs(h-M())<=2?Math.abs(h-M()):void 0,$=g()&&h>=g()[0]&&h<=g()[1]?"":void 0,C=`${ft(h,k())}%`;return w!==S.e&&c.setAttribute(T,"data-d",S.e=w),$!==S.t&&c.setAttribute(T,"data-view",S.t=$),C!==S.a&&c.setStyleProperty(T,"top",S.a=C),S},{e:void 0,t:void 0,a:void 0}),T})()}),null),c.insert(b,c.createComponent(v.Show,{get when(){return U()},children:u=>(()=>{var h=ye(),T=h.firstChild,S=T.firstChild;return h.$$pointermove=w=>w.stopPropagation(),c.insert(S,()=>u().title),c.insert(T,c.createComponent(v.Show,{get when(){return u().snippet},get children(){var w=xe();return c.insert(w,()=>u().snippet),w}}),null),c.effect(w=>{var $=`${ft(M(),k())}%`,C=`translateY(${Lt(M())})`;return $!==w.e&&c.setStyleProperty(h,"top",w.e=$),C!==w.t&&c.setStyleProperty(h,"transform",w.t=C),w},{e:void 0,t:void 0}),h})()}),null),c.insert(f,()=>st("next"),null),c.effect(u=>{var h=a()?.persistent?"":void 0,T=It()?"":void 0,S=_t(),w=(a()?.hit??0)>=Se?"":void 0,$=ot()?"":void 0,C=de(k()),lt=U()?"22rem":`${a()?.hit??0}px`,ct=`Jump to message: ${Ct()}`;return h!==u.e&&c.setAttribute(m,"data-persistent",u.e=h),T!==u.t&&c.setAttribute(m,"data-armed",u.t=T),u.a=c.style(m,S,u.a),w!==u.o&&c.setAttribute(f,"data-navigation",u.o=w),$!==u.i&&c.setAttribute(f,"data-pass",u.i=$),C!==u.n&&c.setStyleProperty(f,"--timeline-rail-height",u.n=C),lt!==u.s&&c.setStyleProperty(f,"width",u.s=lt),ct!==u.h&&c.setAttribute(b,"aria-label",u.h=ct),u},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),m}})})),o})()}const Ce=`
[data-timeline-rail] {
  position: absolute;
  left: 0;
  z-index: 55;
  display: none;
  flex-direction: column;
  justify-content: center;
  width: 72px;
  pointer-events: none;
  --timeline-rail-curve: cubic-bezier(0.4, 0, 0.2, 1);
}
@media (pointer: fine) {
  [data-timeline-rail] { display: flex; }
}
[data-timeline-rail]:not([data-persistent]) { opacity: 0; }
[data-timeline-rail]:not([data-persistent]):hover,
[data-timeline-rail]:not([data-persistent]):focus-within { opacity: 1; }
[data-timeline-rail][data-armed]:not([data-persistent]) { transition: opacity 150ms var(--timeline-rail-curve); }
[data-timeline-rail-body] {
  position: relative;
  margin-left: ${xt}px;
  height: var(--timeline-rail-height);
  flex: none;
  pointer-events: none;
}
[data-timeline-rail-body]:not([data-pass]) { pointer-events: auto; }
[data-timeline-rail-strip] {
  appearance: none;
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
  outline: none;
  user-select: none;
}
[data-timeline-rail-strip]:focus-visible { box-shadow: inset 0 0 0 2px var(--v2-border-border-focus); }
/* One span per prompt: 24px wide, drawn at a third of that at rest, scaled by index distance from the pointer.
   The colour is a node background, so only transform and the overlay's opacity ever change. */
[data-timeline-rail-tick] {
  position: absolute;
  left: 0;
  width: 24px;
  height: 2px;
  margin-top: -1px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--v2-text-text-faint) 45%, transparent);
  transform-origin: 0 50%;
  transform: scaleX(0.3333);
  pointer-events: none;
}
[data-timeline-rail-tick][data-d="0"] { transform: scaleX(1); background: color-mix(in srgb, var(--v2-text-text-base) 60%, transparent); }
[data-timeline-rail-tick][data-d="1"] { transform: scaleX(0.667); }
[data-timeline-rail-tick][data-d="2"] { transform: scaleX(0.417); }
[data-timeline-rail-tick]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 1px;
  background: var(--v2-text-text-base);
  opacity: 0;
}
[data-timeline-rail-tick][data-view]::after { opacity: 1; }
[data-timeline-rail][data-armed] [data-timeline-rail-tick] { transition: transform 150ms var(--timeline-rail-curve); }
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 150ms var(--timeline-rail-curve); }
[data-timeline-rail-turn] {
  position: absolute;
  left: 4px;
  z-index: 1;
  display: none;
  transform: translateX(-50%);
  opacity: 0;
}
[data-timeline-rail-body][data-navigation] [data-timeline-rail-turn] { display: inline-flex; pointer-events: auto; }
[data-timeline-rail-turn="previous"] { bottom: calc(100% + 2px); }
[data-timeline-rail-turn="previous"] svg { transform: rotate(180deg); }
[data-timeline-rail-turn="next"] { top: calc(100% + 2px); }
[data-timeline-rail][data-armed] [data-timeline-rail-turn] { transition: opacity 150ms var(--timeline-rail-curve); }
[data-timeline-rail-turn]:hover,
[data-timeline-rail-turn]:focus-within { opacity: 1; }
[data-timeline-rail-card] {
  position: absolute;
  left: 32px;
  width: 320px;
  display: block;
  cursor: text;
  user-select: text;
  pointer-events: auto;
}
[data-timeline-rail-card-body] {
  display: block;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 12px;
  background: var(--v2-background-bg-layer-01);
  box-shadow: var(--v2-elevation-floating);
  color: var(--v2-text-text-base);
  text-align: left;
}
[data-timeline-rail-card-title] {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
[data-timeline-rail-card-snippet] {
  display: -webkit-box;
  margin-top: 4px;
  max-height: 60px;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 20px;
  color: var(--v2-text-text-muted);
}
@media (prefers-reduced-motion: reduce) {
  [data-timeline-rail][data-armed] [data-timeline-rail-tick] { transition: none; }
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 120ms linear; }
}
`,Pe=Y.Plugin.define({setup(t){t.add(Y.Style,Ce),t.add(Y.Slot,{at:"session.header",render:e=>c.createComponent($e,{input:e,get ui(){return t.ui}})})}});c.delegateEvents(["pointerdown","pointermove","mousedown","click","keydown"]);exports.default=Pe;exports.measure=yt;
