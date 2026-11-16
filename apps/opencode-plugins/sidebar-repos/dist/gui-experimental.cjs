"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const q=require("@opencode/plugin/gui"),W=require("solid-js"),Z=require("solid-js/web");function tt(e,i){return Promise.all([e.session.permission.sync(i),e.session.form.sync(i)]).then(()=>{})}const L=6e4,z=60*L,M=24*z,V=7*M,J=30*M;function et(e,i){const n=Math.max(0,i-e);return n<L?"now":n<z?`${Math.floor(n/L)}m`:n<M?`${Math.floor(n/z)}h`:n<V?`${Math.floor(n/M)}d`:n<J?`${Math.floor(n/V)}w`:n<365*M?`${Math.floor(n/J)}mo`:`${Math.floor(n/(365*M))}y`}function Y(e,i){return new Date(e).toLocaleString(i,{dateStyle:"medium",timeStyle:"long"})}function at(e,i){for(let n=(e?.length??0)-1;n>=0;n--){const o=e[n];if(o.type!=="user"&&o.type!=="assistant")continue;const d=o.time?.completed??o.time?.created;if(d!==void 0&&Number.isFinite(d))return d}return i!==void 0&&Number.isFinite(i)?i:void 0}const it=3e4;function nt(e,i){let n;const o=()=>{n!==void 0&&(e.clearInterval(n),n=void 0)},d=()=>{if(!e.visible())return o();n===void 0&&(n=e.setInterval(i,it))};return d(),{wake(){d(),e.visible()&&i()},dispose:o}}const $="data-sidebar-active-at",O="[data-titlebar-tab][data-orientation='vertical']",st="[data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention]",ot=e=>e.matches(st),G=e=>{const i=Number(e.getAttribute($));return e.hasAttribute($)&&Number.isFinite(i)?i:void 0};function rt(e,i){for(const n of e.querySelectorAll(O)){const o=n.closest("[data-tab-key]")?.getAttribute("data-tab-key");if(o==null)continue;const d=i.get(o);d===void 0?n.removeAttribute($):n.getAttribute($)!==String(d)&&n.setAttribute($,String(d))}}const dt=e=>{const i=e?G(e):void 0;return i===void 0?void 0:`Last active ${Y(i)}`};function ct(e,i,n){for(const o of e.querySelectorAll(O)){const d=G(o),m=o.querySelector(":scope > [data-slot='tab-close']"),p=m?.querySelector(":scope > [data-sidebar-time]");if(!m||d===void 0||ot(o)){p?.remove(),o.removeAttribute("data-sidebar-time-shown"),o.style.removeProperty("--sidebar-time-width");continue}const s=p??e.createElement("span");p||(s.setAttribute("data-sidebar-time",""),s.setAttribute("aria-hidden","true"),m.prepend(s));const l=et(d,i);s.textContent!==l&&(s.textContent=l),s.getAttribute("data-at")!==String(d)&&(s.setAttribute("data-at",String(d)),s.title=Y(d)),o.hasAttribute("data-sidebar-time-shown")||o.setAttribute("data-sidebar-time-shown","");const u=`${Math.ceil(n(l))}px`;o.style.getPropertyValue("--sidebar-time-width")!==u&&o.style.setProperty("--sidebar-time-width",u)}}function lt(e){e.querySelectorAll("[data-sidebar-time]").forEach(i=>i.remove()),e.querySelectorAll("[data-sidebar-time-shown]").forEach(i=>{i.removeAttribute("data-sidebar-time-shown"),i.style.removeProperty("--sidebar-time-width")}),e.querySelectorAll(`[data-tab-key] ${O}`).forEach(i=>i.removeAttribute($))}function ut(e){return e.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??""}function bt(e,i,n,o=.75){if(i<0||n(e)<=i)return e;let d="…",m=0,p=e.length-1;for(;m<=p;){const s=Math.floor((m+p)/2),l=Math.ceil(s*o),u=e.slice(0,l)+"…"+e.slice(e.length-(s-l));n(u)<=i?(d=u,m=s+1):p=s-1}return d}function mt(e,i){return(e?.length??0)>0?"permission":(i?.length??0)>0?"question":void 0}function ft(e,i,n,o=new Map,d){const m=[];for(const s of e.querySelectorAll("[data-tab-key]")){const l=s.querySelector("[data-slot='tab-title']"),u=s.querySelector("[data-sidebar-repo]"),A=s.getAttribute("data-tab-key")??"",w=i.get(A),h=s.querySelector("[data-titlebar-tab]")??s,v=h.querySelector("[data-slot='tab-status']");if(v){for(const x of["permission","question"]){let g=v.querySelector(`[data-sidebar-status-icon='${x}']`);g||(g=e.createElement("span"),g.setAttribute("data-sidebar-status-icon",x),d?.(g,x),v.append(g))}const y=o.get(A);y?h.setAttribute("data-sidebar-attention",y):h.removeAttribute("data-sidebar-attention")}if(!l||!w||s.getAttribute("data-orientation")!=="vertical"){u?.remove();continue}const f=u??e.createElement("span");u||(f.setAttribute("data-sidebar-repo",""),l.before(f)),m.push({badge:f,full:w,owner:h})}const p=m.map(({badge:s,full:l})=>n?.(s,l)??l);m.forEach(({badge:s,full:l,owner:u},A)=>{const w=p[A];s.textContent!==w&&(s.textContent=w);const h=`${l}|${u.getAttribute("data-sidebar-active-at")??""}`;if(s.getAttribute("data-tip-key")===h)return;s.setAttribute("data-tip-key",h);const v=dt(u),f=v?`${l}
${v}`:l;s.title!==f&&(s.title=f)})}const pt=q.Plugin.define({setup(e){e.add(q.Style,`
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
      [data-titlebar-tab][data-orientation='vertical']:is([data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention], [data-sidebar-time-shown], [data-notify], :hover, :focus-within) [data-slot='tab-link'] {
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
    `);const n=document.createElement("canvas").getContext("2d"),o=new Map,d=(t,a)=>{const r=`${t}|${a}`,b=o.get(r);if(b!==void 0)return b;let c=a.length*6;return n&&(n.font!==t&&(n.font=t),c=n.measureText(a).width),o.size>2e3&&o.clear(),o.set(r,c),c},m=(t,a)=>{const r=t.getBoundingClientRect().width-1;if(!(r>0))return a;const b=window.getComputedStyle(t),c=`${b.fontStyle} ${b.fontWeight} ${b.fontSize} ${b.fontFamily}`;return bt(a,r,R=>d(c,R))},p=()=>`400 11px ${window.getComputedStyle(document.body).fontFamily}`,s=new Set,l={permission:"warning",question:"help"},u=new Map,A=(t,a)=>{u.set(t,Z.render(()=>e.ui.Icon({name:l[a],size:"small"}),t))};let w=new Map,h=new Map,v=new Map,f,y,x=0,g=0,K=0;const k=()=>{if(f!==void 0||y!==void 0)return;const t=x-performance.now();if(t>4){y=setTimeout(()=>(y=void 0,k()),t);return}f=requestAnimationFrame(()=>{f=void 0;const a=performance.now();B(),rt(document,v),ft(document,w,m,h,A);const r=p();ct(document,Date.now(),c=>d(r,c));for(const[c,R]of u)c.isConnected||(R(),u.delete(c));for(const c of s)c.isConnected&&c.matches("[data-titlebar-tab][data-orientation='vertical']")||(C.unobserve(c),s.delete(c));document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']").forEach(c=>{s.has(c)||(s.add(c),C.observe(c))});const b=performance.now()-a;g=a-K<500?g+1:1,K=a,x=b<8||g<5?0:performance.now()+Math.min(250,b*9)})},C=new ResizeObserver(k),I=new Set;q.createKeyed(()=>e.sessions.list(),t=>{for(const a of t){const r=`${a.server.id}:${a.id}`;I.has(r)||(I.add(r),tt(a.server.data,a.id).catch(()=>I.delete(r)))}});const F=new Set;q.createKeyed(()=>e.tabs.list().flatMap(t=>t.session?[t.session]:[]),t=>{for(const a of t){const r=`${a.server.id}:${a.id}`;F.has(r)||(F.add(r),a.server.data.session.message.sync(a.id).catch(()=>F.delete(r)))}});const Q=W.createMemo(()=>new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const r=a.server.data,b=at(r.session.message.list(a.id),r.session.get(a.id)?.time.updated);return b===void 0?[]:[[t.key,b]]})));q.createKeyed(Q,t=>{v=t,k()});const X=W.createMemo(()=>({names:new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const r=a.server.data.session.get(a.id),b=r?a.server.data.project.get(r.projectID):void 0,c=ut(b?.canonical??a.location?.directory??"");return c?[[t.key,c]]:[]})),attention:new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const r=a.server.data,b=mt(r.session.permission.list(a.id),r.session.form.list(a.id));return b?[[t.key,b]]:[]}))}));q.createKeyed(X,t=>{w=t.names,h=t.attention,k()});const P=t=>!!(t.nodeType===1?t:t.parentElement)?.closest("[data-sidebar-repo], [data-sidebar-status-icon], [data-sidebar-time]"),j="[data-slot='vertical-tabs']";let E=null;const N=new MutationObserver(t=>{t.some(a=>P(a.target)?!1:a.type==="attributes"?!0:[...a.addedNodes,...a.removedNodes].some(r=>!P(r)))&&k()}),D=t=>{E&&N.disconnect(),E=t,N.observe(t,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["data-tab-key","data-orientation","data-status"]})};let S;const _=t=>{if(S=void 0,E?.isConnected)return;const a=document.querySelector(j);a?(D(a),k()):t>0&&(S=requestAnimationFrame(()=>_(t-1)))},B=()=>{!E?.isConnected&&S===void 0&&(S=requestAnimationFrame(()=>_(60)))},H=document.querySelector(j);H?D(H):B();const U=nt({setInterval:(t,a)=>window.setInterval(t,a),clearInterval:t=>window.clearInterval(t),visible:()=>document.visibilityState==="visible"},k),T=()=>U.wake();return window.addEventListener("focus",T),document.addEventListener("visibilitychange",T),()=>{N.disconnect(),S!==void 0&&cancelAnimationFrame(S),U.dispose(),window.removeEventListener("focus",T),document.removeEventListener("visibilitychange",T),lt(document),C.disconnect(),s.clear(),u.forEach(t=>t()),u.clear(),f!==void 0&&cancelAnimationFrame(f),clearTimeout(y),document.querySelectorAll("[data-sidebar-repo]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-status-icon]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-attention]").forEach(t=>t.removeAttribute("data-sidebar-attention"))}}});exports.default=pt;
