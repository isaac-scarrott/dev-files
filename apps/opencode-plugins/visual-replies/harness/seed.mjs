// Seeds one session that shows every shape the plugin places: direct create + update, Code Mode with a returned id,
// Code Mode matched by time window, an artifact the agent deleted, and the attack page. No model calls.
// Usage: node seed.mjs <baseUrl> <password> <projectDir> <attackPort>
import { randomBytes } from "node:crypto"
import { attackPage } from "./attack.mjs"

const [base, password, directory, attackPort = "49777"] = process.argv.slice(2)
const headers = { "content-type": "application/json", authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64") }
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const rand = (n) => Array.from(randomBytes(n), (b) => B62[b % 62]).join("")
let seq = Date.now() * 4096
const id = (p) => `${p}_${(seq++).toString(16).padStart(12, "0").slice(-12)}${rand(14)}`
const model = { id: "seed", providerID: "seed" }
const zero = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
const now = Date.now()
const q = "?location[directory]=" + encodeURIComponent(directory)
const api = async (method, path, body) => {
  const res = await fetch(base + path + q, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${await res.text()}`)
  return res.status === 204 ? undefined : (await res.json()).data
}
const page = (title, color) => `<style>body{margin:0;padding:14px;font:14px var(--font,system-ui);background:var(--bg,#fff);color:var(--fg,#111)}.c{background:var(--surface,#f5f5f5);border:1px solid var(--border,#ddd);border-radius:10px;padding:12px}.b{height:10px;border-radius:5px;background:${color};width:60%}</style><div class="c"><h3 style="margin:0 0 6px">${title}</h3><p style="margin:0 0 8px;color:var(--muted,#666)">--bg --fg --surface --accent</p><div class="b"></div></div>`
const files = (html) => ({ "index.html": html })
const tool = (name, input, text, extra = {}) => ({ type: "tool", id: id("tool"), name, executed: true, state: { status: "completed", input, content: [{ type: "text", text }], ...extra }, time: { created: now, completed: now } })

const info = { id: id("ses"), projectID: "global", agent: "build", model, cost: 0, tokens: zero, title: "Visual replies harness", time: { created: now - 1000, updated: now }, location: { directory } }

// A: direct create, later updated. B: returned from execute. D: deleted by the agent. E: attack page.
const A = await api("POST", "/api/experimental/artifacts", { title: "Revenue (direct)", files: files(page("Revenue (direct) v1", "var(--accent,#48f)")) })
const B = await api("POST", "/api/experimental/artifacts", { title: "Funnel (returned id)", files: files(page("Funnel (returned id)", "var(--info,#37c)")) })
const D = await api("POST", "/api/experimental/artifacts", { title: "Throwaway mock-up", files: files(page("Throwaway (deleted)", "var(--warning,#c80)")) })
const E = await api("POST", "/api/experimental/artifacts", { title: "Attack page", files: files(attackPage(attackPort)) })
const L = await api("POST", "/api/experimental/artifacts", { title: "Link page", files: files(`<p style="font:14px system-ui;padding:14px"><a id="go" href="http://127.0.0.1:${attackPort}/gesture-ok" style="font-size:20px">open the listener</a></p>`) })
await api("DELETE", `/api/experimental/artifacts/${D.id}`)
const Au = await api("PATCH", `/api/experimental/artifacts/${A.id}`, { title: "Revenue (direct) v2", files: files(page("Revenue (direct) v2", "var(--danger,#c33)")) })

const asst = (t, content) => ({ id: id("msg"), type: "assistant", agent: "build", model, finish: "stop", time: { created: t, completed: t + 1 }, content })
const user = (t, text) => ({ id: id("msg"), type: "user", time: { created: t }, text })
const win = { created: now - 200, ran: now - 100, completed: now + 25_000 }
const exec = (calls, text, time = { created: now, completed: now }) => ({
  type: "tool", id: id("tool"), name: "execute", executed: true,
  state: { status: "completed", input: { code: "..." }, content: [{ type: "text", text }], metadata: { toolCalls: calls } }, time,
})
const call = (name, input) => ({ tool: `opencode.${name}`, status: "completed", input })
const messages = [
  user(now - 9000, "Mock up a revenue card"),
  asst(now - 8900, [tool("artifact_create", { title: A.title, files: files("…") }, `Published ${A.title} (${A.id} via local): ${A.url}`), { type: "text", text: "Direct create." }]),
  user(now - 8000, "Make the bar red"),
  asst(now - 7900, [tool("artifact_update", { id: A.id, title: Au.title, files: files("…") }, `Updated ${Au.title} (${A.id}): ${A.url}`), { type: "text", text: "Direct update." }]),
  user(now - 7000, "Funnel chart in Code Mode"),
  asst(now - 6900, [exec([call("artifact_create", { title: B.title, files: files(page("Funnel (returned id)", "var(--info,#37c)")) })], JSON.stringify({ id: B.id, title: B.title })), { type: "text", text: "Returned id." }]),
  user(now - 6000, "A quick throwaway"),
  asst(now - 5900, [exec([call("artifact_create", { title: D.title, files: files(page("Throwaway (deleted)", "var(--warning,#c80)")) }), call("artifact_delete", { id: D.id })], "{}", { created: now - 5890, ran: now - 5880, completed: now - 5860 }), { type: "text", text: "Created then deleted: the card renders from the call." }]),
  user(now - 5000, "Show the window match"),
  asst(now - 4900, [exec([call("artifact_create", { title: "Window match", files: files(page("Window match (no returned id)", "var(--accent,#48f)")) })], "", win), { type: "text", text: "No id returned." }]),
  user(now - 4500, "A link"),
  asst(now - 4400, [tool("artifact_create", { title: L.title, files: files("…") }, `Published ${L.title} (${L.id} via local): ${L.url}`), { type: "text", text: "Link." }]),
  user(now - 4000, "Hostile page"),
  asst(now - 3900, [tool("artifact_create", { title: E.title, files: files("…") }, `Published ${E.title} (${E.id} via local): ${E.url}`), { type: "text", text: "Attack." }]),
]
const imp = await fetch(base + "/api/experimental/session/import", { method: "POST", headers, body: JSON.stringify({ info, messages, location: { directory } }) })
if (!imp.ok) throw new Error(`import ${imp.status} ${await imp.text()}`)
// Created while the "window match" execute part is running, so only the time window can place it.
const W = await api("POST", "/api/experimental/artifacts", { title: "Window match", files: files(page("Window match (no returned id)", "var(--accent,#48f)")), sessionID: info.id })
console.log(JSON.stringify({ session: info.id, A: A.id, B: B.id, D: D.id, E: E.id, W: W.id, L: L.id }))
