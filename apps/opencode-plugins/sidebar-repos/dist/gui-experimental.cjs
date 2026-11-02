"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const S=require("@opencode/plugin/gui"),D=require("solid-js"),J=require("solid-js/web"),I=6e4,F=60*I,q=24*F,_=7*q,B=30*q;function Y(e,n){const i=Math.max(0,n-e);return i<I?"now":i<F?`${Math.floor(i/I)}m`:i<q?`${Math.floor(i/F)}h`:i<_?`${Math.floor(i/q)}d`:i<B?`${Math.floor(i/_)}w`:i<365*q?`${Math.floor(i/B)}mo`:`${Math.floor(i/(365*q))}y`}function H(e,n){return new Date(e).toLocaleString(n,{dateStyle:"medium",timeStyle:"long"})}function G(e,n){for(let i=(e?.length??0)-1;i>=0;i--){const s=e[i];if(s.type!=="user"&&s.type!=="assistant")continue;const o=s.time?.completed??s.time?.created;if(o!==void 0&&Number.isFinite(o))return o}return n!==void 0&&Number.isFinite(n)?n:void 0}const Q=3e4;function X(e,n){let i;const s=()=>{i!==void 0&&(e.clearInterval(i),i=void 0)},o=()=>{if(!e.visible())return s();i===void 0&&(i=e.setInterval(n,Q))};return o(),{wake(){o(),e.visible()&&n()},dispose:s}}const M="data-sidebar-active-at",N="[data-titlebar-tab][data-orientation='vertical']",Z="[data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention]",tt=e=>e.matches(Z),W=e=>{const n=Number(e.getAttribute(M));return e.hasAttribute(M)&&Number.isFinite(n)?n:void 0};function et(e,n){for(const i of e.querySelectorAll(N)){const s=i.closest("[data-tab-key]")?.getAttribute("data-tab-key");if(s==null)continue;const o=n.get(s);o===void 0?i.removeAttribute(M):i.getAttribute(M)!==String(o)&&i.setAttribute(M,String(o))}}const at=e=>{const n=e?W(e):void 0;return n===void 0?void 0:`Last active ${H(n)}`};function it(e,n,i){for(const s of e.querySelectorAll(N)){const o=W(s),l=s.querySelector(":scope > [data-slot='tab-close']"),c=l?.querySelector(":scope > [data-sidebar-time]");if(!l||o===void 0||tt(s)){c?.remove(),s.removeAttribute("data-sidebar-time-shown"),s.style.removeProperty("--sidebar-time-width");continue}const d=c??e.createElement("span");c||(d.setAttribute("data-sidebar-time",""),d.setAttribute("aria-hidden","true"),l.prepend(d));const u=Y(o,n);d.textContent!==u&&(d.textContent=u);const m=H(o);d.title!==m&&(d.title=m),s.hasAttribute("data-sidebar-time-shown")||s.setAttribute("data-sidebar-time-shown","");const f=`${Math.ceil(i(u))}px`;s.style.getPropertyValue("--sidebar-time-width")!==f&&s.style.setProperty("--sidebar-time-width",f)}}function nt(e){e.querySelectorAll("[data-sidebar-time]").forEach(n=>n.remove()),e.querySelectorAll("[data-sidebar-time-shown]").forEach(n=>{n.removeAttribute("data-sidebar-time-shown"),n.style.removeProperty("--sidebar-time-width")}),e.querySelectorAll(`[data-tab-key] ${N}`).forEach(n=>n.removeAttribute(M))}function st(e){return e.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??""}function ot(e,n,i,s=.75){if(n<0||i(e)<=n)return e;let o="…",l=0,c=e.length-1;for(;l<=c;){const d=Math.floor((l+c)/2),u=Math.ceil(d*s),m=e.slice(0,u)+"…"+e.slice(e.length-(d-u));i(m)<=n?(o=m,l=d+1):c=d-1}return o}function rt(e,n){return(e?.length??0)>0?"permission":(n?.length??0)>0?"question":void 0}function dt(e,n,i,s=new Map,o){for(const l of e.querySelectorAll("[data-tab-key]")){const c=l.querySelector("[data-slot='tab-title']"),d=l.querySelector("[data-sidebar-repo]"),u=l.getAttribute("data-tab-key")??"",m=n.get(u),f=l.querySelector("[data-titlebar-tab]")??l,w=f.querySelector("[data-slot='tab-status']");if(w){for(const g of["permission","question"]){let y=w.querySelector(`[data-sidebar-status-icon='${g}']`);y||(y=e.createElement("span"),y.setAttribute("data-sidebar-status-icon",g),o?.(y,g),w.append(y))}const x=s.get(u);x?f.setAttribute("data-sidebar-attention",x):f.removeAttribute("data-sidebar-attention")}if(!c||!m||l.getAttribute("data-orientation")!=="vertical"){d?.remove();continue}const p=d??e.createElement("span");d||(p.setAttribute("data-sidebar-repo",""),c.before(p));const v=i?.(p,m)??m;p.textContent!==v&&(p.textContent=v);const h=at(f),k=h?`${m}
${h}`:m;p.title!==k&&(p.title=k)}}const lt=S.Plugin.define({setup(e){e.add(S.Style,`
      [data-titlebar-tab][data-orientation='vertical']:has([data-sidebar-repo]) {
        height: 52px;
        padding-block: 5px;
      }
      [data-slot='tab-link']:has(> [data-sidebar-repo]) {
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr);
        grid-template-rows: 14px 16px;
        column-gap: 5px;
        row-gap: 6px;
        align-content: center;
      }
      [data-slot='tab-link']:has(> [data-sidebar-repo]) > [data-slot='project-avatar-slot'] {
        grid-column: 1;
        grid-row: 1;
        width: 14px;
        height: 14px;
      }
      [data-slot='tab-link']:has(> [data-sidebar-repo]) > [data-slot='project-avatar-slot'] > * {
        max-width: 14px;
        max-height: 14px;
      }
      [data-slot='tab-link'] > [data-sidebar-repo] {
        grid-column: 2;
        grid-row: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--v2-text-text-muted);
        font-size: 11px;
        line-height: 14px;
        font-weight: 400;
      }
      [data-slot='tab-link']:has(> [data-sidebar-repo]) > [data-slot='tab-title'] {
        grid-column: 1 / -1;
        grid-row: 2;
        width: 100%;
        font-size: 13px;
        line-height: 16px;
      }
      [data-titlebar-tab-list][data-orientation='vertical'] {
        gap: 4px;
      }
      /* Home lives on its keybind; the sidebar row is redundant. */
      [data-action='vertical-tabs-home'] {
        display: none !important;
      }
      /* The native list fade masks the status mark too. */
      [data-slot='vertical-tabs-scroll'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      /*
       * Text yields to whatever sits at the row's trailing edge (a status mark, a time, or the close button on hover) through
       * one mask on the full-height link, so the badge and title lines fade as a single band. The marks live outside
       * the link and are never masked. Same shape as the native link mask: 16px ramp, clear from --sidebar-fade in
       * (24px mark + 6px gap); idle rows keep no fade. Not animated, like the native one.
       */
      [data-titlebar-tab][data-orientation='vertical'] {
        --sidebar-fade: 30px;
      }
      /* The archive action sits left of the close button: 30px in, 20px wide. */
      [data-titlebar-tab-slot]:has(> [data-sa-actions]) [data-titlebar-tab][data-orientation='vertical']:is(:hover, :focus-within) {
        --sidebar-fade: 56px;
      }
      [data-titlebar-tab][data-orientation='vertical'] [data-slot='tab-link'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      /*
       * Last activity, in the status mark's slot (20px box, 4px from the end) and the title's end padding (6px).
       * Shown only on a row with no indicator; hidden under the row's hover and focus affordances as the status mark is
       * (no transition, like it). The text fade stops short of it: width measured into --sidebar-time-width.
       */
      [data-titlebar-tab] [data-sidebar-time] {
        position: absolute;
        inset-block: 0;
        inset-inline-end: 2px;
        display: flex;
        align-items: center;
        font-size: 11px;
        line-height: 14px;
        font-weight: 400;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        color: var(--v2-text-text-muted);
        pointer-events: none;
      }
      [data-titlebar-tab]:is(:hover, :has(:focus-visible)) [data-sidebar-time] {
        opacity: 0;
      }
      [data-titlebar-tab][data-orientation='vertical'][data-sidebar-time-shown]:not(:hover):not(:has(:focus-visible)) {
        --sidebar-fade: calc(var(--sidebar-time-width, 0px) + 12px);
      }
      [data-titlebar-tab][data-orientation='vertical']:is([data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention], [data-sidebar-time-shown], [data-sa-woke], :hover, :focus-within) [data-slot='tab-link'] {
        -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--sidebar-fade) - 16px), transparent calc(100% - var(--sidebar-fade))) !important;
        mask-image: linear-gradient(to right, #000 calc(100% - var(--sidebar-fade) - 16px), transparent calc(100% - var(--sidebar-fade))) !important;
      }
      /* Attention shows a catalog icon instead of the dot; unread keeps its blue dot, busy its ring. */
      [data-titlebar-tab][data-sidebar-attention] [data-slot='tab-status'] > [data-mark='attention'] {
        display: none !important;
      }
      [data-titlebar-tab] [data-sidebar-status-icon] {
        grid-area: 1 / 1;
        display: none;
        width: 14px;
        height: 14px;
        color: var(--v2-state-fg-warning);
      }
      [data-titlebar-tab][data-status='attention'][data-sidebar-attention='permission'] [data-sidebar-status-icon='permission'],
      [data-titlebar-tab][data-status='attention'][data-sidebar-attention='question'] [data-sidebar-status-icon='question'] {
        display: block;
      }
    `);const i=document.createElement("canvas").getContext("2d"),s=(t,a)=>i?(i.font!==t&&(i.font=t),i.measureText(a).width):a.length*6,o=(t,a)=>{const r=t.getBoundingClientRect().width-1;if(!(r>0))return a;const b=window.getComputedStyle(t),T=`${b.fontStyle} ${b.fontWeight} ${b.fontSize} ${b.fontFamily}`;return ot(a,r,V=>s(T,V))},l=()=>`400 11px ${window.getComputedStyle(document.body).fontFamily}`,c=new Set,d={permission:"warning",question:"help"},u=new Map,m=(t,a)=>{u.set(t,J.render(()=>e.ui.Icon({name:d[a],size:"small"}),t))};let f=new Map,w=new Map,p=new Map,v;const h=()=>{v===void 0&&(v=requestAnimationFrame(()=>{v=void 0,K(),et(document,p),dt(document,f,o,w,m),it(document,Date.now(),t=>s(l(),t));for(const[t,a]of u)t.isConnected||(a(),u.delete(t));for(const t of c)t.isConnected&&t.matches("[data-titlebar-tab][data-orientation='vertical']")||(k.unobserve(t),c.delete(t));document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']").forEach(t=>{c.has(t)||(c.add(t),k.observe(t))})}))},k=new ResizeObserver(h),x=new Set;S.createKeyed(()=>e.sessions.list(),t=>{for(const a of t){const r=`${a.server.id}:${a.id}`;if(x.has(r))continue;x.add(r);const b=a.server.data;Promise.all([b.session.permission.sync(a.id),b.session.form.sync(a.id)]).catch(()=>x.delete(r))}});const g=new Set;S.createKeyed(()=>e.tabs.list().flatMap(t=>t.session?[t.session]:[]),t=>{for(const a of t){const r=`${a.server.id}:${a.id}`;g.has(r)||(g.add(r),a.server.data.session.message.sync(a.id).catch(()=>g.delete(r)))}});const y=D.createMemo(()=>new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const r=a.server.data,b=G(r.session.message.list(a.id),r.session.get(a.id)?.time.updated);return b===void 0?[]:[[t.key,b]]})));S.createKeyed(y,t=>{p=t,h()});const U=D.createMemo(()=>({names:new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const r=a.server.data.session.get(a.id),b=r?a.server.data.project.get(r.projectID):void 0,T=st(b?.canonical??a.location?.directory??"");return T?[[t.key,T]]:[]})),attention:new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const r=a.server.data,b=rt(r.session.permission.list(a.id),r.session.form.list(a.id));return b?[[t.key,b]]:[]}))}));S.createKeyed(U,t=>{f=t.names,w=t.attention,h()});const L=t=>!!(t.nodeType===1?t:t.parentElement)?.closest("[data-sidebar-repo], [data-sidebar-status-icon], [data-sidebar-time]"),O="[data-slot='vertical-tabs']";let $=null;const C=new MutationObserver(t=>{t.some(a=>L(a.target)?!1:a.type==="attributes"?!0:[...a.addedNodes,...a.removedNodes].some(r=>!L(r)))&&h()}),R=t=>{$&&C.disconnect(),$=t,C.observe(t,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["data-tab-key","data-orientation","data-status"]})};let A;const z=t=>{if(A=void 0,$?.isConnected)return;const a=document.querySelector(O);a?(R(a),h()):t>0&&(A=requestAnimationFrame(()=>z(t-1)))},K=()=>{!$?.isConnected&&A===void 0&&(A=requestAnimationFrame(()=>z(60)))},P=document.querySelector(O);P?R(P):K();const j=X({setInterval:(t,a)=>window.setInterval(t,a),clearInterval:t=>window.clearInterval(t),visible:()=>document.visibilityState==="visible"},h),E=()=>j.wake();return window.addEventListener("focus",E),document.addEventListener("visibilitychange",E),()=>{C.disconnect(),A!==void 0&&cancelAnimationFrame(A),j.dispose(),window.removeEventListener("focus",E),document.removeEventListener("visibilitychange",E),nt(document),k.disconnect(),c.clear(),u.forEach(t=>t()),u.clear(),v!==void 0&&cancelAnimationFrame(v),document.querySelectorAll("[data-sidebar-repo]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-status-icon]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-attention]").forEach(t=>t.removeAttribute("data-sidebar-attention"))}}});exports.default=lt;
