"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const x=require("@opencode/plugin/gui"),q=require("solid-js"),S=require("solid-js/web");function A(a){return a.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??""}function M(a,s){return s?`${a} · ${s}`:a}function E(a,s,l,g=.75){if(s<0||l(a)<=s)return a;let f="…",i=0,b=a.length-1;for(;i<=b;){const n=Math.floor((i+b)/2),p=Math.ceil(n*g),r=a.slice(0,p)+"…"+a.slice(a.length-(n-p));l(r)<=s?(f=r,i=n+1):b=n-1}return f}function $(a,s){return(a?.length??0)>0?"permission":(s?.length??0)>0?"question":void 0}function C(a,s,l,g=new Map,f){for(const i of a.querySelectorAll("[data-tab-key]")){const b=i.querySelector("[data-slot='tab-title']"),n=i.querySelector("[data-sidebar-repo]"),p=i.getAttribute("data-tab-key")??"",r=s.get(p),m=i.querySelector("[data-titlebar-tab]")??i,c=m.querySelector("[data-slot='tab-status']");if(c){for(const v of["permission","question"]){let t=c.querySelector(`[data-sidebar-status-icon='${v}']`);t||(t=a.createElement("span"),t.setAttribute("data-sidebar-status-icon",v),f?.(t,v),c.append(t))}const w=g.get(p);w?m.setAttribute("data-sidebar-attention",w):m.removeAttribute("data-sidebar-attention")}if(!b||!r||i.getAttribute("data-orientation")!=="vertical"){n?.remove();continue}const d=n??a.createElement("span");n||(d.setAttribute("data-sidebar-repo",""),b.before(d));const h=l?.(d,r)??r;d.textContent!==h&&(d.textContent=h),d.title!==r&&(d.title=r)}}const T=x.Plugin.define({setup(a){a.add(x.Style,`
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
    `);const l=document.createElement("canvas").getContext("2d"),g=(t,e)=>l?(l.font!==t&&(l.font=t),l.measureText(e).width):e.length*6,f=(t,e)=>{const o=t.getBoundingClientRect().width-1;if(!(o>0))return e;const u=window.getComputedStyle(t),k=`${u.fontStyle} ${u.fontWeight} ${u.fontSize} ${u.fontFamily}`;return E(e,o,y=>g(k,y))},i=new Set,b={permission:"warning",question:"help"},n=new Map,p=(t,e)=>{n.set(t,S.render(()=>a.ui.Icon({name:b[e],size:"small"}),t))};let r=new Map,m=new Map,c;const d=()=>{c===void 0&&(c=requestAnimationFrame(()=>{c=void 0,C(document,r,f,m,p);for(const[t,e]of n)t.isConnected||(e(),n.delete(t));for(const t of i)t.isConnected&&t.matches("[data-titlebar-tab][data-orientation='vertical']")||(h.unobserve(t),i.delete(t));document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']").forEach(t=>{i.has(t)||(i.add(t),h.observe(t))})}))},h=new ResizeObserver(d);q.createEffect(()=>{for(const t of a.sessions.list()){const e=t.server.data;t.location&&e.location.vcs.sync(t.location).catch(o=>{console.warn("sidebar-repos: could not load workspace branch",o)}),e.session.permission.sync(t.id).catch(()=>{}),e.session.form.sync(t.id).catch(()=>{})}}),q.createEffect(()=>{r=new Map(a.tabs.list().flatMap(t=>{const e=t.session;if(!e)return[];const o=e.server.data.session.get(e.id),u=o?e.server.data.project.get(o.projectID):void 0,k=A(u?.canonical??e.location?.directory??""),y=e.location?e.server.data.location.vcs.info(e.location)?.branch.current:void 0;return k?[[t.key,M(k,y)]]:[]})),m=new Map(a.tabs.list().flatMap(t=>{const e=t.session;if(!e)return[];const o=e.server.data,u=$(o.session.permission.list(e.id),o.session.form.list(e.id));return u?[[t.key,u]]:[]})),d()});const w=t=>!!(t.nodeType===1?t:t.parentElement)?.closest("[data-sidebar-repo], [data-sidebar-status-icon]"),v=new MutationObserver(t=>{t.some(e=>w(e.target)?!1:e.type==="attributes"?!0:[...e.addedNodes,...e.removedNodes].some(o=>!w(o)))&&d()});return v.observe(document.documentElement,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["data-tab-key","data-orientation","data-status"]}),()=>{v.disconnect(),h.disconnect(),i.clear(),n.forEach(t=>t()),n.clear(),c!==void 0&&cancelAnimationFrame(c),document.querySelectorAll("[data-sidebar-repo]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-status-icon]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-attention]").forEach(t=>t.removeAttribute("data-sidebar-attention"))}}});exports.default=T;
