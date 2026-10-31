"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const s=require("solid-js/web"),nt=require("@opencode/plugin/gui"),c=require("solid-js"),jt=160,Wt=4;function Kt(t){const e=t.scroller.getBoundingClientRect().top+t.inset();for(const i of t.scroller.querySelectorAll("[data-message-id]")){const r=i.getBoundingClientRect();if(r.bottom>e)return{element:i,top:r.top}}}async function Xt(t,e,i){const{scroller:r}=t;for(let a=0;a<Wt&&!i.aborted;a+=1){if(await t.frame(),!e.element.isConnected||t.idle()<32)return;const l=e.element.getBoundingClientRect().top-e.top;t.drift?.(l),Math.abs(l)>1&&r.scrollTo({top:r.scrollTop+l,behavior:"auto"})}}async function Jt(t,e){if(!(!t.more()||e.aborted)){t.loading(!0);try{for(;t.more()&&!e.aborted;){for(await t.frame();t.idle()<jt&&!e.aborted;)await t.frame();if(e.aborted)return;let i;await t.loadMore({signal:e,beforePublish:()=>i=Kt(t)}),i&&await Xt(t,i,e)}}catch{}finally{t.loading(!1)}}}const Qt=8;function Zt(t,e,i){if(t.length===0)return-1;const r=e.find(u=>u.bottom>i+Qt)??e.at(-1);if(!r)return-1;const a=t.indexOf(r.owner);if(a!==-1)return a;const l=t.findIndex(u=>u>r.owner);return l===-1?t.length-1:Math.max(0,l-1)}function te(t){return t.ids.indexOf(t.target)>=1?{kind:"probe"}:t.more?{kind:"load"}:{kind:"top"}}function ee(t,e,i){const r=t.filter(f=>f.bottom>i.top&&f.top<i.bottom),a=r.length?r:t,l=a[0],u=a.at(-1);return!l||l.owner>=e?-1:u&&u.owner<e?1:0}function ne(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const i=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:i,behavior:"smooth"}}const J=3,re=40,ie=120,ae=200,oe=3,le=5;function Et(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const i=e.dataset.messageId;if(!i)return[];const r=e.getBoundingClientRect();return[{owner:i,prompt:e.dataset.timelineRow==="UserMessage",top:r.top,bottom:r.bottom}]})}function Q(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function F(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(i=>i.dataset.messageId===e)}function ce(t){const e=t.scroller.getBoundingClientRect();return Zt(t.ids(),Et(t.scroller),e.top+Q(t.scroller))}function se(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}async function de(t,e){t.loading?.(!0);try{await t.loadMore(e)}finally{t.loading?.(!1)}}function yt(t,e){const i=e.getBoundingClientRect(),r=t.getBoundingClientRect();return Math.max(0,i.top-r.top+t.scrollTop-Q(t))}async function wt(t,e,i){let r=Number.NaN,a=0,l=0;for(let u=0;u<re&&!i.aborted;u+=1){await t.frame();const f=t.scroller.scrollTop,v=F(t.scroller,e);if(a=v&&f===r?a+1:0,l=v?0:l+1,r=f,a>=J||l>J)return}}async function me(t,e,i,r){const{scroller:a}=t;let l=0;for(let u=0;u<ae&&!i.aborted;u+=1){if(F(a,e))return;const f=ee(Et(a),e,a.getBoundingClientRect());if(f===0){if((l+=1)>J)return;await t.frame();continue}l=0;const v=Math.max(0,a.scrollHeight-a.clientHeight);if(f===-1&&a.scrollTop<=0||f===1&&a.scrollTop>=v)return;r.direction!==0&&f!==r.direction&&(r.step=Math.max(a.clientHeight/4,r.step/2)),r.direction=f,a.scrollTo({top:Math.min(v,Math.max(0,a.scrollTop+f*r.step)),behavior:"auto"}),await t.frame()}}async function St(t,e,i,r=0){const{scroller:a}=t,l=te({ids:t.ids(),target:e,more:t.more()});if(l.kind==="load")return r>=le||(await de(t,i),i.aborted)?void 0:St(t,e,i,r+1);if(l.kind==="top")return a.scrollTo({top:0,behavior:"auto"}),wt(t,e,i);const u={step:a.clientHeight,direction:0};for(let f=0;f<oe&&!i.aborted;f+=1)if(await me(t,e,i,u),await wt(t,e,i),F(a,e))return}async function ue(t,e,i){const{scroller:r}=t,a=F(r,e);if(!a)return!1;const l=ne({from:r.scrollTop,to:yt(r,a),viewport:r.clientHeight,max:r.scrollHeight-r.clientHeight,reduced:t.reducedMotion()});l.start!==void 0&&(r.scrollTo({top:l.start,behavior:"auto"}),await t.frame());const u=async M=>{if(l.behavior==="auto")return r.scrollTo({top:M,behavior:"auto"}),!0;if(t.tween)return t.tween(M,i);r.scrollTo({top:M,behavior:l.behavior});let A=Number.NaN,x=0;for(let z=0;z<ie&&!i.aborted;z+=1){await t.frame();const k=r.scrollTop;if(x=k===A?x+1:0,A=k,x>=J)break}return!0};if(!await u(l.to)||l.behavior==="auto"||i.aborted)return!0;const f=F(r,e);if(!f)return!0;const v=Math.min(yt(r,f),Math.max(0,r.scrollHeight-r.clientHeight));return Math.abs(v-r.scrollTop)>2&&await u(v),!0}async function fe(t,e,i){return t.ids().includes(e)?(se(t.scroller),!F(t.scroller,e)&&(await St(t,e,i),i.aborted)?"aborted":await ue(t,e,i)?i.aborted?"aborted":"done":"none"):"none"}const X=4,pe=10,ve=.6,xt=200,Mt=240,ot=t=>t.replace(/\s+/g," ").trim();function ge(t){const e=t.metadata?.displayText,i=ot(typeof e=="string"&&e?e:t.text??"");if(i)return i.length>xt?`${i.slice(0,xt)}…`:i;const r=(t.files??[]).map(u=>u.mime.startsWith("image/")?"[image]":`[${u.name??"file"}]`),a=(t.agents??[]).map(u=>`@${u.name}`),l=[...r,...a];return l.length?l.slice(0,3).join(" "):"(empty prompt)"}function he(t){return ot(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}function be(t,e){const i=[];for(let r=0;r<t.length;r+=1){const a=t[r];if(a.type!=="user"||e&&a.id>=e)continue;let l,u=!1;for(let v=r+1;v<t.length&&t[v].type!=="user";v+=1){const M=t[v];if(M.type!=="assistant")continue;const A=M.content?.find(x=>x.type==="text"&&x.text&&ot(x.text))?.text;if(A){const x=he(A);l=x.length>Mt?`${x.slice(0,Mt)}…`:x;break}M.time?.completed===void 0&&!M.error&&(u=!0)}const f=ge(a);i.push({id:a.id,title:f,snippet:l,working:!l&&u})}return i}function ye(t,e){const i=Math.max(0,e*ve),r=Math.max(1,Math.floor(i/X));if(t<=r)return{pitch:t>0?Math.min(pe,Math.max(X,Math.floor(i/t))):X,ticks:Array.from({length:t},(u,f)=>({start:f,end:f}))};const a=[];for(let l=0;l<r;l+=1)a.push({start:Math.floor(l*t/r),end:Math.floor((l+1)*t/r)-1});return{pitch:X,ticks:a}}function we(t,e){return t.findIndex(i=>e>=i.start&&e<=i.end)}const xe=t=>1-(1-t)**4;function Me(t){return Math.round(Math.min(420,180+Math.abs(t)*.12))}const kt=["wheel","touchstart","pointerdown","keydown"];async function ke(t,e,i){const{scroller:r}=t,a=r.scrollTop,l=Me(e-a);let u=!1;const f=()=>{u=!0};for(const v of kt)r.addEventListener(v,f,{passive:!0});try{const v=t.now();for(;;){if(await t.frame(),u||i.aborted)return!1;const M=Math.min(1,(t.now()-v)/l);if(r.scrollTo({top:a+(e-a)*xe(M),behavior:"auto"}),M>=1)return!0}}finally{for(const v of kt)r.removeEventListener(v,f)}}var Te=s.template("<span style=display:contents>"),Ee=s.template("<div data-timeline-rail-card-meta>"),Se=s.template("<div data-timeline-rail-card-snippet dir=auto>"),Ae=s.template("<div data-timeline-rail-card><div data-timeline-rail-card-body role=tooltip><div data-timeline-rail-card-title dir=auto>"),Ce=s.template('<div data-timeline-rail><div data-timeline-rail-ticks role=toolbar aria-orientation=vertical aria-label="Your prompts"><span data-timeline-rail-history aria-hidden=true>'),$e=s.template("<button type=button data-timeline-rail-tick>");const at=28,Ie=6,_e=44,Le="(min-width: 768px)",Re=400,Pe=300,He=90,Fe=1.4,Tt=30,rt=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,it=()=>new Promise(t=>requestAnimationFrame(()=>t()));function Ne(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function At(t,e){const i=e.getBoundingClientRect(),r=e.querySelector("[data-slot='session-timeline-visible']"),a=r instanceof HTMLElement?r.getBoundingClientRect():i,l=t.querySelector("[data-timeline-row][data-message-id]"),f=(l instanceof HTMLElement?l.getBoundingClientRect().left:i.left+Math.max(0,(i.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||i.width))/2))-i.left,v=Q(t);return{top:a.top-i.top+v,height:Math.max(0,i.bottom-a.top-v),left:Math.min(Ie,Math.max(0,Math.round((f-at)/2))),show:f>=_e}}function Oe(t){const[e,i]=c.createSignal(),[r,a]=c.createSignal(),[l,u]=c.createSignal(),[f,v]=c.createSignal(-1),[M,A]=c.createSignal(!1),[x,z]=c.createSignal(!0),k=()=>t.input.session,$=()=>k().server.data.session,C=c.createMemo(()=>be($().message.list(k().id),$().get(k().id)?.revert?.messageID)),Y=c.createMemo(()=>C().map(n=>n.id)),G=c.createMemo(()=>$().message.more(k().id)),N=c.createMemo(()=>ye(C().length,l()?.height??0)),Z=c.createMemo(()=>we(N().ticks,f()));let lt,U;const ct=n=>{U=void 0;const o=lt?.closest("[data-scrollable]"),d=o&&Ne(o);o&&d?(i(o),a(d)):n>0&&(U=requestAnimationFrame(()=>ct(n-1)))};c.onMount(()=>ct(10)),c.onCleanup(()=>{U!==void 0&&cancelAnimationFrame(U)}),c.onMount(()=>{if(typeof window.matchMedia!="function")return;const n=window.matchMedia(Le),o=()=>z(n.matches);o(),n.addEventListener("change",o),c.onCleanup(()=>n.removeEventListener("change",o))});let st=Number.NEGATIVE_INFINITY;const Ct=()=>performance.now()-st;c.createEffect(()=>{const n=e();if(!n)return;const o=()=>{st=performance.now()},d=["wheel","touchstart","touchmove","pointerdown","keydown"];for(const m of d)n.addEventListener(m,o,{passive:!0});c.onCleanup(()=>{for(const m of d)n.removeEventListener(m,o)})});const $t=()=>{const n=e();if(n)return{scroller:n,ids:Y,more:G,loadMore:o=>$().message.loadMore(k().id,{signal:o}),reducedMotion:rt,frame:it,loading:A,tween:(o,d)=>ke({scroller:n,frame:it,now:()=>performance.now()},o,d)}},[tt,dt]=c.createSignal(!1),It=c.createMemo(()=>t.input.active);c.createEffect(()=>{const n=e();if(!n||!It()||!G())return;const o=new AbortController,d={scroller:n,more:()=>$().message.more(k().id),loadMore:({signal:m,beforePublish:h})=>$().message.loadMore(k().id,{signal:m,beforePublish:h}),frame:it,idle:Ct,inset:()=>Q(n),loading:dt,drift:globalThis.__timelineRailDrift};c.untrack(()=>Jt(d,o.signal)),c.onCleanup(()=>{o.abort(),dt(!1)})});let O;const _t=()=>{O=void 0;const n=e(),o=r();if(!t.input.active||!n||!o)return;const d=ce({scroller:n,ids:Y}),m=At(n,o);v(d),u(h=>h&&h.top===m.top&&h.height===m.height&&h.left===m.left&&h.show===m.show?h:m)},I=()=>{O===void 0&&(O=requestAnimationFrame(_t))};c.onCleanup(()=>{O!==void 0&&cancelAnimationFrame(O)}),c.createEffect(()=>{const n=e(),o=r();if(!n||!o)return;n.addEventListener("scroll",I,{passive:!0});const d=typeof ResizeObserver=="function"?new ResizeObserver(I):void 0;d?.observe(o);const m=o.querySelector("[data-slot='session-timeline-visible']");m&&d?.observe(m),I(),c.onCleanup(()=>{n.removeEventListener("scroll",I),d?.disconnect()})}),c.createEffect(c.on([Y,G,()=>t.input.active,x],I,{defer:!0}));let q;const Lt=n=>{const o=Y()[n],d=$t();if(!o||!d||!t.input.active)return;q?.abort();const m=new AbortController;q=m,fe(d,o,m.signal).finally(()=>{q===m&&(q=void 0),I()})};c.onCleanup(()=>q?.abort());const[mt,Rt]=c.createSignal(),[_,L]=c.createSignal("closed"),[Pt,ut]=c.createSignal(!1),[Ht,ft]=c.createSignal();let R,pt=Number.NEGATIVE_INFINITY;const vt=(n,o=!1)=>{if(Rt(n),_()!=="open"){if(clearTimeout(R),_()==="closing"||o||Date.now()-pt<Pe){L("open");return}R=setTimeout(()=>L("open"),Re)}},et=()=>{if(clearTimeout(R),R=void 0,_()!=="open"){L("closed");return}if(pt=Date.now(),rt()){L("closed");return}L("closing"),R=setTimeout(()=>{_()==="closing"&&L("closed")},He)};c.onCleanup(()=>clearTimeout(R)),c.createEffect(()=>{if(_()!=="open"){ut(!1);return}const n=requestAnimationFrame(()=>ut(!0));c.onCleanup(()=>cancelAnimationFrame(n))});const V=c.createMemo(()=>{const n=mt();return n===void 0||_()==="closed"?void 0:N().ticks[n]}),P=()=>{const n=V();return n?C()[n.start]:void 0},gt=()=>{const n=V();if(!(!n||G()||tt()))return n.end>n.start?`${n.start+1}–${n.end+1} of ${C().length}`:`${n.start+1} of ${C().length}`},Ft=n=>{const o=C()[n.start];return o?n.end>n.start?`${o.title} (and ${n.end-n.start} more)`:o.title:""},Nt=()=>Ht()??Math.max(0,Z());let H,j,W;const[Ot,qt]=c.createSignal(0),[Bt,Dt]=c.createSignal(0),[zt,Yt]=c.createSignal(!1),K=()=>H?[...H.querySelectorAll("[data-timeline-rail-tick]")]:[];c.createEffect(()=>{const n=V(),o=P(),d=mt();if(!n||!o||d===void 0||!H||!W)return;const m=K()[d];if(!m)return;const h=H.getBoundingClientRect(),E=m.getBoundingClientRect(),p=E.top+E.height/2-h.top,b=W.offsetHeight,w=Math.round(Math.max(0,Math.min(p-b/2,h.height-b)));qt(w),Dt(Math.round(p-w))});let T,ht=0;const Gt=()=>{if(T=void 0,!j)return;const n=j.getBoundingClientRect().top,o=N().pitch;K().forEach((d,m)=>{const h=ht-(n+(m+.5)*o),E=1+Fe*Math.exp(-(h*h)/(2*Tt*Tt));E<1.01?d.style.removeProperty("--k"):d.style.setProperty("--k",E.toFixed(3))})},bt=()=>{T!==void 0&&cancelAnimationFrame(T),T=void 0;for(const n of K())n.style.removeProperty("--k")};c.onCleanup(()=>{T!==void 0&&cancelAnimationFrame(T)});const Ut=n=>{if(n.key==="Escape"){et();return}const o=K();if(o.length===0)return;const d=o.findIndex(h=>h===document.activeElement),m=n.key==="ArrowDown"?Math.min(o.length-1,d+1):n.key==="ArrowUp"?Math.max(0,d-1):n.key==="PageDown"?Math.min(o.length-1,d+5):n.key==="PageUp"?Math.max(0,d-5):n.key==="Home"?0:n.key==="End"?o.length-1:-1;m!==-1&&(n.preventDefault(),o[m]?.focus())},Vt=()=>{const n=l();return{top:`${n?.top??0}px`,height:`${n?.height??0}px`,left:`${n?.left??0}px`,"--timeline-rail-pitch":`${N().pitch}px`}};return(()=>{var n=Te();return s.use(o=>lt=o,n),s.insert(n,s.createComponent(c.Show,{get when(){return s.memo(()=>!!(t.input.active&&x()&&l()?.show))()&&r()},children:o=>s.createComponent(s.Portal,{get mount(){return o()},ref:d=>d.style.display="contents",get children(){var d=Ce(),m=d.firstChild,h=m.firstChild;d.$$focusout=p=>{(!(p.relatedTarget instanceof Node)||!H?.contains(p.relatedTarget))&&(ft(void 0),et())},d.$$keydown=Ut,d.addEventListener("pointerleave",()=>{bt(),et()}),s.use(p=>{H=p,requestAnimationFrame(()=>requestAnimationFrame(()=>Yt(!0)))},d),m.$$pointermove=p=>{if(p.pointerType!=="touch"){if(rt()){bt();return}ht=p.clientY,T===void 0&&(T=requestAnimationFrame(Gt))}};var E=j;return typeof E=="function"?s.use(E,m):j=m,s.insert(m,s.createComponent(c.For,{get each(){return N().ticks},children:(p,b)=>(()=>{var w=$e();return w.$$click=()=>Lt(p.start),w.addEventListener("focus",y=>{ft(b()),y.currentTarget.matches(":focus-visible")&&vt(b(),!0)}),w.addEventListener("pointerenter",y=>{y.pointerType!=="touch"&&vt(b())}),s.effect(y=>{var g=Z()===b()?"":void 0,S=Z()===b()?"true":void 0,B=Ft(p),D=Nt()===b()?0:-1;return g!==y.e&&s.setAttribute(w,"data-current",y.e=g),S!==y.t&&s.setAttribute(w,"aria-current",y.t=S),B!==y.a&&s.setAttribute(w,"aria-label",y.a=B),D!==y.o&&s.setAttribute(w,"tabindex",y.o=D),y},{e:void 0,t:void 0,a:void 0,o:void 0}),w})()}),null),s.insert(d,s.createComponent(c.Show,{get when(){return V()},get children(){var p=Ae(),b=p.firstChild,w=b.firstChild,y=W;return typeof y=="function"?s.use(y,b):W=b,s.insert(b,s.createComponent(c.Show,{get when(){return gt()},get children(){var g=Ee();return s.insert(g,gt),g}}),w),s.insert(w,()=>P()?.title),s.insert(b,s.createComponent(c.Show,{get when(){return P()?.snippet||P()?.working},get children(){var g=Se();return s.insert(g,()=>P()?.snippet??"Working…"),s.effect(()=>s.setAttribute(g,"data-working",P()?.working?"":void 0)),g}}),null),s.effect(g=>{var S=Pt()?"":void 0,B=`${Ot()}px`,D=`${Bt()}px`;return S!==g.e&&s.setAttribute(p,"data-entered",g.e=S),B!==g.t&&s.setStyleProperty(p,"--card-y",g.t=B),D!==g.a&&s.setStyleProperty(p,"--card-origin",g.a=D),g},{e:void 0,t:void 0,a:void 0}),p}}),null),s.effect(p=>{var b=C().length<2?"":void 0,w=zt()?"":void 0,y=Vt(),g=M()||tt()?"true":void 0,S=tt()?"":void 0;return b!==p.e&&s.setAttribute(d,"data-empty",p.e=b),w!==p.t&&s.setAttribute(d,"data-armed",p.t=w),p.a=s.style(d,y,p.a),g!==p.o&&s.setAttribute(m,"aria-busy",p.o=g),S!==p.i&&s.setAttribute(h,"data-active",p.i=S),p},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0}),d}})})),n})()}const qe=`
[data-timeline-rail] {
  --timeline-rail-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --timeline-rail-move: cubic-bezier(0.77, 0, 0.175, 1);
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${at}px;
  pointer-events: none;
}
[data-timeline-rail][data-empty] { opacity: 0; visibility: hidden; }
[data-timeline-rail][data-armed] { transition: opacity 200ms var(--timeline-rail-ease), visibility 0s; }
[data-timeline-rail][data-armed][data-empty] { transition: opacity 160ms var(--timeline-rail-ease), visibility 0s 160ms; }
[data-timeline-rail-ticks] {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  box-sizing: border-box;
  pointer-events: auto;
}
[data-timeline-rail-history] {
  position: absolute;
  top: -9px;
  left: 0;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--v2-text-text-faint);
  opacity: 0;
}
[data-timeline-rail][data-armed] [data-timeline-rail-history] { transition: opacity 200ms var(--timeline-rail-ease); }
[data-timeline-rail-history][data-active] { opacity: 1; animation: timelineRailHistory 1.4s ease-in-out infinite; }
[data-timeline-rail-tick] {
  appearance: none;
  position: relative;
  display: block;
  height: var(--timeline-rail-pitch, 10px);
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  outline: none;
}
[data-timeline-rail-tick]::before,
[data-timeline-rail-tick]::after {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  height: 2px;
  width: 8px;
  margin-top: -1px;
  border-radius: 1px;
  transform-origin: 0 50%;
  transform: scale(var(--k, 1), calc(1 + (var(--k, 1) - 1) * 0.45));
}
[data-timeline-rail-tick]::before { background: var(--v2-text-text-faint); opacity: 0.45; }
[data-timeline-rail-tick]::after { background: var(--v2-text-text-base); opacity: 0; }
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::after {
  transition: transform 110ms var(--timeline-rail-ease), opacity 120ms var(--timeline-rail-ease);
}
@media (hover: hover) and (pointer: fine) {
  [data-timeline-rail-tick]:hover::after { opacity: 0.6; }
  [data-timeline-rail-ticks]:hover [data-timeline-rail-tick]::before { opacity: 0.8; }
}
[data-timeline-rail-tick][data-current]::after { opacity: 1; }
[data-timeline-rail-tick]:focus-visible::before {
  outline: 2px solid var(--v2-border-border-focus);
  outline-offset: 2px;
}
[data-timeline-rail-card] {
  position: absolute;
  top: 0;
  left: ${at}px;
  padding-left: 4px;
  pointer-events: auto;
  transform: translateY(var(--card-y, 0px));
}
[data-timeline-rail-card][data-entered] { transition: transform 140ms var(--timeline-rail-ease); }
[data-timeline-rail-card-body] {
  box-sizing: border-box;
  width: min(320px, 40vw);
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--v2-background-bg-layer-01);
  box-shadow: var(--v2-elevation-floating);
  color: var(--v2-text-text-base);
  opacity: 0;
  transform: scale(0.96);
  transform-origin: 0 var(--card-origin, 50%);
  transition: opacity 90ms var(--timeline-rail-ease), transform 90ms var(--timeline-rail-ease);
}
[data-timeline-rail-card][data-entered] [data-timeline-rail-card-body] {
  opacity: 1;
  transform: none;
  transition: opacity 140ms var(--timeline-rail-ease), transform 140ms var(--timeline-rail-ease);
}
[data-timeline-rail-card-meta] {
  margin-bottom: 2px;
  font-size: 11px;
  line-height: 14px;
  font-weight: 440;
  letter-spacing: 0.05px;
  color: var(--v2-text-text-faint);
  font-variant-numeric: tabular-nums;
}
[data-timeline-rail-card-title] {
  font-size: 13px;
  line-height: 16px;
  font-weight: 530;
  letter-spacing: -0.04px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
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
@keyframes timelineRailHistory { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.9; } }
@media (prefers-reduced-motion: reduce) {
  [data-timeline-rail-history][data-active] { animation: none; opacity: 0.6; }
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 120ms linear; }
  [data-timeline-rail-card][data-entered] { transition: none; }
  [data-timeline-rail-card-body], [data-timeline-rail-card][data-entered] [data-timeline-rail-card-body] { transform: none; transition: opacity 90ms linear; }
}
`,Be=nt.Plugin.define({setup(t){t.add(nt.Style,qe),t.add(nt.Slot,{at:"session.header",render:e=>s.createComponent(Oe,{input:e})})}});s.delegateEvents(["keydown","focusout","pointermove","click"]);exports.default=Be;exports.measure=At;
