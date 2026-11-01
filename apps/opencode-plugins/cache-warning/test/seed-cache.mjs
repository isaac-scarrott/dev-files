#!/usr/bin/env node
// Seeds one session per cache scenario into a throwaway OpenCode server, with no model calls. Ages are relative to now.
// Usage: node seed-cache.mjs <baseUrl> <password> <projectDir> [provider=stub] [modelA=a] [warmSeconds=290]
//   SUFFIX appends to every title; ONLY keeps the scenarios whose title contains it.
//   warmSeconds: how long ago the "expires soon" session's last reply ended (the 5 minute cache runs out 300 - n s later).
import { randomBytes } from "node:crypto"

const [base, password, directory, provider = "stub", modelA = "a", warm = "290"] = process.argv.slice(2)
if (!password || !directory) throw new Error("usage: seed-cache.mjs <baseUrl> <password> <projectDir> [provider] [modelA] [warmSeconds]")

const headers = {
  "content-type": "application/json",
  authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64"),
}
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const rand = (n) => Array.from(randomBytes(n), (b) => B62[b % 62]).join("")
let seq = Date.now() * 4096
const id = (prefix) => `${prefix}_${(seq++).toString(16).padStart(12, "0").slice(-12)}${rand(14)}`

const model = { id: modelA, providerID: provider }
const MIN = 60_000
const now = Date.now()
const suffix = process.env.SUFFIX ?? ""
const only = process.env.ONLY

const tokens = (context) => ({
  input: 200,
  output: 800,
  reasoning: 0,
  cache: { read: Math.round(context * 0.85), write: Math.round(context * 0.15) },
})

const session = (title, parentID) => ({
  id: id("ses"), parentID, projectID: "global", agent: "build", model, cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  title: title + suffix, time: { created: now - 60 * MIN, updated: now }, location: { directory },
})

/** Six prompt/answer turns; the last answer ended `agoMs` ago and the context then held `context` tokens. */
const thread = (agoMs, context, extra = []) => {
  const out = []
  let t = now - agoMs - 12 * MIN
  for (let i = 1; i <= 6; i++) {
    out.push({ id: id("msg"), type: "user", time: { created: (t += 1000) }, text: `question ${i}` })
    const last = i === 6
    const end = last ? now - agoMs : (t += 60_000)
    out.push({
      id: id("msg"), type: "assistant", agent: "build", model, finish: "stop",
      tokens: tokens(Math.round((context * i) / 6)),
      time: { created: end - 20_000, streamed: end - 500, completed: end },
      content: [{ type: "text", text: `answer ${i}\n\n${"lorem ipsum dolor sit amet ".repeat(8)}` }],
    })
  }
  return [...out, ...extra]
}

const compaction = (at) => ({
  id: id("msg"), type: "compaction", status: "completed", reason: "manual", summary: "Summary of the conversation so far.",
  time: { created: at },
})

const send = async (info, messages) => {
  const res = await fetch(base + "/api/experimental/session/import", {
    method: "POST", headers, body: JSON.stringify({ info, messages, location: { directory } }),
  })
  if (!res.ok) throw new Error(`import ${res.status} ${await res.text()}`)
}

const scenarios = [
  ["Cache idle 12 min", thread(12 * MIN, 180_000)],
  ["Cache warm 1 min", thread(1 * MIN, 180_000)],
  ["Cache expires soon", thread(Number(warm) * 1000, 180_000)],
  ["Cache small context", thread(12 * MIN, 8_000)],
  ["Cache after compaction", thread(2 * MIN, 180_000, [compaction(now - MIN)])],
  ["Cache idle then sent", thread(12 * MIN, 180_000, [{ id: id("msg"), type: "user", time: { created: now - MIN }, text: "sent just now" }])],
]

const out = {}
for (const [title, messages] of scenarios) {
  if (only && !title.includes(only)) continue
  const info = session(title)
  await send(info, messages)
  out[title] = info.id
}
if (only) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }
const parent = session("Cache subagent parent")
const child = session("Cache idle subagent", parent.id)
await send(parent, thread(12 * MIN, 180_000))
await send(child, thread(12 * MIN, 180_000))
out["Cache idle subagent"] = child.id
console.log(JSON.stringify(out, null, 2))
