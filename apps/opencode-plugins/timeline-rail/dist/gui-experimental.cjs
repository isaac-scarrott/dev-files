"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const u=require("solid-js/web"),dt=require("@opencode/plugin/gui"),c=require("solid-js"),le=160,se=4;function ce(t){const e=t.scroller.getBoundingClientRect().top+t.inset();for(const a of t.scroller.querySelectorAll("[data-message-id]")){const n=a.getBoundingClientRect();if(n.bottom>e)return{element:a,top:n.top}}}async function de(t,e,a){const{scroller:n}=t;for(let r=0;r<se&&!a.aborted;r+=1){if(await t.frame(),!e.element.isConnected||t.idle()<32)return;const s=e.element.getBoundingClientRect().top-e.top;t.drift?.(s),Math.abs(s)>1&&n.scrollTo({top:n.scrollTop+s,behavior:"auto"})}}async function me(t,e){if(!(!t.more()||e.aborted)){t.loading(!0);try{for(;t.more()&&!e.aborted;){for(await t.frame();t.idle()<le&&!e.aborted;)await t.frame();if(e.aborted)return;let a;await t.loadMore({signal:e,beforePublish:()=>a=ce(t)}),a&&await de(t,a,e)}}catch{}finally{t.loading(!1)}}}const ue=8;function fe(t,e,a){if(t.length===0)return-1;const n=e.find(f=>f.bottom>a+ue)??e.at(-1);if(!n)return-1;const r=t.indexOf(n.owner);if(r!==-1)return r;const s=t.findIndex(f=>f>n.owner);return s===-1?t.length-1:Math.max(0,s-1)}function pe(t){return t.ids.indexOf(t.target)>=1?{kind:"probe"}:t.more?{kind:"load"}:{kind:"top"}}function ve(t,e,a){const n=t.filter(v=>v.bottom>a.top&&v.top<a.bottom),r=n.length?n:t,s=r[0],f=r.at(-1);return!s||s.owner>=e?-1:f&&f.owner<e?1:0}function ge(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const a=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:a,behavior:"smooth"}}const et=3,he=40,be=120,we=200,ye=3,xe=5;function Nt(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const a=e.dataset.messageId;if(!a)return[];const n=e.getBoundingClientRect();return[{owner:a,prompt:e.dataset.timelineRow==="UserMessage",top:n.top,bottom:n.bottom}]})}function it(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function q(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(a=>a.dataset.messageId===e)}function Ot(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}async function Me(t,e){t.loading?.(!0);try{await t.loadMore(e)}finally{t.loading?.(!1)}}function Ct(t,e){const a=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,a.top-n.top+t.scrollTop-it(t))}async function It(t,e,a){let n=Number.NaN,r=0,s=0;for(let f=0;f<he&&!a.aborted;f+=1){await t.frame();const v=t.scroller.scrollTop,g=q(t.scroller,e);if(r=g&&v===n?r+1:0,s=g?0:s+1,n=v,r>=et||s>et)return}}async function Ee(t,e,a,n){const{scroller:r}=t;let s=0;for(let f=0;f<we&&!a.aborted;f+=1){if(q(r,e))return;const v=ve(Nt(r),e,r.getBoundingClientRect());if(v===0){if((s+=1)>et)return;await t.frame();continue}s=0;const g=Math.max(0,r.scrollHeight-r.clientHeight);if(v===-1&&r.scrollTop<=0||v===1&&r.scrollTop>=g)return;n.direction!==0&&v!==n.direction&&(n.step=Math.max(r.clientHeight/4,n.step/2)),n.direction=v,r.scrollTo({top:Math.min(g,Math.max(0,r.scrollTop+v*n.step)),behavior:"auto"}),await t.frame()}}async function Ft(t,e,a,n=0){const{scroller:r}=t,s=pe({ids:t.ids(),target:e,more:t.more()});if(s.kind==="load")return n>=xe||(await Me(t,a),a.aborted)?void 0:Ft(t,e,a,n+1);if(s.kind==="top")return r.scrollTo({top:0,behavior:"auto"}),It(t,e,a);const f={step:r.clientHeight,direction:0};for(let v=0;v<ye&&!a.aborted;v+=1)if(await Ee(t,e,a,f),await It(t,e,a),q(r,e))return}async function Te(t,e,a){const{scroller:n}=t,r=q(n,e);if(!r)return!1;const s=ge({from:n.scrollTop,to:Ct(n,r),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});s.start!==void 0&&(n.scrollTo({top:s.start,behavior:"auto"}),await t.frame());const f=async E=>{if(s.behavior==="auto")return n.scrollTo({top:E,behavior:"auto"}),!0;if(t.tween)return t.tween(E,a);n.scrollTo({top:E,behavior:s.behavior});let I=Number.NaN,M=0;for(let S=0;S<be&&!a.aborted;S+=1){await t.frame();const A=n.scrollTop;if(M=A===I?M+1:0,I=A,M>=et)break}return!0};if(!await f(s.to)||s.behavior==="auto"||a.aborted)return!0;const v=q(n,e);if(!v)return!0;const g=Math.min(Ct(n,v),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(g-n.scrollTop)>2&&await f(g),!0}async function ke(t,e,a){return t.ids().includes(e)?(Ot(t.scroller),!q(t.scroller,e)&&(await Ft(t,e,a),a.aborted)?"aborted":await Te(t,e,a)?a.aborted?"aborted":"done":"none"):"none"}const Se=8,Ae=2,Ce="calc(100vh - 18rem)",$t=2,_t=200,Lt=240,vt=t=>t.replace(/\s+/g," ").trim();function Ie(t){const e=t.metadata?.displayText,a=vt(typeof e=="string"&&e?e:t.text??"");if(a)return a.length>_t?`${a.slice(0,_t)}…`:a;const n=(t.files??[]).map(f=>f.mime.startsWith("image/")?"[image]":`[${f.name??"file"}]`),r=(t.agents??[]).map(f=>`@${f.name}`),s=[...n,...r];return s.length?s.slice(0,3).join(" "):"(empty prompt)"}function $e(t){return vt(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}function _e(t,e){const a=[];for(let n=0;n<t.length;n+=1){const r=t[n];if(r.type!=="user"||e&&r.id>=e)continue;let s,f=!1;for(let g=n+1;g<t.length&&t[g].type!=="user";g+=1){const E=t[g];if(E.type!=="assistant")continue;const I=E.content?.find(M=>M.type==="text"&&M.text&&vt(M.text))?.text;if(I){const M=$e(I);s=M.length>Lt?`${M.slice(0,Lt)}…`:M;break}E.time?.completed===void 0&&!E.error&&(f=!0)}const v=Ie(r);a.push({id:r.id,title:v,snippet:s,working:!s&&f})}return a}function Le(t){return`max(0px, min(${Math.max(1,(t-1)*Se)}px, ${Ce}))`}function Pe(t,e){return e>1?t/(e-1)*100:0}function Re(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}function Pt(t,e){if(!(t===void 0||t<0||t>=e))return[Math.max(0,t-$t),Math.min(e-1,t+$t)]}function He(t,e,a){let n=Number.POSITIVE_INFINITY,r=-1;for(const s of e){if(s.bottom<=a.top||s.top>=a.bottom)continue;const f=t.get(s.owner);f!==void 0&&(n=Math.min(n,f),r=Math.max(r,f))}return r===-1?void 0:[n,r]}const mt=220;function Ne(t){const e=document.createElement("span"),a=new Map;let n=0,r,s=-1,f,v;const g=new Map;e.setAttribute("data-timeline-rail-base",""),t.appendChild(e);const E=d=>({d:f===void 0?void 0:Math.abs(d-f),view:r!==void 0&&d>=r[0]&&d<=r[1],current:d===s}),I=d=>{let m=a.get(d);return m||(m=document.createElement("span"),m.setAttribute("data-timeline-rail-tick",""),m.setAttribute("data-index",String(d)),m.setAttribute("aria-hidden","true"),m.style.setProperty("--i",String(d)),t.appendChild(m),a.set(d,m),m.offsetWidth,m)},M=()=>{v=void 0;const d=performance.now();for(const[m,b]of g)d-b<mt||(g.delete(m),a.get(m)?.remove(),a.delete(m));g.size>0&&(v=setTimeout(M,mt))},S=d=>{if(d<0||d>=n)return;const m=E(d),b=m.d!==void 0&&m.d<=2||m.view||m.current;if(!b&&!a.has(d))return;const y=b?I(d):a.get(d),$=(_,nt,k="")=>{nt?y.getAttribute(_)!==k&&y.setAttribute(_,k):y.hasAttribute(_)&&y.removeAttribute(_)};$("data-d",m.d!==void 0&&m.d<=2,String(m.d)),$("data-view",m.view),$("data-current",m.current),b?g.delete(d):g.has(d)||(g.set(d,performance.now()),v??=setTimeout(M,mt))},A=(d,m)=>{if(d)for(let b=d[0];b<=d[1];b+=1)m(b)};return{nodes:()=>[...a.values()],count(d){const m=n;n=d,t.style.setProperty("--max",String(Math.max(1,d-1)));for(const[b,y]of a)b<d||(y.remove(),a.delete(b),g.delete(b));s>=d&&(s=-1),r&&r[0]>=d?r=void 0:r&&r[1]>=d&&(r=[r[0],d-1]),f!==void 0&&f>=d&&(f=void 0),d>m&&A(r,S)},view(d){const m=r,b=d&&d[0]<n?[d[0],Math.min(d[1],n-1)]:void 0;r=b,A(m,y=>{(!b||y<b[0]||y>b[1])&&S(y)}),A(b,y=>{(!m||y<m[0]||y>m[1])&&S(y)})},current(d){const m=d>=0&&d<n?d:-1;if(m===s)return;const b=s;s=m,S(b),S(m)},active(d){const m=Pt(f,n);f=d,A(m,S),A(Pt(f,n),S)}}}const Oe=t=>1-(1-t)**4;function Fe(t){return Math.round(Math.min(420,180+Math.abs(t)*.12))}const Rt=["wheel","touchstart","pointerdown","keydown"];async function Be(t,e,a){const{scroller:n}=t,r=n.scrollTop,s=Fe(e-r);let f=!1;const v=()=>{f=!0};for(const g of Rt)n.addEventListener(g,v,{passive:!0});try{const g=t.now();for(;;){if(await t.frame(),f||a.aborted)return!1;const E=Math.min(1,(t.now()-g)/s);if(n.scrollTo({top:r+(e-r)*Oe(E),behavior:"auto"}),E>=1)return!0}}finally{for(const g of Rt)n.removeEventListener(g,v)}}var De=u.template("<span>"),qe=u.template("<span style=display:contents>"),ze=u.template("<div data-timeline-rail-card-meta>"),Ge=u.template("<div data-timeline-rail-card-snippet dir=auto>"),Ye=u.template("<div data-timeline-rail-card><div data-timeline-rail-card-body role=tooltip><div data-timeline-rail-card-title dir=auto>"),Ue=u.template("<div data-timeline-rail><div data-timeline-rail-body><span data-timeline-rail-history aria-hidden=true></span><button type=button data-timeline-rail-strip><span data-timeline-rail-ticks aria-hidden=true>");const pt=28,Ve=6,We=44,je="(min-width: 768px)",Ke=400,Xe=300,Je=90,Ht=5,ut=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,ft=()=>new Promise(t=>requestAnimationFrame(()=>t()));function Qe(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function Bt(t,e){const a=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),r=n instanceof HTMLElement?n.getBoundingClientRect():a,s=t.querySelector("[data-timeline-row][data-message-id]"),v=(s instanceof HTMLElement?s.getBoundingClientRect().left:a.left+Math.max(0,(a.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||a.width))/2))-a.left,g=it(t);return{top:r.top-a.top+g,height:Math.max(0,a.bottom-r.top-g),left:Math.min(Ve,Math.max(0,Math.round((v-pt)/2))),show:v>=We}}function Ze(t){const[e,a]=c.createSignal(),[n,r]=c.createSignal(),[s,f]=c.createSignal(),[v,g]=c.createSignal(-1),[E,I]=c.createSignal(),[M,S]=c.createSignal(!1),[A,d]=c.createSignal(!0),m=()=>t.input.session,b=()=>m().server.data.session,y=c.createMemo(()=>_e(b().message.list(m().id),b().get(m().id)?.revert?.messageID)),$=c.createMemo(()=>y().map(i=>i.id)),_=c.createMemo(()=>b().message.more(m().id)),nt=c.createMemo(()=>new Map($().map((i,o)=>[i,o]))),k=()=>y().length;let gt,j;const ht=i=>{j=void 0;const o=gt?.closest("[data-scrollable]"),p=o&&Qe(o);o&&p?(a(o),r(p)):i>0&&(j=requestAnimationFrame(()=>ht(i-1)))};c.onMount(()=>ht(10)),c.onCleanup(()=>{j!==void 0&&cancelAnimationFrame(j)}),c.onMount(()=>{if(typeof window.matchMedia!="function")return;const i=window.matchMedia(je),o=()=>d(i.matches);o(),i.addEventListener("change",o),c.onCleanup(()=>i.removeEventListener("change",o))});let at=Number.NEGATIVE_INFINITY;const Dt=()=>performance.now()-at;c.createEffect(()=>{const i=e();if(!i)return;const o=()=>{at=performance.now()},p=["wheel","touchstart","touchmove","pointerdown","keydown"];for(const h of p)i.addEventListener(h,o,{passive:!0});c.onCleanup(()=>{for(const h of p)i.removeEventListener(h,o)})});const qt=()=>{const i=e();if(i)return{scroller:i,ids:$,more:_,loadMore:o=>b().message.loadMore(m().id,{signal:o}),reducedMotion:ut,frame:ft,loading:S,tween:(o,p)=>Be({scroller:i,frame:ft,now:()=>performance.now()},o,p)}},[rt,bt]=c.createSignal(!1),zt=c.createMemo(()=>t.input.active);c.createEffect(()=>{const i=e();if(!i||!zt()||!_())return;const o=new AbortController,p={scroller:i,more:()=>b().message.more(m().id),loadMore:({signal:h,beforePublish:C})=>b().message.loadMore(m().id,{signal:h,beforePublish:C}),frame:ft,idle:Dt,inset:()=>it(i),loading:bt,drift:globalThis.__timelineRailDrift};c.untrack(()=>me(p,o.signal)),c.onCleanup(()=>{o.abort(),bt(!1)})});let z;const Gt=()=>{z=void 0;const i=e(),o=n();if(!t.input.active||!i||!o)return;const p=Nt(i),h=i.getBoundingClientRect(),C=h.top+it(i),w=fe($(),p,C),L=He(nt(),p,{top:C,bottom:h.bottom}),P=Bt(i,o);g(w),I(l=>l&&L&&l[0]===L[0]&&l[1]===L[1]?l:L),f(l=>l&&l.top===P.top&&l.height===P.height&&l.left===P.left&&l.show===P.show?l:P)},R=()=>{z===void 0&&(z=requestAnimationFrame(Gt))};c.onCleanup(()=>{z!==void 0&&cancelAnimationFrame(z)}),c.createEffect(()=>{const i=e(),o=n();if(!i||!o)return;i.addEventListener("scroll",R,{passive:!0});const p=typeof ResizeObserver=="function"?new ResizeObserver(R):void 0;p?.observe(o);const h=o.querySelector("[data-slot='session-timeline-visible']");h&&p?.observe(h),R(),c.onCleanup(()=>{i.removeEventListener("scroll",R),p?.disconnect()})}),c.createEffect(c.on([$,_,()=>t.input.active,A],R,{defer:!0}));let G;const Yt=i=>{const o=$()[i],p=qt();if(!o||!p||!t.input.active)return;G?.abort();const h=new AbortController;G=h,ke(p,o,h.signal).finally(()=>{G===h&&(G=void 0),R()})};c.onCleanup(()=>G?.abort());const[Ut,Vt]=c.createSignal(),[H,wt]=c.createSignal(),[N,O]=c.createSignal("closed"),[Wt,yt]=c.createSignal(!1);let F,xt=Number.NEGATIVE_INFINITY;const K=(i,o=!1)=>{if(Vt(i),wt(i),N()!=="open"){if(clearTimeout(F),N()==="closing"||o||Date.now()-xt<Xe){O("open");return}F=setTimeout(()=>O("open"),Ke)}},ot=()=>{if(clearTimeout(F),F=void 0,wt(void 0),N()!=="open"){O("closed");return}if(xt=Date.now(),ut()){O("closed");return}O("closing"),F=setTimeout(()=>{N()==="closing"&&O("closed")},Je)};c.onCleanup(()=>clearTimeout(F)),c.createEffect(()=>{if(N()!=="open"){yt(!1);return}const i=requestAnimationFrame(()=>yt(!0));c.onCleanup(()=>cancelAnimationFrame(i))});const X=c.createMemo(()=>{const i=Ut();return i===void 0||N()==="closed"||i>=k()?void 0:i}),B=()=>{const i=X();return i===void 0?void 0:y()[i]},Mt=()=>{const i=X();return i===void 0||_()||rt()?void 0:`${i+1} of ${k()}`},jt=()=>y()[H()??Math.max(0,v())]?.title??"User message";let lt,D,J;const[Kt,Xt]=c.createSignal(0),[Jt,Qt]=c.createSignal(0),[Zt,te]=c.createSignal(!1),[ee,ie]=c.createSignal(),Q=c.createMemo(()=>{const i=ee();return i?Ne(i):void 0});c.createEffect(()=>Q()?.count(k())),c.createEffect(()=>Q()?.view(E())),c.createEffect(()=>Q()?.current(v())),c.createEffect(()=>Q()?.active(ut()?void 0:H())),c.createEffect(()=>{const i=X(),o=B();if(i===void 0||!o||!lt||!D||!J)return;const p=lt.getBoundingClientRect(),h=D.getBoundingClientRect(),C=h.top+h.height*Pe(i,k())/100-p.top,w=J.offsetHeight,L=Math.round(Math.max(0,Math.min(C-w/2,p.height-w)));Xt(L),Qt(Math.round(C-L))});const st=i=>{i!==void 0&&i>=0&&i<k()&&Yt(i)},ct=i=>{if(!D)return null;const o=D.getBoundingClientRect();return Re({count:k(),top:o.top,height:o.height,y:i.clientY})};let Z=!1;const[Et,Tt]=c.createSignal(!1),kt=i=>{const o=h=>{h.buttons===0&&(p(),i())},p=()=>{window.removeEventListener("pointerup",o),window.removeEventListener("pointermove",o)};window.addEventListener("pointerup",o),window.addEventListener("pointermove",o)},ne=i=>{const o=e();o&&(i.preventDefault(),at=performance.now(),Ot(o),o.scrollBy({top:i.deltaY,left:i.deltaX}))},ae=i=>{if(i.key==="Escape"){ot();return}const o=k()-1,p=H()??Math.max(0,v()),h=i.key==="ArrowDown"?Math.min(o,p+1):i.key==="ArrowUp"?Math.max(0,p-1):i.key==="PageDown"?Math.min(o,p+Ht):i.key==="PageUp"?Math.max(0,p-Ht):i.key==="Home"?0:i.key==="End"?o:-1;if(i.key==="Enter"||i.key===" "){i.preventDefault(),st(H());return}h!==-1&&(i.preventDefault(),K(h,!0))},re=()=>{const i=s();return{top:`${i?.top??0}px`,height:`${i?.height??0}px`,left:`${i?.left??0}px`}},oe=i=>{const o=v()+i;v()>=0&&st(o)},St=i=>{const o=i==="previous",p=o?"Previous turn":"Next turn";return u.createComponent(t.ui.Tooltip,{value:p,placement:o?"top":"bottom",get children(){var h=De();return u.setAttribute(h,"data-timeline-rail-turn",i),u.insert(h,u.createComponent(t.ui.IconButton,{icon:"chevron-down",label:p,size:"small",variant:"ghost-muted",get disabled(){return o?v()<=0:v()<0||v()>=k()-1},onClick:()=>oe(o?-1:1)})),h}})};return(()=>{var i=qe();return u.use(o=>gt=o,i),u.insert(i,u.createComponent(c.Show,{get when(){return u.memo(()=>!!(t.input.active&&A()&&s()?.show))()&&n()},children:o=>u.createComponent(u.Portal,{get mount(){return o()},ref:p=>p.style.display="contents",get children(){var p=Ue(),h=p.firstChild,C=h.firstChild,w=C.nextSibling,L=w.firstChild;p.addEventListener("pointerleave",()=>ot()),u.use(l=>{lt=l,l.addEventListener("wheel",ne,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>te(!0)))},p),u.insert(h,()=>St("previous"),w),w.$$keydown=ae,w.addEventListener("blur",()=>ot()),w.addEventListener("focus",l=>{H()===void 0&&K(Math.max(0,v()),l.currentTarget.matches(":focus-visible"))}),w.$$click=l=>{l.detail!==0&&(st(ct(l)??void 0),l.currentTarget.blur())},w.$$pointermove=l=>{if(l.pointerType==="touch")return;if(l.buttons!==0&&!Z){Et()||(Tt(!0),kt(()=>Tt(!1)));return}const T=ct(l);T!==null&&T!==H()&&K(T)},w.addEventListener("pointerenter",l=>{if(l.pointerType==="touch")return;const T=ct(l);T!==null&&K(T)}),w.$$mousedown=l=>l.preventDefault(),w.$$pointerdown=()=>{Z||(Z=!0,kt(()=>Z=!1))};var P=D;return typeof P=="function"?u.use(P,w):D=w,u.use(ie,L),u.insert(h,()=>St("next"),null),u.insert(p,u.createComponent(c.Show,{get when(){return X()!==void 0},get children(){var l=Ye(),T=l.firstChild,Y=T.firstChild,tt=J;return typeof tt=="function"?u.use(tt,T):J=T,u.insert(T,u.createComponent(c.Show,{get when(){return Mt()},get children(){var x=ze();return u.insert(x,Mt),x}}),Y),u.insert(Y,()=>B()?.title),u.insert(T,u.createComponent(c.Show,{get when(){return B()?.snippet||B()?.working},get children(){var x=Ge();return u.insert(x,()=>B()?.snippet??"Working…"),u.effect(()=>u.setAttribute(x,"data-working",B()?.working?"":void 0)),x}}),null),u.effect(x=>{var U=Wt()?"":void 0,V=`${Kt()}px`,W=`${Jt()}px`;return U!==x.e&&u.setAttribute(l,"data-entered",x.e=U),V!==x.t&&u.setStyleProperty(l,"--card-y",x.t=V),W!==x.a&&u.setStyleProperty(l,"--card-origin",x.a=W),x},{e:void 0,t:void 0,a:void 0}),l}}),null),u.effect(l=>{var T=k()<Ae?"":void 0,Y=Zt()?"":void 0,tt=re(),x=Le(k()),U=rt()?"":void 0,V=Et()?"":void 0,W=`Jump to message: ${jt()}`,At=M()||rt()?"true":void 0;return T!==l.e&&u.setAttribute(p,"data-empty",l.e=T),Y!==l.t&&u.setAttribute(p,"data-armed",l.t=Y),l.a=u.style(p,tt,l.a),x!==l.o&&u.setStyleProperty(h,"--timeline-rail-height",l.o=x),U!==l.i&&u.setAttribute(C,"data-active",l.i=U),V!==l.n&&u.setAttribute(w,"data-pass",l.n=V),W!==l.s&&u.setAttribute(w,"aria-label",l.s=W),At!==l.h&&u.setAttribute(w,"aria-busy",l.h=At),l},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),p}})})),i})()}const ti=`
[data-timeline-rail] {
  --timeline-rail-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --timeline-rail-move: cubic-bezier(0.77, 0, 0.175, 1);
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${pt}px;
  pointer-events: none;
}
[data-timeline-rail][data-empty] { opacity: 0; visibility: hidden; }
[data-timeline-rail][data-armed] { transition: opacity 200ms var(--timeline-rail-ease), visibility 0s; }
[data-timeline-rail][data-armed][data-empty] { transition: opacity 160ms var(--timeline-rail-ease), visibility 0s 160ms; }
[data-timeline-rail-body] {
  position: relative;
  width: 100%;
  height: var(--timeline-rail-height);
  flex: none;
  pointer-events: none;
}
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
  cursor: pointer;
  outline: none;
  pointer-events: auto;
  user-select: none;
}
[data-timeline-rail-strip][data-pass] { pointer-events: none; }
[data-timeline-rail-strip]:focus-visible { outline: 2px solid var(--v2-border-border-focus); outline-offset: 2px; border-radius: 2px; }
[data-timeline-rail-ticks] { position: absolute; inset: 0; display: block; pointer-events: none; }
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
/* Faint ticks are one gradient (a 2px tick every height / (count - 1), 8px wide); only prompts with something to show
   get a node, drawn at a third of its 24px width at rest. The fisheye is t3-code's: scale-x by index distance from the
   active prompt. Only transform and opacity ever change. */
