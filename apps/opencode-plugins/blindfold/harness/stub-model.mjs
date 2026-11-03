// A stub OpenAI-compatible model for the private harness. Each user turn it calls Code Mode `execute` with the code in
// $BF_CODE_FILE (read per request), then answers with text once the tool result is back. Usage: node stub-model.mjs
import { createServer } from "node:http"
import { readFileSync, writeFileSync } from "node:fs"
const port = Number(process.env.BF_STUB_PORT ?? 49882)
const codeFile = process.env.BF_CODE_FILE
const log = process.env.BF_STUB_LOG
const chunk = (delta, finish) => `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "stub-1", choices: [{ index: 0, delta, finish_reason: finish ?? null }] })}\n\n`
createServer((req, res) => {
  let data = ""
  req.on("data", (c) => (data += c))
  req.on("end", () => {
    if (req.method !== "POST" || !/chat\/completions/.test(req.url)) return res.writeHead(404).end()
    const body = JSON.parse(data)
    if (log && body.messages.at(-1)?.role === "tool") writeFileSync(log, JSON.stringify(body)) // the follow-up: what the model sees of the tool result
    const last = body.messages.at(-1)
    console.log(new Date().toISOString(), "request", "last=" + last?.role, "messages=" + body.messages.length, "tools=" + (body.tools?.length ?? 0))
    res.writeHead(200, { "content-type": "text/event-stream" })
    if (!body.tools?.length || last?.role === "tool") {
      res.write(chunk({ role: "assistant", content: "Done." }))
      res.write(chunk({}, "stop"))
    } else {
      const code = readFileSync(codeFile, "utf8")
      const tool = body.tools?.some((t) => t.function?.name === "execute") ? "execute" : "blindfold_get"
      const args = tool === "execute" ? { code } : JSON.parse(code)
      res.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: "function", function: { name: tool, arguments: JSON.stringify(args) } }] }))
      res.write(chunk({}, "tool_calls"))
    }
    res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "stub-1", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
    res.end("data: [DONE]\n\n")
  })
}).listen(port, "127.0.0.1", () => console.log("stub listening", port))
setTimeout(() => process.exit(0), Number(process.env.BF_STUB_MS ?? 1800000)).unref?.()
