"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const p=require("solid-js/web"),mt=require("@opencode/plugin/gui"),u=require("solid-js"),ce=160,de=4;function ue(t){const e=t.scroller.getBoundingClientRect().top+t.inset();for(const r of t.scroller.querySelectorAll("[data-message-id]")){const n=r.getBoundingClientRect();if(n.bottom>e)return{element:r,top:n.top}}}async function me(t,e,r){const{scroller:n}=t;for(let o=0;o<de&&!r.aborted;o+=1){if(await t.frame(),!e.element.isConnected||t.idle()<32)return;const l=e.element.getBoundingClientRect().top-e.top;t.drift?.(l),Math.abs(l)>1&&n.scrollTo({top:n.scrollTop+l,behavior:"auto"})}}async function fe(t,e){if(!(!t.more()||e.aborted)){t.loading(!0);try{for(;t.more()&&!e.aborted;){for(await t.frame();t.idle()<ce&&!e.aborted;)await t.frame();if(e.aborted)return;let r;await t.loadMore({signal:e,beforePublish:()=>r=ue(t)}),r&&await me(t,r,e)}}catch{}finally{t.loading(!1)}}}const pe=8;function ve(t,e,r){if(t.length===0)return-1;const n=e.find(s=>s.bottom>r+pe)??e.at(-1);if(!n)return-1;const o=t.indexOf(n.owner);if(o!==-1)return o;const l=t.findIndex(s=>s>n.owner);return l===-1?t.length-1:Math.max(0,l-1)}function ge(t){return t.ids.indexOf(t.target)>=1?{kind:"probe"}:t.more?{kind:"load"}:{kind:"top"}}function he(t,e,r){const n=t.filter(m=>m.bottom>r.top&&m.top<r.bottom),o=n.length?n:t,l=o[0],s=o.at(-1);return!l||l.owner>=e?-1:s&&s.owner<e?1:0}function be(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const r=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:r,behavior:"smooth"}}function we(t){const e=Math.max(0,t.scrollHeight-t.clientHeight);return Math.min(e,Math.max(0,Math.round(t.index/Math.max(1,t.count)*t.scrollHeight)))}function ye(t){let e=Number.POSITIVE_INFINITY,r=-1;for(const g of t.rows){if(g.bottom<=t.box.top||g.top>=t.box.bottom)continue;const b=t.indexOf.get(g.owner);b!==void 0&&(e=Math.min(e,b),r=Math.max(r,b))}if(r===-1)return;if(t.target>=e&&t.target<=r)return 0;const n=t.rows.flatMap(g=>{const b=g.prompt?t.indexOf.get(g.owner):void 0;return b===void 0?[]:[{index:b,top:g.top}]}),o=n[0],l=n.at(-1),s=o&&l&&l.index>o.index?(l.top-o.top)/(l.index-o.index):0,m=s>0?s:t.fallback;return Math.round((t.target-(e+r)/2)*m)}const rt=3,xe=40,Me=120,Ee=200,Te=3,Se=5,ke=20,Ce=24,Ae=2,Ie=4;function bt(t){return[...t.querySelectorAll("[data-message-id]")].flatMap(e=>{const r=e.dataset.messageId;if(!r)return[];const n=e.getBoundingClientRect();return[{owner:r,prompt:e.dataset.timelineRow==="UserMessage",top:n.top,bottom:n.bottom}]})}function ot(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function P(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(r=>r.dataset.messageId===e)}function Ft(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}async function _e(t,e){t.loading?.(!0);try{await t.loadMore(e)}finally{t.loading?.(!1)}}function gt(t,e){const r=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,r.top-n.top+t.scrollTop-ot(t))}async function Rt(t,e,r){let n=Number.NaN,o=0,l=0;for(let s=0;s<xe&&!r.aborted;s+=1){await t.frame();const m=t.scroller.scrollTop,g=P(t.scroller,e);if(o=g&&m===n?o+1:0,l=g?0:l+1,n=m,o>=rt||l>rt)return}}async function Re(t,e,r,n){const{scroller:o}=t;let l=0;for(let s=0;s<Ee&&!r.aborted;s+=1){if(P(o,e))return;const m=he(bt(o),e,o.getBoundingClientRect());if(m===0){if((l+=1)>rt)return;await t.frame();continue}l=0;const g=Math.max(0,o.scrollHeight-o.clientHeight);if(m===-1&&o.scrollTop<=0||m===1&&o.scrollTop>=g)return;n.direction!==0&&m!==n.direction&&(n.step=Math.max(o.clientHeight/4,n.step/2)),n.direction=m,o.scrollTo({top:Math.min(g,Math.max(0,o.scrollTop+m*n.step)),behavior:"auto"}),await t.frame()}}async function $e(t,e,r){const{scroller:n}=t,o=t.ids(),l=o.indexOf(e),s=we({index:l,count:o.length,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});if(Math.abs(s-n.scrollTop)<ke*n.clientHeight)return;const m=new Map(o.map((y,A)=>[y,A])),g=n.scrollHeight/Math.max(1,o.length),b=()=>Math.max(0,n.scrollHeight-n.clientHeight),M=async()=>{for(let y=0;y<Ae&&!r.aborted;y+=1)await t.frame()};n.scrollTo({top:s,behavior:"auto"}),await M();for(let y=0;y<Ce&&!r.aborted;y+=1){if(P(n,e))return;const A=ye({rows:bt(n),indexOf:m,target:l,fallback:g,box:n.getBoundingClientRect()});if(A===0)return;if(A===void 0){await M();continue}const _=Math.min(b(),Math.max(0,n.scrollTop+A));if(_===n.scrollTop)return;n.scrollTo({top:_,behavior:"auto"}),await M()}}async function qt(t,e,r,n=0){const{scroller:o}=t,l=ge({ids:t.ids(),target:e,more:t.more()});if(l.kind==="load")return n>=Se||(await _e(t,r),r.aborted)?void 0:qt(t,e,r,n+1);if(l.kind==="top")return o.scrollTo({top:0,behavior:"auto"}),Rt(t,e,r);await $e(t,e,r);const s={step:o.clientHeight,direction:0};for(let m=0;m<Te&&!r.aborted;m+=1)if(await Re(t,e,r,s),await Rt(t,e,r),P(o,e))return}async function Le(t,e,r){const{scroller:n}=t,o=P(n,e);if(!o)return!1;const l=be({from:n.scrollTop,to:gt(n,o),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});l.start!==void 0&&(n.scrollTo({top:l.start,behavior:"auto"}),await t.frame());const s=async b=>{if(l.behavior==="auto")return n.scrollTo({top:b,behavior:"auto"}),!0;if(t.tween)return t.tween(b,r);n.scrollTo({top:b,behavior:l.behavior});let M=Number.NaN,y=0;for(let A=0;A<Me&&!r.aborted;A+=1){await t.frame();const _=n.scrollTop;if(y=_===M?y+1:0,M=_,y>=rt)break}return!0};if(!await s(l.to)||l.behavior==="auto"||r.aborted)return!0;const m=P(n,e);if(!m)return!0;const g=Math.min(gt(n,m),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(g-n.scrollTop)>2&&await s(g),!0}const $t=["wheel","touchstart","pointerdown","keydown"];async function Pe(t,e,r){if(!t.ids().includes(e))return"none";Ft(t.scroller);const n=new AbortController,o=()=>n.abort(),l=AbortSignal.any([r,n.signal]);for(const s of $t)t.scroller.addEventListener(s,o,{passive:!0});try{for(let s=0;s<Ie;s+=1){if(!P(t.scroller,e)&&(await qt(t,e,l),l.aborted))return"aborted";if(!await Le(t,e,l))return"none";if(l.aborted)return"aborted";const m=P(t.scroller,e);if(m&&Math.abs(gt(t.scroller,m)-t.scroller.scrollTop)<=2)break}return l.aborted?"aborted":"done"}finally{for(const s of $t)t.scroller.removeEventListener(s,o)}}const He=8,Oe=2,Ne="calc(100vh - 18rem)",Lt=5,Pt=2,Ht=200,Ot=240,wt=t=>t.replace(/\s+/g," ").trim();function Be(t){const e=t.metadata?.displayText,r=wt(typeof e=="string"&&e?e:t.text??"");if(r)return r.length>Ht?`${r.slice(0,Ht)}…`:r;const n=(t.files??[]).map(s=>s.mime.startsWith("image/")?"[image]":`[${s.name??"file"}]`),o=(t.agents??[]).map(s=>`@${s.name}`),l=[...n,...o];return l.length?l.slice(0,3).join(" "):"(empty prompt)"}function De(t){return wt(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}function Fe(t,e){const r=[];for(let n=0;n<t.length;n+=1){const o=t[n];if(o.type!=="user"||e&&o.id>=e)continue;let l,s=!1;for(let g=n+1;g<t.length&&t[g].type!=="user";g+=1){const b=t[g];if(b.type!=="assistant")continue;const M=b.content?.find(y=>y.type==="text"&&y.text&&wt(y.text))?.text;if(M){const y=De(M);l=y.length>Ot?`${y.slice(0,Ot)}…`:y;break}b.time?.completed===void 0&&!b.error&&(s=!0)}const m=Be(o);r.push({id:o.id,title:m,snippet:l,working:!l&&s})}return r}function qe(t){return`max(0px, min(${Math.max(1,(t-1)*He)}px, ${Ne}))`}function ze(t,e){if(t<3||!(e>0))return 1;const r=e/(t-1);return r>=Lt?1:Math.ceil(Lt/r)}function Ye(t,e){return e>1?t/(e-1)*100:0}function Ge(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}function Nt(t,e){if(!(t===void 0||t<0||t>=e))return[Math.max(0,t-Pt),Math.min(e-1,t+Pt)]}function Ue(t,e,r){let n=Number.POSITIVE_INFINITY,o=-1;for(const l of e){if(l.bottom<=r.top||l.top>=r.bottom)continue;const s=t.get(l.owner);s!==void 0&&(n=Math.min(n,s),o=Math.max(o,s))}return o===-1?void 0:[n,o]}const ft=220;function Ve(t){const e=document.createElement("span"),r=new Map;let n=0,o=1,l=0,s,m=-1,g,b;const M=new Map;e.setAttribute("data-timeline-rail-base",""),t.appendChild(e);const y=()=>{const c=ze(n,l);if(t.style.setProperty("--stride",String(c)),c===o)return;const f=o;o=c,(f===1||c===1)&&E(n-1)},A=c=>({d:g===void 0?void 0:Math.abs(c-g),view:s!==void 0&&c>=s[0]&&c<=s[1],current:c===m,last:o>1&&c===n-1&&n>1}),_=c=>{let f=r.get(c);return f||(f=document.createElement("span"),f.setAttribute("data-timeline-rail-tick",""),f.setAttribute("data-index",String(c)),f.setAttribute("aria-hidden","true"),f.style.setProperty("--i",String(c)),t.appendChild(f),r.set(c,f),f.offsetWidth,f)},Q=()=>{b=void 0;const c=performance.now();for(const[f,w]of M)c-w<ft||(M.delete(f),r.get(f)?.remove(),r.delete(f));M.size>0&&(b=setTimeout(Q,ft))},E=c=>{if(c<0||c>=n)return;const f=A(c),w=f.d!==void 0&&f.d<=2||f.view||f.current||f.last;if(!w&&!r.has(c))return;const S=w?_(c):r.get(c),C=(H,N,G="")=>{N?S.getAttribute(H)!==G&&S.setAttribute(H,G):S.hasAttribute(H)&&S.removeAttribute(H)};C("data-d",f.d!==void 0&&f.d<=2,String(f.d)),C("data-view",f.view),C("data-current",f.current),w?M.delete(c):M.has(c)||(M.set(c,performance.now()),b??=setTimeout(Q,ft))},I=(c,f)=>{if(c)for(let w=c[0];w<=c[1];w+=1)f(w)};return{nodes:()=>[...r.values()],count(c){const f=n;n=c,t.style.setProperty("--max",String(Math.max(1,c-1))),y();for(const[w,S]of r)w<c||(S.remove(),r.delete(w),M.delete(w));m>=c&&(m=-1),s&&s[0]>=c?s=void 0:s&&s[1]>=c&&(s=[s[0],c-1]),g!==void 0&&g>=c&&(g=void 0),c>f&&I(s,E),o>1&&(E(f-1),E(c-1))},height(c){l=c,y()},view(c){const f=s,w=c&&c[0]<n?[c[0],Math.min(c[1],n-1)]:void 0;s=w,I(f,S=>{(!w||S<w[0]||S>w[1])&&E(S)}),I(w,S=>{(!f||S<f[0]||S>f[1])&&E(S)})},current(c){const f=c>=0&&c<n?c:-1;if(f===m)return;const w=m;m=f,E(w),E(f)},active(c){const f=Nt(g,n);g=c,I(f,E),I(Nt(g,n),E)}}}const Ke=t=>1-(1-t)**4;function We(t){return Math.round(Math.min(420,180+Math.abs(t)*.12))}const Bt=["wheel","touchstart","pointerdown","keydown"];async function je(t,e,r){const{scroller:n}=t,o=n.scrollTop,l=We(e-o);let s=!1;const m=()=>{s=!0};for(const g of Bt)n.addEventListener(g,m,{passive:!0});try{const g=t.now();for(;;){if(await t.frame(),s||r.aborted)return!1;const b=Math.min(1,(t.now()-g)/l);if(n.scrollTo({top:o+(e-o)*Ke(b),behavior:"auto"}),b>=1)return!0}}finally{for(const g of Bt)n.removeEventListener(g,m)}}var Xe=p.template("<span>"),Je=p.template("<span style=display:contents>"),Qe=p.template("<div data-timeline-rail-card-meta>"),Ze=p.template("<div data-timeline-rail-card-snippet dir=auto>"),tn=p.template("<div data-timeline-rail-card><div data-timeline-rail-card-body role=tooltip><div data-timeline-rail-card-title dir=auto>"),en=p.template("<div data-timeline-rail><div data-timeline-rail-body><span data-timeline-rail-history aria-hidden=true></span><button type=button data-timeline-rail-strip><span data-timeline-rail-ticks aria-hidden=true>");const ht=28,nn=6,rn=44,on="(min-width: 768px)",an=400,ln=300,sn=90,Dt=5,pt=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,vt=()=>new Promise(t=>requestAnimationFrame(()=>t()));function cn(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function zt(t,e){const r=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),o=n instanceof HTMLElement?n.getBoundingClientRect():r,l=t.querySelector("[data-timeline-row][data-message-id]"),m=(l instanceof HTMLElement?l.getBoundingClientRect().left:r.left+Math.max(0,(r.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||r.width))/2))-r.left,g=ot(t);return{top:o.top-r.top+g,height:Math.max(0,r.bottom-o.top-g),left:Math.min(nn,Math.max(0,Math.round((m-ht)/2))),show:m>=rn}}function dn(t){const[e,r]=u.createSignal(),[n,o]=u.createSignal(),[l,s]=u.createSignal(),[m,g]=u.createSignal(-1),[b,M]=u.createSignal(),[y,A]=u.createSignal(!1),[_,Q]=u.createSignal(!0),E=()=>t.input.session,I=()=>E().server.data.session,c=u.createMemo(()=>Fe(I().message.list(E().id),I().get(E().id)?.revert?.messageID)),f=u.createMemo(()=>c().map(i=>i.id)),w=u.createMemo(()=>I().message.more(E().id)),S=u.createMemo(()=>new Map(f().map((i,a)=>[i,a]))),C=()=>c().length;let H,N;const G=i=>{N=void 0;const a=H?.closest("[data-scrollable]"),v=a&&cn(a);a&&v?(r(a),o(v)):i>0&&(N=requestAnimationFrame(()=>G(i-1)))};u.onMount(()=>G(10)),u.onCleanup(()=>{N!==void 0&&cancelAnimationFrame(N)}),u.onMount(()=>{if(typeof window.matchMedia!="function")return;const i=window.matchMedia(on),a=()=>Q(i.matches);a(),i.addEventListener("change",a),u.onCleanup(()=>i.removeEventListener("change",a))});let at=Number.NEGATIVE_INFINITY;const Yt=()=>performance.now()-at;u.createEffect(()=>{const i=e();if(!i)return;const a=()=>{at=performance.now()},v=["wheel","touchstart","touchmove","pointerdown","keydown"];for(const h of v)i.addEventListener(h,a,{passive:!0});u.onCleanup(()=>{for(const h of v)i.removeEventListener(h,a)})});const Gt=()=>{const i=e();if(i)return{scroller:i,ids:f,more:w,loadMore:a=>I().message.loadMore(E().id,{signal:a}),reducedMotion:pt,frame:vt,loading:A,tween:(a,v)=>je({scroller:i,frame:vt,now:()=>performance.now()},a,v)}},[lt,yt]=u.createSignal(!1),Ut=u.createMemo(()=>t.input.active);u.createEffect(()=>{const i=e();if(!i||!Ut()||!w())return;const a=new AbortController,v={scroller:i,more:()=>I().message.more(E().id),loadMore:({signal:h,beforePublish:R})=>I().message.loadMore(E().id,{signal:h,beforePublish:R}),frame:vt,idle:Yt,inset:()=>ot(i),loading:yt,drift:globalThis.__timelineRailDrift};u.untrack(()=>fe(v,a.signal)),u.onCleanup(()=>{a.abort(),yt(!1)})});let U;const Vt=()=>{U=void 0;const i=e(),a=n();if(!t.input.active||!i||!a)return;const v=bt(i),h=i.getBoundingClientRect(),R=h.top+ot(i),x=ve(f(),v,R),$=Ue(S(),v,{top:R,bottom:h.bottom}),L=zt(i,a);g(x),M(d=>d&&$&&d[0]===$[0]&&d[1]===$[1]?d:$),s(d=>d&&d.top===L.top&&d.height===L.height&&d.left===L.left&&d.show===L.show?d:L)},B=()=>{U===void 0&&(U=requestAnimationFrame(Vt))};u.onCleanup(()=>{U!==void 0&&cancelAnimationFrame(U)}),u.createEffect(()=>{const i=e(),a=n();if(!i||!a)return;i.addEventListener("scroll",B,{passive:!0});const v=typeof ResizeObserver=="function"?new ResizeObserver(B):void 0;v?.observe(a);const h=a.querySelector("[data-slot='session-timeline-visible']");h&&v?.observe(h),B(),u.onCleanup(()=>{i.removeEventListener("scroll",B),v?.disconnect()})}),u.createEffect(u.on([f,w,()=>t.input.active,_],B,{defer:!0}));let V;const Kt=i=>{const a=f()[i],v=Gt();if(!a||!v||!t.input.active)return;V?.abort();const h=new AbortController;V=h,Pe(v,a,h.signal).finally(()=>{V===h&&(V=void 0),B()})};u.onCleanup(()=>V?.abort());const[Wt,jt]=u.createSignal(),[O,xt]=u.createSignal(),[D,F]=u.createSignal("closed"),[Xt,Mt]=u.createSignal(!1);let q,Et=Number.NEGATIVE_INFINITY;const Z=(i,a=!1)=>{if(jt(i),xt(i),D()!=="open"){if(clearTimeout(q),D()==="closing"||a||Date.now()-Et<ln){F("open");return}q=setTimeout(()=>F("open"),an)}},st=()=>{if(clearTimeout(q),q=void 0,xt(void 0),D()!=="open"){F("closed");return}if(Et=Date.now(),pt()){F("closed");return}F("closing"),q=setTimeout(()=>{D()==="closing"&&F("closed")},sn)};u.onCleanup(()=>clearTimeout(q)),u.createEffect(()=>{if(D()!=="open"){Mt(!1);return}const i=requestAnimationFrame(()=>Mt(!0));u.onCleanup(()=>cancelAnimationFrame(i))});const tt=u.createMemo(()=>{const i=Wt();return i===void 0||D()==="closed"||i>=C()?void 0:i}),z=()=>{const i=tt();return i===void 0?void 0:c()[i]},Tt=()=>{const i=tt();return i===void 0||w()||lt()?void 0:`${i+1} of ${C()}`},Jt=()=>c()[O()??Math.max(0,m())]?.title??"User message";let ct,Y,et;const[Qt,Zt]=u.createSignal(0),[te,ee]=u.createSignal(0),[ne,ie]=u.createSignal(!1),[St,re]=u.createSignal(),K=u.createMemo(()=>{const i=St();return i?Ve(i):void 0});u.createEffect(()=>{const i=St(),a=K();if(!i||!a||typeof ResizeObserver!="function")return;const v=new ResizeObserver(()=>a.height(i.getBoundingClientRect().height));v.observe(i),a.height(i.getBoundingClientRect().height),u.onCleanup(()=>v.disconnect())}),u.createEffect(()=>K()?.count(C())),u.createEffect(()=>K()?.view(b())),u.createEffect(()=>K()?.current(m())),u.createEffect(()=>K()?.active(pt()?void 0:O())),u.createEffect(()=>{const i=tt(),a=z();if(i===void 0||!a||!ct||!Y||!et)return;const v=ct.getBoundingClientRect(),h=Y.getBoundingClientRect(),R=h.top+h.height*Ye(i,C())/100-v.top,x=et.offsetHeight,$=Math.round(Math.max(0,Math.min(R-x/2,v.height-x)));Zt($),ee(Math.round(R-$))});const dt=i=>{i!==void 0&&i>=0&&i<C()&&Kt(i)},ut=i=>{if(!Y)return null;const a=Y.getBoundingClientRect();return Ge({count:C(),top:a.top,height:a.height,y:i.clientY})};let nt=!1;const[kt,Ct]=u.createSignal(!1),At=i=>{const a=h=>{h.buttons===0&&(v(),i())},v=()=>{window.removeEventListener("pointerup",a),window.removeEventListener("pointermove",a)};window.addEventListener("pointerup",a),window.addEventListener("pointermove",a)},oe=i=>{const a=e();a&&(i.preventDefault(),at=performance.now(),Ft(a),a.scrollBy({top:i.deltaY,left:i.deltaX}))},ae=i=>{if(i.key==="Escape"){st();return}const a=C()-1,v=O()??Math.max(0,m()),h=i.key==="ArrowDown"?Math.min(a,v+1):i.key==="ArrowUp"?Math.max(0,v-1):i.key==="PageDown"?Math.min(a,v+Dt):i.key==="PageUp"?Math.max(0,v-Dt):i.key==="Home"?0:i.key==="End"?a:-1;if(i.key==="Enter"||i.key===" "){i.preventDefault(),dt(O());return}h!==-1&&(i.preventDefault(),Z(h,!0))},le=()=>{const i=l();return{top:`${i?.top??0}px`,height:`${i?.height??0}px`,left:`${i?.left??0}px`}},se=i=>{const a=m()+i;m()>=0&&dt(a)},It=i=>{const a=i==="previous",v=a?"Previous turn":"Next turn";return p.createComponent(t.ui.Tooltip,{value:v,placement:a?"top":"bottom",get children(){var h=Xe();return p.setAttribute(h,"data-timeline-rail-turn",i),p.insert(h,p.createComponent(t.ui.IconButton,{icon:"chevron-down",label:v,size:"small",variant:"ghost-muted",get disabled(){return a?m()<=0:m()<0||m()>=C()-1},onClick:()=>se(a?-1:1)})),h}})};return(()=>{var i=Je();return p.use(a=>H=a,i),p.insert(i,p.createComponent(u.Show,{get when(){return p.memo(()=>!!(t.input.active&&_()&&l()?.show))()&&n()},children:a=>p.createComponent(p.Portal,{get mount(){return a()},ref:v=>v.style.display="contents",get children(){var v=en(),h=v.firstChild,R=h.firstChild,x=R.nextSibling,$=x.firstChild;v.addEventListener("pointerleave",()=>st()),p.use(d=>{ct=d,d.addEventListener("wheel",oe,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>ie(!0)))},v),p.insert(h,()=>It("previous"),x),x.$$keydown=ae,x.addEventListener("blur",()=>st()),x.addEventListener("focus",d=>{O()===void 0&&Z(Math.max(0,m()),d.currentTarget.matches(":focus-visible"))}),x.$$click=d=>{d.detail!==0&&(dt(O()??ut(d)??void 0),d.currentTarget.blur())},x.$$pointermove=d=>{if(d.pointerType==="touch")return;if(d.buttons!==0&&!nt){kt()||(Ct(!0),At(()=>Ct(!1)));return}const k=ut(d);k!==null&&k!==O()&&Z(k)},x.addEventListener("pointerenter",d=>{if(d.pointerType==="touch")return;const k=ut(d);k!==null&&Z(k)}),x.$$mousedown=d=>d.preventDefault(),x.$$pointerdown=()=>{nt||(nt=!0,At(()=>nt=!1))};var L=Y;return typeof L=="function"?p.use(L,x):Y=x,p.use(re,$),p.insert(h,()=>It("next"),null),p.insert(v,p.createComponent(u.Show,{get when(){return tt()!==void 0},get children(){var d=tn(),k=d.firstChild,W=k.firstChild,it=et;return typeof it=="function"?p.use(it,k):et=k,p.insert(k,p.createComponent(u.Show,{get when(){return Tt()},get children(){var T=Qe();return p.insert(T,Tt),T}}),W),p.insert(W,()=>z()?.title),p.insert(k,p.createComponent(u.Show,{get when(){return z()?.snippet||z()?.working},get children(){var T=Ze();return p.insert(T,()=>z()?.snippet??"Working…"),p.effect(()=>p.setAttribute(T,"data-working",z()?.working?"":void 0)),T}}),null),p.effect(T=>{var j=Xt()?"":void 0,X=`${Qt()}px`,J=`${te()}px`;return j!==T.e&&p.setAttribute(d,"data-entered",T.e=j),X!==T.t&&p.setStyleProperty(d,"--card-y",T.t=X),J!==T.a&&p.setStyleProperty(d,"--card-origin",T.a=J),T},{e:void 0,t:void 0,a:void 0}),d}}),null),p.effect(d=>{var k=C()<Oe?"":void 0,W=ne()?"":void 0,it=le(),T=qe(C()),j=lt()?"":void 0,X=kt()?"":void 0,J=`Jump to message: ${Jt()}`,_t=y()||lt()?"true":void 0;return k!==d.e&&p.setAttribute(v,"data-empty",d.e=k),W!==d.t&&p.setAttribute(v,"data-armed",d.t=W),d.a=p.style(v,it,d.a),T!==d.o&&p.setStyleProperty(h,"--timeline-rail-height",d.o=T),j!==d.i&&p.setAttribute(R,"data-active",d.i=j),X!==d.n&&p.setAttribute(x,"data-pass",d.n=X),J!==d.s&&p.setAttribute(x,"aria-label",d.s=J),_t!==d.h&&p.setAttribute(x,"aria-busy",d.h=_t),d},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),v}})})),i})()}const un=`
[data-timeline-rail] {
  --timeline-rail-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --timeline-rail-move: cubic-bezier(0.77, 0, 0.175, 1);
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${ht}px;
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
    transparent 2px calc(var(--timeline-rail-height) * var(--stride, 1) / var(--max, 1))
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
  left: ${ht}px;
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
`,mn=mt.Plugin.define({setup(t){t.add(mt.Style,un),t.add(mt.Slot,{at:"session.header",render:e=>p.createComponent(dn,{input:e,get ui(){return t.ui}})})}});p.delegateEvents(["pointerdown","mousedown","pointermove","click","keydown"]);exports.default=mn;exports.measure=zt;