[data-timeline-rail-base] {
  position: absolute;
  left: 0;
  top: -1px;
  width: 8px;
  height: calc(var(--timeline-rail-height) + 2px);
  background: repeating-linear-gradient(
    to bottom,
    var(--v2-text-text-faint) 0 2px,
    transparent 2px calc(var(--timeline-rail-height) / var(--max, 1))
  );
  opacity: 0.45;
  pointer-events: none;
}
[data-timeline-rail][data-armed] [data-timeline-rail-base] { transition: opacity 150ms var(--timeline-rail-ease); }
[data-timeline-rail-tick] {
  position: absolute;
  left: 0;
  top: calc(var(--i) / var(--max) * 100%);
  width: 24px;
  height: 2px;
  margin-top: -1px;
  transform-origin: 0 50%;
  transform: scale(0.3333, 1);
  pointer-events: none;
}
[data-timeline-rail-tick][data-d="0"] { transform: scale(1, 1.8); }
[data-timeline-rail-tick][data-d="1"] { transform: scale(0.667, 1.4); }
[data-timeline-rail-tick][data-d="2"] { transform: scale(0.417, 1.15); }
[data-timeline-rail-tick]::before,
[data-timeline-rail-tick]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 1px;
  opacity: 0;
}
[data-timeline-rail-tick]::before { background: var(--v2-text-text-faint); }
[data-timeline-rail-tick]::after { background: var(--v2-text-text-base); }
[data-timeline-rail-tick][data-d]::before { opacity: 0.8; }
[data-timeline-rail-tick][data-d="0"]::after { opacity: 0.6; }
[data-timeline-rail-tick][data-view]::after,
[data-timeline-rail-tick][data-current]::after { opacity: 1; }
[data-timeline-rail][data-armed] [data-timeline-rail-tick] { transition: transform 150ms var(--timeline-rail-ease); }
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 150ms var(--timeline-rail-ease); }
@media (hover: hover) and (pointer: fine) {
  [data-timeline-rail-strip]:hover [data-timeline-rail-base] { opacity: 0.8; }
}
[data-timeline-rail-turn] {
  position: absolute;
  left: -2px;
  z-index: 1;
  display: inline-flex;
  opacity: 0;
  pointer-events: auto;
}
[data-timeline-rail-turn="previous"] { bottom: calc(100% + 2px); }
[data-timeline-rail-turn="previous"] svg { transform: rotate(180deg); }
[data-timeline-rail-turn="next"] { top: calc(100% + 2px); }
[data-timeline-rail][data-armed] [data-timeline-rail-turn] { transition: opacity 150ms var(--timeline-rail-ease); }
[data-timeline-rail-body]:hover [data-timeline-rail-turn],
[data-timeline-rail-turn]:hover,
[data-timeline-rail-turn]:focus-within { opacity: 1; }
[data-timeline-rail-card] {
  position: absolute;
  top: 0;
  left: ${pt}px;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  [data-timeline-rail][data-armed] [data-timeline-rail-tick] { transition: none; }
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 120ms linear; }
  [data-timeline-rail-card][data-entered] { transition: none; }
  [data-timeline-rail-card-body], [data-timeline-rail-card][data-entered] [data-timeline-rail-card-body] { transform: none; transition: opacity 90ms linear; }
}
`,ei=dt.Plugin.define({setup(t){t.add(dt.Style,ti),t.add(dt.Slot,{at:"session.header",render:e=>u.createComponent(Ze,{input:e,get ui(){return t.ui}})})}});u.delegateEvents(["pointerdown","mousedown","pointermove","click","keydown"]);exports.default=ei;exports.measure=Bt;
