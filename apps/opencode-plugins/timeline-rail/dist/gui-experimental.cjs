"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const d=require("solid-js/web"),N=require("@opencode/plugin/gui"),b=require("solid-js"),Pt=8,ct=2;function Ot(t,e,i,n){const r=t.length-1;if(r<0)return-1;if(n.max<=ct||n.max-n.top<=ct)return r;let a;for(const M of e){if(M.top>i)break;a=M}const c=a??e[0];if(!c)return 0;const l=t.indexOf(c.owner),m=l!==-1?l:t.findIndex(M=>M>c.owner),g=l!==-1?l:m===-1?r:m-1;return Math.min(r,Math.max(0,!a&&c.prompt&&l!==-1?l-1:g))}function Ht(t,e,i){const n=t.filter(l=>l.bottom>i.top&&l.top<i.bottom),r=n.length?n:t,a=r[0],c=r.at(-1);return!a||a.owner>=e?-1:c&&c.owner<e?1:0}function Lt(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const i=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:i,behavior:"smooth"}}function Nt(t){const e=Math.max(0,t.scrollHeight-t.clientHeight);return Math.min(e,Math.max(0,Math.round(t.index/Math.max(1,t.count)*t.scrollHeight)))}function Bt(t){let e=Number.POSITIVE_INFINITY,i=-1;for(const m of t.rows){if(m.bottom<=t.box.top||m.top>=t.box.bottom)continue;const g=t.indexOf.get(m.owner);g!==void 0&&(e=Math.min(e,g),i=Math.max(i,g))}if(i===-1)return;if(t.target>=e&&t.target<=i)return 0;const n=t.rows.flatMap(m=>{const g=m.prompt?t.indexOf.get(m.owner):void 0;return g===void 0?[]:[{index:g,top:m.top}]}),r=n[0],a=n.at(-1),c=r&&a&&a.index>r.index?(a.top-r.top)/(a.index-r.index):0,l=c>0?c:t.fallback;return Math.round((t.target-(e+i)/2)*l)}const X=3,qt=40,Ft=120,Dt=200,Kt=3,zt=20,Yt=24,Gt=2,Ut=4;function ht(t){const e=t.querySelector("[data-timeline-key]")?.parentElement,i=[],n=r=>{const a=r.dataset.messageId;if(!a)return;const c=r.getBoundingClientRect();i.push({owner:a,prompt:r.dataset.timelineRow==="UserMessage",top:c.top,bottom:c.bottom})};if(!e){for(const r of t.querySelectorAll("[data-message-id]"))n(r);return i}for(const r of e.children){const a=r.matches("[data-message-id]")?r:r.querySelector("[data-message-id]");a&&n(a)}return i}function vt(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function H(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(i=>i.dataset.messageId===e)}function gt(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}function tt(t,e){const i=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,i.top-n.top+t.scrollTop-vt(t))}async function Xt(t,e,i){let n=Number.NaN,r=0,a=0;for(let c=0;c<qt&&!i.aborted;c+=1){await t.frame();const l=t.scroller.scrollTop,m=H(t.scroller,e);if(r=m&&l===n?r+1:0,a=m?0:a+1,n=l,r>=X||a>X)return}}async function Vt(t,e,i,n){const{scroller:r}=t;let a=0;for(let c=0;c<Dt&&!i.aborted;c+=1){if(H(r,e))return;const l=Ht(ht(r),e,r.getBoundingClientRect());if(l===0){if((a+=1)>X)return;await t.frame();continue}a=0;const m=Math.max(0,r.scrollHeight-r.clientHeight);if(l===-1&&r.scrollTop<=0||l===1&&r.scrollTop>=m)return;n.direction!==0&&l!==n.direction&&(n.step=Math.max(r.clientHeight/4,n.step/2)),n.direction=l,r.scrollTo({top:Math.min(m,Math.max(0,r.scrollTop+l*n.step)),behavior:"auto"}),await t.frame()}}async function jt(t,e,i){const{scroller:n}=t,r=t.ids(),a=r.indexOf(e),c=Nt({index:a,count:r.length,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});if(Math.abs(c-n.scrollTop)<zt*n.clientHeight)return;const l=new Map(r.map((w,S)=>[w,S])),m=n.scrollHeight/Math.max(1,r.length),g=()=>Math.max(0,n.scrollHeight-n.clientHeight),M=async()=>{for(let w=0;w<Gt&&!i.aborted;w+=1)await t.frame()};n.scrollTo({top:c,behavior:"auto"}),await M();for(let w=0;w<Yt&&!i.aborted;w+=1){if(H(n,e))return;const S=Bt({rows:ht(n),indexOf:l,target:a,fallback:m,box:n.getBoundingClientRect()});if(S===0)return;if(S===void 0){await M();continue}const A=Math.min(g(),Math.max(0,n.scrollTop+S));if(A===n.scrollTop)return;n.scrollTo({top:A,behavior:"auto"}),await M()}}async function Wt(t,e,i){const{scroller:n}=t;await jt(t,e,i);const r={step:n.clientHeight,direction:0};for(let a=0;a<Kt&&!i.aborted;a+=1)if(await Vt(t,e,i,r),await Xt(t,e,i),H(n,e))return}async function Jt(t,e,i){const{scroller:n}=t,r=H(n,e);if(!r)return!1;const a=Lt({from:n.scrollTop,to:tt(n,r),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});a.start!==void 0&&(n.scrollTo({top:a.start,behavior:"auto"}),await t.frame());const c=async g=>{if(a.behavior==="auto")return n.scrollTo({top:g,behavior:"auto"}),!0;n.scrollTo({top:g,behavior:a.behavior});let M=Number.NaN,w=0;for(let S=0;S<Ft&&!i.aborted;S+=1){await t.frame();const A=n.scrollTop;if(w=A===M?w+1:0,M=A,w>=X)break}return!0};if(!await c(a.to)||a.behavior==="auto"||i.aborted)return!0;const l=H(n,e);if(!l)return!0;const m=Math.min(tt(n,l),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(m-n.scrollTop)>2&&await c(m),!0}const dt=["wheel","touchstart","pointerdown","keydown"];async function Qt(t,e,i){if(!t.ids().includes(e))return"none";gt(t.scroller);const n=new AbortController,r=()=>n.abort(),a=AbortSignal.any([i,n.signal]);for(const c of dt)t.scroller.addEventListener(c,r,{passive:!0});try{for(let c=0;c<Ut;c+=1){if(!H(t.scroller,e)&&(await Wt(t,e,a),a.aborted))return"aborted";if(!await Jt(t,e,a))return"none";if(a.aborted)return"aborted";const l=H(t.scroller,e);if(l&&Math.abs(tt(t.scroller,l)-t.scroller.scrollTop)<=2)break}return a.aborted?"aborted":"done"}finally{for(const c of dt)t.scroller.removeEventListener(c,r)}}const Zt=8,te=2,ee="calc(100vh - 18rem)",ut=200,ne=1500,mt=10,oe=20,bt="User message",wt=t=>t.replace(/\s+/g," ").trim();function re(t){const e=t.metadata?.displayText,i=wt(typeof e=="string"&&e?e:t.text??"");return i?i.length>ut?`${i.slice(0,ut)}…`:i:bt}function ie(t){return wt(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}const ae="peerMessage",xt=t=>t.type==="user"&&t.metadata?.[ae]===void 0;function se(t,e){const i=[];for(const n of t)xt(n)&&!(e&&n.id>=e)&&i.push(n.id);return i}function le(t){const e=(t.content??[]).flatMap(i=>i.type==="text"&&i.text?[i.text]:[]).join(`
`);return(e.trim()?ie(e.slice(0,ne)):"")||void 0}function ce(t,e,i){const n=[];for(let r=0;r<t.length;r+=1){const a=t[r];if(!xt(a)||e&&a.id>=e||i&&a.id<i)continue;let c;for(let g=r+1;g<t.length&&t[g].type!=="user";g+=1)t[g].type==="assistant"&&(c=t[g]);const l=c;let m=null;n.push({id:a.id,title:re(a),get snippet(){return m===null&&(m=l?le(l):void 0),m}})}return n}function de(t,e,i=!0){if(e.length===0)return;if(!t)return{from:e[Math.max(0,e.length-mt)],loaded:e};const n=t.loaded[0],r=!i||n===void 0?0:e.indexOf(n),a=e.indexOf(t.from),c=a!==-1?a:e.findIndex(l=>l>t.from);return c===-1?{from:e[Math.max(0,e.length-mt)],loaded:e}:{from:e[Math.max(0,c-(r>0?Math.min(r,oe):0))],loaded:e}}function ue(t){return`max(0px, min(${Math.max(1,(t-1)*Zt)}px, ${ee}))`}function ft(t,e){return e>1?t/(e-1)*100:0}function me(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}const fe=2,yt=1e7,pe=120;function he(t){return`${yt}px 0px ${-(t.contentBottom-t.line)}px 0px`}function ve(t){return`${yt}px 0px ${fe-t}px 0px`}function ge(t,e){const i=new Map;let n,r,a,c="",l,m=0,g=!1,M=null,w,S=!1;const A=v=>{const h=v.matches("[data-message-id]")?v:v.querySelector("[data-message-id]");return h instanceof HTMLElement&&h.dataset.messageId?{owner:h.dataset.messageId,prompt:h.dataset.timelineRow==="UserMessage"}:void 0},Y=v=>{for(const h of v){if(!h.target.isConnected)continue;const y=i.get(h.target),x=A(h.target);i.set(h.target,{owner:x?.owner??y?.owner,prompt:x?.prompt??y?.prompt??!1,reached:h.isIntersecting})}e()},G=()=>{const v=t.getBoundingClientRect(),h=getComputedStyle(t),y=v.top+t.clientTop+t.clientHeight-(parseFloat(h.paddingBottom)||0),x=v.top+(M?.offsetHeight??0)+Pt;return he({contentBottom:y,line:x})},V=()=>{if(r?.disconnect(),r=void 0,!(!n||typeof IntersectionObserver!="function")){r=new IntersectionObserver(Y,{root:t,rootMargin:c,threshold:0});for(const v of n.children)r.observe(v)}},j=v=>{const h=v.at(-1);if(!h?.rootBounds)return;const y=h.boundingClientRect.bottom<=h.rootBounds.bottom;y!==g&&(g=y,e())},W=()=>{a?.disconnect(),a=void 0,!(!n||l===void 0||typeof IntersectionObserver!="function")&&(a=new IntersectionObserver(j,{root:t,rootMargin:ve(l),threshold:1}),a.observe(n))},B=()=>{if(m=t.scrollHeight-t.clientHeight,!n)return;const v=t.scrollHeight-(n.getBoundingClientRect().bottom-t.getBoundingClientRect().top-t.clientTop+t.scrollTop);l!==void 0&&Math.abs(v-l)<.5||(l=v,W())},_=new ResizeObserver(v=>{if(n&&!n.isConnected){L();return}const h=c,y=m;B(),(!c||v.some(x=>x.target===t||x.target===M))&&(c=G()),c!==h&&V(),(c!==h||m!==y)&&e()}),I=new MutationObserver(v=>{for(const h of v){for(const y of h.removedNodes)y instanceof Element&&r?.unobserve(y),i.delete(y);for(const y of h.addedNodes)y instanceof Element&&r?.observe(y)}e()}),L=(v=pe)=>{if(w=void 0,S)return;const h=t.querySelector("[data-timeline-key]")?.parentElement??void 0;if(!h){v>0&&(w=requestAnimationFrame(()=>L(v-1)));return}h===n&&h.isConnected||(I.disconnect(),_.disconnect(),i.clear(),l=void 0,g=!1,n=h,M=t.querySelector("[data-session-title]"),I.observe(n,{childList:!0}),c="",_.observe(t),_.observe(n),M&&_.observe(M),e())};return L(),{active(v){const h=[];for(const y of n?.children??[]){const x=i.get(y);if(!x||x.reached===void 0)continue;const q=x.owner?void 0:A(y);q&&(x.owner=q.owner,x.prompt=q.prompt),x.owner&&h.push({owner:x.owner,prompt:x.prompt,top:x.reached?Number.NEGATIVE_INFINITY:Number.POSITIVE_INFINITY,bottom:0})}return Ot(v,h,0,{top:g?m:0,max:m})},rescan:()=>{w===void 0&&L()},stop(){S=!0,w!==void 0&&cancelAnimationFrame(w),r?.disconnect(),a?.disconnect(),I.disconnect(),_.disconnect()}}}var be=d.template("<span>"),we=d.template("<span style=display:contents>"),xe=d.template("<div data-timeline-rail><div data-timeline-rail-body><button type=button data-timeline-rail-strip>"),ye=d.template("<span data-timeline-rail-tick aria-hidden=true>"),Me=d.template("<span data-timeline-rail-card-snippet dir=auto>"),Ee=d.template("<span data-timeline-rail-card><span data-timeline-rail-card-body role=tooltip><span data-timeline-rail-card-title dir=auto>");const Mt=12,Te=40,Se=48,Ie=14,ke="(min-width: 768px)",Ce=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,Ae=()=>new Promise(t=>requestAnimationFrame(()=>t()));function $e(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function Et(t,e){const i=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),r=n instanceof HTMLElement?n.getBoundingClientRect():i,a=t.querySelector("[data-timeline-row][data-message-id]"),c=a instanceof HTMLElement?a.getBoundingClientRect().left:i.left+Math.max(0,(i.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||i.width))/2),l=Math.max(0,c-i.left),m=vt(t);return{top:r.top-i.top+m,height:Math.max(0,i.bottom-r.top-m),hit:Math.max(0,Math.min(Te,Math.floor(l)-Mt)),persistent:l>=Se}}const pt=t=>t?.closest?.("[data-timeline-rail-card]")!=null;function Re(t){const[e,i]=b.createSignal(),n=()=>e()?.root,r=()=>e()?.parent,[a,c]=b.createSignal(),[l,m]=b.createSignal(-1),[g,M]=b.createSignal(!0),w=()=>t.input.session,S=()=>w().server.data.session,A=()=>S().message.list(w().id),Y=()=>S().get(w().id)?.revert?.messageID,G=b.createMemo(()=>se(A(),Y())),[V,j]=b.createSignal(),W=b.createMemo(o=>{const s=w().id;return{id:s,window:de(o?.id===s?o.window:void 0,G(),V()===s)}}),B=b.createMemo(()=>{const o=W().window?.from;return o?ce(A(),Y(),o):[]}),_=b.createMemo(()=>B().map(o=>o.id),[],{equals:(o,s)=>o.length===s.length&&o.every((u,p)=>u===s[p])}),I=()=>B().length;let L,v;const h=o=>{v=void 0;const s=L?.closest("[data-scrollable]"),u=s&&$e(s);s&&u?i({root:s,parent:u}):o>0&&(v=requestAnimationFrame(()=>h(o-1)))};b.onMount(()=>h(10)),b.onCleanup(()=>{v!==void 0&&cancelAnimationFrame(v)}),b.onMount(()=>{if(typeof window.matchMedia!="function")return;const o=window.matchMedia(ke),s=()=>M(o.matches);s(),o.addEventListener("change",s),b.onCleanup(()=>o.removeEventListener("change",s))}),N.createKeyed(n,o=>{const s=()=>j(w().id),u=["wheel","touchmove","pointerdown","keydown"];for(const p of u)o.addEventListener(p,s,{passive:!0});b.onCleanup(()=>{for(const p of u)o.removeEventListener(p,s)})});const y=()=>{const o=n();if(o)return{scroller:o,ids:G,reducedMotion:Ce,frame:Ae}};let x;const q=()=>{x=void 0;const o=n(),s=r();if(!t.input.active||!o||!s)return;const u=Et(o,s);c(p=>p&&p.top===u.top&&p.height===u.height&&p.hit===u.hit&&p.persistent===u.persistent?p:u)},J=()=>{x===void 0&&(x=requestAnimationFrame(q))};b.onCleanup(()=>{x!==void 0&&cancelAnimationFrame(x)}),N.createKeyed(e,({parent:o})=>{const s=typeof ResizeObserver=="function"?new ResizeObserver(J):void 0;s?.observe(o);const u=o.querySelector("[data-slot='session-timeline-visible']");u&&s?.observe(u),J(),b.onCleanup(()=>s?.disconnect())});let F;N.createKeyed(()=>t.input.active&&g()?n():void 0,o=>{let s=!1;const u=ge(o,()=>{s&&m(u.active(_()))});s=!0,F=u,m(u.active(_())),b.onCleanup(()=>{u.stop(),F===u&&(F=void 0)})}),N.createKeyed(()=>t.input.active&&g()?_():void 0,o=>{J(),F?.rescan(),m(F?.active(o)??-1)});let D;const Tt=o=>{const s=_()[o],u=y();if(!s||!u||!t.input.active)return;D?.abort();const p=new AbortController;D=p,Qt(u,s,p.signal).finally(()=>{D===p&&(D=void 0)})};b.onCleanup(()=>D?.abort());const[C,K]=b.createSignal(),[St,It]=b.createSignal(!1),[et,nt]=b.createSignal(!1),Q=()=>{const o=C();return o===void 0||o>=I()?void 0:B()[o]},kt=()=>Q()?.title??bt;let U;const Z=o=>{o!==void 0&&o>=0&&o<I()&&Tt(o)},ot=o=>{if(!U)return null;const s=U.getBoundingClientRect();return me({count:I(),top:s.top,height:s.height,y:o.clientY})};let z=!1;const rt=o=>{const s=p=>{p.buttons===0&&(u(),o())},u=()=>{window.removeEventListener("pointerup",s),window.removeEventListener("pointermove",s)};window.addEventListener("pointerup",s),window.addEventListener("pointermove",s)},Ct=o=>{const s=n();!s||o.defaultPrevented||o.ctrlKey||o.deltaY===0||(o.preventDefault(),gt(s),s.scrollBy({top:o.deltaY,left:o.deltaX}))},At=o=>{const s=I()-1;if(o.key==="Enter"||o.key===" "){o.preventDefault(),Z(C());return}const u=C()??0,p=o.key==="ArrowDown"?Math.min(s,u+1):o.key==="ArrowUp"?Math.max(0,u-1):o.key==="Home"?0:o.key==="End"?s:-1;p!==-1&&(o.preventDefault(),K(p))},$t=()=>{const o=a();return{top:`${o?.top??0}px`,height:`${o?.height??0}px`}},Rt=o=>{l()>=0&&Z(l()+o)},it=o=>{const s=o==="previous",u=s?"Previous turn":"Next turn";return(()=>{var p=be();return d.setAttribute(p,"data-timeline-rail-turn",o),d.insert(p,d.createComponent(t.ui.Tooltip,{value:u,placement:s?"top":"bottom",get children(){return d.createComponent(t.ui.IconButton,{icon:"chevron-down",label:u,size:"small",variant:"ghost-muted",get disabled(){return s?l()<=0:l()<0||l()>=I()-1},onClick:()=>Rt(s?-1:1)})}})),p})()},_t=o=>o===0?"0%":o===I()-1?"-100%":"-50%";return(()=>{var o=we();return d.use(s=>L=s,o),d.insert(o,d.createComponent(b.Show,{get when(){return d.memo(()=>!!(t.input.active&&g()&&I()>=te&&(a()?.hit??0)>0))()&&r()},children:s=>d.createComponent(d.Portal,{get mount(){return s()},ref:u=>u.style.display="contents",get children(){var u=xe(),p=u.firstChild,k=p.firstChild;d.use(f=>{f.addEventListener("wheel",Ct,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>It(!0)))},u),p.$$pointermove=f=>{f.buttons===0||z||et()||(nt(!0),rt(()=>nt(!1)))},p.$$pointerdown=()=>{z||(z=!0,rt(()=>z=!1))},d.insert(p,()=>it("previous"),k),k.$$keydown=At,k.addEventListener("blur",()=>K(void 0)),k.addEventListener("focus",()=>{C()===void 0&&K(Math.max(0,l()))}),k.$$click=f=>{pt(f.target)||f.detail===0||(Z(C()??ot(f)??void 0),f.currentTarget.blur())},k.addEventListener("pointerleave",()=>K(void 0)),k.$$pointermove=f=>{if(f.pointerType==="touch"||f.buttons!==0&&!z)return;const E=ot(f);E!==null&&E!==C()&&K(E)},k.$$mousedown=f=>{pt(f.target)||f.preventDefault()};var at=U;return typeof at=="function"?d.use(at,k):U=k,d.insert(k,d.createComponent(b.Index,{get each(){return B()},children:(f,E)=>(()=>{var $=ye();return d.setAttribute($,"data-index",E),d.effect(R=>{var T=C()!==void 0&&Math.abs(E-C())<=2?Math.abs(E-C()):void 0,P=E===l()||E===C()?"":void 0,O=`${ft(E,I())}%`;return T!==R.e&&d.setAttribute($,"data-d",R.e=T),P!==R.t&&d.setAttribute($,"data-active",R.t=P),O!==R.a&&d.setStyleProperty($,"top",R.a=O),R},{e:void 0,t:void 0,a:void 0}),$})()}),null),d.insert(k,d.createComponent(b.Show,{get when(){return Q()},children:f=>(()=>{var E=Ee(),$=E.firstChild,R=$.firstChild;return E.$$pointermove=T=>T.stopPropagation(),d.insert(R,()=>f().title),d.insert($,d.createComponent(b.Show,{get when(){return f().snippet},get children(){var T=Me();return d.insert(T,()=>f().snippet),T}}),null),d.effect(T=>{var P=`${ft(C(),I())}%`,O=`translateY(${_t(C())})`;return P!==T.e&&d.setStyleProperty(E,"top",T.e=P),O!==T.t&&d.setStyleProperty(E,"transform",T.t=O),T},{e:void 0,t:void 0}),E})()}),null),d.insert(p,()=>it("next"),null),d.effect(f=>{var E=a()?.persistent?"":void 0,$=St()?"":void 0,R=$t(),T=(a()?.hit??0)>=Ie?"":void 0,P=et()?"":void 0,O=ue(I()),st=Q()?"22rem":`${a()?.hit??0}px`,lt=`Jump to message: ${kt()}`;return E!==f.e&&d.setAttribute(u,"data-persistent",f.e=E),$!==f.t&&d.setAttribute(u,"data-armed",f.t=$),f.a=d.style(u,R,f.a),T!==f.o&&d.setAttribute(p,"data-navigation",f.o=T),P!==f.i&&d.setAttribute(p,"data-pass",f.i=P),O!==f.n&&d.setStyleProperty(p,"--timeline-rail-height",f.n=O),st!==f.s&&d.setStyleProperty(p,"width",f.s=st),lt!==f.h&&d.setAttribute(k,"aria-label",f.h=lt),f},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),u}})})),o})()}const _e=`
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
  margin-left: ${Mt}px;
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
`,Pe=N.Plugin.define({setup(t){t.add(N.Style,_e),t.add(N.Slot,{at:"session.header",render:e=>d.createComponent(Re,{input:e,get ui(){return t.ui}})})}});d.delegateEvents(["pointerdown","pointermove","mousedown","click","keydown"]);exports.default=Pe;exports.measure=Et;
