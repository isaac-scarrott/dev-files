"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const c=require("solid-js/web"),V=require("@opencode/plugin/gui"),v=require("solid-js");function Ht(t,e,r){const n=e.filter(l=>l.bottom>r.top&&l.top<r.bottom),i=n.find(l=>l.prompt&&t.includes(l.owner))??n[0];if(!i)return-1;const a=t.indexOf(i.owner);if(a!==-1)return a;const d=t.findIndex(l=>l>i.owner);return d===-1?t.length-1:d-1}function Nt(t,e,r){const n=t.filter(l=>l.bottom>r.top&&l.top<r.bottom),i=n.length?n:t,a=i[0],d=i.at(-1);return!a||a.owner>=e?-1:d&&d.owner<e?1:0}function qt(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const r=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:r,behavior:"smooth"}}function Ft(t){const e=Math.max(0,t.scrollHeight-t.clientHeight);return Math.min(e,Math.max(0,Math.round(t.index/Math.max(1,t.count)*t.scrollHeight)))}function Bt(t){let e=Number.POSITIVE_INFINITY,r=-1;for(const p of t.rows){if(p.bottom<=t.box.top||p.top>=t.box.bottom)continue;const g=t.indexOf.get(p.owner);g!==void 0&&(e=Math.min(e,g),r=Math.max(r,g))}if(r===-1)return;if(t.target>=e&&t.target<=r)return 0;const n=t.rows.flatMap(p=>{const g=p.prompt?t.indexOf.get(p.owner):void 0;return g===void 0?[]:[{index:g,top:p.top}]}),i=n[0],a=n.at(-1),d=i&&a&&a.index>i.index?(a.top-i.top)/(a.index-i.index):0,l=d>0?d:t.fallback;return Math.round((t.target-(e+r)/2)*l)}const z=3,Dt=40,zt=120,Xt=200,Yt=3,Ut=20,Vt=24,Gt=2,Kt=4;function K(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const r=e.dataset.messageId;if(!r)return[];const n=e.getBoundingClientRect();return[{owner:r,prompt:e.dataset.timelineRow==="UserMessage",top:n.top,bottom:n.bottom}]})}function j(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function C(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(r=>r.dataset.messageId===e)}function gt(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}function G(t,e){const r=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,r.top-n.top+t.scrollTop-j(t))}async function jt(t,e,r){let n=Number.NaN,i=0,a=0;for(let d=0;d<Dt&&!r.aborted;d+=1){await t.frame();const l=t.scroller.scrollTop,p=C(t.scroller,e);if(i=p&&l===n?i+1:0,a=p?0:a+1,n=l,i>=z||a>z)return}}async function Wt(t,e,r,n){const{scroller:i}=t;let a=0;for(let d=0;d<Xt&&!r.aborted;d+=1){if(C(i,e))return;const l=Nt(K(i),e,i.getBoundingClientRect());if(l===0){if((a+=1)>z)return;await t.frame();continue}a=0;const p=Math.max(0,i.scrollHeight-i.clientHeight);if(l===-1&&i.scrollTop<=0||l===1&&i.scrollTop>=p)return;n.direction!==0&&l!==n.direction&&(n.step=Math.max(i.clientHeight/4,n.step/2)),n.direction=l,i.scrollTo({top:Math.min(p,Math.max(0,i.scrollTop+l*n.step)),behavior:"auto"}),await t.frame()}}async function Jt(t,e,r){const{scroller:n}=t,i=t.ids(),a=i.indexOf(e),d=Ft({index:a,count:i.length,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});if(Math.abs(d-n.scrollTop)<Ut*n.clientHeight)return;const l=new Map(i.map((x,S)=>[x,S])),p=n.scrollHeight/Math.max(1,i.length),g=()=>Math.max(0,n.scrollHeight-n.clientHeight),I=async()=>{for(let x=0;x<Gt&&!r.aborted;x+=1)await t.frame()};n.scrollTo({top:d,behavior:"auto"}),await I();for(let x=0;x<Vt&&!r.aborted;x+=1){if(C(n,e))return;const S=Bt({rows:K(n),indexOf:l,target:a,fallback:p,box:n.getBoundingClientRect()});if(S===0)return;if(S===void 0){await I();continue}const y=Math.min(g(),Math.max(0,n.scrollTop+S));if(y===n.scrollTop)return;n.scrollTo({top:y,behavior:"auto"}),await I()}}async function Qt(t,e,r){const{scroller:n}=t;await Jt(t,e,r);const i={step:n.clientHeight,direction:0};for(let a=0;a<Yt&&!r.aborted;a+=1)if(await Wt(t,e,r,i),await jt(t,e,r),C(n,e))return}async function Zt(t,e,r){const{scroller:n}=t,i=C(n,e);if(!i)return!1;const a=qt({from:n.scrollTop,to:G(n,i),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});a.start!==void 0&&(n.scrollTo({top:a.start,behavior:"auto"}),await t.frame());const d=async g=>{if(a.behavior==="auto")return n.scrollTo({top:g,behavior:"auto"}),!0;if(t.tween)return t.tween(g,r);n.scrollTo({top:g,behavior:a.behavior});let I=Number.NaN,x=0;for(let S=0;S<zt&&!r.aborted;S+=1){await t.frame();const y=n.scrollTop;if(x=y===I?x+1:0,I=y,x>=z)break}return!0};if(!await d(a.to)||a.behavior==="auto"||r.aborted)return!0;const l=C(n,e);if(!l)return!0;const p=Math.min(G(n,l),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(p-n.scrollTop)>2&&await d(p),!0}const dt=["wheel","touchstart","pointerdown","keydown"];async function te(t,e,r){if(!t.ids().includes(e))return"none";gt(t.scroller);const n=new AbortController,i=()=>n.abort(),a=AbortSignal.any([r,n.signal]);for(const d of dt)t.scroller.addEventListener(d,i,{passive:!0});try{for(let d=0;d<Kt;d+=1){if(!C(t.scroller,e)&&(await Qt(t,e,a),a.aborted))return"aborted";if(!await Zt(t,e,a))return"none";if(a.aborted)return"aborted";const l=C(t.scroller,e);if(l&&Math.abs(G(t.scroller,l)-t.scroller.scrollTop)<=2)break}return a.aborted?"aborted":"done"}finally{for(const d of dt)t.scroller.removeEventListener(d,i)}}const ee=8,ne=2,oe="calc(100vh - 18rem)",ut=200,re=1500,mt=10,ie=20,bt="User message",wt=t=>t.replace(/\s+/g," ").trim();function ae(t){const e=t.metadata?.displayText,r=wt(typeof e=="string"&&e?e:t.text??"");return r?r.length>ut?`${r.slice(0,ut)}…`:r:bt}function se(t){return wt(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}const le="peerMessage",xt=t=>t.type==="user"&&t.metadata?.[le]===void 0;function ce(t,e){const r=[];for(const n of t)xt(n)&&!(e&&n.id>=e)&&r.push(n.id);return r}function de(t,e,r){const n=[];for(let i=0;i<t.length;i+=1){const a=t[i];if(!xt(a)||e&&a.id>=e||r&&a.id<r)continue;let d;for(let g=i+1;g<t.length&&t[g].type!=="user";g+=1)t[g].type==="assistant"&&(d=t[g]);const l=d?(d.content??[]).flatMap(g=>g.type==="text"&&g.text?[g.text]:[]).join(`
`):"",p=l.trim()?se(l.slice(0,re)):"";n.push({id:a.id,title:ae(a),snippet:p||void 0})}return n}function ue(t,e,r=!0){if(e.length===0)return;if(!t)return{from:e[Math.max(0,e.length-mt)],loaded:e};const n=t.loaded[0],i=!r||n===void 0?0:e.indexOf(n),a=e.indexOf(t.from),d=a!==-1?a:e.findIndex(l=>l>t.from);return d===-1?{from:e[Math.max(0,e.length-mt)],loaded:e}:{from:e[Math.max(0,d-(i>0?Math.min(i,ie):0))],loaded:e}}function me(t){return`max(0px, min(${Math.max(1,(t-1)*ee)}px, ${oe}))`}function ft(t,e){return e>1?t/(e-1)*100:0}function fe(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}function pe(t,e,r){let n=Number.POSITIVE_INFINITY,i=-1;for(const a of e){if(!a.prompt||a.bottom<=r.top||a.top>=r.bottom)continue;const d=t.get(a.owner);d!==void 0&&(n=Math.min(n,d),i=Math.max(i,d))}return i===-1?void 0:[n,i]}const he=t=>1-(1-t)**4;function ve(t){return Math.round(Math.min(420,180+Math.abs(t)*.12))}const pt=["wheel","touchstart","pointerdown","keydown"];async function ge(t,e,r){const{scroller:n}=t,i=n.scrollTop,a=ve(e-i);let d=!1;const l=()=>{d=!0};for(const p of pt)n.addEventListener(p,l,{passive:!0});try{const p=t.now();for(;;){if(await t.frame(),d||r.aborted)return!1;const g=Math.min(1,(t.now()-p)/a);if(n.scrollTo({top:i+(e-i)*he(g),behavior:"auto"}),g>=1)return!0}}finally{for(const p of pt)n.removeEventListener(p,l)}}var be=c.template("<span>"),we=c.template("<span style=display:contents>"),xe=c.template("<div data-timeline-rail><div data-timeline-rail-body><button type=button data-timeline-rail-strip>"),ye=c.template("<span data-timeline-rail-tick aria-hidden=true>"),Me=c.template("<span data-timeline-rail-card-snippet dir=auto>"),Te=c.template("<span data-timeline-rail-card><span data-timeline-rail-card-body role=tooltip><span data-timeline-rail-card-title dir=auto>");const yt=12,Ee=40,Se=48,ke=14,Ie="(min-width: 768px)",Pe=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,ht=()=>new Promise(t=>requestAnimationFrame(()=>t()));function $e(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function Mt(t,e){const r=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),i=n instanceof HTMLElement?n.getBoundingClientRect():r,a=t.querySelector("[data-timeline-row][data-message-id]"),d=a instanceof HTMLElement?a.getBoundingClientRect().left:r.left+Math.max(0,(r.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||r.width))/2),l=Math.max(0,d-r.left),p=j(t);return{top:i.top-r.top+p,height:Math.max(0,r.bottom-i.top-p),hit:Math.max(0,Math.min(Ee,Math.floor(l)-yt)),persistent:l>=Se}}const vt=t=>t?.closest?.("[data-timeline-rail-card]")!=null;function Ce(t){const[e,r]=v.createSignal(),[n,i]=v.createSignal(),[a,d]=v.createSignal(),[l,p]=v.createSignal(-1),[g,I]=v.createSignal(),[x,S]=v.createSignal(!0),y=()=>t.input.session,W=()=>y().server.data.session,J=()=>W().message.list(y().id),Q=()=>W().get(y().id)?.revert?.messageID,Z=v.createMemo(()=>ce(J(),Q()));let X=!1,N,tt;const Tt=v.createMemo(()=>(tt!==y().id&&(tt=y().id,N=void 0,X=!1),N=ue(N,Z(),X),N)),q=v.createMemo(()=>{const o=Tt()?.from;return o?de(J(),Q(),o):[]}),F=v.createMemo(()=>q().map(o=>o.id)),Et=v.createMemo(()=>new Map(F().map((o,s)=>[o,s]))),k=()=>q().length;let et,B;const nt=o=>{B=void 0;const s=et?.closest("[data-scrollable]"),m=s&&$e(s);s&&m?(r(s),i(m)):o>0&&(B=requestAnimationFrame(()=>nt(o-1)))};v.onMount(()=>nt(10)),v.onCleanup(()=>{B!==void 0&&cancelAnimationFrame(B)}),v.onMount(()=>{if(typeof window.matchMedia!="function")return;const o=window.matchMedia(Ie),s=()=>S(o.matches);s(),o.addEventListener("change",s),v.onCleanup(()=>o.removeEventListener("change",s))}),v.createEffect(()=>{const o=e();if(!o)return;const s=()=>{X=!0},m=["wheel","touchmove","pointerdown","keydown"];for(const f of m)o.addEventListener(f,s,{passive:!0});v.onCleanup(()=>{for(const f of m)o.removeEventListener(f,s)})});const St=()=>{const o=e();if(o)return{scroller:o,ids:Z,reducedMotion:Pe,frame:ht,tween:(s,m)=>ge({scroller:o,frame:ht,now:()=>performance.now()},s,m)}};let R;const kt=()=>{R=void 0;const o=e(),s=n();if(!t.input.active||!o||!s)return;const m=K(o),f=o.getBoundingClientRect(),b={top:f.top+j(o),bottom:f.bottom},A=pe(Et(),m,b),u=Mt(o,s);p(Ht(F(),m,b)),I(h=>h&&A&&h[0]===A[0]&&h[1]===A[1]?h:A),d(h=>h&&h.top===u.top&&h.height===u.height&&h.hit===u.hit&&h.persistent===u.persistent?h:u)},_=()=>{R===void 0&&(R=requestAnimationFrame(kt))};v.onCleanup(()=>{R!==void 0&&cancelAnimationFrame(R)}),v.createEffect(()=>{const o=e(),s=n();if(!o||!s)return;o.addEventListener("scroll",_,{passive:!0});const m=typeof ResizeObserver=="function"?new ResizeObserver(_):void 0;m?.observe(s);const f=s.querySelector("[data-slot='session-timeline-visible']");f&&m?.observe(f),_(),v.onCleanup(()=>{o.removeEventListener("scroll",_),m?.disconnect()})}),v.createEffect(v.on([F,()=>t.input.active,x],_,{defer:!0}));let L;const It=o=>{const s=F()[o],m=St();if(!s||!m||!t.input.active)return;L?.abort();const f=new AbortController;L=f,te(m,s,f.signal).finally(()=>{L===f&&(L=void 0),_()})};v.onCleanup(()=>L?.abort());const[M,O]=v.createSignal(),[Pt,$t]=v.createSignal(!1),[ot,rt]=v.createSignal(!1),Y=()=>{const o=M();return o===void 0||o>=k()?void 0:q()[o]},Ct=()=>Y()?.title??bt;let D;const U=o=>{o!==void 0&&o>=0&&o<k()&&It(o)},it=o=>{if(!D)return null;const s=D.getBoundingClientRect();return fe({count:k(),top:s.top,height:s.height,y:o.clientY})};let H=!1;const at=o=>{const s=f=>{f.buttons===0&&(m(),o())},m=()=>{window.removeEventListener("pointerup",s),window.removeEventListener("pointermove",s)};window.addEventListener("pointerup",s),window.addEventListener("pointermove",s)},At=o=>{const s=e();!s||o.defaultPrevented||o.ctrlKey||o.deltaY===0||(o.preventDefault(),gt(s),s.scrollBy({top:o.deltaY,left:o.deltaX}))},_t=o=>{const s=k()-1;if(o.key==="Enter"||o.key===" "){o.preventDefault(),U(M());return}const m=M()??0,f=o.key==="ArrowDown"?Math.min(s,m+1):o.key==="ArrowUp"?Math.max(0,m-1):o.key==="Home"?0:o.key==="End"?s:-1;f!==-1&&(o.preventDefault(),O(f))},Rt=()=>{const o=a();return{top:`${o?.top??0}px`,height:`${o?.height??0}px`}},Lt=o=>{l()>=0&&U(l()+o)},st=o=>{const s=o==="previous",m=s?"Previous turn":"Next turn";return c.createComponent(t.ui.Tooltip,{value:m,placement:s?"top":"bottom",get children(){var f=be();return c.setAttribute(f,"data-timeline-rail-turn",o),c.insert(f,c.createComponent(t.ui.IconButton,{icon:"chevron-down",label:m,size:"small",variant:"ghost-muted",get disabled(){return s?l()<=0:l()<0||l()>=k()-1},onClick:()=>Lt(s?-1:1)})),f}})},Ot=o=>o===0?"0%":o===k()-1?"-100%":"-50%";return(()=>{var o=we();return c.use(s=>et=s,o),c.insert(o,c.createComponent(v.Show,{get when(){return c.memo(()=>!!(t.input.active&&x()&&k()>=ne&&(a()?.hit??0)>0))()&&n()},children:s=>c.createComponent(c.Portal,{get mount(){return s()},ref:m=>m.style.display="contents",get children(){var m=xe(),f=m.firstChild,b=f.firstChild;c.use(u=>{u.addEventListener("wheel",At,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>$t(!0)))},m),f.$$pointermove=u=>{u.buttons===0||H||ot()||(rt(!0),at(()=>rt(!1)))},f.$$pointerdown=()=>{H||(H=!0,at(()=>H=!1))},c.insert(f,()=>st("previous"),b),b.$$keydown=_t,b.addEventListener("blur",()=>O(void 0)),b.addEventListener("focus",()=>{M()===void 0&&O(Math.max(0,l()))}),b.$$click=u=>{vt(u.target)||u.detail===0||(U(M()??it(u)??void 0),u.currentTarget.blur())},b.addEventListener("pointerleave",()=>O(void 0)),b.$$pointermove=u=>{if(u.pointerType==="touch"||u.buttons!==0&&!H)return;const h=it(u);h!==null&&h!==M()&&O(h)},b.$$mousedown=u=>{vt(u.target)||u.preventDefault()};var A=D;return typeof A=="function"?c.use(A,b):D=b,c.insert(b,c.createComponent(v.Index,{get each(){return q()},children:(u,h)=>(()=>{var T=ye();return c.setAttribute(T,"data-index",h),c.effect(E=>{var w=M()!==void 0&&Math.abs(h-M())<=2?Math.abs(h-M()):void 0,P=g()&&h>=g()[0]&&h<=g()[1]?"":void 0,$=`${ft(h,k())}%`;return w!==E.e&&c.setAttribute(T,"data-d",E.e=w),P!==E.t&&c.setAttribute(T,"data-view",E.t=P),$!==E.a&&c.setStyleProperty(T,"top",E.a=$),E},{e:void 0,t:void 0,a:void 0}),T})()}),null),c.insert(b,c.createComponent(v.Show,{get when(){return Y()},children:u=>(()=>{var h=Te(),T=h.firstChild,E=T.firstChild;return h.$$pointermove=w=>w.stopPropagation(),c.insert(E,()=>u().title),c.insert(T,c.createComponent(v.Show,{get when(){return u().snippet},get children(){var w=Me();return c.insert(w,()=>u().snippet),w}}),null),c.effect(w=>{var P=`${ft(M(),k())}%`,$=`translateY(${Ot(M())})`;return P!==w.e&&c.setStyleProperty(h,"top",w.e=P),$!==w.t&&c.setStyleProperty(h,"transform",w.t=$),w},{e:void 0,t:void 0}),h})()}),null),c.insert(f,()=>st("next"),null),c.effect(u=>{var h=a()?.persistent?"":void 0,T=Pt()?"":void 0,E=Rt(),w=(a()?.hit??0)>=ke?"":void 0,P=ot()?"":void 0,$=me(k()),lt=Y()?"22rem":`${a()?.hit??0}px`,ct=`Jump to message: ${Ct()}`;return h!==u.e&&c.setAttribute(m,"data-persistent",u.e=h),T!==u.t&&c.setAttribute(m,"data-armed",u.t=T),u.a=c.style(m,E,u.a),w!==u.o&&c.setAttribute(f,"data-navigation",u.o=w),P!==u.i&&c.setAttribute(f,"data-pass",u.i=P),$!==u.n&&c.setStyleProperty(f,"--timeline-rail-height",u.n=$),lt!==u.s&&c.setStyleProperty(f,"width",u.s=lt),ct!==u.h&&c.setAttribute(b,"aria-label",u.h=ct),u},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),m}})})),o})()}const Ae=`
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
  margin-left: ${yt}px;
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
`,_e=V.Plugin.define({setup(t){t.add(V.Style,Ae),t.add(V.Slot,{at:"session.header",render:e=>c.createComponent(Ce,{input:e,get ui(){return t.ui}})})}});c.delegateEvents(["pointerdown","pointermove","mousedown","click","keydown"]);exports.default=_e;exports.measure=Mt;
