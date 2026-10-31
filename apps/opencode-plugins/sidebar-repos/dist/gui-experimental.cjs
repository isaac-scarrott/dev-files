"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const g=require("@opencode/plugin/gui"),w=require("solid-js");function y(a){return a.replace(/[/\\]+$/,"").split(/[/\\]/).pop()??""}function k(a,u){return u?`${a} · ${u}`:a}function x(a,u,b,m=.75){if(u<0||b(a)<=u)return a;let s="…",p=0,r=a.length-1;for(;p<=r;){const d=Math.floor((p+r)/2),i=Math.ceil(d*m),l=a.slice(0,i)+"…"+a.slice(a.length-(d-i));b(l)<=u?(s=l,p=d+1):r=d-1}return s}const A={permission:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"/></svg>',question:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>'};function M(a,u,b,m=new Map){for(const s of a.querySelectorAll("[data-tab-key]")){const p=s.querySelector("[data-slot='tab-title']"),r=s.querySelector("[data-sidebar-repo]"),d=s.getAttribute("data-tab-key")??"",i=u.get(d),l=s.querySelector("[data-titlebar-tab]")??s,f=l.querySelector("[data-slot='tab-status']");if(f){for(const n of["permission","question"]){let o=f.querySelector(`[data-sidebar-status-icon='${n}']`);o||(o=a.createElement("span"),o.setAttribute("data-sidebar-status-icon",n),o.innerHTML=A[n],f.append(o))}const e=m.get(d);e?l.setAttribute("data-sidebar-attention",e):l.removeAttribute("data-sidebar-attention")}if(!p||!i||s.getAttribute("data-orientation")!=="vertical"){r?.remove();continue}const c=r??a.createElement("span");r||(c.setAttribute("data-sidebar-repo",""),p.before(c));const t=b?.(c,i)??i;c.textContent!==t&&(c.textContent=t),c.title!==i&&(c.title=i)}}const q=g.Plugin.define({setup(a){a.add(g.Style,`
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
      /* No fades: the scroll list fades top/bottom and the title fades at its edge; both are masks. */
      [data-slot='vertical-tabs-scroll'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      [data-titlebar-tab][data-orientation='vertical'] [data-slot='tab-link'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      /* Attention shows a Phosphor icon instead of the dot; unread keeps its blue dot, busy its ring. */
      [data-titlebar-tab] [data-slot='tab-status'] > [data-mark='attention'] {
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
    `);const b=document.createElement("canvas").getContext("2d"),m=(t,e)=>b?(b.font!==t&&(b.font=t),b.measureText(e).width):e.length*6,s=(t,e)=>{const n=t.getBoundingClientRect().width-1;if(!(n>0))return e;const o=window.getComputedStyle(t),h=`${o.fontStyle} ${o.fontWeight} ${o.fontSize} ${o.fontFamily}`;return x(e,n,v=>m(h,v))},p=new WeakSet;let r=new Map,d=new Map,i;const l=()=>{i===void 0&&(i=requestAnimationFrame(()=>{i=void 0,M(document,r,s,d),document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']").forEach(t=>{p.has(t)||(p.add(t),f.observe(t))})}))},f=new ResizeObserver(l);w.createEffect(()=>{for(const t of a.sessions.list()){if(!t.location)continue;const e=t.server.data;e.location.vcs.sync(t.location).catch(n=>{console.warn("sidebar-repos: could not load workspace branch",n)}),e.session.permission.sync(t.id).catch(()=>{}),e.session.form.sync(t.id).catch(()=>{})}}),w.createEffect(()=>{r=new Map(a.tabs.list().flatMap(t=>{const e=t.session;if(!e)return[];const n=e.server.data.session.get(e.id),o=n?e.server.data.project.get(n.projectID):void 0,h=y(o?.canonical??e.location?.directory??""),v=e.location?e.server.data.location.vcs.info(e.location)?.branch.current:void 0;return h?[[t.key,k(h,v)]]:[]})),d=new Map(a.tabs.list().flatMap(t=>{const e=t.session;if(!e)return[];const n=e.server.data,o=n.session.permission.list(e.id).length>0?"permission":(n.session.form.list(e.id)?.length??0)>0?"question":void 0;return o?[[t.key,o]]:[]})),l()});const c=new MutationObserver(l);return c.observe(document.documentElement,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["data-tab-key","data-orientation","data-status"]}),()=>{c.disconnect(),f.disconnect(),i!==void 0&&cancelAnimationFrame(i),document.querySelectorAll("[data-sidebar-repo]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-status-icon]").forEach(t=>t.remove()),document.querySelectorAll("[data-sidebar-attention]").forEach(t=>t.removeAttribute("data-sidebar-attention"))}}});exports.default=q;
