"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const w=require("@opencode/plugin/gui"),y=require("solid-js");function k(a){return a.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??""}function x(a,s){return s?`${a} · ${s}`:a}function A(a,s,b,m=.75){if(s<0||b(a)<=s)return a;let r="…",o=0,d=a.length-1;for(;o<=d;){const l=Math.floor((o+d)/2),n=Math.ceil(l*m),c=a.slice(0,n)+"…"+a.slice(a.length-(l-n));b(c)<=s?(r=c,o=l+1):d=l-1}return r}function M(a,s){return(a?.length??0)>0?"permission":(s?.length??0)>0?"question":void 0}const q={permission:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"/></svg>',question:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>'};function S(a,s,b,m=new Map){for(const r of a.querySelectorAll("[data-tab-key]")){const o=r.querySelector("[data-slot='tab-title']"),d=r.querySelector("[data-sidebar-repo]"),l=r.getAttribute("data-tab-key")??"",n=s.get(l),c=r.querySelector("[data-titlebar-tab]")??r,f=c.querySelector("[data-slot='tab-status']");if(f){for(const e of["permission","question"]){let i=f.querySelector(`[data-sidebar-status-icon='${e}']`);i||(i=a.createElement("span"),i.setAttribute("data-sidebar-status-icon",e),i.innerHTML=q[e],f.append(i))}const t=m.get(l);t?c.setAttribute("data-sidebar-attention",t):c.removeAttribute("data-sidebar-attention")}if(!o||!n||r.getAttribute("data-orientation")!=="vertical"){d?.remove();continue}const u=d??a.createElement("span");d||(u.setAttribute("data-sidebar-repo",""),o.before(u));const v=b?.(u,n)??n;u.textContent!==v&&(u.textContent=v),u.title!==n&&(u.title=n)}}const E=w.Plugin.define({setup(a){a.add(w.Style,`
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
      /* The native list and link fades are masks that ignore the status mark; replaced by the title fade below. */
      [data-slot='vertical-tabs-scroll'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      [data-titlebar-tab][data-orientation='vertical'] [data-slot='tab-link'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      /* Text yields to whatever sits at the row's trailing edge: a status mark, or the close button on hover. */
      [data-titlebar-tab][data-orientation='vertical'] {
        --sidebar-fade: 0px;
      }
      [data-titlebar-tab][data-orientation='vertical']:is([data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention]) {
        --sidebar-fade: 28px;
      }
      [data-titlebar-tab][data-orientation='vertical']:is(:hover, :focus-within) {
        --sidebar-fade: 32px;
      }
      [data-titlebar-tab][data-orientation='vertical'] :is([data-slot='tab-title'], [data-sidebar-repo]) {
        -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--sidebar-fade)), transparent) !important;
        mask-image: linear-gradient(to right, #000 calc(100% - var(--sidebar-fade)), transparent) !important;
      }
      /* Attention shows a Phosphor icon instead of the dot; unread keeps its blue dot, busy its ring. */
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
    `);const b=document.createElement("canvas").getContext("2d"),m=(t,e)=>b?(b.font!==t&&(b.font=t),b.measureText(e).width):e.length*6,r=(t,e)=>{const i=t.getBoundingClientRect().width-1;if(!(i>0))return e;const p=window.getComputedStyle(t),h=`${p.fontStyle} ${p.fontWeight} ${p.fontSize} ${p.fontFamily}`;return A(e,i,g=>m(h,g))},o=new Set;let d=new Map,l=new Map,n;const c=()=>{n===void 0&&(n=requestAnimationFrame(()=>{n=void 0,S(document,d,r,l);for(const t of o)t.isConnected&&t.matches("[data-titlebar-tab][data-orientation='vertical']")||(f.unobserve(t),o.delete(t));document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']").forEach(t=>{o.has(t)||(o.add(t),f.observe(t))})}))},f=new ResizeObserver(c);y.createEffect(()=>{for(const t of a.sessions.list()){const e=t.server.data;t.location&&e.location.vcs.sync(t.location).catch(i=>{console.warn("sidebar-repos: could not load workspace branch",i)}),e.session.permission.sync(t.id).catch(()=>{}),e.session.form.sync(t.id).catch(()=>{})}}),y.createEffect(()=>{d=new Map(a.tabs.list().flatMap(t=>{const e=t.session;if(!e)return[];const i=e.server.data.session.get(e.id),p=i?e.server.data.project.get(i.projectID):void 0,h=k(p?.canonical??e.location?.directory??""),g=e.location?e.server.data.location.vcs.info(e.location)?.branch.current:void 0;return h?[[t.key,x(h,g)]]:[]})),l=new Map(a.tabs.list().flatMap(t=>{const e=t.session;if(!e)return[];const i=e.server.data,p=M(i.session.permission.list(e.id),i.session.form.list(e.id));return p?[[t.key,p]]:[]})),c()});const u=t=>!!(t.nodeType===1?t:t.parentElement)?.closest("[data-sidebar-repo], [data-sidebar-status-icon]"),v=new MutationObserver(t=>{t.some(e=>u(e.target)?!1:e.type==="attributes"?!0:[...e.addedNodes,...e.removedNodes].some(i=>!u(i)))&&c()});return v.observe(document.documentElement,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["data-tab-key","data-orientation","data-status"]}),()=>{v.disconnect(),f.disconnect(),o.clear(),n!==void 0&&cancelAnimationFrame(n),document.querySelectorAll("[data-sidebar-repo]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-status-icon]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-attention]").forEach(t=>t.removeAttribute("data-sidebar-attention"))}}});exports.default=E;
