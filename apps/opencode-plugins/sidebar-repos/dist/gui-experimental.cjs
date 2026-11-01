"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const N=require("@opencode/plugin/gui"),E=require("solid-js"),P=require("solid-js/web"),$=6e4,T=60*$,A=24*T,F=7*A,L=30*A;function R(e,n){const i=Math.max(0,n-e);return i<$?"now":i<T?`${Math.floor(i/$)}m`:i<A?`${Math.floor(i/T)}h`:i<F?`${Math.floor(i/A)}d`:i<L?`${Math.floor(i/F)}w`:i<365*A?`${Math.floor(i/L)}mo`:`${Math.floor(i/(365*A))}y`}function O(e,n){return new Date(e).toLocaleString(n,{dateStyle:"medium",timeStyle:"long"})}function D(e,n){for(let i=(e?.length??0)-1;i>=0;i--){const s=e[i];if(s.type!=="user"&&s.type!=="assistant")continue;const o=s.time?.completed??s.time?.created;if(o!==void 0&&Number.isFinite(o))return o}return n!==void 0&&Number.isFinite(n)?n:void 0}const _=3e4;function H(e,n){let i;const s=()=>{i!==void 0&&(e.clearInterval(i),i=void 0)},o=()=>{if(!e.visible())return s();i===void 0&&(i=e.setInterval(n,_))};return o(),{wake(){o(),e.visible()&&n()},dispose:s}}const S="data-sidebar-active-at",I="[data-titlebar-tab][data-orientation='vertical']",K="[data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention]",W=e=>e.matches(K),z=e=>{const n=Number(e.getAttribute(S));return e.hasAttribute(S)&&Number.isFinite(n)?n:void 0};function U(e,n){for(const i of e.querySelectorAll(I)){const s=i.closest("[data-tab-key]")?.getAttribute("data-tab-key");if(s==null)continue;const o=n.get(s);o===void 0?i.removeAttribute(S):i.getAttribute(S)!==String(o)&&i.setAttribute(S,String(o))}}const V=e=>{const n=e?z(e):void 0;return n===void 0?void 0:`Last active ${O(n)}`};function B(e,n,i){for(const s of e.querySelectorAll(I)){const o=z(s),l=s.querySelector(":scope > [data-slot='tab-close']"),c=l?.querySelector(":scope > [data-sidebar-time]");if(!l||o===void 0||W(s)){c?.remove(),s.removeAttribute("data-sidebar-time-shown"),s.style.removeProperty("--sidebar-time-width");continue}const r=c??e.createElement("span");c||(r.setAttribute("data-sidebar-time",""),r.setAttribute("aria-hidden","true"),l.prepend(r));const u=R(o,n);r.textContent!==u&&(r.textContent=u);const b=O(o);r.title!==b&&(r.title=b),s.hasAttribute("data-sidebar-time-shown")||s.setAttribute("data-sidebar-time-shown","");const f=`${Math.ceil(i(u))}px`;s.style.getPropertyValue("--sidebar-time-width")!==f&&s.style.setProperty("--sidebar-time-width",f)}}function J(e){e.querySelectorAll("[data-sidebar-time]").forEach(n=>n.remove()),e.querySelectorAll("[data-sidebar-time-shown]").forEach(n=>{n.removeAttribute("data-sidebar-time-shown"),n.style.removeProperty("--sidebar-time-width")}),e.querySelectorAll(`[data-tab-key] ${I}`).forEach(n=>n.removeAttribute(S))}function Y(e){return e.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??""}function G(e,n,i,s=.75){if(n<0||i(e)<=n)return e;let o="…",l=0,c=e.length-1;for(;l<=c;){const r=Math.floor((l+c)/2),u=Math.ceil(r*s),b=e.slice(0,u)+"…"+e.slice(e.length-(r-u));i(b)<=n?(o=b,l=r+1):c=r-1}return o}function Q(e,n){return(e?.length??0)>0?"permission":(n?.length??0)>0?"question":void 0}function X(e,n,i,s=new Map,o){for(const l of e.querySelectorAll("[data-tab-key]")){const c=l.querySelector("[data-slot='tab-title']"),r=l.querySelector("[data-sidebar-repo]"),u=l.getAttribute("data-tab-key")??"",b=n.get(u),f=l.querySelector("[data-titlebar-tab]")??l,w=f.querySelector("[data-slot='tab-status']");if(w){for(const x of["permission","question"]){let g=w.querySelector(`[data-sidebar-status-icon='${x}']`);g||(g=e.createElement("span"),g.setAttribute("data-sidebar-status-icon",x),o?.(g,x),w.append(g))}const k=s.get(u);k?f.setAttribute("data-sidebar-attention",k):f.removeAttribute("data-sidebar-attention")}if(!c||!b||l.getAttribute("data-orientation")!=="vertical"){r?.remove();continue}const p=r??e.createElement("span");r||(p.setAttribute("data-sidebar-repo",""),c.before(p));const h=i?.(p,b)??b;p.textContent!==h&&(p.textContent=h);const v=V(f),y=v?`${b}
${v}`:b;p.title!==y&&(p.title=y)}}const Z=N.Plugin.define({setup(e){e.add(N.Style,`
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
    `);const i=document.createElement("canvas").getContext("2d"),s=(t,a)=>i?(i.font!==t&&(i.font=t),i.measureText(a).width):a.length*6,o=(t,a)=>{const d=t.getBoundingClientRect().width-1;if(!(d>0))return a;const m=window.getComputedStyle(t),q=`${m.fontStyle} ${m.fontWeight} ${m.fontSize} ${m.fontFamily}`;return G(a,d,j=>s(q,j))},l=()=>`400 11px ${window.getComputedStyle(document.body).fontFamily}`,c=new Set,r={permission:"warning",question:"help"},u=new Map,b=(t,a)=>{u.set(t,P.render(()=>e.ui.Icon({name:r[a],size:"small"}),t))};let f=new Map,w=new Map,p=new Map,h;const v=()=>{h===void 0&&(h=requestAnimationFrame(()=>{h=void 0,U(document,p),X(document,f,o,w,b),B(document,Date.now(),t=>s(l(),t));for(const[t,a]of u)t.isConnected||(a(),u.delete(t));for(const t of c)t.isConnected&&t.matches("[data-titlebar-tab][data-orientation='vertical']")||(y.unobserve(t),c.delete(t));document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']").forEach(t=>{c.has(t)||(c.add(t),y.observe(t))})}))},y=new ResizeObserver(v);E.createEffect(()=>{for(const t of e.sessions.list()){const a=t.server.data;a.session.permission.sync(t.id).catch(()=>{}),a.session.form.sync(t.id).catch(()=>{})}});const k=new Set;E.createEffect(()=>{for(const t of e.tabs.list()){const a=t.session;if(!a)continue;const d=`${a.server.id}:${a.id}`;k.has(d)||(k.add(d),a.server.data.session.message.sync(a.id).catch(()=>k.delete(d)))}}),E.createEffect(()=>{p=new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const d=a.server.data,m=D(d.session.message.list(a.id),d.session.get(a.id)?.time.updated);return m===void 0?[]:[[t.key,m]]})),v()}),E.createEffect(()=>{f=new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const d=a.server.data.session.get(a.id),m=d?a.server.data.project.get(d.projectID):void 0,q=Y(m?.canonical??a.location?.directory??"");return q?[[t.key,q]]:[]})),w=new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const d=a.server.data,m=Q(d.session.permission.list(a.id),d.session.form.list(a.id));return m?[[t.key,m]]:[]})),v()});const x=t=>!!(t.nodeType===1?t:t.parentElement)?.closest("[data-sidebar-repo], [data-sidebar-status-icon], [data-sidebar-time]"),g=new MutationObserver(t=>{t.some(a=>x(a.target)?!1:a.type==="attributes"?!0:[...a.addedNodes,...a.removedNodes].some(d=>!x(d)))&&v()});g.observe(document.documentElement,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["data-tab-key","data-orientation","data-status"]});const C=H({setInterval:(t,a)=>window.setInterval(t,a),clearInterval:t=>window.clearInterval(t),visible:()=>document.visibilityState==="visible"},v),M=()=>C.wake();return window.addEventListener("focus",M),document.addEventListener("visibilitychange",M),()=>{g.disconnect(),C.dispose(),window.removeEventListener("focus",M),document.removeEventListener("visibilitychange",M),J(document),y.disconnect(),c.clear(),u.forEach(t=>t()),u.clear(),h!==void 0&&cancelAnimationFrame(h),document.querySelectorAll("[data-sidebar-repo]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-status-icon]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-attention]").forEach(t=>t.removeAttribute("data-sidebar-attention"))}}});exports.default=Z;
