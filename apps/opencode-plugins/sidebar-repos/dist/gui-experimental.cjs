"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const M=require("@opencode/plugin/gui"),W=require("solid-js"),Z=require("solid-js/web"),R=6e4,z=60*R,q=24*z,V=7*q,J=30*q;function tt(e,n){const i=Math.max(0,n-e);return i<R?"now":i<z?`${Math.floor(i/R)}m`:i<q?`${Math.floor(i/z)}h`:i<V?`${Math.floor(i/q)}d`:i<J?`${Math.floor(i/V)}w`:i<365*q?`${Math.floor(i/J)}mo`:`${Math.floor(i/(365*q))}y`}function Y(e,n){return new Date(e).toLocaleString(n,{dateStyle:"medium",timeStyle:"long"})}function et(e,n){for(let i=(e?.length??0)-1;i>=0;i--){const o=e[i];if(o.type!=="user"&&o.type!=="assistant")continue;const d=o.time?.completed??o.time?.created;if(d!==void 0&&Number.isFinite(d))return d}return n!==void 0&&Number.isFinite(n)?n:void 0}const at=3e4;function it(e,n){let i;const o=()=>{i!==void 0&&(e.clearInterval(i),i=void 0)},d=()=>{if(!e.visible())return o();i===void 0&&(i=e.setInterval(n,at))};return d(),{wake(){d(),e.visible()&&n()},dispose:o}}const $="data-sidebar-active-at",O="[data-titlebar-tab][data-orientation='vertical']",nt="[data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention]",st=e=>e.matches(nt),G=e=>{const n=Number(e.getAttribute($));return e.hasAttribute($)&&Number.isFinite(n)?n:void 0};function ot(e,n){for(const i of e.querySelectorAll(O)){const o=i.closest("[data-tab-key]")?.getAttribute("data-tab-key");if(o==null)continue;const d=n.get(o);d===void 0?i.removeAttribute($):i.getAttribute($)!==String(d)&&i.setAttribute($,String(d))}}const rt=e=>{const n=e?G(e):void 0;return n===void 0?void 0:`Last active ${Y(n)}`};function dt(e,n,i){for(const o of e.querySelectorAll(O)){const d=G(o),m=o.querySelector(":scope > [data-slot='tab-close']"),p=m?.querySelector(":scope > [data-sidebar-time]");if(!m||d===void 0||st(o)){p?.remove(),o.removeAttribute("data-sidebar-time-shown"),o.style.removeProperty("--sidebar-time-width");continue}const s=p??e.createElement("span");p||(s.setAttribute("data-sidebar-time",""),s.setAttribute("aria-hidden","true"),m.prepend(s));const u=tt(d,n);s.textContent!==u&&(s.textContent=u),s.getAttribute("data-at")!==String(d)&&(s.setAttribute("data-at",String(d)),s.title=Y(d)),o.hasAttribute("data-sidebar-time-shown")||o.setAttribute("data-sidebar-time-shown","");const b=`${Math.ceil(i(u))}px`;o.style.getPropertyValue("--sidebar-time-width")!==b&&o.style.setProperty("--sidebar-time-width",b)}}function ct(e){e.querySelectorAll("[data-sidebar-time]").forEach(n=>n.remove()),e.querySelectorAll("[data-sidebar-time-shown]").forEach(n=>{n.removeAttribute("data-sidebar-time-shown"),n.style.removeProperty("--sidebar-time-width")}),e.querySelectorAll(`[data-tab-key] ${O}`).forEach(n=>n.removeAttribute($))}function lt(e){return e.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??""}function ut(e,n,i,o=.75){if(n<0||i(e)<=n)return e;let d="…",m=0,p=e.length-1;for(;m<=p;){const s=Math.floor((m+p)/2),u=Math.ceil(s*o),b=e.slice(0,u)+"…"+e.slice(e.length-(s-u));i(b)<=n?(d=b,m=s+1):p=s-1}return d}function bt(e,n){return(e?.length??0)>0?"permission":(n?.length??0)>0?"question":void 0}function mt(e,n,i,o=new Map,d){const m=[];for(const s of e.querySelectorAll("[data-tab-key]")){const u=s.querySelector("[data-slot='tab-title']"),b=s.querySelector("[data-sidebar-repo]"),A=s.getAttribute("data-tab-key")??"",g=n.get(A),h=s.querySelector("[data-titlebar-tab]")??s,v=h.querySelector("[data-slot='tab-status']");if(v){for(const x of["permission","question"]){let w=v.querySelector(`[data-sidebar-status-icon='${x}']`);w||(w=e.createElement("span"),w.setAttribute("data-sidebar-status-icon",x),d?.(w,x),v.append(w))}const y=o.get(A);y?h.setAttribute("data-sidebar-attention",y):h.removeAttribute("data-sidebar-attention")}if(!u||!g||s.getAttribute("data-orientation")!=="vertical"){b?.remove();continue}const f=b??e.createElement("span");b||(f.setAttribute("data-sidebar-repo",""),u.before(f)),m.push({badge:f,full:g,owner:h})}const p=m.map(({badge:s,full:u})=>i?.(s,u)??u);m.forEach(({badge:s,full:u,owner:b},A)=>{const g=p[A];s.textContent!==g&&(s.textContent=g);const h=`${u}|${b.getAttribute("data-sidebar-active-at")??""}`;if(s.getAttribute("data-tip-key")===h)return;s.setAttribute("data-tip-key",h);const v=rt(b),f=v?`${u}
${v}`:u;s.title!==f&&(s.title=f)})}const ft=M.Plugin.define({setup(e){e.add(M.Style,`
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
    `);const i=document.createElement("canvas").getContext("2d"),o=new Map,d=(t,a)=>{const r=`${t}|${a}`,l=o.get(r);if(l!==void 0)return l;let c=a.length*6;return i&&(i.font!==t&&(i.font=t),c=i.measureText(a).width),o.size>2e3&&o.clear(),o.set(r,c),c},m=(t,a)=>{const r=t.getBoundingClientRect().width-1;if(!(r>0))return a;const l=window.getComputedStyle(t),c=`${l.fontStyle} ${l.fontWeight} ${l.fontSize} ${l.fontFamily}`;return ut(a,r,L=>d(c,L))},p=()=>`400 11px ${window.getComputedStyle(document.body).fontFamily}`,s=new Set,u={permission:"warning",question:"help"},b=new Map,A=(t,a)=>{b.set(t,Z.render(()=>e.ui.Icon({name:u[a],size:"small"}),t))};let g=new Map,h=new Map,v=new Map,f,y,x=0,w=0,K=0;const k=()=>{if(f!==void 0||y!==void 0)return;const t=x-performance.now();if(t>4){y=setTimeout(()=>(y=void 0,k()),t);return}f=requestAnimationFrame(()=>{f=void 0;const a=performance.now();B(),ot(document,v),mt(document,g,m,h,A);const r=p();dt(document,Date.now(),c=>d(r,c));for(const[c,L]of b)c.isConnected||(L(),b.delete(c));for(const c of s)c.isConnected&&c.matches("[data-titlebar-tab][data-orientation='vertical']")||(C.unobserve(c),s.delete(c));document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']").forEach(c=>{s.has(c)||(s.add(c),C.observe(c))});const l=performance.now()-a;w=a-K<500?w+1:1,K=a,x=l<8||w<5?0:performance.now()+Math.min(250,l*9)})},C=new ResizeObserver(k),I=new Set;M.createKeyed(()=>e.sessions.list(),t=>{for(const a of t){const r=`${a.server.id}:${a.id}`;if(I.has(r))continue;I.add(r);const l=a.server.data;Promise.all([l.session.permission.sync(a.id),l.session.form.sync(a.id)]).catch(()=>I.delete(r))}});const F=new Set;M.createKeyed(()=>e.tabs.list().flatMap(t=>t.session?[t.session]:[]),t=>{for(const a of t){const r=`${a.server.id}:${a.id}`;F.has(r)||(F.add(r),a.server.data.session.message.sync(a.id).catch(()=>F.delete(r)))}});const Q=W.createMemo(()=>new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const r=a.server.data,l=et(r.session.message.list(a.id),r.session.get(a.id)?.time.updated);return l===void 0?[]:[[t.key,l]]})));M.createKeyed(Q,t=>{v=t,k()});const X=W.createMemo(()=>({names:new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const r=a.server.data.session.get(a.id),l=r?a.server.data.project.get(r.projectID):void 0,c=lt(l?.canonical??a.location?.directory??"");return c?[[t.key,c]]:[]})),attention:new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const r=a.server.data,l=bt(r.session.permission.list(a.id),r.session.form.list(a.id));return l?[[t.key,l]]:[]}))}));M.createKeyed(X,t=>{g=t.names,h=t.attention,k()});const P=t=>!!(t.nodeType===1?t:t.parentElement)?.closest("[data-sidebar-repo], [data-sidebar-status-icon], [data-sidebar-time]"),j="[data-slot='vertical-tabs']";let E=null;const N=new MutationObserver(t=>{t.some(a=>P(a.target)?!1:a.type==="attributes"?!0:[...a.addedNodes,...a.removedNodes].some(r=>!P(r)))&&k()}),D=t=>{E&&N.disconnect(),E=t,N.observe(t,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["data-tab-key","data-orientation","data-status"]})};let S;const _=t=>{if(S=void 0,E?.isConnected)return;const a=document.querySelector(j);a?(D(a),k()):t>0&&(S=requestAnimationFrame(()=>_(t-1)))},B=()=>{!E?.isConnected&&S===void 0&&(S=requestAnimationFrame(()=>_(60)))},H=document.querySelector(j);H?D(H):B();const U=it({setInterval:(t,a)=>window.setInterval(t,a),clearInterval:t=>window.clearInterval(t),visible:()=>document.visibilityState==="visible"},k),T=()=>U.wake();return window.addEventListener("focus",T),document.addEventListener("visibilitychange",T),()=>{N.disconnect(),S!==void 0&&cancelAnimationFrame(S),U.dispose(),window.removeEventListener("focus",T),document.removeEventListener("visibilitychange",T),ct(document),C.disconnect(),s.clear(),b.forEach(t=>t()),b.clear(),f!==void 0&&cancelAnimationFrame(f),clearTimeout(y),document.querySelectorAll("[data-sidebar-repo]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-status-icon]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-attention]").forEach(t=>t.removeAttribute("data-sidebar-attention"))}}});exports.default=ft;
