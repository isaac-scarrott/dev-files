"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const f=require("solid-js/web"),dt=require("@opencode/plugin/gui"),d=require("solid-js"),se=160,ce=4;function de(t){const e=t.scroller.getBoundingClientRect().top+t.inset();for(const r of t.scroller.querySelectorAll("[data-message-id]")){const n=r.getBoundingClientRect();if(n.bottom>e)return{element:r,top:n.top}}}async function me(t,e,r){const{scroller:n}=t;for(let a=0;a<ce&&!r.aborted;a+=1){if(await t.frame(),!e.element.isConnected||t.idle()<32)return;const o=e.element.getBoundingClientRect().top-e.top;t.drift?.(o),Math.abs(o)>1&&n.scrollTo({top:n.scrollTop+o,behavior:"auto"})}}async function ue(t,e){if(!(!t.more()||e.aborted)){t.loading(!0);try{for(;t.more()&&!e.aborted;){for(await t.frame();t.idle()<se&&!e.aborted;)await t.frame();if(e.aborted)return;let r;await t.loadMore({signal:e,beforePublish:()=>r=de(t)}),r&&await me(t,r,e)}}catch{}finally{t.loading(!1)}}}const fe=8;function pe(t,e,r){if(t.length===0)return-1;const n=e.find(s=>s.bottom>r+fe)??e.at(-1);if(!n)return-1;const a=t.indexOf(n.owner);if(a!==-1)return a;const o=t.findIndex(s=>s>n.owner);return o===-1?t.length-1:Math.max(0,o-1)}function ve(t){return t.ids.indexOf(t.target)>=1?{kind:"probe"}:t.more?{kind:"load"}:{kind:"top"}}function ge(t,e,r){const n=t.filter(p=>p.bottom>r.top&&p.top<r.bottom),a=n.length?n:t,o=a[0],s=a.at(-1);return!o||o.owner>=e?-1:s&&s.owner<e?1:0}function he(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const r=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:r,behavior:"smooth"}}function be(t){const e=Math.max(0,t.scrollHeight-t.clientHeight);return Math.min(e,Math.max(0,Math.round(t.index/Math.max(1,t.count)*t.scrollHeight)))}function we(t){let e=Number.POSITIVE_INFINITY,r=-1;for(const g of t.rows){if(g.bottom<=t.box.top||g.top>=t.box.bottom)continue;const w=t.indexOf.get(g.owner);w!==void 0&&(e=Math.min(e,w),r=Math.max(r,w))}if(r===-1)return;if(t.target>=e&&t.target<=r)return 0;const n=t.rows.flatMap(g=>{const w=g.prompt?t.indexOf.get(g.owner):void 0;return w===void 0?[]:[{index:w,top:g.top}]}),a=n[0],o=n.at(-1),s=a&&o&&o.index>a.index?(o.top-a.top)/(o.index-a.index):0,p=s>0?s:t.fallback;return Math.round((t.target-(e+r)/2)*p)}const et=3,ye=40,xe=120,Me=200,Ee=3,Te=5,ke=20,Se=24,Ae=2,Ce=4;function gt(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const r=e.dataset.messageId;if(!r)return[];const n=e.getBoundingClientRect();return[{owner:r,prompt:e.dataset.timelineRow==="UserMessage",top:n.top,bottom:n.bottom}]})}function nt(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function P(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(r=>r.dataset.messageId===e)}function Dt(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}async function Ie(t,e){t.loading?.(!0);try{await t.loadMore(e)}finally{t.loading?.(!1)}}function pt(t,e){const r=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,r.top-n.top+t.scrollTop-nt(t))}async function _t(t,e,r){let n=Number.NaN,a=0,o=0;for(let s=0;s<ye&&!r.aborted;s+=1){await t.frame();const p=t.scroller.scrollTop,g=P(t.scroller,e);if(a=g&&p===n?a+1:0,o=g?0:o+1,n=p,a>=et||o>et)return}}async function _e(t,e,r,n){const{scroller:a}=t;let o=0;for(let s=0;s<Me&&!r.aborted;s+=1){if(P(a,e))return;const p=ge(gt(a),e,a.getBoundingClientRect());if(p===0){if((o+=1)>et)return;await t.frame();continue}o=0;const g=Math.max(0,a.scrollHeight-a.clientHeight);if(p===-1&&a.scrollTop<=0||p===1&&a.scrollTop>=g)return;n.direction!==0&&p!==n.direction&&(n.step=Math.max(a.clientHeight/4,n.step/2)),n.direction=p,a.scrollTo({top:Math.min(g,Math.max(0,a.scrollTop+p*n.step)),behavior:"auto"}),await t.frame()}}async function $e(t,e,r){const{scroller:n}=t,a=t.ids(),o=a.indexOf(e),s=be({index:o,count:a.length,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});if(Math.abs(s-n.scrollTop)<ke*n.clientHeight)return;const p=new Map(a.map((y,E)=>[y,E])),g=n.scrollHeight/Math.max(1,a.length),w=()=>Math.max(0,n.scrollHeight-n.clientHeight),A=async()=>{for(let y=0;y<Ae&&!r.aborted;y+=1)await t.frame()};n.scrollTo({top:s,behavior:"auto"}),await A();for(let y=0;y<Se&&!r.aborted;y+=1){if(P(n,e))return;const E=we({rows:gt(n),indexOf:p,target:o,fallback:g,box:n.getBoundingClientRect()});if(E===0)return;if(E===void 0){await A();continue}const S=Math.min(w(),Math.max(0,n.scrollTop+E));if(S===n.scrollTop)return;n.scrollTo({top:S,behavior:"auto"}),await A()}}async function Ft(t,e,r,n=0){const{scroller:a}=t,o=ve({ids:t.ids(),target:e,more:t.more()});if(o.kind==="load")return n>=Te||(await Ie(t,r),r.aborted)?void 0:Ft(t,e,r,n+1);if(o.kind==="top")return a.scrollTo({top:0,behavior:"auto"}),_t(t,e,r);await $e(t,e,r);const s={step:a.clientHeight,direction:0};for(let p=0;p<Ee&&!r.aborted;p+=1)if(await _e(t,e,r,s),await _t(t,e,r),P(a,e))return}async function Re(t,e,r){const{scroller:n}=t,a=P(n,e);if(!a)return!1;const o=he({from:n.scrollTop,to:pt(n,a),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});o.start!==void 0&&(n.scrollTo({top:o.start,behavior:"auto"}),await t.frame());const s=async w=>{if(o.behavior==="auto")return n.scrollTo({top:w,behavior:"auto"}),!0;if(t.tween)return t.tween(w,r);n.scrollTo({top:w,behavior:o.behavior});let A=Number.NaN,y=0;for(let E=0;E<xe&&!r.aborted;E+=1){await t.frame();const S=n.scrollTop;if(y=S===A?y+1:0,A=S,y>=et)break}return!0};if(!await s(o.to)||o.behavior==="auto"||r.aborted)return!0;const p=P(n,e);if(!p)return!0;const g=Math.min(pt(n,p),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(g-n.scrollTop)>2&&await s(g),!0}const $t=["wheel","touchstart","pointerdown","keydown"];async function Le(t,e,r){if(!t.ids().includes(e))return"none";Dt(t.scroller);const n=new AbortController,a=()=>n.abort(),o=AbortSignal.any([r,n.signal]);for(const s of $t)t.scroller.addEventListener(s,a,{passive:!0});try{for(let s=0;s<Ce;s+=1){if(!P(t.scroller,e)&&(await Ft(t,e,o),o.aborted))return"aborted";if(!await Re(t,e,o))return"none";if(o.aborted)return"aborted";const p=P(t.scroller,e);if(p&&Math.abs(pt(t.scroller,p)-t.scroller.scrollTop)<=2)break}return o.aborted?"aborted":"done"}finally{for(const s of $t)t.scroller.removeEventListener(s,a)}}const Pe=8,He=2,Oe="calc(100vh - 18rem)",Rt=2,Lt=200,Pt=240,ht=t=>t.replace(/\s+/g," ").trim();function Ne(t){const e=t.metadata?.displayText,r=ht(typeof e=="string"&&e?e:t.text??"");if(r)return r.length>Lt?`${r.slice(0,Lt)}…`:r;const n=(t.files??[]).map(s=>s.mime.startsWith("image/")?"[image]":`[${s.name??"file"}]`),a=(t.agents??[]).map(s=>`@${s.name}`),o=[...n,...a];return o.length?o.slice(0,3).join(" "):"(empty prompt)"}function De(t){return ht(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}function Fe(t,e){const r=[];for(let n=0;n<t.length;n+=1){const a=t[n];if(a.type!=="user"||e&&a.id>=e)continue;let o,s=!1;for(let g=n+1;g<t.length&&t[g].type!=="user";g+=1){const w=t[g];if(w.type!=="assistant")continue;const A=w.content?.find(y=>y.type==="text"&&y.text&&ht(y.text))?.text;if(A){const y=De(A);o=y.length>Pt?`${y.slice(0,Pt)}…`:y;break}w.time?.completed===void 0&&!w.error&&(s=!0)}const p=Ne(a);r.push({id:a.id,title:p,snippet:o,working:!o&&s})}return r}function Be(t){return`max(0px, min(${Math.max(1,(t-1)*Pe)}px, ${Oe}))`}function qe(t,e){return e>1?t/(e-1)*100:0}function ze(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}function Ht(t,e){if(!(t===void 0||t<0||t>=e))return[Math.max(0,t-Rt),Math.min(e-1,t+Rt)]}function Ye(t,e,r){let n=Number.POSITIVE_INFINITY,a=-1;for(const o of e){if(o.bottom<=r.top||o.top>=r.bottom)continue;const s=t.get(o.owner);s!==void 0&&(n=Math.min(n,s),a=Math.max(a,s))}return a===-1?void 0:[n,a]}const mt=220;function Ge(t){const e=document.createElement("span"),r=new Map;let n=0,a,o=-1,s,p;const g=new Map;e.setAttribute("data-timeline-rail-base",""),t.appendChild(e);const w=m=>({d:s===void 0?void 0:Math.abs(m-s),view:a!==void 0&&m>=a[0]&&m<=a[1],current:m===o}),A=m=>{let u=r.get(m);return u||(u=document.createElement("span"),u.setAttribute("data-timeline-rail-tick",""),u.setAttribute("data-index",String(m)),u.setAttribute("aria-hidden","true"),u.style.setProperty("--i",String(m)),t.appendChild(u),r.set(m,u),u.offsetWidth,u)},y=()=>{p=void 0;const m=performance.now();for(const[u,b]of g)m-b<mt||(g.delete(u),r.get(u)?.remove(),r.delete(u));g.size>0&&(p=setTimeout(y,mt))},E=m=>{if(m<0||m>=n)return;const u=w(m),b=u.d!==void 0&&u.d<=2||u.view||u.current;if(!b&&!r.has(m))return;const M=b?A(m):r.get(m),_=($,it,C="")=>{it?M.getAttribute($)!==C&&M.setAttribute($,C):M.hasAttribute($)&&M.removeAttribute($)};_("data-d",u.d!==void 0&&u.d<=2,String(u.d)),_("data-view",u.view),_("data-current",u.current),b?g.delete(m):g.has(m)||(g.set(m,performance.now()),p??=setTimeout(y,mt))},S=(m,u)=>{if(m)for(let b=m[0];b<=m[1];b+=1)u(b)};return{nodes:()=>[...r.values()],count(m){const u=n;n=m,t.style.setProperty("--max",String(Math.max(1,m-1)));for(const[b,M]of r)b<m||(M.remove(),r.delete(b),g.delete(b));o>=m&&(o=-1),a&&a[0]>=m?a=void 0:a&&a[1]>=m&&(a=[a[0],m-1]),s!==void 0&&s>=m&&(s=void 0),m>u&&S(a,E)},view(m){const u=a,b=m&&m[0]<n?[m[0],Math.min(m[1],n-1)]:void 0;a=b,S(u,M=>{(!b||M<b[0]||M>b[1])&&E(M)}),S(b,M=>{(!u||M<u[0]||M>u[1])&&E(M)})},current(m){const u=m>=0&&m<n?m:-1;if(u===o)return;const b=o;o=u,E(b),E(u)},active(m){const u=Ht(s,n);s=m,S(u,E),S(Ht(s,n),E)}}}const Ue=t=>1-(1-t)**4;function Ve(t){return Math.round(Math.min(420,180+Math.abs(t)*.12))}const Ot=["wheel","touchstart","pointerdown","keydown"];async function Ke(t,e,r){const{scroller:n}=t,a=n.scrollTop,o=Ve(e-a);let s=!1;const p=()=>{s=!0};for(const g of Ot)n.addEventListener(g,p,{passive:!0});try{const g=t.now();for(;;){if(await t.frame(),s||r.aborted)return!1;const w=Math.min(1,(t.now()-g)/o);if(n.scrollTo({top:a+(e-a)*Ue(w),behavior:"auto"}),w>=1)return!0}}finally{for(const g of Ot)n.removeEventListener(g,p)}}var We=f.template("<span>"),je=f.template("<span style=display:contents>"),Xe=f.template("<div data-timeline-rail-card-meta>"),Je=f.template("<div data-timeline-rail-card-snippet dir=auto>"),Qe=f.template("<div data-timeline-rail-card><div data-timeline-rail-card-body role=tooltip><div data-timeline-rail-card-title dir=auto>"),Ze=f.template("<div data-timeline-rail><div data-timeline-rail-body><span data-timeline-rail-history aria-hidden=true></span><button type=button data-timeline-rail-strip><span data-timeline-rail-ticks aria-hidden=true>");const vt=28,tn=6,en=44,nn="(min-width: 768px)",rn=400,an=300,on=90,Nt=5,ut=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,ft=()=>new Promise(t=>requestAnimationFrame(()=>t()));function ln(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function Bt(t,e){const r=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),a=n instanceof HTMLElement?n.getBoundingClientRect():r,o=t.querySelector("[data-timeline-row][data-message-id]"),p=(o instanceof HTMLElement?o.getBoundingClientRect().left:r.left+Math.max(0,(r.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||r.width))/2))-r.left,g=nt(t);return{top:a.top-r.top+g,height:Math.max(0,r.bottom-a.top-g),left:Math.min(tn,Math.max(0,Math.round((p-vt)/2))),show:p>=en}}function sn(t){const[e,r]=d.createSignal(),[n,a]=d.createSignal(),[o,s]=d.createSignal(),[p,g]=d.createSignal(-1),[w,A]=d.createSignal(),[y,E]=d.createSignal(!1),[S,m]=d.createSignal(!0),u=()=>t.input.session,b=()=>u().server.data.session,M=d.createMemo(()=>Fe(b().message.list(u().id),b().get(u().id)?.revert?.messageID)),_=d.createMemo(()=>M().map(i=>i.id)),$=d.createMemo(()=>b().message.more(u().id)),it=d.createMemo(()=>new Map(_().map((i,l)=>[i,l]))),C=()=>M().length;let bt,W;const wt=i=>{W=void 0;const l=bt?.closest("[data-scrollable]"),v=l&&ln(l);l&&v?(r(l),a(v)):i>0&&(W=requestAnimationFrame(()=>wt(i-1)))};d.onMount(()=>wt(10)),d.onCleanup(()=>{W!==void 0&&cancelAnimationFrame(W)}),d.onMount(()=>{if(typeof window.matchMedia!="function")return;const i=window.matchMedia(nn),l=()=>m(i.matches);l(),i.addEventListener("change",l),d.onCleanup(()=>i.removeEventListener("change",l))});let rt=Number.NEGATIVE_INFINITY;const qt=()=>performance.now()-rt;d.createEffect(()=>{const i=e();if(!i)return;const l=()=>{rt=performance.now()},v=["wheel","touchstart","touchmove","pointerdown","keydown"];for(const h of v)i.addEventListener(h,l,{passive:!0});d.onCleanup(()=>{for(const h of v)i.removeEventListener(h,l)})});const zt=()=>{const i=e();if(i)return{scroller:i,ids:_,more:$,loadMore:l=>b().message.loadMore(u().id,{signal:l}),reducedMotion:ut,frame:ft,loading:E,tween:(l,v)=>Ke({scroller:i,frame:ft,now:()=>performance.now()},l,v)}},[at,yt]=d.createSignal(!1),Yt=d.createMemo(()=>t.input.active);d.createEffect(()=>{const i=e();if(!i||!Yt()||!$())return;const l=new AbortController,v={scroller:i,more:()=>b().message.more(u().id),loadMore:({signal:h,beforePublish:I})=>b().message.loadMore(u().id,{signal:h,beforePublish:I}),frame:ft,idle:qt,inset:()=>nt(i),loading:yt,drift:globalThis.__timelineRailDrift};d.untrack(()=>ue(v,l.signal)),d.onCleanup(()=>{l.abort(),yt(!1)})});let z;const Gt=()=>{z=void 0;const i=e(),l=n();if(!t.input.active||!i||!l)return;const v=gt(i),h=i.getBoundingClientRect(),I=h.top+nt(i),x=pe(_(),v,I),R=Ye(it(),v,{top:I,bottom:h.bottom}),L=Bt(i,l);g(x),A(c=>c&&R&&c[0]===R[0]&&c[1]===R[1]?c:R),s(c=>c&&c.top===L.top&&c.height===L.height&&c.left===L.left&&c.show===L.show?c:L)},O=()=>{z===void 0&&(z=requestAnimationFrame(Gt))};d.onCleanup(()=>{z!==void 0&&cancelAnimationFrame(z)}),d.createEffect(()=>{const i=e(),l=n();if(!i||!l)return;i.addEventListener("scroll",O,{passive:!0});const v=typeof ResizeObserver=="function"?new ResizeObserver(O):void 0;v?.observe(l);const h=l.querySelector("[data-slot='session-timeline-visible']");h&&v?.observe(h),O(),d.onCleanup(()=>{i.removeEventListener("scroll",O),v?.disconnect()})}),d.createEffect(d.on([_,$,()=>t.input.active,S],O,{defer:!0}));let Y;const Ut=i=>{const l=_()[i],v=zt();if(!l||!v||!t.input.active)return;Y?.abort();const h=new AbortController;Y=h,Le(v,l,h.signal).finally(()=>{Y===h&&(Y=void 0),O()})};d.onCleanup(()=>Y?.abort());const[Vt,Kt]=d.createSignal(),[H,xt]=d.createSignal(),[N,D]=d.createSignal("closed"),[Wt,Mt]=d.createSignal(!1);let F,Et=Number.NEGATIVE_INFINITY;const j=(i,l=!1)=>{if(Kt(i),xt(i),N()!=="open"){if(clearTimeout(F),N()==="closing"||l||Date.now()-Et<an){D("open");return}F=setTimeout(()=>D("open"),rn)}},ot=()=>{if(clearTimeout(F),F=void 0,xt(void 0),N()!=="open"){D("closed");return}if(Et=Date.now(),ut()){D("closed");return}D("closing"),F=setTimeout(()=>{N()==="closing"&&D("closed")},on)};d.onCleanup(()=>clearTimeout(F)),d.createEffect(()=>{if(N()!=="open"){Mt(!1);return}const i=requestAnimationFrame(()=>Mt(!0));d.onCleanup(()=>cancelAnimationFrame(i))});const X=d.createMemo(()=>{const i=Vt();return i===void 0||N()==="closed"||i>=C()?void 0:i}),B=()=>{const i=X();return i===void 0?void 0:M()[i]},Tt=()=>{const i=X();return i===void 0||$()||at()?void 0:`${i+1} of ${C()}`},jt=()=>M()[H()??Math.max(0,p())]?.title??"User message";let lt,q,J;const[Xt,Jt]=d.createSignal(0),[Qt,Zt]=d.createSignal(0),[te,ee]=d.createSignal(!1),[ne,ie]=d.createSignal(),Q=d.createMemo(()=>{const i=ne();return i?Ge(i):void 0});d.createEffect(()=>Q()?.count(C())),d.createEffect(()=>Q()?.view(w())),d.createEffect(()=>Q()?.current(p())),d.createEffect(()=>Q()?.active(ut()?void 0:H())),d.createEffect(()=>{const i=X(),l=B();if(i===void 0||!l||!lt||!q||!J)return;const v=lt.getBoundingClientRect(),h=q.getBoundingClientRect(),I=h.top+h.height*qe(i,C())/100-v.top,x=J.offsetHeight,R=Math.round(Math.max(0,Math.min(I-x/2,v.height-x)));Jt(R),Zt(Math.round(I-R))});const st=i=>{i!==void 0&&i>=0&&i<C()&&Ut(i)},ct=i=>{if(!q)return null;const l=q.getBoundingClientRect();return ze({count:C(),top:l.top,height:l.height,y:i.clientY})};let Z=!1;const[kt,St]=d.createSignal(!1),At=i=>{const l=h=>{h.buttons===0&&(v(),i())},v=()=>{window.removeEventListener("pointerup",l),window.removeEventListener("pointermove",l)};window.addEventListener("pointerup",l),window.addEventListener("pointermove",l)},re=i=>{const l=e();l&&(i.preventDefault(),rt=performance.now(),Dt(l),l.scrollBy({top:i.deltaY,left:i.deltaX}))},ae=i=>{if(i.key==="Escape"){ot();return}const l=C()-1,v=H()??Math.max(0,p()),h=i.key==="ArrowDown"?Math.min(l,v+1):i.key==="ArrowUp"?Math.max(0,v-1):i.key==="PageDown"?Math.min(l,v+Nt):i.key==="PageUp"?Math.max(0,v-Nt):i.key==="Home"?0:i.key==="End"?l:-1;if(i.key==="Enter"||i.key===" "){i.preventDefault(),st(H());return}h!==-1&&(i.preventDefault(),j(h,!0))},oe=()=>{const i=o();return{top:`${i?.top??0}px`,height:`${i?.height??0}px`,left:`${i?.left??0}px`}},le=i=>{const l=p()+i;p()>=0&&st(l)},Ct=i=>{const l=i==="previous",v=l?"Previous turn":"Next turn";return f.createComponent(t.ui.Tooltip,{value:v,placement:l?"top":"bottom",get children(){var h=We();return f.setAttribute(h,"data-timeline-rail-turn",i),f.insert(h,f.createComponent(t.ui.IconButton,{icon:"chevron-down",label:v,size:"small",variant:"ghost-muted",get disabled(){return l?p()<=0:p()<0||p()>=C()-1},onClick:()=>le(l?-1:1)})),h}})};return(()=>{var i=je();return f.use(l=>bt=l,i),f.insert(i,f.createComponent(d.Show,{get when(){return f.memo(()=>!!(t.input.active&&S()&&o()?.show))()&&n()},children:l=>f.createComponent(f.Portal,{get mount(){return l()},ref:v=>v.style.display="contents",get children(){var v=Ze(),h=v.firstChild,I=h.firstChild,x=I.nextSibling,R=x.firstChild;v.addEventListener("pointerleave",()=>ot()),f.use(c=>{lt=c,c.addEventListener("wheel",re,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>ee(!0)))},v),f.insert(h,()=>Ct("previous"),x),x.$$keydown=ae,x.addEventListener("blur",()=>ot()),x.addEventListener("focus",c=>{H()===void 0&&j(Math.max(0,p()),c.currentTarget.matches(":focus-visible"))}),x.$$click=c=>{c.detail!==0&&(st(H()??ct(c)??void 0),c.currentTarget.blur())},x.$$pointermove=c=>{if(c.pointerType==="touch")return;if(c.buttons!==0&&!Z){kt()||(St(!0),At(()=>St(!1)));return}const k=ct(c);k!==null&&k!==H()&&j(k)},x.addEventListener("pointerenter",c=>{if(c.pointerType==="touch")return;const k=ct(c);k!==null&&j(k)}),x.$$mousedown=c=>c.preventDefault(),x.$$pointerdown=()=>{Z||(Z=!0,At(()=>Z=!1))};var L=q;return typeof L=="function"?f.use(L,x):q=x,f.use(ie,R),f.insert(h,()=>Ct("next"),null),f.insert(v,f.createComponent(d.Show,{get when(){return X()!==void 0},get children(){var c=Qe(),k=c.firstChild,G=k.firstChild,tt=J;return typeof tt=="function"?f.use(tt,k):J=k,f.insert(k,f.createComponent(d.Show,{get when(){return Tt()},get children(){var T=Xe();return f.insert(T,Tt),T}}),G),f.insert(G,()=>B()?.title),f.insert(k,f.createComponent(d.Show,{get when(){return B()?.snippet||B()?.working},get children(){var T=Je();return f.insert(T,()=>B()?.snippet??"Working…"),f.effect(()=>f.setAttribute(T,"data-working",B()?.working?"":void 0)),T}}),null),f.effect(T=>{var U=Wt()?"":void 0,V=`${Xt()}px`,K=`${Qt()}px`;return U!==T.e&&f.setAttribute(c,"data-entered",T.e=U),V!==T.t&&f.setStyleProperty(c,"--card-y",T.t=V),K!==T.a&&f.setStyleProperty(c,"--card-origin",T.a=K),T},{e:void 0,t:void 0,a:void 0}),c}}),null),f.effect(c=>{var k=C()<He?"":void 0,G=te()?"":void 0,tt=oe(),T=Be(C()),U=at()?"":void 0,V=kt()?"":void 0,K=`Jump to message: ${jt()}`,It=y()||at()?"true":void 0;return k!==c.e&&f.setAttribute(v,"data-empty",c.e=k),G!==c.t&&f.setAttribute(v,"data-armed",c.t=G),c.a=f.style(v,tt,c.a),T!==c.o&&f.setStyleProperty(h,"--timeline-rail-height",c.o=T),U!==c.i&&f.setAttribute(I,"data-active",c.i=U),V!==c.n&&f.setAttribute(x,"data-pass",c.n=V),K!==c.s&&f.setAttribute(x,"aria-label",c.s=K),It!==c.h&&f.setAttribute(x,"aria-busy",c.h=It),c},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),v}})})),i})()}const cn=`
[data-timeline-rail] {
  --timeline-rail-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --timeline-rail-move: cubic-bezier(0.77, 0, 0.175, 1);
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${vt}px;
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
  left: ${vt}px;
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
`,dn=dt.Plugin.define({setup(t){t.add(dt.Style,cn),t.add(dt.Slot,{at:"session.header",render:e=>f.createComponent(sn,{input:e,get ui(){return t.ui}})})}});f.delegateEvents(["pointerdown","mousedown","pointermove","click","keydown"]);exports.default=dn;exports.measure=Bt;
