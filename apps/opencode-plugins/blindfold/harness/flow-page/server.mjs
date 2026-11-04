// A Google-style multi-step sign-in for the flow-approval harness: email, then password, then a one-time code, one input per
// step. No library. Fake values only. Usage: node server.mjs [port]
import { createServer } from "node:http"

const port = Number(process.argv[2] ?? 47341)
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Flow sign-in</title>
<style>body{font:16px/1.4 -apple-system,system-ui,sans-serif;margin:32px;max-width:480px}label{display:block;margin:14px 0 4px;font-weight:600}input{font:18px ui-monospace,Menlo,monospace;padding:8px 10px;width:100%;box-sizing:border-box;border:1px solid #888;border-radius:6px}button{margin-top:16px;font-size:16px;padding:8px 16px}</style></head>
<body><h1>Sign in (flow test)</h1><div id="step"></div>
<script>
const STEPS = [
  { id: "identifierId", label: "Email or phone", attrs: 'type="email" autocomplete="username" aria-label="Email or phone"', button: "Next" },
  { id: "password", label: "Enter your password", attrs: 'type="password" autocomplete="current-password"', button: "Next" },
  { id: "totp", label: "Enter code", attrs: 'type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"', button: "Verify" },
]
let index = 0
const root = document.getElementById("step")
function render() {
  const step = STEPS[index]
  if (!step) { root.innerHTML = '<p id="done">Signed in</p>'; return }
  root.innerHTML = '<label for="' + step.id + '">' + step.label + '</label><input id="' + step.id + '" ' + step.attrs + '><button id="next" type="button">' + step.button + '</button>'
  document.getElementById("next").onclick = () => { if (document.getElementById(step.id).value) { index++; render() } }
}
render()
window.__flow = () => ({ step: index, done: index >= STEPS.length })
</script></body></html>`

createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" })
  res.end(PAGE)
}).listen(port, "127.0.0.1", () => console.log(`listening http://127.0.0.1:${port}/signin`))
