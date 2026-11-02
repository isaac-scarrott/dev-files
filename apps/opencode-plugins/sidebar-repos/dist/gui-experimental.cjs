"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const F=require("@opencode/plugin/gui"),M=require("solid-js"),_=require("solid-js/web"),$=6e4,T=60*$,A=24*T,L=7*A,O=30*A;function H(e,s){const i=Math.max(0,s-e);return i<$?"now":i<T?`${Math.floor(i/$)}m`:i<A?`${Math.floor(i/T)}h`:i<L?`${Math.floor(i/A)}d`:i<O?`${Math.floor(i/L)}w`:i<365*A?`${Math.floor(i/O)}mo`:`${Math.floor(i/(365*A))}y`}function z(e,s){return new Date(e).toLocaleString(s,{dateStyle:"medium",timeStyle:"long"})}function K(e,s){for(let i=(e?.length??0)-1;i>=0;i--){const n=e[i];if(n.type!=="user"&&n.type!=="assistant")continue;const o=n.time?.completed??n.time?.created;if(o!==void 0&&Number.isFinite(o))return o}return s!==void 0&&Number.isFinite(s)?s:void 0}const W=3e4;function B(e,s){let i;const n=()=>{i!==void 0&&(e.clearInterval(i),i=void 0)},o=()=>{if(!e.visible())return n();i===void 0&&(i=e.setInterval(s,W))};return o(),{wake(){o(),e.visible()&&s()},dispose:n}}const S="data-sidebar-active-at",I="[data-titlebar-tab][data-orientation='vertical']",U="[data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention]",V=e=>e.matches(U),R=e=>{const s=Number(e.getAttribute(S));return e.hasAttribute(S)&&Number.isFinite(s)?s:void 0};function J(e,s){for(const i of e.querySelectorAll(I)){const n=i.closest("[data-tab-key]")?.getAttribute("data-tab-key");if(n==null)continue;const o=s.get(n);o===void 0?i.removeAttribute(S):i.getAttribute(S)!==String(o)&&i.setAttribute(S,String(o))}}const Y=e=>{const s=e?R(e):void 0;return s===void 0?void 0:`Last active ${z(s)}`};function G(e,s,i){for(const n of e.querySelectorAll(I)){const o=R(n),l=n.querySelector(":scope > [data-slot='tab-close']"),c=l?.querySelector(":scope > [data-sidebar-time]");if(!l||o===void 0||V(n)){c?.remove(),n.removeAttribute("data-sidebar-time-shown"),n.style.removeProperty("--sidebar-time-width");continue}const r=c??e.createElement("span");c||(r.setAttribute("data-sidebar-time",""),r.setAttribute("aria-hidden","true"),l.prepend(r));const u=H(o,s);r.textContent!==u&&(r.textContent=u);const b=z(o);r.title!==b&&(r.title=b),n.hasAttribute("data-sidebar-time-shown")||n.setAttribute("data-sidebar-time-shown","");const f=`${Math.ceil(i(u))}px`;n.style.getPropertyValue("--sidebar-time-width")!==f&&n.style.setProperty("--sidebar-time-width",f)}}function Q(e){e.querySelectorAll("[data-sidebar-time]").forEach(s=>s.remove()),e.querySelectorAll("[data-sidebar-time-shown]").forEach(s=>{s.removeAttribute("data-sidebar-time-shown"),s.style.removeProperty("--sidebar-time-width")}),e.querySelectorAll(`[data-tab-key] ${I}`).forEach(s=>s.removeAttribute(S))}function X(e){return e.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??""}function Z(e,s,i,n=.75){if(s<0||i(e)<=s)return e;let o="…",l=0,c=e.length-1;for(;l<=c;){const r=Math.floor((l+c)/2),u=Math.ceil(r*n),b=e.slice(0,u)+"…"+e.slice(e.length-(r-u));i(b)<=s?(o=b,l=r+1):c=r-1}return o}function tt(e,s){return(e?.length??0)>0?"permission":(s?.length??0)>0?"question":void 0}function et(e,s,i,n=new Map,o){for(const l of e.querySelectorAll("[data-tab-key]")){const c=l.querySelector("[data-slot='tab-title']"),r=l.querySelector("[data-sidebar-repo]"),u=l.getAttribute("data-tab-key")??"",b=s.get(u),f=l.querySelector("[data-titlebar-tab]")??l,w=f.querySelector("[data-slot='tab-status']");if(w){for(const x of["permission","question"]){let h=w.querySelector(`[data-sidebar-status-icon='${x}']`);h||(h=e.createElement("span"),h.setAttribute("data-sidebar-status-icon",x),o?.(h,x),w.append(h))}const k=n.get(u);k?f.setAttribute("data-sidebar-attention",k):f.removeAttribute("data-sidebar-attention")}if(!c||!b||l.getAttribute("data-orientation")!=="vertical"){r?.remove();continue}const p=r??e.createElement("span");r||(p.setAttribute("data-sidebar-repo",""),c.before(p));const v=i?.(p,b)??b;p.textContent!==v&&(p.textContent=v);const g=Y(f),y=g?`${b}
${g}`:b;p.title!==y&&(p.title=y)}}const at=F.Plugin.define({setup(e){e.add(F.Style,`
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
    `);const i=document.createElement("canvas").getContext("2d"),n=(t,a)=>i?(i.font!==t&&(i.font=t),i.measureText(a).width):a.length*6,o=(t,a)=>{const d=t.getBoundingClientRect().width-1;if(!(d>0))return a;const m=window.getComputedStyle(t),E=`${m.fontStyle} ${m.fontWeight} ${m.fontSize} ${m.fontFamily}`;return Z(a,d,P=>n(E,P))},l=()=>`400 11px ${window.getComputedStyle(document.body).fontFamily}`,c=new Set,r={permission:"warning",question:"help"},u=new Map,b=(t,a)=>{u.set(t,_.render(()=>e.ui.Icon({name:r[a],size:"small"}),t))};let f=new Map,w=new Map,p=new Map,v;const g=()=>{v===void 0&&(v=requestAnimationFrame(()=>{v=void 0,J(document,p),et(document,f,o,w,b),G(document,Date.now(),t=>n(l(),t));for(const[t,a]of u)t.isConnected||(a(),u.delete(t));for(const t of c)t.isConnected&&t.matches("[data-titlebar-tab][data-orientation='vertical']")||(y.unobserve(t),c.delete(t));document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']").forEach(t=>{c.has(t)||(c.add(t),y.observe(t))})}))},y=new ResizeObserver(g);M.createEffect(()=>{for(const t of e.sessions.list()){const a=t.server.data;a.session.permission.sync(t.id).catch(()=>{}),a.session.form.sync(t.id).catch(()=>{})}});const k=new Set;M.createEffect(()=>{for(const t of e.tabs.list()){const a=t.session;if(!a)continue;const d=`${a.server.id}:${a.id}`;k.has(d)||(k.add(d),a.server.data.session.message.sync(a.id).catch(()=>k.delete(d)))}}),M.createEffect(()=>{p=new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const d=a.server.data,m=K(d.session.message.list(a.id),d.session.get(a.id)?.time.updated);return m===void 0?[]:[[t.key,m]]})),g()}),M.createEffect(()=>{f=new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const d=a.server.data.session.get(a.id),m=d?a.server.data.project.get(d.projectID):void 0,E=X(m?.canonical??a.location?.directory??"");return E?[[t.key,E]]:[]})),w=new Map(e.tabs.list().flatMap(t=>{const a=t.session;if(!a)return[];const d=a.server.data,m=tt(d.session.permission.list(a.id),d.session.form.list(a.id));return m?[[t.key,m]]:[]})),g()});const x=t=>!!(t.nodeType===1?t:t.parentElement)?.closest("[data-sidebar-repo], [data-sidebar-status-icon], [data-sidebar-time]"),h="[data-tab-key], [data-titlebar-tab-list], [data-titlebar-tab], [data-slot='vertical-tabs-scroll'], [data-action='vertical-tabs-home']",j=t=>!!(t.nodeType===1?t:t.parentElement)?.closest(h),D=t=>t.nodeType===1&&(t.matches(h)||!!t.querySelector(h)),C=new MutationObserver(t=>{t.some(a=>x(a.target)||!j(a.target)&&!(a.type==="childList"&&[...a.addedNodes].some(D))?!1:a.type==="attributes"?!0:[...a.addedNodes,...a.removedNodes].some(d=>!x(d)))&&g()});C.observe(document.documentElement,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["data-tab-key","data-orientation","data-status"]});const N=B({setInterval:(t,a)=>window.setInterval(t,a),clearInterval:t=>window.clearInterval(t),visible:()=>document.visibilityState==="visible"},g),q=()=>N.wake();return window.addEventListener("focus",q),document.addEventListener("visibilitychange",q),()=>{C.disconnect(),N.dispose(),window.removeEventListener("focus",q),document.removeEventListener("visibilitychange",q),Q(document),y.disconnect(),c.clear(),u.forEach(t=>t()),u.clear(),v!==void 0&&cancelAnimationFrame(v),document.querySelectorAll("[data-sidebar-repo]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-status-icon]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-attention]").forEach(t=>t.removeAttribute("data-sidebar-attention"))}}});exports.default=at;
