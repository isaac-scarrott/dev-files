"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const l=require("solid-js/web"),_=require("@opencode/plugin/gui"),g=require("solid-js"),Lt=8,lt=2;function Ot(t,e,a,n){const r=t.length-1;if(r<0)return-1;if(n.max<=lt||n.max-n.top<=lt)return r;let i;for(const y of e){if(y.top>a)break;i=y}const u=i??e[0];if(!u)return 0;const c=t.indexOf(u.owner),p=c!==-1?c:t.findIndex(y=>y>u.owner),h=c!==-1?c:p===-1?r:p-1;return Math.min(r,Math.max(0,!i&&u.prompt&&c!==-1?c-1:h))}function Nt(t,e,a){const n=t.filter(c=>c.bottom>a.top&&c.top<a.bottom),r=n.length?n:t,i=r[0],u=r.at(-1);return!i||i.owner>=e?-1:u&&u.owner<e?1:0}function qt(t){const e=Math.min(Math.max(0,t.to),Math.max(0,t.max));if(t.reduced)return{to:e,behavior:"auto"};if(Math.abs(e-t.from)<=t.viewport*2)return{to:e,behavior:"smooth"};const a=t.from>e?Math.min(t.max,e+t.viewport):Math.max(0,e-t.viewport);return{to:e,start:a,behavior:"smooth"}}function Ft(t){const e=Math.max(0,t.scrollHeight-t.clientHeight);return Math.min(e,Math.max(0,Math.round(t.index/Math.max(1,t.count)*t.scrollHeight)))}function Bt(t){let e=Number.POSITIVE_INFINITY,a=-1;for(const p of t.rows){if(p.bottom<=t.box.top||p.top>=t.box.bottom)continue;const h=t.indexOf.get(p.owner);h!==void 0&&(e=Math.min(e,h),a=Math.max(a,h))}if(a===-1)return;if(t.target>=e&&t.target<=a)return 0;const n=t.rows.flatMap(p=>{const h=p.prompt?t.indexOf.get(p.owner):void 0;return h===void 0?[]:[{index:h,top:p.top}]}),r=n[0],i=n.at(-1),u=r&&i&&i.index>r.index?(i.top-r.top)/(i.index-r.index):0,c=u>0?u:t.fallback;return Math.round((t.target-(e+a)/2)*c)}const D=3,Dt=40,Kt=120,zt=200,Xt=3,Gt=20,Ut=24,Yt=2,Vt=4;function V(t){const e=t.querySelector("[data-timeline-key]")?.parentElement,a=[],n=r=>{const i=r.dataset.messageId;if(!i)return;const u=r.getBoundingClientRect();a.push({owner:i,prompt:r.dataset.timelineRow==="UserMessage",top:u.top,bottom:u.bottom})};if(!e){for(const r of t.querySelectorAll("[data-message-id]"))n(r);return a}for(const r of e.children){const i=r.matches("[data-message-id]")?r:r.querySelector("[data-message-id]");i&&n(i)}return a}function pt(t){const e=t.querySelector("[data-session-title]");return e instanceof HTMLElement?e.offsetHeight:0}function P(t,e){return[...t.querySelectorAll("[data-timeline-row='UserMessage'][data-message-id]")].find(a=>a.dataset.messageId===e)}function ht(t){t.dispatchEvent(new WheelEvent("wheel",{deltaY:-1,bubbles:!0,cancelable:!0}))}function Y(t,e){const a=e.getBoundingClientRect(),n=t.getBoundingClientRect();return Math.max(0,a.top-n.top+t.scrollTop-pt(t))}async function jt(t,e,a){let n=Number.NaN,r=0,i=0;for(let u=0;u<Dt&&!a.aborted;u+=1){await t.frame();const c=t.scroller.scrollTop,p=P(t.scroller,e);if(r=p&&c===n?r+1:0,i=p?0:i+1,n=c,r>=D||i>D)return}}async function Wt(t,e,a,n){const{scroller:r}=t;let i=0;for(let u=0;u<zt&&!a.aborted;u+=1){if(P(r,e))return;const c=Nt(V(r),e,r.getBoundingClientRect());if(c===0){if((i+=1)>D)return;await t.frame();continue}i=0;const p=Math.max(0,r.scrollHeight-r.clientHeight);if(c===-1&&r.scrollTop<=0||c===1&&r.scrollTop>=p)return;n.direction!==0&&c!==n.direction&&(n.step=Math.max(r.clientHeight/4,n.step/2)),n.direction=c,r.scrollTo({top:Math.min(p,Math.max(0,r.scrollTop+c*n.step)),behavior:"auto"}),await t.frame()}}async function Jt(t,e,a){const{scroller:n}=t,r=t.ids(),i=r.indexOf(e),u=Ft({index:i,count:r.length,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});if(Math.abs(u-n.scrollTop)<Gt*n.clientHeight)return;const c=new Map(r.map((b,M)=>[b,M])),p=n.scrollHeight/Math.max(1,r.length),h=()=>Math.max(0,n.scrollHeight-n.clientHeight),y=async()=>{for(let b=0;b<Yt&&!a.aborted;b+=1)await t.frame()};n.scrollTo({top:u,behavior:"auto"}),await y();for(let b=0;b<Ut&&!a.aborted;b+=1){if(P(n,e))return;const M=Bt({rows:V(n),indexOf:c,target:i,fallback:p,box:n.getBoundingClientRect()});if(M===0)return;if(M===void 0){await y();continue}const C=Math.min(h(),Math.max(0,n.scrollTop+M));if(C===n.scrollTop)return;n.scrollTo({top:C,behavior:"auto"}),await y()}}async function Qt(t,e,a){const{scroller:n}=t;await Jt(t,e,a);const r={step:n.clientHeight,direction:0};for(let i=0;i<Xt&&!a.aborted;i+=1)if(await Wt(t,e,a,r),await jt(t,e,a),P(n,e))return}async function Zt(t,e,a){const{scroller:n}=t,r=P(n,e);if(!r)return!1;const i=qt({from:n.scrollTop,to:Y(n,r),viewport:n.clientHeight,max:n.scrollHeight-n.clientHeight,reduced:t.reducedMotion()});i.start!==void 0&&(n.scrollTo({top:i.start,behavior:"auto"}),await t.frame());const u=async h=>{if(i.behavior==="auto")return n.scrollTo({top:h,behavior:"auto"}),!0;n.scrollTo({top:h,behavior:i.behavior});let y=Number.NaN,b=0;for(let M=0;M<Kt&&!a.aborted;M+=1){await t.frame();const C=n.scrollTop;if(b=C===y?b+1:0,y=C,b>=D)break}return!0};if(!await u(i.to)||i.behavior==="auto"||a.aborted)return!0;const c=P(n,e);if(!c)return!0;const p=Math.min(Y(n,c),Math.max(0,n.scrollHeight-n.clientHeight));return Math.abs(p-n.scrollTop)>2&&await u(p),!0}const ct=["wheel","touchstart","pointerdown","keydown"];async function te(t,e,a){if(!t.ids().includes(e))return"none";ht(t.scroller);const n=new AbortController,r=()=>n.abort(),i=AbortSignal.any([a,n.signal]);for(const u of ct)t.scroller.addEventListener(u,r,{passive:!0});try{for(let u=0;u<Vt;u+=1){if(!P(t.scroller,e)&&(await Qt(t,e,i),i.aborted))return"aborted";if(!await Zt(t,e,i))return"none";if(i.aborted)return"aborted";const c=P(t.scroller,e);if(c&&Math.abs(Y(t.scroller,c)-t.scroller.scrollTop)<=2)break}return i.aborted?"aborted":"done"}finally{for(const u of ct)t.scroller.removeEventListener(u,r)}}const ee=8,ne=2,oe="calc(100vh - 18rem)",dt=200,re=1500,ut=10,ie=20,vt="User message",gt=t=>t.replace(/\s+/g," ").trim();function ae(t){const e=t.metadata?.displayText,a=gt(typeof e=="string"&&e?e:t.text??"");return a?a.length>dt?`${a.slice(0,dt)}…`:a:vt}function se(t){return gt(t.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm,"").replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<[^>\n]+>/g,"").replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,"").replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,"").replace(/^[ \t]*>[ \t]?/gm,"").replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm,"").replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,"$2").replace(new RegExp("(?<![\\w*])(\\*|_)(?=\\S)([^*_\\n]*?\\S)\\1(?![\\w*])","g"),"$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g,"$1").replace(/`([^`\n]*)`/g,"$1").replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm,"").replace(/\|/g," "))}const le="peerMessage",bt=t=>t.type==="user"&&t.metadata?.[le]===void 0;function ce(t,e){const a=[];for(const n of t)bt(n)&&!(e&&n.id>=e)&&a.push(n.id);return a}function de(t,e,a){const n=[];for(let r=0;r<t.length;r+=1){const i=t[r];if(!bt(i)||e&&i.id>=e||a&&i.id<a)continue;let u;for(let h=r+1;h<t.length&&t[h].type!=="user";h+=1)t[h].type==="assistant"&&(u=t[h]);const c=u?(u.content??[]).flatMap(h=>h.type==="text"&&h.text?[h.text]:[]).join(`
`):"",p=c.trim()?se(c.slice(0,re)):"";n.push({id:i.id,title:ae(i),snippet:p||void 0})}return n}function ue(t,e,a=!0){if(e.length===0)return;if(!t)return{from:e[Math.max(0,e.length-ut)],loaded:e};const n=t.loaded[0],r=!a||n===void 0?0:e.indexOf(n),i=e.indexOf(t.from),u=i!==-1?i:e.findIndex(c=>c>t.from);return u===-1?{from:e[Math.max(0,e.length-ut)],loaded:e}:{from:e[Math.max(0,u-(r>0?Math.min(r,ie):0))],loaded:e}}function me(t){return`max(0px, min(${Math.max(1,(t-1)*ee)}px, ${oe}))`}function mt(t,e){return e>1?t/(e-1)*100:0}function fe(t){if(t.count<1)return null;if(t.count===1||t.height<=0)return 0;const e=Math.min(1,Math.max(0,(t.y-t.top)/t.height));return Math.round(e*(t.count-1))}var pe=l.template("<span>"),he=l.template("<span style=display:contents>"),ve=l.template("<div data-timeline-rail><div data-timeline-rail-body><button type=button data-timeline-rail-strip>"),ge=l.template("<span data-timeline-rail-tick aria-hidden=true>"),be=l.template("<span data-timeline-rail-card-snippet dir=auto>"),xe=l.template("<span data-timeline-rail-card><span data-timeline-rail-card-body role=tooltip><span data-timeline-rail-card-title dir=auto>");const xt=12,we=40,ye=48,Me=14,Se="(min-width: 768px)",Te=()=>typeof window<"u"&&typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)").matches:!1,Ee=()=>new Promise(t=>requestAnimationFrame(()=>t()));function ke(t){return t.closest("[data-slot='session-timeline-scroll']")?.parentElement??void 0}function wt(t,e){const a=e.getBoundingClientRect(),n=e.querySelector("[data-slot='session-timeline-visible']"),r=n instanceof HTMLElement?n.getBoundingClientRect():a,i=t.querySelector("[data-timeline-row][data-message-id]"),u=i instanceof HTMLElement?i.getBoundingClientRect().left:a.left+Math.max(0,(a.width-(parseFloat(window.getComputedStyle(e).getPropertyValue("--container-session"))||a.width))/2),c=Math.max(0,u-a.left),p=pt(t);return{top:r.top-a.top+p,height:Math.max(0,a.bottom-r.top-p),hit:Math.max(0,Math.min(we,Math.floor(c)-xt)),persistent:c>=ye}}const ft=t=>t?.closest?.("[data-timeline-rail-card]")!=null;function Ce(t){const[e,a]=g.createSignal(),n=()=>e()?.root,r=()=>e()?.parent,[i,u]=g.createSignal(),[c,p]=g.createSignal(-1),[h,y]=g.createSignal(!0),b=()=>t.input.session,M=()=>b().server.data.session,C=()=>M().message.list(b().id),j=()=>M().get(b().id)?.revert?.messageID,W=g.createMemo(()=>ce(C(),j())),[yt,Mt]=g.createSignal(),St=g.createMemo(o=>{const s=b().id;return{id:s,window:ue(o?.id===s?o.window:void 0,W(),yt()===s)}}),N=g.createMemo(()=>{const o=St().window?.from;return o?de(C(),j(),o):[]}),K=g.createMemo(()=>N().map(o=>o.id),[],{equals:(o,s)=>o.length===s.length&&o.every((m,f)=>m===s[f])}),E=()=>N().length;let J,q;const Q=o=>{q=void 0;const s=J?.closest("[data-scrollable]"),m=s&&ke(s);s&&m?a({root:s,parent:m}):o>0&&(q=requestAnimationFrame(()=>Q(o-1)))};g.onMount(()=>Q(10)),g.onCleanup(()=>{q!==void 0&&cancelAnimationFrame(q)}),g.onMount(()=>{if(typeof window.matchMedia!="function")return;const o=window.matchMedia(Se),s=()=>y(o.matches);s(),o.addEventListener("change",s),g.onCleanup(()=>o.removeEventListener("change",s))}),_.createKeyed(n,o=>{const s=()=>Mt(b().id),m=["wheel","touchmove","pointerdown","keydown"];for(const f of m)o.addEventListener(f,s,{passive:!0});g.onCleanup(()=>{for(const f of m)o.removeEventListener(f,s)})});const Tt=()=>{const o=n();if(o)return{scroller:o,ids:W,reducedMotion:Te,frame:Ee}};let $,z=!1,X;const Et=()=>{$=void 0;const o=z;z=!1;const s=n(),m=r();if(!t.input.active||!s||!m)return;const f=V(s),w=s.getBoundingClientRect();X?.isConnected||(X=s.querySelector("[data-session-title]"));const B=w.top+(X?.offsetHeight??0)+Lt,d=o||!i()?wt(s,m):void 0;p(Ot(K(),f,B,{top:s.scrollTop,max:s.scrollHeight-s.clientHeight})),d&&u(v=>v&&v.top===d.top&&v.height===d.height&&v.hit===d.hit&&v.persistent===d.persistent?v:d)},R=o=>{z||=o,$===void 0&&($=requestAnimationFrame(Et))},Z=()=>R(!1);g.onCleanup(()=>{$!==void 0&&cancelAnimationFrame($)}),_.createKeyed(e,({root:o,parent:s})=>{o.addEventListener("scroll",Z,{passive:!0});const m=typeof ResizeObserver=="function"?new ResizeObserver(()=>R(!0)):void 0;m?.observe(s);const f=s.querySelector("[data-slot='session-timeline-visible']");f&&m?.observe(f),R(!0),g.onCleanup(()=>{o.removeEventListener("scroll",Z),m?.disconnect()})}),_.createKeyed(()=>t.input.active&&h()?K():void 0,()=>R(!0));let H;const kt=o=>{const s=K()[o],m=Tt();if(!s||!m||!t.input.active)return;H?.abort();const f=new AbortController;H=f,te(m,s,f.signal).finally(()=>{H===f&&(H=void 0),R(!1)})};g.onCleanup(()=>H?.abort());const[k,L]=g.createSignal(),[Ct,At]=g.createSignal(!1),[tt,et]=g.createSignal(!1),G=()=>{const o=k();return o===void 0||o>=E()?void 0:N()[o]},nt=()=>k()??c(),It=()=>G()?.title??vt;let F;const U=o=>{o!==void 0&&o>=0&&o<E()&&kt(o)},ot=o=>{if(!F)return null;const s=F.getBoundingClientRect();return fe({count:E(),top:s.top,height:s.height,y:o.clientY})};let O=!1;const rt=o=>{const s=f=>{f.buttons===0&&(m(),o())},m=()=>{window.removeEventListener("pointerup",s),window.removeEventListener("pointermove",s)};window.addEventListener("pointerup",s),window.addEventListener("pointermove",s)},Pt=o=>{const s=n();!s||o.defaultPrevented||o.ctrlKey||o.deltaY===0||(o.preventDefault(),ht(s),s.scrollBy({top:o.deltaY,left:o.deltaX}))},_t=o=>{const s=E()-1;if(o.key==="Enter"||o.key===" "){o.preventDefault(),U(k());return}const m=k()??0,f=o.key==="ArrowDown"?Math.min(s,m+1):o.key==="ArrowUp"?Math.max(0,m-1):o.key==="Home"?0:o.key==="End"?s:-1;f!==-1&&(o.preventDefault(),L(f))},$t=()=>{const o=i();return{top:`${o?.top??0}px`,height:`${o?.height??0}px`}},Rt=o=>{c()>=0&&U(c()+o)},it=o=>{const s=o==="previous",m=s?"Previous turn":"Next turn";return l.createComponent(t.ui.Tooltip,{value:m,placement:s?"top":"bottom",get children(){var f=pe();return l.setAttribute(f,"data-timeline-rail-turn",o),l.insert(f,l.createComponent(t.ui.IconButton,{icon:"chevron-down",label:m,size:"small",variant:"ghost-muted",get disabled(){return s?c()<=0:c()<0||c()>=E()-1},onClick:()=>Rt(s?-1:1)})),f}})},Ht=o=>o===0?"0%":o===E()-1?"-100%":"-50%";return(()=>{var o=he();return l.use(s=>J=s,o),l.insert(o,l.createComponent(g.Show,{get when(){return l.memo(()=>!!(t.input.active&&h()&&E()>=ne&&(i()?.hit??0)>0))()&&r()},children:s=>l.createComponent(l.Portal,{get mount(){return s()},ref:m=>m.style.display="contents",get children(){var m=ve(),f=m.firstChild,w=f.firstChild;l.use(d=>{d.addEventListener("wheel",Pt,{passive:!1}),requestAnimationFrame(()=>requestAnimationFrame(()=>At(!0)))},m),f.$$pointermove=d=>{d.buttons===0||O||tt()||(et(!0),rt(()=>et(!1)))},f.$$pointerdown=()=>{O||(O=!0,rt(()=>O=!1))},l.insert(f,()=>it("previous"),w),w.$$keydown=_t,w.addEventListener("blur",()=>L(void 0)),w.addEventListener("focus",()=>{k()===void 0&&L(Math.max(0,c()))}),w.$$click=d=>{ft(d.target)||d.detail===0||(U(k()??ot(d)??void 0),d.currentTarget.blur())},w.addEventListener("pointerleave",()=>L(void 0)),w.$$pointermove=d=>{if(d.pointerType==="touch"||d.buttons!==0&&!O)return;const v=ot(d);v!==null&&v!==k()&&L(v)},w.$$mousedown=d=>{ft(d.target)||d.preventDefault()};var B=F;return typeof B=="function"?l.use(B,w):F=w,l.insert(w,l.createComponent(g.Index,{get each(){return N()},children:(d,v)=>(()=>{var S=ge();return l.setAttribute(S,"data-index",v),l.effect(T=>{var x=Math.abs(v-nt())<=2?Math.abs(v-nt()):void 0,A=v===c()?"":void 0,I=`${mt(v,E())}%`;return x!==T.e&&l.setAttribute(S,"data-d",T.e=x),A!==T.t&&l.setAttribute(S,"data-active",T.t=A),I!==T.a&&l.setStyleProperty(S,"top",T.a=I),T},{e:void 0,t:void 0,a:void 0}),S})()}),null),l.insert(w,l.createComponent(g.Show,{get when(){return G()},children:d=>(()=>{var v=xe(),S=v.firstChild,T=S.firstChild;return v.$$pointermove=x=>x.stopPropagation(),l.insert(T,()=>d().title),l.insert(S,l.createComponent(g.Show,{get when(){return d().snippet},get children(){var x=be();return l.insert(x,()=>d().snippet),x}}),null),l.effect(x=>{var A=`${mt(k(),E())}%`,I=`translateY(${Ht(k())})`;return A!==x.e&&l.setStyleProperty(v,"top",x.e=A),I!==x.t&&l.setStyleProperty(v,"transform",x.t=I),x},{e:void 0,t:void 0}),v})()}),null),l.insert(f,()=>it("next"),null),l.effect(d=>{var v=i()?.persistent?"":void 0,S=Ct()?"":void 0,T=$t(),x=(i()?.hit??0)>=Me?"":void 0,A=tt()?"":void 0,I=me(E()),at=G()?"22rem":`${i()?.hit??0}px`,st=`Jump to message: ${It()}`;return v!==d.e&&l.setAttribute(m,"data-persistent",d.e=v),S!==d.t&&l.setAttribute(m,"data-armed",d.t=S),d.a=l.style(m,T,d.a),x!==d.o&&l.setAttribute(f,"data-navigation",d.o=x),A!==d.i&&l.setAttribute(f,"data-pass",d.i=A),I!==d.n&&l.setStyleProperty(f,"--timeline-rail-height",d.n=I),at!==d.s&&l.setStyleProperty(f,"width",d.s=at),st!==d.h&&l.setAttribute(w,"aria-label",d.h=st),d},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),m}})})),o})()}const Ae=`
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
  margin-left: ${xt}px;
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
`,Ie=_.Plugin.define({setup(t){t.add(_.Style,Ae),t.add(_.Slot,{at:"session.header",render:e=>l.createComponent(Ce,{input:e,get ui(){return t.ui}})})}});l.delegateEvents(["pointerdown","pointermove","mousedown","click","keydown"]);exports.default=Ie;exports.measure=wt;
