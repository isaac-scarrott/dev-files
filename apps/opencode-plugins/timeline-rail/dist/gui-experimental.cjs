"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const l=require("solid-js/web"),G=require("@opencode/plugin/gui"),h=require("solid-js");function Lt(t,e,r){const n=e.filter(c=>c.bottom>r.top&&c.top<r.bottom),a=n.find(c=>c.prompt&&t.includes(c.owner))??n[0];if(!a)return-1;const i=t.indexOf(a.owner);if(i!==-1)return i;const u=t.findIndex(c=>c>a.owner);return u===-1?t.length-1:u-1}function Ht(t,e,r){const n=t.filter(c=>c.bottom>r.top&&c.top<r.bottom),a=n.length?n:t,i=a[0],u=a.at(-1);return!i||i.owner>=e?-1:u&&u.owner<e?1:0}function Ot(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const r=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:r,behavior:"smooth"}}function Nt(t){const e=Math.max(0,t.scrollHeight-t.clientHeight);return Math.min(e,Math.max(0,Math.round(t.index/Math.max(1,t.count)*t.scrollHeight)))}function qt(t){let e=Number.POSITIVE_INFINITY,r=-1;for(const v of t.rows){if(v.bottom<=t.box.top||v.top>=t.box.bottom)continue;const g=t.indexOf.get(v.owner);g!==void 0&&(e=Math.min(e,g),r=Math.max(r,g))}if(r===-1)return;if(t.target>=e&&t.target<=r)return 0;const n=t.rows.flatMap(v=>{const g=v.prompt?t.indexOf.get(v.owner):void 0;return g===void 0?[]:[{index:g,top:v.top}]}),a=n[0],i=n.at(-1),u=a&&i&&i.index>a.index?(i.top-a.top)/(i.index-a.index):0,c=u>0?u:t.fallback;return Math.round((t.target-(e+r)/2)*c)}const z=3,Ft=40,Bt=120,Dt=200,zt=3,Xt=20,Yt=24,Ut=2,Gt=4;function K(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const r=e.dataset.messageId;if(!r)return[];const n=e.getBoundingClientRect();return[{owner:r,prompt:e.dataset.timelineRow==="UserMessage",top:n.top,bottom:n.bottom}]})}function j(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function $(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(r=>r.dataset.messageId===e)}function ht(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}function V(t,e){const r=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,r.top-n.top+t.scrollTop-j(t))}async function Vt(t,e,r){let n=Number.NaN,a=0,i=0;for(let u=0;u<Ft&&!r.aborted;u+=1){await t.frame();const c=t.scroller.scrollTop,v=$(t.scroller,e);if(a=v&&c===n?a+1:0,i=v?0:i+1,n=c,a>=z||i>z)return}}async function Kt(t,e,r,n){const{scroller:a}=t;let i=0;for(let u=0;u<Dt&&!r.aborted;u+=1){if($(a,e))return;const c=Ht(K(a),e,a.getBoundingClientRect());if(c===0){if((i+=1)>z)return;await t.frame();continue}i=0;const v=Math.max(0,a.scrollHeight-a.clientHeight);if(c===-1&&a.scrollTop<=0||c===1&&a.scrollTop>=v)return;n.direction!==0&&c!==n.direction&&(n.step=Math.max(a.clientHeight/4,n.step/2)),n.direction=c,a.scrollTo({top:Math.min(v,Math.max(0,a.scrollTop+c*n.step)),behavior:"auto"}),await t.frame()}}async function jt(t,e,r){const{scroller:n}=t,a=t.ids(),i=a.indexOf(e),u=Nt({index:i,count:a.length,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});if(Math.abs(u-n.scrollTop)<Xt*n.clientHeight)return;const c=new Map(a.map((x,E)=>[x,E])),v=n.scrollHeight/Math.max(1,a.length),g=()=>Math.max(0,n.scrollHeight-n.clientHeight),I=async()=>{for(let x=0;x<Ut&&!r.aborted;x+=1)await t.frame()};n.scrollTo({top:u,behavior:"auto"}),await I();for(let x=0;x<Yt&&!r.aborted;x+=1){if($(n,e))return;const E=qt({rows:K(n),indexOf:c,target:i,fallback:v,box:n.getBoundingClientRect()});if(E===0)return;if(E===void 0){await I();continue}const y=Math.min(g(),Math.max(0,n.scrollTop+E));if(y===n.scrollTop)return;n.scrollTo({top:y,behavior:"auto"}),await I()}}async function Wt(t,e,r){const{scroller:n}=t;await jt(t,e,r);const a={step:n.clientHeight,direction:0};for(let i=0;i<zt&&!r.aborted;i+=1)if(await Kt(t,e,r,a),await Vt(t,e,r),$(n,e))return}async function Jt(t,e,r){const{scroller:n}=t,a=$(n,e);if(!a)return!1;const i=Ot({from:n.scrollTop,to:V(n,a),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});i.start!==void 0&&(n.scrollTo({top:i.start,behavior:"auto"}),await t.frame());const u=async g=>{if(i.behavior==="auto")return n.scrollTo({top:g,behavior:"auto"}),!0;n.scrollTo({top:g,behavior:i.behavior});let I=Number.NaN,x=0;for(let E=0;E<Bt&&!r.aborted;E+=1){await t.frame();const y=n.scrollTop;if(x=y===I?x+1:0,I=y,x>=z)break}return!0};if(!await u(i.to)||i.behavior==="auto"||r.aborted)return!0;const c=$(n,e);if(!c)return!0;const v=Math.min(V(n,c),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(v-n.scrollTop)>2&&await u(v),!0}const dt=["wheel","touchstart","pointerdown","keydown"];async function Qt(t,e,r){if(!t.ids().includes(e))return"none";ht(t.scroller);const n=new AbortController,a=()=>n.abort(),i=AbortSignal.any([r,n.signal]);for(const u of dt)t.scroller.addEventListener(u,a,{passive:!0});try{for(let u=0;u<Gt;u+=1){if(!$(t.scroller,e)&&(await Wt(t,e,i),i.aborted))return"aborted";if(!await Jt(t,e,i))return"none";if(i.aborted)return"aborted";const c=$(t.scroller,e);if(c&&Math.abs(V(t.scroller,c)-t.scroller.scrollTop)<=2)break}return i.aborted?"aborted":"done"}finally{for(const u of dt)t.scroller.removeEventListener(u,a)}}const Zt=8,te=2,ee="calc(100vh - 18rem)",ut=200,ne=1500,mt=10,oe=20,vt="User message",gt=t=>t.replace(/\s+/g," ").trim();function re(t){const e=t.metadata?.displayText,r=gt(typeof e=="string"&&e?e:t.text??"");return r?r.length>ut?`${r.slice(0,ut)}…`:r:vt}function ie(t){return gt(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}const ae="peerMessage",bt=t=>t.type==="user"&&t.metadata?.[ae]===void 0;function se(t,e){const r=[];for(const n of t)bt(n)&&!(e&&n.id>=e)&&r.push(n.id);return r}function le(t,e,r){const n=[];for(let a=0;a<t.length;a+=1){const i=t[a];if(!bt(i)||e&&i.id>=e||r&&i.id<r)continue;let u;for(let g=a+1;g<t.length&&t[g].type!=="user";g+=1)t[g].type==="assistant"&&(u=t[g]);const c=u?(u.content??[]).flatMap(g=>g.type==="text"&&g.text?[g.text]:[]).join(`
`):"",v=c.trim()?ie(c.slice(0,ne)):"";n.push({id:i.id,title:re(i),snippet:v||void 0})}return n}function ce(t,e,r=!0){if(e.length===0)return;if(!t)return{from:e[Math.max(0,e.length-mt)],loaded:e};const n=t.loaded[0],a=!r||n===void 0?0:e.indexOf(n),i=e.indexOf(t.from),u=i!==-1?i:e.findIndex(c=>c>t.from);return u===-1?{from:e[Math.max(0,e.length-mt)],loaded:e}:{from:e[Math.max(0,u-(a>0?Math.min(a,oe):0))],loaded:e}}function de(t){return`max(0px, min(${Math.max(1,(t-1)*Zt)}px, ${ee}))`}function ft(t,e){return e>1?t/(e-1)*100:0}function ue(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}function me(t,e,r){let n=Number.POSITIVE_INFINITY,a=-1;for(const i of e){if(!i.prompt||i.bottom<=r.top||i.top>=r.bottom)continue;const u=t.get(i.owner);u!==void 0&&(n=Math.min(n,u),a=Math.max(a,u))}return a===-1?void 0:[n,a]}var fe=l.template("<span>"),pe=l.template("<span style=display:contents>"),he=l.template("<div data-timeline-rail><div data-timeline-rail-body><button type=button data-timeline-rail-strip>"),ve=l.template("<span data-timeline-rail-tick aria-hidden=true>"),ge=l.template("<span data-timeline-rail-card-snippet dir=auto>"),be=l.template("<span data-timeline-rail-card><span data-timeline-rail-card-body role=tooltip><span data-timeline-rail-card-title dir=auto>");const wt=12,we=40,xe=48,ye=14,Me="(min-width: 768px)",Te=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,Se=()=>new Promise(t=>requestAnimationFrame(()=>t()));function Ee(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function xt(t,e){const r=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),a=n instanceof HTMLElement?n.getBoundingClientRect():r,i=t.querySelector("[data-timeline-row][data-message-id]"),u=i instanceof HTMLElement?i.getBoundingClientRect().left:r.left+Math.max(0,(r.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||r.width))/2),c=Math.max(0,u-r.left),v=j(t);return{top:a.top-r.top+v,height:Math.max(0,r.bottom-a.top-v),hit:Math.max(0,Math.min(we,Math.floor(c)-wt)),persistent:c>=xe}}const pt=t=>t?.closest?.("[data-timeline-rail-card]")!=null;function ke(t){const[e,r]=h.createSignal(),[n,a]=h.createSignal(),[i,u]=h.createSignal(),[c,v]=h.createSignal(-1),[g,I]=h.createSignal(),[x,E]=h.createSignal(!0),y=()=>t.input.session,W=()=>y().server.data.session,J=()=>W().message.list(y().id),Q=()=>W().get(y().id)?.revert?.messageID,Z=h.createMemo(()=>se(J(),Q()));let X=!1,N,tt;const yt=h.createMemo(()=>(tt!==y().id&&(tt=y().id,N=void 0,X=!1),N=ce(N,Z(),X),N)),q=h.createMemo(()=>{const o=yt()?.from;return o?le(J(),Q(),o):[]}),F=h.createMemo(()=>q().map(o=>o.id)),Mt=h.createMemo(()=>new Map(F().map((o,s)=>[o,s]))),k=()=>q().length;let et,B;const nt=o=>{B=void 0;const s=et?.closest("[data-scrollable]"),m=s&&Ee(s);s&&m?(r(s),a(m)):o>0&&(B=requestAnimationFrame(()=>nt(o-1)))};h.onMount(()=>nt(10)),h.onCleanup(()=>{B!==void 0&&cancelAnimationFrame(B)}),h.onMount(()=>{if(typeof window.matchMedia!="function")return;const o=window.matchMedia(Me),s=()=>E(o.matches);s(),o.addEventListener("change",s),h.onCleanup(()=>o.removeEventListener("change",s))}),h.createEffect(()=>{const o=e();if(!o)return;const s=()=>{X=!0},m=["wheel","touchmove","pointerdown","keydown"];for(const f of m)o.addEventListener(f,s,{passive:!0});h.onCleanup(()=>{for(const f of m)o.removeEventListener(f,s)})});const Tt=()=>{const o=e();if(o)return{scroller:o,ids:Z,reducedMotion:Te,frame:Se}};let R;const St=()=>{R=void 0;const o=e(),s=n();if(!t.input.active||!o||!s)return;const m=K(o),f=o.getBoundingClientRect(),b={top:f.top+j(o),bottom:f.bottom},_=me(Mt(),m,b),d=xt(o,s);v(Lt(F(),m,b)),I(p=>p&&_&&p[0]===_[0]&&p[1]===_[1]?p:_),u(p=>p&&p.top===d.top&&p.height===d.height&&p.hit===d.hit&&p.persistent===d.persistent?p:d)},A=()=>{R===void 0&&(R=requestAnimationFrame(St))};h.onCleanup(()=>{R!==void 0&&cancelAnimationFrame(R)}),h.createEffect(()=>{const o=e(),s=n();if(!o||!s)return;o.addEventListener("scroll",A,{passive:!0});const m=typeof ResizeObserver=="function"?new ResizeObserver(A):void 0;m?.observe(s);const f=s.querySelector("[data-slot='session-timeline-visible']");f&&m?.observe(f),A(),h.onCleanup(()=>{o.removeEventListener("scroll",A),m?.disconnect()})}),h.createEffect(h.on([F,()=>t.input.active,x],A,{defer:!0}));let L;const Et=o=>{const s=F()[o],m=Tt();if(!s||!m||!t.input.active)return;L?.abort();const f=new AbortController;L=f,Qt(m,s,f.signal).finally(()=>{L===f&&(L=void 0),A()})};h.onCleanup(()=>L?.abort());const[M,H]=h.createSignal(),[kt,It]=h.createSignal(!1),[ot,rt]=h.createSignal(!1),Y=()=>{const o=M();return o===void 0||o>=k()?void 0:q()[o]},Pt=()=>Y()?.title??vt;let D;const U=o=>{o!==void 0&&o>=0&&o<k()&&Et(o)},it=o=>{if(!D)return null;const s=D.getBoundingClientRect();return ue({count:k(),top:s.top,height:s.height,y:o.clientY})};let O=!1;const at=o=>{const s=f=>{f.buttons===0&&(m(),o())},m=()=>{window.removeEventListener("pointerup",s),window.removeEventListener("pointermove",s)};window.addEventListener("pointerup",s),window.addEventListener("pointermove",s)},Ct=o=>{const s=e();!s||o.defaultPrevented||o.ctrlKey||o.deltaY===0||(o.preventDefault(),ht(s),s.scrollBy({top:o.deltaY,left:o.deltaX}))},$t=o=>{const s=k()-1;if(o.key==="Enter"||o.key===" "){o.preventDefault(),U(M());return}const m=M()??0,f=o.key==="ArrowDown"?Math.min(s,m+1):o.key==="ArrowUp"?Math.max(0,m-1):o.key==="Home"?0:o.key==="End"?s:-1;f!==-1&&(o.preventDefault(),H(f))},_t=()=>{const o=i();return{top:`${o?.top??0}px`,height:`${o?.height??0}px`}},At=o=>{c()>=0&&U(c()+o)},st=o=>{const s=o==="previous",m=s?"Previous turn":"Next turn";return l.createComponent(t.ui.Tooltip,{value:m,placement:s?"top":"bottom",get children(){var f=fe();return l.setAttribute(f,"data-timeline-rail-turn",o),l.insert(f,l.createComponent(t.ui.IconButton,{icon:"chevron-down",label:m,size:"small",variant:"ghost-muted",get disabled(){return s?c()<=0:c()<0||c()>=k()-1},onClick:()=>At(s?-1:1)})),f}})},Rt=o=>o===0?"0%":o===k()-1?"-100%":"-50%";return(()=>{var o=pe();return l.use(s=>et=s,o),l.insert(o,l.createComponent(h.Show,{get when(){return l.memo(()=>!!(t.input.active&&x()&&k()>=te&&(i()?.hit??0)>0))()&&n()},children:s=>l.createComponent(l.Portal,{get mount(){return s()},ref:m=>m.style.display="contents",get children(){var m=he(),f=m.firstChild,b=f.firstChild;l.use(d=>{d.addEventListener("wheel",Ct,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>It(!0)))},m),f.$$pointermove=d=>{d.buttons===0||O||ot()||(rt(!0),at(()=>rt(!1)))},f.$$pointerdown=()=>{O||(O=!0,at(()=>O=!1))},l.insert(f,()=>st("previous"),b),b.$$keydown=$t,b.addEventListener("blur",()=>H(void 0)),b.addEventListener("focus",()=>{M()===void 0&&H(Math.max(0,c()))}),b.$$click=d=>{pt(d.target)||d.detail===0||(U(M()??it(d)??void 0),d.currentTarget.blur())},b.addEventListener("pointerleave",()=>H(void 0)),b.$$pointermove=d=>{if(d.pointerType==="touch"||d.buttons!==0&&!O)return;const p=it(d);p!==null&&p!==M()&&H(p)},b.$$mousedown=d=>{pt(d.target)||d.preventDefault()};var _=D;return typeof _=="function"?l.use(_,b):D=b,l.insert(b,l.createComponent(h.Index,{get each(){return q()},children:(d,p)=>(()=>{var T=ve();return l.setAttribute(T,"data-index",p),l.effect(S=>{var w=M()!==void 0&&Math.abs(p-M())<=2?Math.abs(p-M()):void 0,P=g()&&p>=g()[0]&&p<=g()[1]?"":void 0,C=`${ft(p,k())}%`;return w!==S.e&&l.setAttribute(T,"data-d",S.e=w),P!==S.t&&l.setAttribute(T,"data-view",S.t=P),C!==S.a&&l.setStyleProperty(T,"top",S.a=C),S},{e:void 0,t:void 0,a:void 0}),T})()}),null),l.insert(b,l.createComponent(h.Show,{get when(){return Y()},children:d=>(()=>{var p=be(),T=p.firstChild,S=T.firstChild;return p.$$pointermove=w=>w.stopPropagation(),l.insert(S,()=>d().title),l.insert(T,l.createComponent(h.Show,{get when(){return d().snippet},get children(){var w=ge();return l.insert(w,()=>d().snippet),w}}),null),l.effect(w=>{var P=`${ft(M(),k())}%`,C=`translateY(${Rt(M())})`;return P!==w.e&&l.setStyleProperty(p,"top",w.e=P),C!==w.t&&l.setStyleProperty(p,"transform",w.t=C),w},{e:void 0,t:void 0}),p})()}),null),l.insert(f,()=>st("next"),null),l.effect(d=>{var p=i()?.persistent?"":void 0,T=kt()?"":void 0,S=_t(),w=(i()?.hit??0)>=ye?"":void 0,P=ot()?"":void 0,C=de(k()),lt=Y()?"22rem":`${i()?.hit??0}px`,ct=`Jump to message: ${Pt()}`;return p!==d.e&&l.setAttribute(m,"data-persistent",d.e=p),T!==d.t&&l.setAttribute(m,"data-armed",d.t=T),d.a=l.style(m,S,d.a),w!==d.o&&l.setAttribute(f,"data-navigation",d.o=w),P!==d.i&&l.setAttribute(f,"data-pass",d.i=P),C!==d.n&&l.setStyleProperty(f,"--timeline-rail-height",d.n=C),lt!==d.s&&l.setStyleProperty(f,"width",d.s=lt),ct!==d.h&&l.setAttribute(b,"aria-label",d.h=ct),d},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),m}})})),o})()}const Ie=`
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
  margin-left: ${wt}px;
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
`,Pe=G.Plugin.define({setup(t){t.add(G.Style,Ie),t.add(G.Slot,{at:"session.header",render:e=>l.createComponent(ke,{input:e,get ui(){return t.ui}})})}});l.delegateEvents(["pointerdown","pointermove","mousedown","click","keydown"]);exports.default=Pe;exports.measure=xt;
