"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const p=require("solid-js/web"),bt=require("@opencode/plugin/gui"),d=require("solid-js"),ye=require("solid-js/store"),xe=160,Me=1200,Ee=400,Te=4;function ke(t){const e=t.scroller.getBoundingClientRect().top+t.inset();for(const r of t.scroller.querySelectorAll("[data-message-id]")){const n=r.getBoundingClientRect();if(n.bottom>e)return{element:r,top:n.top}}}async function Se(t,e,r){const{scroller:n}=t;for(let a=0;a<Te&&!r.aborted;a+=1){if(await t.frame(),!e.element.isConnected||t.idle()<32)return;const o=e.element.getBoundingClientRect().top-e.top;t.drift?.(o),Math.abs(o)>1&&n.scrollTo({top:n.scrollTop+o,behavior:"auto"})}}async function Ae(t,e){if(!(!t.more()||e.aborted)){t.loading(!0);try{for(await t.pause?.(Me,e);t.more()&&!e.aborted;){for(await t.frame();t.idle()<xe&&!e.aborted;)await t.frame();if(e.aborted)return;let r;await t.loadMore({signal:e,beforePublish:()=>r=ke(t)}),r&&await Se(t,r,e),t.more()&&await t.pause?.(Ee,e)}}catch{}finally{t.loading(!1)}}}const Ie=8;function Ce(t,e,r){if(t.length===0)return-1;const n=e.find(s=>s.bottom>r+Ie)??e.at(-1);if(!n)return-1;const a=t.indexOf(n.owner);if(a!==-1)return a;const o=t.findIndex(s=>s>n.owner);return o===-1?t.length-1:Math.max(0,o-1)}function _e(t){return t.ids.indexOf(t.target)>=1?{kind:"probe"}:t.more?{kind:"load"}:{kind:"top"}}function $e(t,e,r){const n=t.filter(c=>c.bottom>r.top&&c.top<r.bottom),a=n.length?n:t,o=a[0],s=a.at(-1);return!o||o.owner>=e?-1:s&&s.owner<e?1:0}function Re(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const r=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:r,behavior:"smooth"}}function Le(t){const e=Math.max(0,t.scrollHeight-t.clientHeight);return Math.min(e,Math.max(0,Math.round(t.index/Math.max(1,t.count)*t.scrollHeight)))}function Pe(t){let e=Number.POSITIVE_INFINITY,r=-1;for(const g of t.rows){if(g.bottom<=t.box.top||g.top>=t.box.bottom)continue;const w=t.indexOf.get(g.owner);w!==void 0&&(e=Math.min(e,w),r=Math.max(r,w))}if(r===-1)return;if(t.target>=e&&t.target<=r)return 0;const n=t.rows.flatMap(g=>{const w=g.prompt?t.indexOf.get(g.owner):void 0;return w===void 0?[]:[{index:w,top:g.top}]}),a=n[0],o=n.at(-1),s=a&&o&&o.index>a.index?(o.top-a.top)/(o.index-a.index):0,c=s>0?s:t.fallback;return Math.round((t.target-(e+r)/2)*c)}const ct=3,Ne=40,He=120,Oe=200,Fe=3,De=5,qe=20,Be=24,ze=2,Ge=4;function Tt(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const r=e.dataset.messageId;if(!r)return[];const n=e.getBoundingClientRect();return[{owner:r,prompt:e.dataset.timelineRow==="UserMessage",top:n.top,bottom:n.bottom}]})}function dt(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function R(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(r=>r.dataset.messageId===e)}function Wt(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}async function Ye(t,e){t.loading?.(!0);try{await t.loadMore(e)}finally{t.loading?.(!1)}}function Mt(t,e){const r=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,r.top-n.top+t.scrollTop-dt(t))}async function qt(t,e,r){let n=Number.NaN,a=0,o=0;for(let s=0;s<Ne&&!r.aborted;s+=1){await t.frame();const c=t.scroller.scrollTop,g=R(t.scroller,e);if(a=g&&c===n?a+1:0,o=g?0:o+1,n=c,a>=ct||o>ct)return}}async function Ve(t,e,r,n){const{scroller:a}=t;let o=0;for(let s=0;s<Oe&&!r.aborted;s+=1){if(R(a,e))return;const c=$e(Tt(a),e,a.getBoundingClientRect());if(c===0){if((o+=1)>ct)return;await t.frame();continue}o=0;const g=Math.max(0,a.scrollHeight-a.clientHeight);if(c===-1&&a.scrollTop<=0||c===1&&a.scrollTop>=g)return;n.direction!==0&&c!==n.direction&&(n.step=Math.max(a.clientHeight/4,n.step/2)),n.direction=c,a.scrollTo({top:Math.min(g,Math.max(0,a.scrollTop+c*n.step)),behavior:"auto"}),await t.frame()}}async function Ue(t,e,r){const{scroller:n}=t,a=t.ids(),o=a.indexOf(e),s=Le({index:o,count:a.length,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});if(Math.abs(s-n.scrollTop)<qe*n.clientHeight)return;const c=new Map(a.map((M,y)=>[M,y])),g=n.scrollHeight/Math.max(1,a.length),w=()=>Math.max(0,n.scrollHeight-n.clientHeight),k=async()=>{for(let M=0;M<ze&&!r.aborted;M+=1)await t.frame()};n.scrollTo({top:s,behavior:"auto"}),await k();for(let M=0;M<Be&&!r.aborted;M+=1){if(R(n,e))return;const y=Pe({rows:Tt(n),indexOf:c,target:o,fallback:g,box:n.getBoundingClientRect()});if(y===0)return;if(y===void 0){await k();continue}const A=Math.min(w(),Math.max(0,n.scrollTop+y));if(A===n.scrollTop)return;n.scrollTo({top:A,behavior:"auto"}),await k()}}async function jt(t,e,r,n=0){const{scroller:a}=t,o=_e({ids:t.ids(),target:e,more:t.more()});if(o.kind==="load")return n>=De||(await Ye(t,r),r.aborted)?void 0:jt(t,e,r,n+1);if(o.kind==="top")return a.scrollTo({top:0,behavior:"auto"}),qt(t,e,r);await Ue(t,e,r);const s={step:a.clientHeight,direction:0};for(let c=0;c<Fe&&!r.aborted;c+=1)if(await Ve(t,e,r,s),await qt(t,e,r),R(a,e))return}async function Ke(t,e,r){const{scroller:n}=t,a=R(n,e);if(!a)return!1;const o=Re({from:n.scrollTop,to:Mt(n,a),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});o.start!==void 0&&(n.scrollTo({top:o.start,behavior:"auto"}),await t.frame());const s=async w=>{if(o.behavior==="auto")return n.scrollTo({top:w,behavior:"auto"}),!0;if(t.tween)return t.tween(w,r);n.scrollTo({top:w,behavior:o.behavior});let k=Number.NaN,M=0;for(let y=0;y<He&&!r.aborted;y+=1){await t.frame();const A=n.scrollTop;if(M=A===k?M+1:0,k=A,M>=ct)break}return!0};if(!await s(o.to)||o.behavior==="auto"||r.aborted)return!0;const c=R(n,e);if(!c)return!0;const g=Math.min(Mt(n,c),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(g-n.scrollTop)>2&&await s(g),!0}const Bt=["wheel","touchstart","pointerdown","keydown"];async function We(t,e,r){if(!t.ids().includes(e))return"none";Wt(t.scroller);const n=new AbortController,a=()=>n.abort(),o=AbortSignal.any([r,n.signal]);for(const s of Bt)t.scroller.addEventListener(s,a,{passive:!0});try{for(let s=0;s<Ge;s+=1){if(!R(t.scroller,e)&&(await jt(t,e,o),o.aborted))return"aborted";if(!await Ke(t,e,o))return"none";if(o.aborted)return"aborted";const c=R(t.scroller,e);if(c&&Math.abs(Mt(t.scroller,c)-t.scroller.scrollTop)<=2)break}return o.aborted?"aborted":"done"}finally{for(const s of Bt)t.scroller.removeEventListener(s,a)}}const je=8,Xe=2,Je="calc(100vh - 18rem)",zt=2,Gt=200,Yt=240,ut=t=>t.replace(/\s+/g," ").trim();function Xt(t){const e=rn(t);return e.length>Yt?`${e.slice(0,Yt)}…`:e}function Qe(){const t=n=>{let a=new Map,o=new Map;return{get(s){let c=o.get(s)??a.get(s);return c===void 0&&(c=n(s)),o.set(s,c),c},sweep(){a=o,o=new Map}}},e=t(ut),r=t(Xt);return{line:e.get,snippet:r.get,sweep(){e.sweep(),r.sweep()}}}const B=new Map,Ze=6;function tn(t){let e=B.get(t);e?B.delete(t):e=Qe(),B.set(t,e);for(const[r]of B){if(B.size<=Ze)break;B.delete(r)}return e}const en={line:ut,snippet:Xt,sweep:()=>{}};function nn(t,e=ut){const r=t.metadata?.displayText,n=e(typeof r=="string"&&r?r:t.text??"");if(n)return n.length>Gt?`${n.slice(0,Gt)}…`:n;const a=(t.files??[]).map(c=>c.mime.startsWith("image/")?"[image]":`[${c.name??"file"}]`),o=(t.agents??[]).map(c=>`@${c.name}`),s=[...a,...o];return s.length?s.slice(0,3).join(" "):"(empty prompt)"}function rn(t){return ut(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}function an(t,e,r=en){const n=[];for(let a=0;a<t.length;a+=1){const o=t[a];if(o.type!=="user"||e&&o.id>=e)continue;let s,c=!1;for(let w=a+1;w<t.length&&t[w].type!=="user";w+=1){const k=t[w];if(k.type!=="assistant")continue;const M=k.content?.find(y=>y.type==="text"&&y.text?.trim())?.text;if(M){s=r.snippet(M);break}k.time?.completed===void 0&&!k.error&&(c=!0)}const g=nn(o,r.line);n.push({id:o.id,title:g,snippet:s,working:!s&&c})}return r.sweep(),n}function on(t){return`max(0px, min(${Math.max(1,(t-1)*je)}px, ${Je}))`}function ln(t,e){return e>1?t/(e-1)*100:0}function sn(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}function Vt(t,e){if(!(t===void 0||t<0||t>=e))return[Math.max(0,t-zt),Math.min(e-1,t+zt)]}function cn(t,e,r){let n=Number.POSITIVE_INFINITY,a=-1;for(const o of e){if(o.bottom<=r.top||o.top>=r.bottom)continue;const s=t.get(o.owner);s!==void 0&&(n=Math.min(n,s),a=Math.max(a,s))}return a===-1?void 0:[n,a]}const wt=220;function dn(t){const e=document.createElement("span"),r=new Map;let n=0,a,o=-1,s,c;const g=new Map;e.setAttribute("data-timeline-rail-base",""),t.appendChild(e);const w=m=>({d:s===void 0?void 0:Math.abs(m-s),view:a!==void 0&&m>=a[0]&&m<=a[1],current:m===o}),k=m=>{let f=r.get(m);return f||(f=document.createElement("span"),f.setAttribute("data-timeline-rail-tick",""),f.setAttribute("data-index",String(m)),f.setAttribute("aria-hidden","true"),f.style.setProperty("--i",String(m)),t.appendChild(f),r.set(m,f),f)},M=()=>{c=void 0;const m=performance.now();for(const[f,b]of g)m-b<wt||(g.delete(f),r.get(f)?.remove(),r.delete(f));g.size>0&&(c=setTimeout(M,wt))},y=m=>{if(m<0||m>=n)return;const f=w(m),b=f.d!==void 0&&f.d<=2||f.view||f.current;if(!b&&!r.has(m))return;const E=b?k(m):r.get(m),z=(P,mt,Q="")=>{mt?E.getAttribute(P)!==Q&&E.setAttribute(P,Q):E.hasAttribute(P)&&E.removeAttribute(P)};z("data-d",f.d!==void 0&&f.d<=2,String(f.d)),z("data-view",f.view),z("data-current",f.current),b?g.delete(m):g.has(m)||(g.set(m,performance.now()),c??=setTimeout(M,wt))},A=(m,f)=>{if(m)for(let b=m[0];b<=m[1];b+=1)f(b)};return{nodes:()=>[...r.values()],count(m){const f=n;n=m,t.style.setProperty("--max",String(Math.max(1,m-1)));for(const[b,E]of r)b<m||(E.remove(),r.delete(b),g.delete(b));o>=m&&(o=-1),a&&a[0]>=m?a=void 0:a&&a[1]>=m&&(a=[a[0],m-1]),s!==void 0&&s>=m&&(s=void 0),m>f&&A(a,y)},view(m){const f=a,b=m&&m[0]<n?[m[0],Math.min(m[1],n-1)]:void 0;a=b,A(f,E=>{(!b||E<b[0]||E>b[1])&&y(E)}),A(b,E=>{(!f||E<f[0]||E>f[1])&&y(E)})},current(m){const f=m>=0&&m<n?m:-1;if(f===o)return;const b=o;o=f,y(b),y(f)},active(m){const f=Vt(s,n);s=m,A(f,y),A(Vt(s,n),y)}}}const un=t=>1-(1-t)**4;function mn(t){return Math.round(Math.min(420,180+Math.abs(t)*.12))}const Ut=["wheel","touchstart","pointerdown","keydown"];async function fn(t,e,r){const{scroller:n}=t,a=n.scrollTop,o=mn(e-a);let s=!1;const c=()=>{s=!0};for(const g of Ut)n.addEventListener(g,c,{passive:!0});try{const g=t.now();for(;;){if(await t.frame(),s||r.aborted)return!1;const w=Math.min(1,(t.now()-g)/o);if(n.scrollTo({top:a+(e-a)*un(w),behavior:"auto"}),w>=1)return!0}}finally{for(const g of Ut)n.removeEventListener(g,c)}}var pn=p.template("<span>"),vn=p.template("<span style=display:contents>"),gn=p.template("<div data-timeline-rail-card-meta>"),hn=p.template("<div data-timeline-rail-card-snippet dir=auto>"),bn=p.template("<div data-timeline-rail-card><div data-timeline-rail-card-body role=tooltip><div data-timeline-rail-card-title dir=auto>"),wn=p.template("<div data-timeline-rail><div data-timeline-rail-body><span data-timeline-rail-history aria-hidden=true></span><button type=button data-timeline-rail-strip><span data-timeline-rail-ticks aria-hidden=true>");const Et=28,yn=6,xn=44,Mn="(min-width: 768px)",En=400,Tn=300,kn=90,Kt=5,Sn=160,An=250,yt=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,In=(t,e)=>new Promise(r=>{let n;const a=()=>{clearTimeout(n),e.removeEventListener("abort",a),r()};e.addEventListener("abort",a,{once:!0}),n=setTimeout(()=>typeof requestIdleCallback=="function"?requestIdleCallback(a,{timeout:400}):a(),t),e.aborted&&a()}),xt=()=>new Promise(t=>requestAnimationFrame(()=>t()));function Cn(t){const e=n=>n[ye.$RAW]??n,r=e(t);return r===t?t.map(n=>e(n)):r}function _n(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function Jt(t,e){const r=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),a=n instanceof HTMLElement?n.getBoundingClientRect():r,o=t.querySelector("[data-timeline-row][data-message-id]"),c=(o instanceof HTMLElement?o.getBoundingClientRect().left:r.left+Math.max(0,(r.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||r.width))/2))-r.left,g=dt(t);return{top:a.top-r.top+g,height:Math.max(0,r.bottom-a.top-g),left:Math.min(yn,Math.max(0,Math.round((c-Et)/2))),show:c>=xn}}function $n(t){const[e,r]=d.createSignal(),[n,a]=d.createSignal(),[o,s]=d.createSignal(),[c,g]=d.createSignal(-1),[w,k]=d.createSignal(),[M,y]=d.createSignal(!1),[A,m]=d.createSignal(!0),f=()=>t.input.session,b=()=>f().server.data.session,E=()=>b().message.list(f().id),z=d.createMemo(()=>{const i=E(),l=i[i.length-1],v=l?.content;return`${i.length}|${l?.id}|${v?.length}|${v?.[v.length-1]?.text?.length}|${l?.time?.completed}|${l?.error?1:0}`}),P=tn(f().id),[mt,Q]=d.createSignal(0);let Z,kt=Number.NEGATIVE_INFINITY;const St=()=>{Z=void 0,kt=performance.now(),Q(i=>i+1)};d.createEffect(d.on(z,()=>{if(Z!==void 0)return;const i=(globalThis.__timelineRailListInterval??An)-(performance.now()-kt);i<=0?St():Z=setTimeout(St,i)},{defer:!0})),d.onCleanup(()=>clearTimeout(Z));const tt=d.createMemo(()=>{mt();const i=b().get(f().id)?.revert?.messageID;return d.untrack(()=>an(Cn(E()),i,P))}),G=d.createMemo(()=>tt().map(i=>i.id)),et=d.createMemo(()=>b().message.more(f().id)),Qt=d.createMemo(()=>new Map(G().map((i,l)=>[i,l]))),I=()=>tt().length;let At,nt;const It=i=>{nt=void 0;const l=At?.closest("[data-scrollable]"),v=l&&_n(l);l&&v?(r(l),a(v)):i>0&&(nt=requestAnimationFrame(()=>It(i-1)))};d.onMount(()=>It(10)),d.onCleanup(()=>{nt!==void 0&&cancelAnimationFrame(nt)}),d.onMount(()=>{if(typeof window.matchMedia!="function")return;const i=window.matchMedia(Mn),l=()=>m(i.matches);l(),i.addEventListener("change",l),d.onCleanup(()=>i.removeEventListener("change",l))});let ft=Number.NEGATIVE_INFINITY;const Zt=()=>performance.now()-ft;d.createEffect(()=>{const i=e();if(!i)return;const l=()=>{ft=performance.now()},v=["wheel","touchstart","touchmove","pointerdown","keydown"];for(const h of v)i.addEventListener(h,l,{passive:!0});d.onCleanup(()=>{for(const h of v)i.removeEventListener(h,l)})});const te=()=>{const i=e();if(i)return{scroller:i,ids:G,more:et,loadMore:l=>b().message.loadMore(f().id,{signal:l}),reducedMotion:yt,frame:xt,loading:y,tween:(l,v)=>fn({scroller:i,frame:xt,now:()=>performance.now()},l,v)}},[pt,Ct]=d.createSignal(!1),ee=d.createMemo(()=>t.input.active);d.createEffect(()=>{const i=e();if(!i||!ee()||!et())return;const l=new AbortController,v={scroller:i,more:()=>b().message.more(f().id),loadMore:({signal:h,beforePublish:C})=>b().message.loadMore(f().id,{signal:h,beforePublish:C,all:!0}),frame:xt,idle:Zt,pause:globalThis.__timelineRailPause??In,inset:()=>dt(i),loading:Ct,drift:globalThis.__timelineRailDrift};d.untrack(()=>Ae(v,l.signal)),d.onCleanup(()=>{l.abort(),Ct(!1)})});let Y;const ne=()=>{Y=void 0;const i=e(),l=n();if(!t.input.active||!i||!l)return;const v=Tt(i),h=i.getBoundingClientRect(),C=h.top+dt(i),x=Ce(G(),v,C),_=cn(Qt(),v,{top:C,bottom:h.bottom}),$=Jt(i,l);g(x),k(u=>u&&_&&u[0]===_[0]&&u[1]===_[1]?u:_),s(u=>u&&u.top===$.top&&u.height===$.height&&u.left===$.left&&u.show===$.show?u:$)},V=()=>{Y===void 0&&(Y=requestAnimationFrame(ne))};let U;const _t=()=>{D&&U===void 0&&D.setAttribute("data-scrolling",""),clearTimeout(U),U=setTimeout(()=>{U=void 0,D?.removeAttribute("data-scrolling")},Sn),V()};d.onCleanup(()=>clearTimeout(U)),d.onCleanup(()=>{Y!==void 0&&cancelAnimationFrame(Y)}),d.createEffect(()=>{const i=e(),l=n();if(!i||!l)return;i.addEventListener("scroll",_t,{passive:!0});const v=typeof ResizeObserver=="function"?new ResizeObserver(V):void 0;v?.observe(l);const h=l.querySelector("[data-slot='session-timeline-visible']");h&&v?.observe(h),V(),d.onCleanup(()=>{i.removeEventListener("scroll",_t),v?.disconnect()})}),d.createEffect(d.on([G,et,()=>t.input.active,A],V,{defer:!0}));let K;const ie=i=>{const l=G()[i],v=te();if(!l||!v||!t.input.active)return;K?.abort();const h=new AbortController;K=h,We(v,l,h.signal).finally(()=>{K===h&&(K=void 0),V()})};d.onCleanup(()=>K?.abort());const[re,ae]=d.createSignal(),[L,$t]=d.createSignal(),[N,H]=d.createSignal("closed"),[oe,Rt]=d.createSignal(!1);let O,Lt=Number.NEGATIVE_INFINITY;const it=(i,l=!1)=>{if(ae(i),$t(i),N()!=="open"){if(clearTimeout(O),N()==="closing"||l||Date.now()-Lt<Tn){H("open");return}O=setTimeout(()=>H("open"),En)}},vt=()=>{if(clearTimeout(O),O=void 0,$t(void 0),N()!=="open"){H("closed");return}if(Lt=Date.now(),yt()){H("closed");return}H("closing"),O=setTimeout(()=>{N()==="closing"&&H("closed")},kn)};d.onCleanup(()=>clearTimeout(O)),d.createEffect(()=>{if(N()!=="open"){Rt(!1);return}const i=requestAnimationFrame(()=>Rt(!0));d.onCleanup(()=>cancelAnimationFrame(i))});const rt=d.createMemo(()=>{const i=re();return i===void 0||N()==="closed"||i>=I()?void 0:i}),F=()=>{const i=rt();return i===void 0?void 0:tt()[i]},Pt=()=>{const i=rt();return i===void 0||et()||pt()?void 0:`${i+1} of ${I()}`},le=()=>tt()[L()??Math.max(0,c())]?.title??"User message";let D,q,at;const[se,ce]=d.createSignal(0),[de,ue]=d.createSignal(0),[me,fe]=d.createSignal(!1),[pe,ve]=d.createSignal(),ot=d.createMemo(()=>{const i=pe();return i?dn(i):void 0});d.createEffect(()=>ot()?.count(I())),d.createEffect(()=>ot()?.view(w())),d.createEffect(()=>ot()?.current(c())),d.createEffect(()=>ot()?.active(yt()?void 0:L())),d.createEffect(()=>{const i=rt(),l=F();if(i===void 0||!l||!D||!q||!at)return;const v=D.getBoundingClientRect(),h=q.getBoundingClientRect(),C=h.top+h.height*ln(i,I())/100-v.top,x=at.offsetHeight,_=Math.round(Math.max(0,Math.min(C-x/2,v.height-x)));ce(_),ue(Math.round(C-_))});const gt=i=>{i!==void 0&&i>=0&&i<I()&&ie(i)},ht=i=>{if(!q)return null;const l=q.getBoundingClientRect();return sn({count:I(),top:l.top,height:l.height,y:i.clientY})};let lt=!1;const[Nt,Ht]=d.createSignal(!1),Ot=i=>{const l=h=>{h.buttons===0&&(v(),i())},v=()=>{window.removeEventListener("pointerup",l),window.removeEventListener("pointermove",l)};window.addEventListener("pointerup",l),window.addEventListener("pointermove",l)},ge=i=>{const l=e();l&&(i.preventDefault(),ft=performance.now(),Wt(l),l.scrollBy({top:i.deltaY,left:i.deltaX}))},he=i=>{if(i.key==="Escape"){vt();return}const l=I()-1,v=L()??Math.max(0,c()),h=i.key==="ArrowDown"?Math.min(l,v+1):i.key==="ArrowUp"?Math.max(0,v-1):i.key==="PageDown"?Math.min(l,v+Kt):i.key==="PageUp"?Math.max(0,v-Kt):i.key==="Home"?0:i.key==="End"?l:-1;if(i.key==="Enter"||i.key===" "){i.preventDefault(),gt(L());return}h!==-1&&(i.preventDefault(),it(h,!0))},be=()=>{const i=o();return{top:`${i?.top??0}px`,height:`${i?.height??0}px`,left:`${i?.left??0}px`}},we=i=>{const l=c()+i;c()>=0&&gt(l)},Ft=i=>{const l=i==="previous",v=l?"Previous turn":"Next turn";return p.createComponent(t.ui.Tooltip,{value:v,placement:l?"top":"bottom",get children(){var h=pn();return p.setAttribute(h,"data-timeline-rail-turn",i),p.insert(h,p.createComponent(t.ui.IconButton,{icon:"chevron-down",label:v,size:"small",variant:"ghost-muted",get disabled(){return l?c()<=0:c()<0||c()>=I()-1},onClick:()=>we(l?-1:1)})),h}})};return(()=>{var i=vn();return p.use(l=>At=l,i),p.insert(i,p.createComponent(d.Show,{get when(){return p.memo(()=>!!(t.input.active&&A()&&o()?.show))()&&n()},children:l=>p.createComponent(p.Portal,{get mount(){return l()},ref:v=>v.style.display="contents",get children(){var v=wn(),h=v.firstChild,C=h.firstChild,x=C.nextSibling,_=x.firstChild;v.addEventListener("pointerleave",()=>vt()),p.use(u=>{D=u,u.addEventListener("wheel",ge,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>fe(!0)))},v),p.insert(h,()=>Ft("previous"),x),x.$$keydown=he,x.addEventListener("blur",()=>vt()),x.addEventListener("focus",u=>{L()===void 0&&it(Math.max(0,c()),u.currentTarget.matches(":focus-visible"))}),x.$$click=u=>{u.detail!==0&&(gt(L()??ht(u)??void 0),u.currentTarget.blur())},x.$$pointermove=u=>{if(u.pointerType==="touch")return;if(u.buttons!==0&&!lt){Nt()||(Ht(!0),Ot(()=>Ht(!1)));return}const S=ht(u);S!==null&&S!==L()&&it(S)},x.addEventListener("pointerenter",u=>{if(u.pointerType==="touch")return;const S=ht(u);S!==null&&it(S)}),x.$$mousedown=u=>u.preventDefault(),x.$$pointerdown=()=>{lt||(lt=!0,Ot(()=>lt=!1))};var $=q;return typeof $=="function"?p.use($,x):q=x,p.use(ve,_),p.insert(h,()=>Ft("next"),null),p.insert(v,p.createComponent(d.Show,{get when(){return rt()!==void 0},get children(){var u=bn(),S=u.firstChild,W=S.firstChild,st=at;return typeof st=="function"?p.use(st,S):at=S,p.insert(S,p.createComponent(d.Show,{get when(){return Pt()},get children(){var T=gn();return p.insert(T,Pt),T}}),W),p.insert(W,()=>F()?.title),p.insert(S,p.createComponent(d.Show,{get when(){return F()?.snippet||F()?.working},get children(){var T=hn();return p.insert(T,()=>F()?.snippet??"Working…"),p.effect(()=>p.setAttribute(T,"data-working",F()?.working?"":void 0)),T}}),null),p.effect(T=>{var j=oe()?"":void 0,X=`${se()}px`,J=`${de()}px`;return j!==T.e&&p.setAttribute(u,"data-entered",T.e=j),X!==T.t&&p.setStyleProperty(u,"--card-y",T.t=X),J!==T.a&&p.setStyleProperty(u,"--card-origin",T.a=J),T},{e:void 0,t:void 0,a:void 0}),u}}),null),p.effect(u=>{var S=I()<Xe?"":void 0,W=me()?"":void 0,st=be(),T=on(I()),j=pt()?"":void 0,X=Nt()?"":void 0,J=`Jump to message: ${le()}`,Dt=M()||pt()?"true":void 0;return S!==u.e&&p.setAttribute(v,"data-empty",u.e=S),W!==u.t&&p.setAttribute(v,"data-armed",u.t=W),u.a=p.style(v,st,u.a),T!==u.o&&p.setStyleProperty(h,"--timeline-rail-height",u.o=T),j!==u.i&&p.setAttribute(C,"data-active",u.i=j),X!==u.n&&p.setAttribute(x,"data-pass",u.n=X),J!==u.s&&p.setAttribute(x,"aria-label",u.s=J),Dt!==u.h&&p.setAttribute(x,"aria-busy",u.h=Dt),u},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),v}})})),i})()}const Rn=`
[data-timeline-rail] {
  --timeline-rail-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --timeline-rail-move: cubic-bezier(0.77, 0, 0.175, 1);
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${Et}px;
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
@starting-style {
  [data-timeline-rail-tick] { transform: scale(0.3333, 1); }
  [data-timeline-rail-tick]::before,
  [data-timeline-rail-tick]::after { opacity: 0; }
}
[data-timeline-rail][data-armed] [data-timeline-rail-tick] { transition: transform 150ms var(--timeline-rail-ease); }
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 150ms var(--timeline-rail-ease); }
[data-timeline-rail][data-scrolling] [data-timeline-rail-tick],
[data-timeline-rail][data-scrolling] [data-timeline-rail-tick]::before,
[data-timeline-rail][data-scrolling] [data-timeline-rail-tick]::after { transition: none !important; }
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
  left: ${Et}px;
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
`,Ln=bt.Plugin.define({setup(t){t.add(bt.Style,Rn),t.add(bt.Slot,{at:"session.header",render:e=>p.createComponent($n,{input:e,get ui(){return t.ui}})})}});p.delegateEvents(["pointerdown","mousedown","pointermove","click","keydown"]);exports.default=Ln;exports.measure=Jt;
