#!/usr/bin/env node
// Seed a throwaway OpenCode server with a long session plus a subagent child, with no model calls.
// Usage: node seed-session.mjs <baseUrl> <password> <projectDir> [turns=40]
// Uses POST /api/experimental/session/import; /synthetic only queues inbox items and never renders.
import { randomBytes } from "node:crypto"

const [base, password, directory, turns = "40"] = process.argv.slice(2)
if (!password || !directory) throw new Error("usage: seed-session.mjs <baseUrl> <password> <projectDir> [turns]")

const headers = {
  "content-type": "application/json",
  authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64"),
}
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const rand = (n) => Array.from(randomBytes(n), (b) => B62[b % 62]).join("")
// Ids sort by creation time: 12 hex of a monotonic counter + 14 random chars.
let seq = Date.now() * 4096
const id = (prefix) => `${prefix}_${(seq++).toString(16).padStart(12, "0").slice(-12)}${rand(14)}`

const model = { id: "seed", providerID: "seed" }
const zeroTokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

const session = (title, parentID) => {
  const now = Date.now()
  return { id: id("ses"), parentID, projectID: "global", agent: "build", model, cost: 0, tokens: zeroTokens, title, time: { created: now, updated: now }, location: { directory } }
}
const messages = (label) => {
  const out = []
  let t = Date.now() - Number(turns) * 2000
  for (let i = 1; i <= Number(turns); i++) {
    out.push({ id: id("msg"), type: "user", time: { created: (t += 1000) }, text: `${label} question ${i}` })
    out.push({
      id: id("msg"), type: "assistant", agent: "build", model, finish: "stop",
      time: { created: (t += 1000), completed: t },
      content: [{ type: "text", text: `${label} answer ${i}\n\n${"lorem ipsum dolor sit amet ".repeat(12)}` }],
    })
  }
  return out
}
const send = async (info, msgs) => {
  const res = await fetch(base + "/api/experimental/session/import", { method: "POST", headers, body: JSON.stringify({ info, messages: msgs, location: { directory } }) })
  if (!res.ok) throw new Error(`import ${res.status} ${await res.text()}`)
}

const parent = session("Seeded long session")
const child = session("Seeded subagent", parent.id)
await send(parent, messages("parent"))
await send(child, messages("child"))
console.log(JSON.stringify({ parent: parent.id, child: child.id }))
