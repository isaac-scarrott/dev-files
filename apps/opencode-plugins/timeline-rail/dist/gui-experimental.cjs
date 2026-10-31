"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const s=require("solid-js/web"),at=require("@opencode/plugin/gui"),a=require("solid-js"),Zt=160,te=4;function ee(t){const e=t.scroller.getBoundingClientRect().top+t.inset();for(const r of t.scroller.querySelectorAll("[data-message-id]")){const n=r.getBoundingClientRect();if(n.bottom>e)return{element:r,top:n.top}}}async function ie(t,e,r){const{scroller:n}=t;for(let o=0;o<te&&!r.aborted;o+=1){if(await t.frame(),!e.element.isConnected||t.idle()<32)return;const l=e.element.getBoundingClientRect().top-e.top;t.drift?.(l),Math.abs(l)>1&&n.scrollTo({top:n.scrollTop+l,behavior:"auto"})}}async function ne(t,e){if(!(!t.more()||e.aborted)){t.loading(!0);try{for(;t.more()&&!e.aborted;){for(await t.frame();t.idle()<Zt&&!e.aborted;)await t.frame();if(e.aborted)return;let r;await t.loadMore({signal:e,beforePublish:()=>r=ee(t)}),r&&await ie(t,r,e)}}catch{}finally{t.loading(!1)}}}const re=8;function ae(t,e,r){if(t.length===0)return-1;const n=e.find(f=>f.bottom>r+re)??e.at(-1);if(!n)return-1;const o=t.indexOf(n.owner);if(o!==-1)return o;const l=t.findIndex(f=>f>n.owner);return l===-1?t.length-1:Math.max(0,l-1)}function oe(t){return t.ids.indexOf(t.target)>=1?{kind:"probe"}:t.more?{kind:"load"}:{kind:"top"}}function le(t,e,r){const n=t.filter(p=>p.bottom>r.top&&p.top<r.bottom),o=n.length?n:t,l=o[0],f=o.at(-1);return!l||l.owner>=e?-1:f&&f.owner<e?1:0}function ce(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const r=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:r,behavior:"smooth"}}const et=3,se=40,de=120,me=200,ue=3,fe=5;function $t(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const r=e.dataset.messageId;if(!r)return[];const n=e.getBoundingClientRect();return[{owner:r,prompt:e.dataset.timelineRow==="UserMessage",top:n.top,bottom:n.bottom}]})}function it(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function B(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(r=>r.dataset.messageId===e)}function pe(t){const e=t.scroller.getBoundingClientRect();return ae(t.ids(),$t(t.scroller),e.top+it(t.scroller))}function ve(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}async function ge(t,e){t.loading?.(!0);try{await t.loadMore(e)}finally{t.loading?.(!1)}}function Mt(t,e){const r=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,r.top-n.top+t.scrollTop-it(t))}async function Tt(t,e,r){let n=Number.NaN,o=0,l=0;for(let f=0;f<se&&!r.aborted;f+=1){await t.frame();const p=t.scroller.scrollTop,v=B(t.scroller,e);if(o=v&&p===n?o+1:0,l=v?0:l+1,n=p,o>=et||l>et)return}}async function he(t,e,r,n){const{scroller:o}=t;let l=0;for(let f=0;f<me&&!r.aborted;f+=1){if(B(o,e))return;const p=le($t(o),e,o.getBoundingClientRect());if(p===0){if((l+=1)>et)return;await t.frame();continue}l=0;const v=Math.max(0,o.scrollHeight-o.clientHeight);if(p===-1&&o.scrollTop<=0||p===1&&o.scrollTop>=v)return;n.direction!==0&&p!==n.direction&&(n.step=Math.max(o.clientHeight/4,n.step/2)),n.direction=p,o.scrollTo({top:Math.min(v,Math.max(0,o.scrollTop+p*n.step)),behavior:"auto"}),await t.frame()}}async function It(t,e,r,n=0){const{scroller:o}=t,l=oe({ids:t.ids(),target:e,more:t.more()});if(l.kind==="load")return n>=fe||(await ge(t,r),r.aborted)?void 0:It(t,e,r,n+1);if(l.kind==="top")return o.scrollTo({top:0,behavior:"auto"}),Tt(t,e,r);const f={step:o.clientHeight,direction:0};for(let p=0;p<ue&&!r.aborted;p+=1)if(await he(t,e,r,f),await Tt(t,e,r),B(o,e))return}async function be(t,e,r){const{scroller:n}=t,o=B(n,e);if(!o)return!1;const l=ce({from:n.scrollTop,to:Mt(n,o),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});l.start!==void 0&&(n.scrollTo({top:l.start,behavior:"auto"}),await t.frame());const f=async k=>{if(l.behavior==="auto")return n.scrollTo({top:k,behavior:"auto"}),!0;if(t.tween)return t.tween(k,r);n.scrollTo({top:k,behavior:l.behavior});let R=Number.NaN,x=0;for(let V=0;V<de&&!r.aborted;V+=1){await t.frame();const M=n.scrollTop;if(x=M===R?x+1:0,R=M,x>=et)break}return!0};if(!await f(l.to)||l.behavior==="auto"||r.aborted)return!0;const p=B(n,e);if(!p)return!0;const v=Math.min(Mt(n,p),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(v-n.scrollTop)>2&&await f(v),!0}async function ye(t,e,r){return t.ids().includes(e)?(ve(t.scroller),!B(t.scroller,e)&&(await It(t,e,r),r.aborted)?"aborted":await be(t,e,r)?r.aborted?"aborted":"done":"none"):"none"}const tt=4,we=10,xe=.6,Et=200,St=240,st=t=>t.replace(/\s+/g," ").trim();function ke(t){const e=t.metadata?.displayText,r=st(typeof e=="string"&&e?e:t.text??"");if(r)return r.length>Et?`${r.slice(0,Et)}…`:r;const n=(t.files??[]).map(f=>f.mime.startsWith("image/")?"[image]":`[${f.name??"file"}]`),o=(t.agents??[]).map(f=>`@${f.name}`),l=[...n,...o];return l.length?l.slice(0,3).join(" "):"(empty prompt)"}function Me(t){return st(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}function Te(t){return t.length<40?"short":t.length<160?"medium":"long"}function Ee(t,e){const r=[];for(let n=0;n<t.length;n+=1){const o=t[n];if(o.type!=="user"||e&&o.id>=e)continue;let l,f=!1;for(let v=n+1;v<t.length&&t[v].type!=="user";v+=1){const k=t[v];if(k.type!=="assistant")continue;const R=k.content?.find(x=>x.type==="text"&&x.text&&st(x.text))?.text;if(R){const x=Me(R);l=x.length>St?`${x.slice(0,St)}…`:x;break}k.time?.completed===void 0&&!k.error&&(f=!0)}const p=ke(o);r.push({id:o.id,title:p,snippet:l,working:!l&&f,length:Te(p)})}return r}function Se(t,e){const r=Math.max(0,e*xe),n=Math.max(1,Math.floor(r/tt));if(t<=n)return{pitch:t>0?Math.min(we,Math.max(tt,Math.floor(r/t))):tt,ticks:Array.from({length:t},(f,p)=>({start:p,end:p}))};const o=[];for(let l=0;l<n;l+=1)o.push({start:Math.floor(l*t/n),end:Math.floor((l+1)*t/n)-1});return{pitch:tt,ticks:o}}function Ae(t,e){return t.findIndex(r=>e>=r.start&&e<=r.end)}const Ce=t=>1-(1-t)**4;function $e(t){return Math.round(Math.min(420,180+Math.abs(t)*.12))}const At=["wheel","touchstart","pointerdown","keydown"];async function Ie(t,e,r){const{scroller:n}=t,o=n.scrollTop,l=$e(e-o);let f=!1;const p=()=>{f=!0};for(const v of At)n.addEventListener(v,p,{passive:!0});try{const v=t.now();for(;;){if(await t.frame(),f||r.aborted)return!1;const k=Math.min(1,(t.now()-v)/l);if(n.scrollTo({top:o+(e-o)*Ce(k),behavior:"auto"}),k>=1)return!0}}finally{for(const v of At)n.removeEventListener(v,p)}}var Re=s.template("<span style=display:contents>"),Le=s.template("<div data-timeline-rail-card-meta>"),_e=s.template("<div data-timeline-rail-card-snippet dir=auto>"),Pe=s.template("<div data-timeline-rail-card><div data-timeline-rail-card-body role=tooltip><div data-timeline-rail-card-title dir=auto>"),Fe=s.template('<div data-timeline-rail><div data-timeline-rail-ticks role=toolbar aria-orientation=vertical aria-label="Your prompts"><span data-timeline-rail-history aria-hidden=true></span><span data-timeline-rail-marker aria-hidden=true style=height:8px>'),He=s.template("<button type=button data-timeline-rail-tick>");const ct=28,qe=44,Ne="(min-width: 768px)",Oe=400,Be=300,De=90,Ye=.4,Ct=16,ze=8,ot=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,lt=()=>new Promise(t=>requestAnimationFrame(()=>t()));function Ge(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function Rt(t,e){const r=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),o=n instanceof HTMLElement?n.getBoundingClientRect():r,l=t.querySelector("[data-timeline-row][data-message-id]"),p=(l instanceof HTMLElement?l.getBoundingClientRect().left:r.left+Math.max(0,(r.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||r.width))/2))-r.left,v=it(t);return{top:o.top-r.top+v,height:Math.max(0,o.height-v),left:Math.round((p-ct)/2),show:p>=qe}}function Ue(t){const[e,r]=a.createSignal(),[n,o]=a.createSignal(),[l,f]=a.createSignal(),[p,v]=a.createSignal(-1),[k,R]=a.createSignal(!1),[x,V]=a.createSignal(!0),M=()=>t.input.session,L=()=>M().server.data.session,S=a.createMemo(()=>Ee(L().message.list(M().id),L().get(M().id)?.revert?.messageID)),j=a.createMemo(()=>S().map(i=>i.id)),K=a.createMemo(()=>L().message.more(M().id)),T=a.createMemo(()=>Se(S().length,l()?.height??0)),D=a.createMemo(()=>Ae(T().ticks,p()));let dt,W;const mt=i=>{W=void 0;const c=dt?.closest("[data-scrollable]"),d=c&&Ge(c);c&&d?(r(c),o(d)):i>0&&(W=requestAnimationFrame(()=>mt(i-1)))};a.onMount(()=>mt(10)),a.onCleanup(()=>{W!==void 0&&cancelAnimationFrame(W)}),a.onMount(()=>{if(typeof window.matchMedia!="function")return;const i=window.matchMedia(Ne),c=()=>V(i.matches);c(),i.addEventListener("change",c),a.onCleanup(()=>i.removeEventListener("change",c))});let ut=Number.NEGATIVE_INFINITY;const Lt=()=>performance.now()-ut;a.createEffect(()=>{const i=e();if(!i)return;const c=()=>{ut=performance.now()},d=["wheel","touchstart","touchmove","pointerdown","keydown"];for(const u of d)i.addEventListener(u,c,{passive:!0});a.onCleanup(()=>{for(const u of d)i.removeEventListener(u,c)})});const _t=()=>{const i=e();if(i)return{scroller:i,ids:j,more:K,loadMore:c=>L().message.loadMore(M().id,{signal:c}),reducedMotion:ot,frame:lt,loading:R,tween:(c,d)=>Ie({scroller:i,frame:lt,now:()=>performance.now()},c,d)}},[nt,ft]=a.createSignal(!1),Pt=a.createMemo(()=>t.input.active);a.createEffect(()=>{const i=e();if(!i||!Pt()||!K())return;const c=new AbortController,d={scroller:i,more:()=>L().message.more(M().id),loadMore:({signal:u,beforePublish:b})=>L().message.loadMore(M().id,{signal:u,beforePublish:b}),frame:lt,idle:Lt,inset:()=>it(i),loading:ft,drift:globalThis.__timelineRailDrift};a.untrack(()=>ne(d,c.signal)),a.onCleanup(()=>{c.abort(),ft(!1)})});let Y;const Ft=()=>{Y=void 0;const i=e(),c=n();if(!t.input.active||!i||!c)return;const d=pe({scroller:i,ids:j}),u=Rt(i,c);v(d),f(b=>b&&b.top===u.top&&b.height===u.height&&b.left===u.left&&b.show===u.show?b:u)},_=()=>{Y===void 0&&(Y=requestAnimationFrame(Ft))};a.onCleanup(()=>{Y!==void 0&&cancelAnimationFrame(Y)}),a.createEffect(()=>{const i=e(),c=n();if(!i||!c)return;i.addEventListener("scroll",_,{passive:!0});const d=typeof ResizeObserver=="function"?new ResizeObserver(_):void 0;d?.observe(c);const u=c.querySelector("[data-slot='session-timeline-visible']");u&&d?.observe(u),_(),a.onCleanup(()=>{i.removeEventListener("scroll",_),d?.disconnect()})}),a.createEffect(a.on([j,K,()=>t.input.active,x],_,{defer:!0}));let z;const Ht=i=>{const c=j()[i],d=_t();if(!c||!d||!t.input.active)return;z?.abort();const u=new AbortController;z=u,ye(d,c,u.signal).finally(()=>{z===u&&(z=void 0),_()})};a.onCleanup(()=>z?.abort());const[pt,qt]=a.createSignal(),[P,F]=a.createSignal("closed"),[Nt,vt]=a.createSignal(!1),[Ot,gt]=a.createSignal();let H,ht=Number.NEGATIVE_INFINITY;const bt=(i,c=!1)=>{if(qt(i),P()!=="open"){if(clearTimeout(H),P()==="closing"||c||Date.now()-ht<Be){F("open");return}H=setTimeout(()=>F("open"),Oe)}},rt=()=>{if(clearTimeout(H),H=void 0,P()!=="open"){F("closed");return}if(ht=Date.now(),ot()){F("closed");return}F("closing"),H=setTimeout(()=>{P()==="closing"&&F("closed")},De)};a.onCleanup(()=>clearTimeout(H)),a.createEffect(()=>{if(P()!=="open"){vt(!1);return}const i=requestAnimationFrame(()=>vt(!0));a.onCleanup(()=>cancelAnimationFrame(i))});const X=a.createMemo(()=>{const i=pt();return i===void 0||P()==="closed"?void 0:T().ticks[i]}),q=()=>{const i=X();return i?S()[i.start]:void 0},yt=()=>{const i=X();if(!(!i||K()||nt()))return i.end>i.start?`${i.start+1}–${i.end+1} of ${S().length}`:`${i.start+1} of ${S().length}`},Bt=i=>{const c=S()[i.start];return c?i.end>i.start?`${c.title} (and ${i.end-i.start} more)`:c.title:""},Dt=()=>Ot()??Math.max(0,D());let N,J,Q;const[Yt,zt]=a.createSignal(0),[Gt,Ut]=a.createSignal(0),[Vt,jt]=a.createSignal(!1),Z=()=>N?[...N.querySelectorAll("[data-timeline-rail-tick]")]:[];a.createEffect(()=>{const i=X(),c=q(),d=pt();if(!i||!c||d===void 0||!N||!Q)return;const u=Z()[d];if(!u)return;const b=N.getBoundingClientRect(),E=u.getBoundingClientRect(),G=E.top+E.height/2-b.top,m=Q.offsetHeight,y=Math.round(Math.max(0,Math.min(G-m/2,b.height-m)));zt(y),Ut(Math.round(G-y))});let A,wt=0;const Kt=()=>{if(A=void 0,!J)return;const i=J.getBoundingClientRect().top,c=T().pitch;Z().forEach((d,u)=>{const b=wt-(i+(u+.5)*c),E=1+Ye*Math.exp(-(b*b)/(2*Ct*Ct));E<1.01?d.style.removeProperty("--k"):d.style.setProperty("--k",E.toFixed(3))})},xt=()=>{A!==void 0&&cancelAnimationFrame(A),A=void 0;for(const i of Z())i.style.removeProperty("--k")};a.onCleanup(()=>{A!==void 0&&cancelAnimationFrame(A)});const[Wt,kt]=a.createSignal(!1);let O;a.createEffect(a.on(()=>`${T().ticks.length}:${T().pitch}:${l()?.height}`,()=>{kt(!0),O!==void 0&&cancelAnimationFrame(O),O=requestAnimationFrame(()=>O=requestAnimationFrame(()=>kt(!1)))})),a.onCleanup(()=>{O!==void 0&&cancelAnimationFrame(O)});const Xt=i=>{if(i.key==="Escape"){rt();return}const c=Z();if(c.length===0)return;const d=c.findIndex(b=>b===document.activeElement),u=i.key==="ArrowDown"?Math.min(c.length-1,d+1):i.key==="ArrowUp"?Math.max(0,d-1):i.key==="PageDown"?Math.min(c.length-1,d+5):i.key==="PageUp"?Math.max(0,d-5):i.key==="Home"?0:i.key==="End"?c.length-1:-1;u!==-1&&(i.preventDefault(),c[u]?.focus())},Jt=()=>{const i=l();return{top:`${i?.top??0}px`,height:`${i?.height??0}px`,left:`${i?.left??0}px`,"--timeline-rail-pitch":`${T().pitch}px`}},Qt=()=>Math.max(0,D())*T().pitch+T().pitch/2-ze/2;return(()=>{var i=Re();return s.use(c=>dt=c,i),s.insert(i,s.createComponent(a.Show,{get when(){return s.memo(()=>!!(t.input.active&&x()&&l()?.show))()&&n()},children:c=>s.createComponent(s.Portal,{get mount(){return c()},ref:d=>d.style.display="contents",get children(){var d=Fe(),u=d.firstChild,b=u.firstChild,E=b.nextSibling;d.$$focusout=m=>{(!(m.relatedTarget instanceof Node)||!N?.contains(m.relatedTarget))&&(gt(void 0),rt())},d.$$keydown=Xt,d.addEventListener("pointerleave",()=>{xt(),rt()}),s.use(m=>{N=m,requestAnimationFrame(()=>requestAnimationFrame(()=>jt(!0)))},d),u.$$pointermove=m=>{if(m.pointerType!=="touch"){if(ot()){xt();return}wt=m.clientY,A===void 0&&(A=requestAnimationFrame(Kt))}};var G=J;return typeof G=="function"?s.use(G,u):J=u,s.insert(u,s.createComponent(a.For,{get each(){return T().ticks},children:(m,y)=>(()=>{var w=He();return w.$$click=()=>Ht(m.start),w.addEventListener("focus",g=>{gt(y()),g.currentTarget.matches(":focus-visible")&&bt(y(),!0)}),w.addEventListener("pointerenter",g=>{g.pointerType!=="touch"&&bt(y())}),s.effect(g=>{var h=S()[m.start]?.length,C=D()===y()?"":void 0,$=D()===y()?"true":void 0,I=Bt(m),U=Dt()===y()?0:-1;return h!==g.e&&s.setAttribute(w,"data-length",g.e=h),C!==g.t&&s.setAttribute(w,"data-current",g.t=C),$!==g.a&&s.setAttribute(w,"aria-current",g.a=$),I!==g.o&&s.setAttribute(w,"aria-label",g.o=I),U!==g.i&&s.setAttribute(w,"tabindex",g.i=U),g},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0}),w})()}),null),s.insert(d,s.createComponent(a.Show,{get when(){return X()},get children(){var m=Pe(),y=m.firstChild,w=y.firstChild,g=Q;return typeof g=="function"?s.use(g,y):Q=y,s.insert(y,s.createComponent(a.Show,{get when(){return yt()},get children(){var h=Le();return s.insert(h,yt),h}}),w),s.insert(w,()=>q()?.title),s.insert(y,s.createComponent(a.Show,{get when(){return q()?.snippet||q()?.working},get children(){var h=_e();return s.insert(h,()=>q()?.snippet??"Working…"),s.effect(()=>s.setAttribute(h,"data-working",q()?.working?"":void 0)),h}}),null),s.effect(h=>{var C=Nt()?"":void 0,$=`${Yt()}px`,I=`${Gt()}px`;return C!==h.e&&s.setAttribute(m,"data-entered",h.e=C),$!==h.t&&s.setStyleProperty(m,"--card-y",h.t=$),I!==h.a&&s.setStyleProperty(m,"--card-origin",h.a=I),h},{e:void 0,t:void 0,a:void 0}),m}}),null),s.effect(m=>{var y=S().length<2?"":void 0,w=Vt()?"":void 0,g=Jt(),h=k()||nt()?"true":void 0,C=nt()?"":void 0,$=Wt()?"":void 0,I=D()<0?"":void 0,U=`translateY(${Qt()}px)`;return y!==m.e&&s.setAttribute(d,"data-empty",m.e=y),w!==m.t&&s.setAttribute(d,"data-armed",m.t=w),m.a=s.style(d,g,m.a),h!==m.o&&s.setAttribute(u,"aria-busy",m.o=h),C!==m.i&&s.setAttribute(b,"data-active",m.i=C),$!==m.n&&s.setAttribute(E,"data-reflow",m.n=$),I!==m.s&&s.setAttribute(E,"data-hidden",m.s=I),U!==m.h&&s.setStyleProperty(E,"transform",m.h=U),m},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),d}})})),i})()}const Ve=`
[data-timeline-rail] {
  --timeline-rail-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --timeline-rail-move: cubic-bezier(0.77, 0, 0.175, 1);
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${ct}px;
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
  width: 6px;
  margin-top: -1px;
  border-radius: 1px;
  transform-origin: 0 50%;
  transform: scale(var(--k, 1), calc(1 + (var(--k, 1) - 1) * 1.2));
}
[data-timeline-rail-tick]::before { background: var(--v2-text-text-faint); }
[data-timeline-rail-tick]::after { background: var(--v2-text-text-base); opacity: 0; }
[data-timeline-rail-tick][data-length="medium"]::before, [data-timeline-rail-tick][data-length="medium"]::after { width: 10px; }
[data-timeline-rail-tick][data-length="long"]::before, [data-timeline-rail-tick][data-length="long"]::after { width: 14px; }
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::after {
  transition: transform 110ms var(--timeline-rail-ease), opacity 120ms var(--timeline-rail-ease);
}
@media (hover: hover) and (pointer: fine) {
  [data-timeline-rail-tick]:hover::after { opacity: 0.6; }
}
[data-timeline-rail-tick][data-current]::after { opacity: 1; }
[data-timeline-rail-tick]:focus-visible::before {
  outline: 2px solid var(--v2-border-border-focus);
  outline-offset: 2px;
}
[data-timeline-rail-card] {
  position: absolute;
  top: 0;
  left: ${ct}px;
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
`,je=at.Plugin.define({setup(t){t.add(at.Style,Ve),t.add(at.Slot,{at:"session.header",render:e=>s.createComponent(Ue,{input:e})})}});s.delegateEvents(["keydown","focusout","pointermove","click"]);exports.default=je;exports.measure=Rt;
