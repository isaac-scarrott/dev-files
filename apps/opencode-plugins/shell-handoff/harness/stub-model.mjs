// A stub OpenAI-compatible model for the private harness. A user turn containing "ARM" calls the `shell` tool with the
// JSON in $SH_ARGS (read per request); the follow-up answers "Done."; anything else answers "OK".
// Every request body is appended to $SH_LOG, one JSON per line, so a test can read what the model was shown.
import { createServer } from "node:http"
import { appendFileSync, readFileSync } from "node:fs"
const port = Number(process.env.SH_STUB_PORT ?? 49642)
const chunk = (delta, finish) => `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "stub-1", choices: [{ index: 0, delta, finish_reason: finish ?? null }] })}\n\n`
createServer((req, res) => {
  let data = ""
  req.on("data", (c) => (data += c))
  req.on("end", () => {
    if (req.method !== "POST" || !/chat\/completions/.test(req.url)) return res.writeHead(404).end()
    const body = JSON.parse(data)
    if (process.env.SH_LOG) appendFileSync(process.env.SH_LOG, JSON.stringify(body) + "\n")
    const last = body.messages.at(-1)
    const text = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "")
    res.writeHead(200, { "content-type": "text/event-stream" })
    if (last?.role !== "tool" && /ARM/.test(text) && body.tools?.some((t) => t.function?.name === "shell")) {
      res.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: "function", function: { name: "shell", arguments: readFileSync(process.env.SH_ARGS, "utf8") } }] }))
      res.write(chunk({}, "tool_calls"))
    } else {
      res.write(chunk({ role: "assistant", content: last?.role === "tool" ? "Done." : "OK" }))
      res.write(chunk({}, "stop"))
    }
    res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "stub-1", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
    res.end("data: [DONE]\n\n")
  })
}).listen(port, "127.0.0.1", () => console.log("stub listening", port))
setTimeout(() => process.exit(0), Number(process.env.SH_STUB_MS ?? 1800000)).unref?.()
