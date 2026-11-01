/**
 * Policy of every page. `default-src 'none'` closes fetch, XHR, WebSocket, images, fonts, media, frames, objects,
 * workers and prefetch to anything but inline or `data:`/`blob:` content the page makes itself. `navigate-to` is listed
 * because it is the right directive, but Chromium does not implement it: navigation is stopped by the bridge (the
 * Navigation API) and by the parent (a second load of the frame replaces it), see DESIGN.md "Isolation".
 */
export const csp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "prefetch-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "navigate-to 'none'",
].join("; ")

/** Without allow-same-origin the page gets an opaque origin: no app cookies, storage, DOM or session. No popups, forms, modals or top navigation. */
export const sandbox = "allow-scripts"

export type ThemeVars = Readonly<Record<string, string>>
export interface Theme {
  mode: "light" | "dark"
  vars: ThemeVars
}

export const heightLimits = { min: 40, max: 900 } as const
export const zoomSteps = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

/** Messages the page may send; everything else is dropped. */
export type FrameMessage =
  | { type: "ready" }
  | { type: "height"; height: number }
  | { type: "open"; url: string }

/**
 * Runs first in the page. It cancels every navigation of the frame (`location.href`, `<meta refresh>`, `a.click()`,
 * `navigation.navigate`), removes WebRTC (its ICE servers reach the network outside CSP), reports height and applies
 * theme and zoom pushed by the parent. A link click only becomes an `open` message when a real user caused it.
 */
const bridge = (id: string) => `(function(){
var id=${JSON.stringify(id)},p=parent,raf=0,last=0;
function send(m){m.vr=id;p.postMessage(m,"*")}
try{var nav=window.navigation;if(nav&&nav.addEventListener)nav.addEventListener("navigate",function(e){e.preventDefault()},true)}catch(_){}
["RTCPeerConnection","webkitRTCPeerConnection","RTCDataChannel","RTCSessionDescription","RTCIceCandidate"].forEach(function(n){try{Object.defineProperty(window,n,{value:undefined,writable:false,configurable:false})}catch(_){}});
function measure(){raf=0;var b=document.body;if(!b)return;var s=getComputedStyle(b);
var h=Math.ceil(b.getBoundingClientRect().height+(parseFloat(s.marginTop)||0)+(parseFloat(s.marginBottom)||0));
if(h!==last){last=h;send({type:"height",height:h})}}
function queue(){if(!raf)raf=requestAnimationFrame(measure)}
function ext(u){return /^(https?:|mailto:)/i.test(u)}
addEventListener("message",function(e){if(e.source!==p)return;var m=e.data;if(!m||m.vr!==id)return;
var r=document.documentElement;
if(m.type==="theme"){for(var k in m.vars)r.style.setProperty(k,m.vars[k]);r.style.colorScheme=m.mode;queue()}
else if(m.type==="zoom"){r.style.zoom=String(m.value);queue()}});
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;
var h=a.getAttribute("href")||"";if(h.charAt(0)==="#")return;e.preventDefault();if(e.isTrusted&&ext(a.href))send({type:"open",url:a.href})},true);
document.addEventListener("submit",function(e){e.preventDefault()},true);
window.open=function(){return null};
addEventListener("load",function(){queue();send({type:"ready"})});
if(typeof ResizeObserver==="function"){var ro=new ResizeObserver(queue);ro.observe(document.documentElement);
document.addEventListener("DOMContentLoaded",function(){ro.observe(document.body);queue()})}
})();`

const base = `html{background:var(--bg);color:var(--fg);font:14px/1.5 var(--font,system-ui,sans-serif)}
body{margin:12px}
code,pre,kbd{font-family:var(--mono,ui-monospace,monospace)}
img,svg,canvas,video{max-width:100%}`

function cssVars(theme: Theme) {
  const rules = Object.entries(theme.vars)
    .filter(([name]) => /^--[a-z0-9-]+$/.test(name) && !/[;{}<]/.test(theme.vars[name]!))
    .map(([name, value]) => `${name}:${value}`)
  return `:root{color-scheme:${theme.mode};${rules.join(";")}}`
}

/**
 * Builds the sandboxed page. The HTML is always wrapped, never spliced, so a `<head>` or `<!--` inside it cannot
 * displace the CSP meta or the bridge, which come first. The iframe's own `csp` attribute enforces the same policy a
 * second time.
 */
export function buildDocument(input: { id: string; html: string; theme: Theme }) {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<script>${bridge(input.id).replaceAll("</", "<\\/")}</script>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${cssVars(input.theme)}${base}</style></head><body>${input.html}</body></html>`
  )
}

export function parseFrameMessage(data: unknown, id: string): FrameMessage | undefined {
  if (!data || typeof data !== "object") return undefined
  const message = data as Record<string, unknown>
  if (message.vr !== id) return undefined
  if (message.type === "ready") return { type: "ready" }
  if (message.type === "height") {
    const height = message.height
    if (typeof height !== "number" || !Number.isFinite(height)) return undefined
    return { type: "height", height: Math.min(heightLimits.max, Math.max(heightLimits.min, Math.round(height))) }
  }
  if (message.type === "open") {
    if (typeof message.url !== "string" || message.url.length > 2048) return undefined
    try {
      const url = new URL(message.url)
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) return undefined
      return { type: "open", url: url.href }
    } catch {
      return undefined
    }
  }
  return undefined
}

const themeTokens: Record<string, string> = {
  "--bg": "--v2-background-bg-base",
  "--surface": "--v2-background-bg-layer-01",
  "--surface-2": "--v2-background-bg-layer-02",
  "--fg": "--v2-text-text-base",
  "--muted": "--v2-text-text-muted",
  "--border": "--v2-border-border-base",
  "--accent": "--v2-border-border-focus",
  "--danger": "--v2-state-fg-danger",
  "--warning": "--v2-state-fg-warning",
  "--info": "--v2-state-fg-info",
}

export function readTheme(
  mode: "light" | "dark",
  read: (token: string) => string,
  fonts: { sans: string; mono: string },
): Theme {
  const vars: Record<string, string> = {}
  for (const [name, token] of Object.entries(themeTokens)) {
    const value = read(token).trim()
    if (value) vars[name] = value
  }
  if (fonts.sans) vars["--font"] = fonts.sans
  if (fonts.mono) vars["--mono"] = fonts.mono
  return { mode, vars }
}

export const themeKey = (theme: Theme) => `${theme.mode}|${JSON.stringify(theme.vars)}`
