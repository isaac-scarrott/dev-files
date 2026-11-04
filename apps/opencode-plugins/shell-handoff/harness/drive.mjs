// Drives the private harness service over HTTP. Usage: node drive.mjs <command> [args]
//   session            create a session in the harness project, print its id
//   prompt <id> <txt>  send a prompt and wait until the session is idle
//   shells             list the host's shell jobs
//   messages <id>      print the session's messages (compact)
import { readFileSync } from "node:fs"
const root = process.env.OC_HARNESS_ROOT ?? "/private/tmp/oc-harness-shh"
const svc = JSON.parse(readFileSync(`${root}/state/opencode/service.json`, "utf8"))
const headers = { "content-type": "application/json", authorization: "Basic " + Buffer.from(`opencode:${svc.password}`).toString("base64") }
const api = async (path, init = {}) => {
  const res = await fetch(svc.url + path, { ...init, headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : undefined
}
const [command, a, b] = process.argv.slice(2)
if (command === "session") {
  const out = await api("/api/session", { method: "POST", body: JSON.stringify({ location: { directory: `${root}/project` } }) })
  console.log(out.data?.id ?? out.id)
} else if (command === "prompt") {
  await api(`/api/session/${a}/prompt`, { method: "POST", body: JSON.stringify({ text: b }) })
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const active = await api("/api/session/active")
    if (!(a in (active.data ?? active))) break
  }
  console.log("idle")
} else if (command === "shells") {
  console.log(JSON.stringify(await api("/api/shell"), null, 1))
} else if (command === "messages") {
  const out = await api(`/api/session/${a}/message`)
  console.log(JSON.stringify(out, null, 1).slice(0, Number(b ?? 6000)))
} else console.log("unknown command")
if (command === "synthetic") {
  await api(`/api/session/${a}/synthetic`, { method: "POST", body: JSON.stringify({ text: process.argv[5] ?? "probe notice", description: "probe", delivery: b, resume: false }) })
  console.log("queued", b)
}
