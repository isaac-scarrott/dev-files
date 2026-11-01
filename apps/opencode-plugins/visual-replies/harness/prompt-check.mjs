// Proves the server hook: a stub OpenAI-compatible model records the request the agent loop sends.
// Usage: node prompt-check.mjs <recordFile>   (starts the stub on VR_STUB_PORT, default 49881, prints nothing else)
import { createServer } from "node:http"
import { writeFileSync } from "node:fs"
const port = Number(process.env.VR_STUB_PORT ?? 49881)
const out = process.argv[2]
const bodies = []
createServer((req, res) => {
  let data = ""
  req.on("data", (c) => (data += c))
  req.on("end", () => {
    if (req.method === "POST" && /chat\/completions/.test(req.url)) {
      bodies.push(data)
      writeFileSync(out, JSON.stringify(bodies.map((b) => { try { return JSON.parse(b) } catch { return b } })))
      res.writeHead(200, { "content-type": "text/event-stream" })
      const chunk = (delta, finish) => `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "stub-1", choices: [{ index: 0, delta, finish_reason: finish ?? null }] })}\n\n`
      res.write(chunk({ role: "assistant", content: "ok" }))
      res.write(chunk({}, "stop"))
      res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "stub-1", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
      res.end("data: [DONE]\n\n")
      return
    }
    res.writeHead(404).end()
  })
}).listen(port, "127.0.0.1", () => console.log("stub listening"))
setTimeout(() => process.exit(0), Number(process.env.VR_STUB_MS ?? 60000)).unref?.()
