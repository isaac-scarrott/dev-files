// Local login test page for the fill-and-mask spike. Fake values only.
// Usage: REACT_UMD_DIR=<dir with umd/react.production.min.js and react-dom umd> node server.mjs [port]
// Serves /login (React 18 controlled inputs: Google-style email combobox, password with a Show toggle, a plain text
// input, a one-time-code input, an echo line that repeats the email) and POST /submit (so network capture sees a body).
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const port = Number(process.argv[2] ?? 47321)
const umd = process.env.REACT_UMD_DIR
if (!umd) throw new Error("REACT_UMD_DIR is required (a react-dom package dir; react is its sibling)")
const files = {
  "/react.js": join(umd, "..", "react", "umd", "react.production.min.js"),
  "/react-dom.js": join(umd, "umd", "react-dom.production.min.js"),
  "/login": new URL("./login.html", import.meta.url).pathname,
  "/app.js": new URL("./app.js", import.meta.url).pathname,
  // The spike driver fetches the fill script from here (Code Mode has no filesystem).
  "/fill.js": new URL("../fill.js", import.meta.url).pathname,
}

createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname
  if (req.method === "POST" && path === "/submit") {
    let size = 0
    req.on("data", (chunk) => (size += chunk.length))
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true, bytes: size }))
    })
    return
  }
  const file = files[path]
  if (!file) {
    res.writeHead(404).end()
    return
  }
  const type = path.endsWith(".js") ? "text/javascript" : "text/html"
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" })
  res.end(readFileSync(file))
}).listen(port, "127.0.0.1", () => console.log(`listening http://127.0.0.1:${port}/login`))
