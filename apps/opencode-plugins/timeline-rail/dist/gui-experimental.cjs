"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const d=require("solid-js/web"),N=require("@opencode/plugin/gui"),b=require("solid-js"),Nt=8,ut=2;function ot(t){return t.max<=ut||t.max-t.top<=ut}function Bt(t){const{chosen:e}=t;return e!==void 0&&e>=0&&e<t.count&&ot(t.scroll)?e:t.computed}function qt(t,e,i,n){const r=t.length-1;if(r<0)return-1;if(ot(n))return r;let a;for(const x of e){if(x.top>i)break;a=x}const c=a??e[0];if(!c)return 0;const l=t.indexOf(c.owner),u=l!==-1?l:t.findIndex(x=>x>c.owner),g=l!==-1?l:u===-1?r:u-1;return Math.min(r,Math.max(0,!a&&c.prompt&&l!==-1?l-1:g))}function Ft(t,e,i){const n=t.filter(l=>l.bottom>i.top&&l.top<i.bottom),r=n.length?n:t,a=r[0],c=r.at(-1);return!a||a.owner>=e?-1:c&&c.owner<e?1:0}function Dt(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const i=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:i,behavior:"smooth"}}function Kt(t){const e=Math.max(0,t.scrollHeight-t.clientHeight);return Math.min(e,Math.max(0,Math.round(t.index/Math.max(1,t.count)*t.scrollHeight)))}function zt(t){let e=Number.POSITIVE_INFINITY,i=-1;for(const u of t.rows){if(u.bottom<=t.box.top||u.top>=t.box.bottom)continue;const g=t.indexOf.get(u.owner);g!==void 0&&(e=Math.min(e,g),i=Math.max(i,g))}if(i===-1)return;if(t.target>=e&&t.target<=i)return 0;const n=t.rows.flatMap(u=>{const g=u.prompt?t.indexOf.get(u.owner):void 0;return g===void 0?[]:[{index:g,top:u.top}]}),r=n[0],a=n.at(-1),c=r&&a&&a.index>r.index?(a.top-r.top)/(a.index-r.index):0,l=c>0?c:t.fallback;return Math.round((t.target-(e+i)/2)*l)}const W=3,Yt=40,Gt=120,Ut=200,Xt=3,Vt=20,jt=24,Wt=2,Jt=4;function gt(t){const e=t.querySelector("[data-timeline-key]")?.parentElement,i=[],n=r=>{const a=r.dataset.messageId;if(!a)return;const c=r.getBoundingClientRect();i.push({owner:a,prompt:r.dataset.timelineRow==="UserMessage",top:c.top,bottom:c.bottom})};if(!e){for(const r of t.querySelectorAll("[data-message-id]"))n(r);return i}for(const r of e.children){const a=r.matches("[data-message-id]")?r:r.querySelector("[data-message-id]");a&&n(a)}return i}function bt(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function O(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(i=>i.dataset.messageId===e)}function wt(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}function nt(t,e){const i=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,i.top-n.top+t.scrollTop-bt(t))}async function Qt(t,e,i){let n=Number.NaN,r=0,a=0;for(let c=0;c<Yt&&!i.aborted;c+=1){await t.frame();const l=t.scroller.scrollTop,u=O(t.scroller,e);if(r=u&&l===n?r+1:0,a=u?0:a+1,n=l,r>=W||a>W)return}}async function Zt(t,e,i,n){const{scroller:r}=t;let a=0;for(let c=0;c<Ut&&!i.aborted;c+=1){if(O(r,e))return;const l=Ft(gt(r),e,r.getBoundingClientRect());if(l===0){if((a+=1)>W)return;await t.frame();continue}a=0;const u=Math.max(0,r.scrollHeight-r.clientHeight);if(l===-1&&r.scrollTop<=0||l===1&&r.scrollTop>=u)return;n.direction!==0&&l!==n.direction&&(n.step=Math.max(r.clientHeight/4,n.step/2)),n.direction=l,r.scrollTo({top:Math.min(u,Math.max(0,r.scrollTop+l*n.step)),behavior:"auto"}),await t.frame()}}async function te(t,e,i){const{scroller:n}=t,r=t.ids(),a=r.indexOf(e),c=Kt({index:a,count:r.length,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});if(Math.abs(c-n.scrollTop)<Vt*n.clientHeight)return;const l=new Map(r.map((y,k)=>[y,k])),u=n.scrollHeight/Math.max(1,r.length),g=()=>Math.max(0,n.scrollHeight-n.clientHeight),x=async()=>{for(let y=0;y<Wt&&!i.aborted;y+=1)await t.frame()};n.scrollTo({top:c,behavior:"auto"}),await x();for(let y=0;y<jt&&!i.aborted;y+=1){if(O(n,e))return;const k=zt({rows:gt(n),indexOf:l,target:a,fallback:u,box:n.getBoundingClientRect()});if(k===0)return;if(k===void 0){await x();continue}const I=Math.min(g(),Math.max(0,n.scrollTop+k));if(I===n.scrollTop)return;n.scrollTo({top:I,behavior:"auto"}),await x()}}async function ee(t,e,i){const{scroller:n}=t;await te(t,e,i);const r={step:n.clientHeight,direction:0};for(let a=0;a<Xt&&!i.aborted;a+=1)if(await Zt(t,e,i,r),await Qt(t,e,i),O(n,e))return}async function ne(t,e,i){const{scroller:n}=t,r=O(n,e);if(!r)return!1;const a=Dt({from:n.scrollTop,to:nt(n,r),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});a.start!==void 0&&(n.scrollTo({top:a.start,behavior:"auto"}),await t.frame());const c=async g=>{if(a.behavior==="auto")return n.scrollTo({top:g,behavior:"auto"}),!0;n.scrollTo({top:g,behavior:a.behavior});let x=Number.NaN,y=0;for(let k=0;k<Gt&&!i.aborted;k+=1){await t.frame();const I=n.scrollTop;if(y=I===x?y+1:0,x=I,y>=W)break}return!0};if(!await c(a.to)||a.behavior==="auto"||i.aborted)return!0;const l=O(n,e);if(!l)return!0;const u=Math.min(nt(n,l),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(u-n.scrollTop)>2&&await c(u),!0}const mt=["wheel","touchstart","pointerdown","keydown"];async function oe(t,e,i){if(!t.ids().includes(e))return"none";wt(t.scroller);const n=new AbortController,r=()=>n.abort(),a=AbortSignal.any([i,n.signal]);for(const c of mt)t.scroller.addEventListener(c,r,{passive:!0});try{for(let c=0;c<Jt;c+=1){if(!O(t.scroller,e)&&(await ee(t,e,a),a.aborted))return"aborted";if(!await ne(t,e,a))return"none";if(a.aborted)return"aborted";const l=O(t.scroller,e),{scroller:u}=t;if(l&&(Math.abs(nt(u,l)-u.scrollTop)<=2||u.scrollHeight-u.clientHeight-u.scrollTop<=2))break}return a.aborted?"aborted":"done"}finally{for(const c of mt)t.scroller.removeEventListener(c,r)}}const re=8,ie=2,ae="calc(100vh - 18rem)",ft=200,se=1500,pt=10,le=20,xt="User message",yt=t=>t.replace(/\s+/g," ").trim();function ce(t){const e=t.metadata?.displayText,i=yt(typeof e=="string"&&e?e:t.text??"");return i?i.length>ft?`${i.slice(0,ft)}…`:i:xt}function de(t){return yt(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}const ue="peerMessage",Mt=t=>t.type==="user"&&t.metadata?.[ue]===void 0;function me(t,e){const i=[];for(const n of t)Mt(n)&&!(e&&n.id>=e)&&i.push(n.id);return i}function fe(t){const e=(t.content??[]).flatMap(i=>i.type==="text"&&i.text?[i.text]:[]).join(`
`);return(e.trim()?de(e.slice(0,se)):"")||void 0}function pe(t,e,i){const n=[];for(let r=0;r<t.length;r+=1){const a=t[r];if(!Mt(a)||e&&a.id>=e||i&&a.id<i)continue;let c;for(let g=r+1;g<t.length&&t[g].type!=="user";g+=1)t[g].type==="assistant"&&(c=t[g]);const l=c;let u=null;n.push({id:a.id,title:ce(a),get snippet(){return u===null&&(u=l?fe(l):void 0),u}})}return n}function he(t,e,i=!0){if(e.length===0)return;if(!t)return{from:e[Math.max(0,e.length-pt)],loaded:e};const n=t.loaded[0],r=!i||n===void 0?0:e.indexOf(n),a=e.indexOf(t.from),c=a!==-1?a:e.findIndex(l=>l>t.from);return c===-1?{from:e[Math.max(0,e.length-pt)],loaded:e}:{from:e[Math.max(0,c-(r>0?Math.min(r,le):0))],loaded:e}}function ve(t){return`max(0px, min(${Math.max(1,(t-1)*re)}px, ${ae}))`}function ht(t,e){return e>1?t/(e-1)*100:0}function ge(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}const be=2,Tt=1e7,we=120;function xe(t){return`${Tt}px 0px ${-(t.contentBottom-t.line)}px 0px`}function ye(t){return`${Tt}px 0px ${be-t}px 0px`}function Me(t,e){const i=new Map;let n,r,a,c="",l,u=0,g=!1,x=null,y,k=!1;const I=p=>{const v=p.matches("[data-message-id]")?p:p.querySelector("[data-message-id]");return v instanceof HTMLElement&&v.dataset.messageId?{owner:v.dataset.messageId,prompt:v.dataset.timelineRow==="UserMessage"}:void 0},Y=p=>{for(const v of p){if(!v.target.isConnected)continue;const w=i.get(v.target),M=I(v.target);i.set(v.target,{owner:M?.owner??w?.owner,prompt:M?.prompt??w?.prompt??!1,reached:v.isIntersecting})}e()},G=()=>{const p=t.getBoundingClientRect(),v=getComputedStyle(t),w=p.top+t.clientTop+t.clientHeight-(parseFloat(v.paddingBottom)||0),M=p.top+(x?.offsetHeight??0)+Nt;return xe({contentBottom:w,line:M})},U=()=>{if(r?.disconnect(),r=void 0,!(!n||typeof IntersectionObserver!="function")){r=new IntersectionObserver(Y,{root:t,rootMargin:c,threshold:0});for(const p of n.children)r.observe(p)}},X=p=>{const v=p.at(-1);if(!v?.rootBounds)return;const w=v.boundingClientRect.bottom<=v.rootBounds.bottom;w!==g&&(g=w,e())},J=()=>{a?.disconnect(),a=void 0,!(!n||l===void 0||typeof IntersectionObserver!="function")&&(a=new IntersectionObserver(X,{root:t,rootMargin:ye(l),threshold:1}),a.observe(n))},Q=()=>{if(u=t.scrollHeight-t.clientHeight,!n)return;const p=t.scrollHeight-(n.getBoundingClientRect().bottom-t.getBoundingClientRect().top-t.clientTop+t.scrollTop);l!==void 0&&Math.abs(p-l)<.5||(l=p,J())},L=new ResizeObserver(p=>{if(n&&!n.isConnected){A();return}const v=c,w=u;Q(),(!c||p.some(M=>M.target===t||M.target===x))&&(c=G()),c!==v&&U(),(c!==v||u!==w)&&e()}),P=new MutationObserver(p=>{for(const v of p){for(const w of v.removedNodes)w instanceof Element&&r?.unobserve(w),i.delete(w);for(const w of v.addedNodes)w instanceof Element&&r?.observe(w)}e()}),A=(p=we)=>{if(y=void 0,k)return;const v=t.querySelector("[data-timeline-key]")?.parentElement??void 0;if(!v){p>0&&(y=requestAnimationFrame(()=>A(p-1)));return}v===n&&v.isConnected||(P.disconnect(),L.disconnect(),i.clear(),l=void 0,g=!1,n=v,x=t.querySelector("[data-session-title]"),P.observe(n,{childList:!0}),c="",L.observe(t),L.observe(n),x&&L.observe(x),e())};return A(),{active(p){const v=[];for(const w of n?.children??[]){const M=i.get(w);if(!M||M.reached===void 0)continue;const q=M.owner?void 0:I(w);q&&(M.owner=q.owner,M.prompt=q.prompt),M.owner&&v.push({owner:M.owner,prompt:M.prompt,top:M.reached?Number.NEGATIVE_INFINITY:Number.POSITIVE_INFINITY,bottom:0})}return qt(p,v,0,{top:g?u:0,max:u})},rescan:()=>{y===void 0&&A()},stop(){k=!0,y!==void 0&&cancelAnimationFrame(y),r?.disconnect(),a?.disconnect(),P.disconnect(),L.disconnect()}}}var Te=d.template("<span>"),Ee=d.template("<span style=display:contents>"),Se=d.template("<div data-timeline-rail><div data-timeline-rail-body><button type=button data-timeline-rail-strip>"),Ie=d.template("<span data-timeline-rail-tick aria-hidden=true>"),ke=d.template("<span data-timeline-rail-card-snippet dir=auto>"),Ce=d.template("<span data-timeline-rail-card><span data-timeline-rail-card-body role=tooltip><span data-timeline-rail-card-title dir=auto>");const Et=12,Ae=40,$e=48,He=14,Pe="(min-width: 768px)",Re=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,_e=()=>new Promise(t=>requestAnimationFrame(()=>t()));function Oe(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function St(t,e){const i=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),r=n instanceof HTMLElement?n.getBoundingClientRect():i,a=t.querySelector("[data-timeline-row][data-message-id]"),c=a instanceof HTMLElement?a.getBoundingClientRect().left:i.left+Math.max(0,(i.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||i.width))/2),l=Math.max(0,c-i.left),u=bt(t);return{top:r.top-i.top+u,height:Math.max(0,i.bottom-r.top-u),hit:Math.max(0,Math.min(Ae,Math.floor(l)-Et)),persistent:l>=$e}}const vt=t=>t?.closest?.("[data-timeline-rail-card]")!=null;function Le(t){const[e,i]=b.createSignal(),n=()=>e()?.root,r=()=>e()?.parent,[a,c]=b.createSignal(),[l,u]=b.createSignal(-1);let g,x=!1;const[y,k]=b.createSignal(!0),I=()=>t.input.session,Y=()=>I().server.data.session,G=()=>Y().message.list(I().id),U=()=>Y().get(I().id)?.revert?.messageID,X=b.createMemo(()=>me(G(),U())),[J,Q]=b.createSignal(),L=b.createMemo(o=>{const s=I().id;return{id:s,window:he(o?.id===s?o.window:void 0,X(),J()===s)}}),P=b.createMemo(()=>{const o=L().window?.from;return o?pe(G(),U(),o):[]}),A=b.createMemo(()=>P().map(o=>o.id),[],{equals:(o,s)=>o.length===s.length&&o.every((m,h)=>m===s[h])}),p=()=>P().length;let v,w;const M=o=>{w=void 0;const s=v?.closest("[data-scrollable]"),m=s&&Oe(s);s&&m?i({root:s,parent:m}):o>0&&(w=requestAnimationFrame(()=>M(o-1)))};b.onMount(()=>M(10)),b.onCleanup(()=>{w!==void 0&&cancelAnimationFrame(w)}),b.onMount(()=>{if(typeof window.matchMedia!="function")return;const o=window.matchMedia(Pe),s=()=>k(o.matches);s(),o.addEventListener("change",s),b.onCleanup(()=>o.removeEventListener("change",s))}),N.createKeyed(n,o=>{const s=()=>{Q(I().id),!(x||g===void 0)&&(g=void 0,u(B?.active(A())??-1))},m=["wheel","touchmove","pointerdown","keydown"];for(const h of m)o.addEventListener(h,s,{passive:!0});b.onCleanup(()=>{for(const h of m)o.removeEventListener(h,s)})});const q=()=>{const o=n();if(o)return{scroller:o,ids:X,reducedMotion:Re,frame:_e}};let F;const It=o=>{const s=n();if(g===void 0||!s)return o;const m=Bt({chosen:g,computed:o,count:A().length,scroll:{top:s.scrollTop,max:s.scrollHeight-s.clientHeight}});return m===o&&(g=void 0),m},kt=()=>{F=void 0;const o=n(),s=r();if(!t.input.active||!o||!s)return;const m=St(o,s);c(h=>h&&h.top===m.top&&h.height===m.height&&h.hit===m.hit&&h.persistent===m.persistent?h:m)},Z=()=>{F===void 0&&(F=requestAnimationFrame(kt))};b.onCleanup(()=>{F!==void 0&&cancelAnimationFrame(F)}),N.createKeyed(e,({parent:o})=>{const s=typeof ResizeObserver=="function"?new ResizeObserver(Z):void 0;s?.observe(o);const m=o.querySelector("[data-slot='session-timeline-visible']");m&&s?.observe(m),Z(),b.onCleanup(()=>s?.disconnect())});let B;N.createKeyed(()=>t.input.active&&y()?n():void 0,o=>{let s=!1;const m=Me(o,()=>{s&&u(It(m.active(A())))});s=!0,B=m,u(m.active(A())),b.onCleanup(()=>{m.stop(),B===m&&(B=void 0)})}),N.createKeyed(()=>t.input.active&&y()?A():void 0,o=>{Z(),B?.rescan(),g=void 0,u(B?.active(o)??-1)});let D;const Ct=o=>{const s=A()[o],m=q();if(!s||!m||!t.input.active)return;D?.abort();const h=new AbortController;D=h,x=!0;const S=oe(m,s,h.signal);x=!1,S.then(j=>{if(D===h&&(D=void 0),j!=="done")return;const f=n();!f||!ot({top:f.scrollTop,max:f.scrollHeight-f.clientHeight})||(g=o,u(o))})};b.onCleanup(()=>D?.abort());const[C,K]=b.createSignal(),[At,$t]=b.createSignal(!1),[rt,it]=b.createSignal(!1),tt=()=>{const o=C();return o===void 0||o>=p()?void 0:P()[o]},Ht=()=>tt()?.title??xt;let V;const et=o=>{o!==void 0&&o>=0&&o<p()&&Ct(o)},at=o=>{if(!V)return null;const s=V.getBoundingClientRect();return ge({count:p(),top:s.top,height:s.height,y:o.clientY})};let z=!1;const st=o=>{const s=h=>{h.buttons===0&&(m(),o())},m=()=>{window.removeEventListener("pointerup",s),window.removeEventListener("pointermove",s)};window.addEventListener("pointerup",s),window.addEventListener("pointermove",s)},Pt=o=>{const s=n();!s||o.defaultPrevented||o.ctrlKey||o.deltaY===0||(o.preventDefault(),wt(s),s.scrollBy({top:o.deltaY,left:o.deltaX}))},Rt=o=>{const s=p()-1;if(o.key==="Enter"||o.key===" "){o.preventDefault(),et(C());return}const m=C()??0,h=o.key==="ArrowDown"?Math.min(s,m+1):o.key==="ArrowUp"?Math.max(0,m-1):o.key==="Home"?0:o.key==="End"?s:-1;h!==-1&&(o.preventDefault(),K(h))},_t=()=>{const o=a();return{top:`${o?.top??0}px`,height:`${o?.height??0}px`}},Ot=o=>{l()>=0&&et(l()+o)},lt=o=>{const s=o==="previous",m=s?"Previous turn":"Next turn";return(()=>{var h=Te();return d.setAttribute(h,"data-timeline-rail-turn",o),d.insert(h,d.createComponent(t.ui.Tooltip,{value:m,placement:s?"top":"bottom",get children(){return d.createComponent(t.ui.IconButton,{icon:"chevron-down",label:m,size:"small",variant:"ghost-muted",get disabled(){return s?l()<=0:l()<0||l()>=p()-1},onClick:()=>Ot(s?-1:1)})}})),h})()},Lt=o=>o===0?"0%":o===p()-1?"-100%":"-50%";return(()=>{var o=Ee();return d.use(s=>v=s,o),d.insert(o,d.createComponent(b.Show,{get when(){return d.memo(()=>!!(t.input.active&&y()&&p()>=ie&&(a()?.hit??0)>0))()&&r()},children:s=>d.createComponent(d.Portal,{get mount(){return s()},ref:m=>m.style.display="contents",get children(){var m=Se(),h=m.firstChild,S=h.firstChild;d.use(f=>{f.addEventListener("wheel",Pt,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>$t(!0)))},m),h.$$pointermove=f=>{f.buttons===0||z||rt()||(it(!0),st(()=>it(!1)))},h.$$pointerdown=()=>{z||(z=!0,st(()=>z=!1))},d.insert(h,()=>lt("previous"),S),S.$$keydown=Rt,S.addEventListener("blur",()=>K(void 0)),S.addEventListener("focus",()=>{C()===void 0&&K(Math.max(0,l()))}),S.$$click=f=>{vt(f.target)||f.detail===0||(et(C()??at(f)??void 0),f.currentTarget.blur())},S.addEventListener("pointerleave",()=>K(void 0)),S.$$pointermove=f=>{if(f.pointerType==="touch"||f.buttons!==0&&!z)return;const T=at(f);T!==null&&T!==C()&&K(T)},S.$$mousedown=f=>{vt(f.target)||f.preventDefault()};var j=V;return typeof j=="function"?d.use(j,S):V=S,d.insert(S,d.createComponent(b.Index,{get each(){return P()},children:(f,T)=>(()=>{var $=Ie();return d.setAttribute($,"data-index",T),d.effect(H=>{var E=C()!==void 0&&Math.abs(T-C())<=2?Math.abs(T-C()):void 0,R=T===l()||T===C()?"":void 0,_=`${ht(T,p())}%`;return E!==H.e&&d.setAttribute($,"data-d",H.e=E),R!==H.t&&d.setAttribute($,"data-active",H.t=R),_!==H.a&&d.setStyleProperty($,"top",H.a=_),H},{e:void 0,t:void 0,a:void 0}),$})()}),null),d.insert(S,d.createComponent(b.Show,{get when(){return tt()},children:f=>(()=>{var T=Ce(),$=T.firstChild,H=$.firstChild;return T.$$pointermove=E=>E.stopPropagation(),d.insert(H,()=>f().title),d.insert($,d.createComponent(b.Show,{get when(){return f().snippet},get children(){var E=ke();return d.insert(E,()=>f().snippet),E}}),null),d.effect(E=>{var R=`${ht(C(),p())}%`,_=`translateY(${Lt(C())})`;return R!==E.e&&d.setStyleProperty(T,"top",E.e=R),_!==E.t&&d.setStyleProperty(T,"transform",E.t=_),E},{e:void 0,t:void 0}),T})()}),null),d.insert(h,()=>lt("next"),null),d.effect(f=>{var T=a()?.persistent?"":void 0,$=At()?"":void 0,H=_t(),E=(a()?.hit??0)>=He?"":void 0,R=rt()?"":void 0,_=ve(p()),ct=tt()?"22rem":`${a()?.hit??0}px`,dt=`Jump to message: ${Ht()}`;return T!==f.e&&d.setAttribute(m,"data-persistent",f.e=T),$!==f.t&&d.setAttribute(m,"data-armed",f.t=$),f.a=d.style(m,H,f.a),E!==f.o&&d.setAttribute(h,"data-navigation",f.o=E),R!==f.i&&d.setAttribute(h,"data-pass",f.i=R),_!==f.n&&d.setStyleProperty(h,"--timeline-rail-height",f.n=_),ct!==f.s&&d.setStyleProperty(h,"width",f.s=ct),dt!==f.h&&d.setAttribute(S,"aria-label",f.h=dt),f},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),m}})})),o})()}const Ne=`
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
  margin-left: ${Et}px;
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
  outline: none;
  user-select: none;
}
[data-timeline-rail-strip]:focus-visible { box-shadow: inset 0 0 0 2px var(--v2-border-border-focus); }
/* One span per prompt: 24px wide, drawn at a third of that at rest, scaled by index distance from the pointer.
   The colour is a node background, so only transform and the lit overlay's opacity ever change. */
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
[data-timeline-rail-tick][data-d="0"] { transform: scaleX(1); }
[data-timeline-rail-tick][data-d="1"] { transform: scaleX(0.667); }
[data-timeline-rail-tick][data-d="2"] { transform: scaleX(0.417); }
[data-timeline-rail-tick]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 1px;
  background: color-mix(in srgb, var(--v2-text-text-base) 60%, transparent);
  opacity: 0;
}
[data-timeline-rail-tick][data-active]::after { opacity: 1; }
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
`,Be=N.Plugin.define({setup(t){t.add(N.Style,Ne),t.add(N.Slot,{at:"session.header",render:e=>d.createComponent(Le,{input:e,get ui(){return t.ui}})})}});d.delegateEvents(["pointerdown","pointermove","mousedown","click","keydown"]);exports.default=Be;exports.measure=St;
