"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const s=require("solid-js/web"),nt=require("@opencode/plugin/gui"),a=require("solid-js"),Zt=160,te=4;function ee(t){const e=t.scroller.getBoundingClientRect().top+t.inset();for(const n of t.scroller.querySelectorAll("[data-message-id]")){const r=n.getBoundingClientRect();if(r.bottom>e)return{element:n,top:r.top}}}async function ie(t,e,n){const{scroller:r}=t;for(let o=0;o<te&&!n.aborted;o+=1){if(await t.frame(),!e.element.isConnected||t.idle()<32)return;const l=e.element.getBoundingClientRect().top-e.top;t.drift?.(l),Math.abs(l)>1&&r.scrollTo({top:r.scrollTop+l,behavior:"auto"})}}async function re(t,e){if(!(!t.more()||e.aborted)){t.loading(!0);try{for(;t.more()&&!e.aborted;){for(await t.frame();t.idle()<Zt&&!e.aborted;)await t.frame();if(e.aborted)return;let n;await t.loadMore({signal:e,beforePublish:()=>n=ee(t)}),n&&await ie(t,n,e)}}catch{}finally{t.loading(!1)}}}const ne=8;function ae(t,e,n){if(t.length===0)return-1;const r=e.find(f=>f.bottom>n+ne)??e.at(-1);if(!r)return-1;const o=t.indexOf(r.owner);if(o!==-1)return o;const l=t.findIndex(f=>f>r.owner);return l===-1?t.length-1:Math.max(0,l-1)}function oe(t){return t.ids.indexOf(t.target)>=1?{kind:"probe"}:t.more?{kind:"load"}:{kind:"top"}}function le(t,e,n){const r=t.filter(p=>p.bottom>n.top&&p.top<n.bottom),o=r.length?r:t,l=o[0],f=o.at(-1);return!l||l.owner>=e?-1:f&&f.owner<e?1:0}function ce(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const n=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:n,behavior:"smooth"}}const tt=3,se=40,de=120,me=200,ue=3,fe=5;function $t(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const n=e.dataset.messageId;if(!n)return[];const r=e.getBoundingClientRect();return[{owner:n,prompt:e.dataset.timelineRow==="UserMessage",top:r.top,bottom:r.bottom}]})}function et(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function B(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(n=>n.dataset.messageId===e)}function pe(t){const e=t.scroller.getBoundingClientRect();return ae(t.ids(),$t(t.scroller),e.top+et(t.scroller))}function ve(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}async function ge(t,e){t.loading?.(!0);try{await t.loadMore(e)}finally{t.loading?.(!1)}}function Mt(t,e){const n=e.getBoundingClientRect(),r=t.getBoundingClientRect();return Math.max(0,n.top-r.top+t.scrollTop-et(t))}async function Tt(t,e,n){let r=Number.NaN,o=0,l=0;for(let f=0;f<se&&!n.aborted;f+=1){await t.frame();const p=t.scroller.scrollTop,v=B(t.scroller,e);if(o=v&&p===r?o+1:0,l=v?0:l+1,r=p,o>=tt||l>tt)return}}async function he(t,e,n,r){const{scroller:o}=t;let l=0;for(let f=0;f<me&&!n.aborted;f+=1){if(B(o,e))return;const p=le($t(o),e,o.getBoundingClientRect());if(p===0){if((l+=1)>tt)return;await t.frame();continue}l=0;const v=Math.max(0,o.scrollHeight-o.clientHeight);if(p===-1&&o.scrollTop<=0||p===1&&o.scrollTop>=v)return;r.direction!==0&&p!==r.direction&&(r.step=Math.max(o.clientHeight/4,r.step/2)),r.direction=p,o.scrollTo({top:Math.min(v,Math.max(0,o.scrollTop+p*r.step)),behavior:"auto"}),await t.frame()}}async function It(t,e,n,r=0){const{scroller:o}=t,l=oe({ids:t.ids(),target:e,more:t.more()});if(l.kind==="load")return r>=fe||(await ge(t,n),n.aborted)?void 0:It(t,e,n,r+1);if(l.kind==="top")return o.scrollTo({top:0,behavior:"auto"}),Tt(t,e,n);const f={step:o.clientHeight,direction:0};for(let p=0;p<ue&&!n.aborted;p+=1)if(await he(t,e,n,f),await Tt(t,e,n),B(o,e))return}async function be(t,e,n){const{scroller:r}=t,o=B(r,e);if(!o)return!1;const l=ce({from:r.scrollTop,to:Mt(r,o),viewport:r.clientHeight,max:r.scrollHeight-r.clientHeight,reduced:t.reducedMotion()});l.start!==void 0&&(r.scrollTo({top:l.start,behavior:"auto"}),await t.frame());const f=async k=>{if(l.behavior==="auto")return r.scrollTo({top:k,behavior:"auto"}),!0;if(t.tween)return t.tween(k,n);r.scrollTo({top:k,behavior:l.behavior});let I=Number.NaN,w=0;for(let U=0;U<de&&!n.aborted;U+=1){await t.frame();const M=r.scrollTop;if(w=M===I?w+1:0,I=M,w>=tt)break}return!0};if(!await f(l.to)||l.behavior==="auto"||n.aborted)return!0;const p=B(r,e);if(!p)return!0;const v=Math.min(Mt(r,p),Math.max(0,r.scrollHeight-r.clientHeight));return Math.abs(v-r.scrollTop)>2&&await f(v),!0}async function ye(t,e,n){return t.ids().includes(e)?(ve(t.scroller),!B(t.scroller,e)&&(await It(t,e,n),n.aborted)?"aborted":await be(t,e,n)?n.aborted?"aborted":"done":"none"):"none"}const Z=4,we=10,xe=.6,Et=200,St=240,ct=t=>t.replace(/\s+/g," ").trim();function ke(t){const e=t.metadata?.displayText,n=ct(typeof e=="string"&&e?e:t.text??"");if(n)return n.length>Et?`${n.slice(0,Et)}…`:n;const r=(t.files??[]).map(f=>f.mime.startsWith("image/")?"[image]":`[${f.name??"file"}]`),o=(t.agents??[]).map(f=>`@${f.name}`),l=[...r,...o];return l.length?l.slice(0,3).join(" "):"(empty prompt)"}function Me(t){return ct(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}function Te(t,e){const n=[];for(let r=0;r<t.length;r+=1){const o=t[r];if(o.type!=="user"||e&&o.id>=e)continue;let l,f=!1;for(let v=r+1;v<t.length&&t[v].type!=="user";v+=1){const k=t[v];if(k.type!=="assistant")continue;const I=k.content?.find(w=>w.type==="text"&&w.text&&ct(w.text))?.text;if(I){const w=Me(I);l=w.length>St?`${w.slice(0,St)}…`:w;break}k.time?.completed===void 0&&!k.error&&(f=!0)}const p=ke(o);n.push({id:o.id,title:p,snippet:l,working:!l&&f})}return n}function Ee(t,e){const n=Math.max(0,e*xe),r=Math.max(1,Math.floor(n/Z));if(t<=r)return{pitch:t>0?Math.min(we,Math.max(Z,Math.floor(n/t))):Z,ticks:Array.from({length:t},(f,p)=>({start:p,end:p}))};const o=[];for(let l=0;l<r;l+=1)o.push({start:Math.floor(l*t/r),end:Math.floor((l+1)*t/r)-1});return{pitch:Z,ticks:o}}function Se(t,e){return t.findIndex(n=>e>=n.start&&e<=n.end)}const Ae=t=>1-(1-t)**4;function Ce(t){return Math.round(Math.min(420,180+Math.abs(t)*.12))}const At=["wheel","touchstart","pointerdown","keydown"];async function $e(t,e,n){const{scroller:r}=t,o=r.scrollTop,l=Ce(e-o);let f=!1;const p=()=>{f=!0};for(const v of At)r.addEventListener(v,p,{passive:!0});try{const v=t.now();for(;;){if(await t.frame(),f||n.aborted)return!1;const k=Math.min(1,(t.now()-v)/l);if(r.scrollTo({top:o+(e-o)*Ae(k),behavior:"auto"}),k>=1)return!0}}finally{for(const v of At)r.removeEventListener(v,p)}}var Ie=s.template("<span style=display:contents>"),Re=s.template("<div data-timeline-rail-card-meta>"),_e=s.template("<div data-timeline-rail-card-snippet dir=auto>"),Le=s.template("<div data-timeline-rail-card><div data-timeline-rail-card-body role=tooltip><div data-timeline-rail-card-title dir=auto>"),Pe=s.template('<div data-timeline-rail><div data-timeline-rail-ticks role=toolbar aria-orientation=vertical aria-label="Your prompts"><span data-timeline-rail-history aria-hidden=true></span><span data-timeline-rail-marker aria-hidden=true style=height:8px>'),Fe=s.template("<button type=button data-timeline-rail-tick>");const lt=28,He=6,Ne=44,qe="(min-width: 768px)",Oe=400,Be=300,De=90,Ye=.4,Ct=16,ze=8,at=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,ot=()=>new Promise(t=>requestAnimationFrame(()=>t()));function Ge(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function Rt(t,e){const n=e.getBoundingClientRect(),r=e.querySelector("[data-slot='session-timeline-visible']"),o=r instanceof HTMLElement?r.getBoundingClientRect():n,l=t.querySelector("[data-timeline-row][data-message-id]"),p=(l instanceof HTMLElement?l.getBoundingClientRect().left:n.left+Math.max(0,(n.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||n.width))/2))-n.left,v=et(t);return{top:o.top-n.top+v,height:Math.max(0,n.bottom-o.top-v),left:Math.min(He,Math.max(0,Math.round((p-lt)/2))),show:p>=Ne}}function Ue(t){const[e,n]=a.createSignal(),[r,o]=a.createSignal(),[l,f]=a.createSignal(),[p,v]=a.createSignal(-1),[k,I]=a.createSignal(!1),[w,U]=a.createSignal(!0),M=()=>t.input.session,_=()=>M().server.data.session,R=a.createMemo(()=>Te(_().message.list(M().id),_().get(M().id)?.revert?.messageID)),V=a.createMemo(()=>R().map(i=>i.id)),j=a.createMemo(()=>_().message.more(M().id)),T=a.createMemo(()=>Ee(R().length,l()?.height??0)),D=a.createMemo(()=>Se(T().ticks,p()));let st,K;const dt=i=>{K=void 0;const c=st?.closest("[data-scrollable]"),d=c&&Ge(c);c&&d?(n(c),o(d)):i>0&&(K=requestAnimationFrame(()=>dt(i-1)))};a.onMount(()=>dt(10)),a.onCleanup(()=>{K!==void 0&&cancelAnimationFrame(K)}),a.onMount(()=>{if(typeof window.matchMedia!="function")return;const i=window.matchMedia(qe),c=()=>U(i.matches);c(),i.addEventListener("change",c),a.onCleanup(()=>i.removeEventListener("change",c))});let mt=Number.NEGATIVE_INFINITY;const _t=()=>performance.now()-mt;a.createEffect(()=>{const i=e();if(!i)return;const c=()=>{mt=performance.now()},d=["wheel","touchstart","touchmove","pointerdown","keydown"];for(const u of d)i.addEventListener(u,c,{passive:!0});a.onCleanup(()=>{for(const u of d)i.removeEventListener(u,c)})});const Lt=()=>{const i=e();if(i)return{scroller:i,ids:V,more:j,loadMore:c=>_().message.loadMore(M().id,{signal:c}),reducedMotion:at,frame:ot,loading:I,tween:(c,d)=>$e({scroller:i,frame:ot,now:()=>performance.now()},c,d)}},[it,ut]=a.createSignal(!1),Pt=a.createMemo(()=>t.input.active);a.createEffect(()=>{const i=e();if(!i||!Pt()||!j())return;const c=new AbortController,d={scroller:i,more:()=>_().message.more(M().id),loadMore:({signal:u,beforePublish:h})=>_().message.loadMore(M().id,{signal:u,beforePublish:h}),frame:ot,idle:_t,inset:()=>et(i),loading:ut,drift:globalThis.__timelineRailDrift};a.untrack(()=>re(d,c.signal)),a.onCleanup(()=>{c.abort(),ut(!1)})});let Y;const Ft=()=>{Y=void 0;const i=e(),c=r();if(!t.input.active||!i||!c)return;const d=pe({scroller:i,ids:V}),u=Rt(i,c);v(d),f(h=>h&&h.top===u.top&&h.height===u.height&&h.left===u.left&&h.show===u.show?h:u)},L=()=>{Y===void 0&&(Y=requestAnimationFrame(Ft))};a.onCleanup(()=>{Y!==void 0&&cancelAnimationFrame(Y)}),a.createEffect(()=>{const i=e(),c=r();if(!i||!c)return;i.addEventListener("scroll",L,{passive:!0});const d=typeof ResizeObserver=="function"?new ResizeObserver(L):void 0;d?.observe(c);const u=c.querySelector("[data-slot='session-timeline-visible']");u&&d?.observe(u),L(),a.onCleanup(()=>{i.removeEventListener("scroll",L),d?.disconnect()})}),a.createEffect(a.on([V,j,()=>t.input.active,w],L,{defer:!0}));let z;const Ht=i=>{const c=V()[i],d=Lt();if(!c||!d||!t.input.active)return;z?.abort();const u=new AbortController;z=u,ye(d,c,u.signal).finally(()=>{z===u&&(z=void 0),L()})};a.onCleanup(()=>z?.abort());const[ft,Nt]=a.createSignal(),[P,F]=a.createSignal("closed"),[qt,pt]=a.createSignal(!1),[Ot,vt]=a.createSignal();let H,gt=Number.NEGATIVE_INFINITY;const ht=(i,c=!1)=>{if(Nt(i),P()!=="open"){if(clearTimeout(H),P()==="closing"||c||Date.now()-gt<Be){F("open");return}H=setTimeout(()=>F("open"),Oe)}},rt=()=>{if(clearTimeout(H),H=void 0,P()!=="open"){F("closed");return}if(gt=Date.now(),at()){F("closed");return}F("closing"),H=setTimeout(()=>{P()==="closing"&&F("closed")},De)};a.onCleanup(()=>clearTimeout(H)),a.createEffect(()=>{if(P()!=="open"){pt(!1);return}const i=requestAnimationFrame(()=>pt(!0));a.onCleanup(()=>cancelAnimationFrame(i))});const W=a.createMemo(()=>{const i=ft();return i===void 0||P()==="closed"?void 0:T().ticks[i]}),N=()=>{const i=W();return i?R()[i.start]:void 0},bt=()=>{const i=W();if(!(!i||j()||it()))return i.end>i.start?`${i.start+1}–${i.end+1} of ${R().length}`:`${i.start+1} of ${R().length}`},Bt=i=>{const c=R()[i.start];return c?i.end>i.start?`${c.title} (and ${i.end-i.start} more)`:c.title:""},Dt=()=>Ot()??Math.max(0,D());let q,X,J;const[Yt,zt]=a.createSignal(0),[Gt,Ut]=a.createSignal(0),[Vt,jt]=a.createSignal(!1),Q=()=>q?[...q.querySelectorAll("[data-timeline-rail-tick]")]:[];a.createEffect(()=>{const i=W(),c=N(),d=ft();if(!i||!c||d===void 0||!q||!J)return;const u=Q()[d];if(!u)return;const h=q.getBoundingClientRect(),E=u.getBoundingClientRect(),G=E.top+E.height/2-h.top,m=J.offsetHeight,b=Math.round(Math.max(0,Math.min(G-m/2,h.height-m)));zt(b),Ut(Math.round(G-b))});let S,yt=0;const Kt=()=>{if(S=void 0,!X)return;const i=X.getBoundingClientRect().top,c=T().pitch;Q().forEach((d,u)=>{const h=yt-(i+(u+.5)*c),E=1+Ye*Math.exp(-(h*h)/(2*Ct*Ct));E<1.01?d.style.removeProperty("--k"):d.style.setProperty("--k",E.toFixed(3))})},wt=()=>{S!==void 0&&cancelAnimationFrame(S),S=void 0;for(const i of Q())i.style.removeProperty("--k")};a.onCleanup(()=>{S!==void 0&&cancelAnimationFrame(S)});const[Wt,xt]=a.createSignal(!1);let O;a.createEffect(a.on(()=>`${T().ticks.length}:${T().pitch}:${l()?.height}`,()=>{xt(!0),O!==void 0&&cancelAnimationFrame(O),O=requestAnimationFrame(()=>O=requestAnimationFrame(()=>xt(!1)))})),a.onCleanup(()=>{O!==void 0&&cancelAnimationFrame(O)});const Xt=i=>{if(i.key==="Escape"){rt();return}const c=Q();if(c.length===0)return;const d=c.findIndex(h=>h===document.activeElement),u=i.key==="ArrowDown"?Math.min(c.length-1,d+1):i.key==="ArrowUp"?Math.max(0,d-1):i.key==="PageDown"?Math.min(c.length-1,d+5):i.key==="PageUp"?Math.max(0,d-5):i.key==="Home"?0:i.key==="End"?c.length-1:-1;u!==-1&&(i.preventDefault(),c[u]?.focus())},Jt=()=>{const i=l();return{top:`${i?.top??0}px`,height:`${i?.height??0}px`,left:`${i?.left??0}px`,"--timeline-rail-pitch":`${T().pitch}px`}},Qt=()=>Math.max(0,D())*T().pitch+T().pitch/2-ze/2;return(()=>{var i=Ie();return s.use(c=>st=c,i),s.insert(i,s.createComponent(a.Show,{get when(){return s.memo(()=>!!(t.input.active&&w()&&l()?.show))()&&r()},children:c=>s.createComponent(s.Portal,{get mount(){return c()},ref:d=>d.style.display="contents",get children(){var d=Pe(),u=d.firstChild,h=u.firstChild,E=h.nextSibling;d.$$focusout=m=>{(!(m.relatedTarget instanceof Node)||!q?.contains(m.relatedTarget))&&(vt(void 0),rt())},d.$$keydown=Xt,d.addEventListener("pointerleave",()=>{wt(),rt()}),s.use(m=>{q=m,requestAnimationFrame(()=>requestAnimationFrame(()=>jt(!0)))},d),u.$$pointermove=m=>{if(m.pointerType!=="touch"){if(at()){wt();return}yt=m.clientY,S===void 0&&(S=requestAnimationFrame(Kt))}};var G=X;return typeof G=="function"?s.use(G,u):X=u,s.insert(u,s.createComponent(a.For,{get each(){return T().ticks},children:(m,b)=>(()=>{var x=Fe();return x.$$click=()=>Ht(m.start),x.addEventListener("focus",y=>{vt(b()),y.currentTarget.matches(":focus-visible")&&ht(b(),!0)}),x.addEventListener("pointerenter",y=>{y.pointerType!=="touch"&&ht(b())}),s.effect(y=>{var g=D()===b()?"":void 0,A=D()===b()?"true":void 0,C=Bt(m),$=Dt()===b()?0:-1;return g!==y.e&&s.setAttribute(x,"data-current",y.e=g),A!==y.t&&s.setAttribute(x,"aria-current",y.t=A),C!==y.a&&s.setAttribute(x,"aria-label",y.a=C),$!==y.o&&s.setAttribute(x,"tabindex",y.o=$),y},{e:void 0,t:void 0,a:void 0,o:void 0}),x})()}),null),s.insert(d,s.createComponent(a.Show,{get when(){return W()},get children(){var m=Le(),b=m.firstChild,x=b.firstChild,y=J;return typeof y=="function"?s.use(y,b):J=b,s.insert(b,s.createComponent(a.Show,{get when(){return bt()},get children(){var g=Re();return s.insert(g,bt),g}}),x),s.insert(x,()=>N()?.title),s.insert(b,s.createComponent(a.Show,{get when(){return N()?.snippet||N()?.working},get children(){var g=_e();return s.insert(g,()=>N()?.snippet??"Working…"),s.effect(()=>s.setAttribute(g,"data-working",N()?.working?"":void 0)),g}}),null),s.effect(g=>{var A=qt()?"":void 0,C=`${Yt()}px`,$=`${Gt()}px`;return A!==g.e&&s.setAttribute(m,"data-entered",g.e=A),C!==g.t&&s.setStyleProperty(m,"--card-y",g.t=C),$!==g.a&&s.setStyleProperty(m,"--card-origin",g.a=$),g},{e:void 0,t:void 0,a:void 0}),m}}),null),s.effect(m=>{var b=R().length<2?"":void 0,x=Vt()?"":void 0,y=Jt(),g=k()||it()?"true":void 0,A=it()?"":void 0,C=Wt()?"":void 0,$=D()<0?"":void 0,kt=`translateY(${Qt()}px)`;return b!==m.e&&s.setAttribute(d,"data-empty",m.e=b),x!==m.t&&s.setAttribute(d,"data-armed",m.t=x),m.a=s.style(d,y,m.a),g!==m.o&&s.setAttribute(u,"aria-busy",m.o=g),A!==m.i&&s.setAttribute(h,"data-active",m.i=A),C!==m.n&&s.setAttribute(E,"data-reflow",m.n=C),$!==m.s&&s.setAttribute(E,"data-hidden",m.s=$),kt!==m.h&&s.setStyleProperty(E,"transform",m.h=kt),m},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),d}})})),i})()}const Ve=`
[data-timeline-rail] {
  --timeline-rail-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --timeline-rail-move: cubic-bezier(0.77, 0, 0.175, 1);
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${lt}px;
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
  padding: 0 0 0 8px;
  box-sizing: border-box;
  pointer-events: auto;
}
[data-timeline-rail-history] {
  position: absolute;
  top: -9px;
  left: 8px;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--v2-text-text-faint);
  opacity: 0;
}
[data-timeline-rail][data-armed] [data-timeline-rail-history] { transition: opacity 200ms var(--timeline-rail-ease); }
[data-timeline-rail-history][data-active] { opacity: 1; animation: timelineRailHistory 1.4s ease-in-out infinite; }
[data-timeline-rail-marker] {
  position: absolute;
  top: 0;
  left: 3px;
  width: 2px;
  border-radius: 1px;
  background: var(--v2-text-text-base);
  pointer-events: none;
  will-change: transform;
}
[data-timeline-rail-marker][data-hidden] { opacity: 0; }
[data-timeline-rail][data-armed] [data-timeline-rail-marker]:not([data-reflow]) {
  transition: transform 180ms var(--timeline-rail-move), opacity 120ms var(--timeline-rail-ease);
}
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
  transform: scale(var(--k, 1), calc(1 + (var(--k, 1) - 1) * 1.2));
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
  left: ${lt}px;
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
  [data-timeline-rail][data-armed] [data-timeline-rail-marker]:not([data-reflow]) { transition: opacity 120ms linear; }
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 120ms linear; }
  [data-timeline-rail-card][data-entered] { transition: none; }
  [data-timeline-rail-card-body], [data-timeline-rail-card][data-entered] [data-timeline-rail-card-body] { transform: none; transition: opacity 90ms linear; }
}
`,je=nt.Plugin.define({setup(t){t.add(nt.Style,Ve),t.add(nt.Slot,{at:"session.header",render:e=>s.createComponent(Ue,{input:e})})}});s.delegateEvents(["keydown","focusout","pointermove","click"]);exports.default=je;exports.measure=Rt;
