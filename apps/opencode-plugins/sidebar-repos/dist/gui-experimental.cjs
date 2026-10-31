"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const y=require("@opencode/plugin/gui"),x=require("solid-js"),S=require("solid-js/web");function A(a){return a.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??""}function M(a,u,d,v=.75){if(u<0||d(a)<=u)return a;let m="…",i=0,b=a.length-1;for(;i<=b;){const n=Math.floor((i+b)/2),p=Math.ceil(n*v),s=a.slice(0,p)+"…"+a.slice(a.length-(n-p));d(s)<=u?(m=s,i=n+1):b=n-1}return m}function E(a,u){return(a?.length??0)>0?"permission":(u?.length??0)>0?"question":void 0}function C(a,u,d,v=new Map,m){for(const i of a.querySelectorAll("[data-tab-key]")){const b=i.querySelector("[data-slot='tab-title']"),n=i.querySelector("[data-sidebar-repo]"),p=i.getAttribute("data-tab-key")??"",s=u.get(p),f=i.querySelector("[data-titlebar-tab]")??i,l=f.querySelector("[data-slot='tab-status']");if(l){for(const g of["permission","question"]){let t=l.querySelector(`[data-sidebar-status-icon='${g}']`);t||(t=a.createElement("span"),t.setAttribute("data-sidebar-status-icon",g),m?.(t,g),l.append(t))}const w=v.get(p);w?f.setAttribute("data-sidebar-attention",w):f.removeAttribute("data-sidebar-attention")}if(!b||!s||i.getAttribute("data-orientation")!=="vertical"){n?.remove();continue}const o=n??a.createElement("span");n||(o.setAttribute("data-sidebar-repo",""),b.before(o));const h=d?.(o,s)??s;o.textContent!==h&&(o.textContent=h),o.title!==s&&(o.title=s)}}const T=y.Plugin.define({setup(a){a.add(y.Style,`
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
       * Text yields to whatever sits at the row's trailing edge (a status mark, or the close button on hover) through
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
      [data-titlebar-tab][data-orientation='vertical']:is([data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention], [data-sa-woke], :hover, :focus-within) [data-slot='tab-link'] {
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
    `);const d=document.createElement("canvas").getContext("2d"),v=(t,e)=>d?(d.font!==t&&(d.font=t),d.measureText(e).width):e.length*6,m=(t,e)=>{const r=t.getBoundingClientRect().width-1;if(!(r>0))return e;const c=window.getComputedStyle(t),k=`${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;return M(e,r,q=>v(k,q))},i=new Set,b={permission:"warning",question:"help"},n=new Map,p=(t,e)=>{n.set(t,S.render(()=>a.ui.Icon({name:b[e],size:"small"}),t))};let s=new Map,f=new Map,l;const o=()=>{l===void 0&&(l=requestAnimationFrame(()=>{l=void 0,C(document,s,m,f,p);for(const[t,e]of n)t.isConnected||(e(),n.delete(t));for(const t of i)t.isConnected&&t.matches("[data-titlebar-tab][data-orientation='vertical']")||(h.unobserve(t),i.delete(t));document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']").forEach(t=>{i.has(t)||(i.add(t),h.observe(t))})}))},h=new ResizeObserver(o);x.createEffect(()=>{for(const t of a.sessions.list()){const e=t.server.data;e.session.permission.sync(t.id).catch(()=>{}),e.session.form.sync(t.id).catch(()=>{})}}),x.createEffect(()=>{s=new Map(a.tabs.list().flatMap(t=>{const e=t.session;if(!e)return[];const r=e.server.data.session.get(e.id),c=r?e.server.data.project.get(r.projectID):void 0,k=A(c?.canonical??e.location?.directory??"");return k?[[t.key,k]]:[]})),f=new Map(a.tabs.list().flatMap(t=>{const e=t.session;if(!e)return[];const r=e.server.data,c=E(r.session.permission.list(e.id),r.session.form.list(e.id));return c?[[t.key,c]]:[]})),o()});const w=t=>!!(t.nodeType===1?t:t.parentElement)?.closest("[data-sidebar-repo], [data-sidebar-status-icon]"),g=new MutationObserver(t=>{t.some(e=>w(e.target)?!1:e.type==="attributes"?!0:[...e.addedNodes,...e.removedNodes].some(r=>!w(r)))&&o()});return g.observe(document.documentElement,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["data-tab-key","data-orientation","data-status"]}),()=>{g.disconnect(),h.disconnect(),i.clear(),n.forEach(t=>t()),n.clear(),l!==void 0&&cancelAnimationFrame(l),document.querySelectorAll("[data-sidebar-repo]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-status-icon]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-attention]").forEach(t=>t.removeAttribute("data-sidebar-attention"))}}});exports.default=T;
