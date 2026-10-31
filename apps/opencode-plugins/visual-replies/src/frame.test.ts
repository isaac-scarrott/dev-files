import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { buildDocument, csp, heightLimits, parseFrameMessage, readTheme, sandbox, themeKey } from "./frame"

const theme = { mode: "dark" as const, vars: { "--bg": "#111", "--fg": "#eee" } }

test("sandbox never grants the app origin", () => {
  assert.equal(sandbox, "allow-scripts")
  for (const forbidden of ["allow-same-origin", "allow-top-navigation", "allow-popups", "allow-forms"]) {
    assert.ok(!sandbox.includes(forbidden))
  }
  assert.match(csp, /default-src 'none'/)
  assert.match(csp, /connect-src 'none'/)
  assert.ok(!/https?:/.test(csp))
})

test("the document wraps hostile HTML after the CSP and the bridge", () => {
  const html = `<!-- <head> --><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head><script>fetch("//x")</script>`
  const doc = buildDocument({ id: "c1", html, theme })
  assert.ok(doc.indexOf("Content-Security-Policy") < doc.indexOf("<!-- <head>"))
  assert.ok(doc.indexOf("<script>") < doc.indexOf(html))
  assert.ok(doc.startsWith("<!doctype html><html><head>"))
  assert.match(doc, /:root\{color-scheme:dark;--bg:#111;--fg:#eee\}/)
})

test("theme values cannot break out of the style element", () => {
  const doc = buildDocument({ id: "c1", html: "", theme: { mode: "light", vars: { "--bg": "red}</style><script>x", "--ok": "blue", "bad name": "1" } } })
  assert.ok(!doc.includes("</style><script>x"))
  assert.match(doc, /--ok:blue/)
  assert.ok(!doc.includes("bad name"))
})

test("parseFrameMessage accepts only this frame's well-formed messages", () => {
  assert.deepEqual(parseFrameMessage({ vr: "c1", type: "ready" }, "c1"), { type: "ready" })
  assert.equal(parseFrameMessage({ vr: "other", type: "ready" }, "c1"), undefined)
  assert.equal(parseFrameMessage("ready", "c1"), undefined)
  assert.equal(parseFrameMessage({ vr: "c1", type: "height", height: "9" }, "c1"), undefined)
  assert.equal(parseFrameMessage({ vr: "c1", type: "height", height: Infinity }, "c1"), undefined)
  assert.deepEqual(parseFrameMessage({ vr: "c1", type: "height", height: 99999 }, "c1"), { type: "height", height: heightLimits.max })
  assert.deepEqual(parseFrameMessage({ vr: "c1", type: "height", height: 1 }, "c1"), { type: "height", height: heightLimits.min })
  assert.deepEqual(parseFrameMessage({ vr: "c1", type: "open", url: "https://a.dev/x" }, "c1"), { type: "open", url: "https://a.dev/x" })
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "not a url", 5]) {
    assert.equal(parseFrameMessage({ vr: "c1", type: "open", url }, "c1"), undefined)
  }
})

test("readTheme maps app tokens and keys on content", () => {
  const dark = readTheme("dark", (token) => (token === "--v2-text-text-base" ? " #fff " : ""), { sans: "Inter", mono: "Menlo" })
  assert.deepEqual(dark.vars, { "--fg": "#fff", "--font": "Inter", "--mono": "Menlo" })
  assert.notEqual(themeKey(dark), themeKey({ ...dark, mode: "light" }))
})

test("the bridge script reports height, forwards theme and routes links", () => {
  const window = new Window({ url: "about:blank" })
  const posted: any[] = []
  const parent = { postMessage: (message: unknown) => posted.push(message) }
  const script = buildDocument({ id: "c1", html: "", theme }).match(/<script>([\s\S]*?)<\/script>/)![1]!
  const fn = new window.Function("parent", "ResizeObserver", "requestAnimationFrame", script.replace("(function(){", "(function(){"))
  window.document.body.innerHTML = `<a id="x" href="https://a.dev/">x</a><a id="y" href="javascript:1">y</a>`
  ;(window as any).parent = parent
  fn.call(window, parent, undefined, (run: () => void) => run())
  window.dispatchEvent(new window.Event("load"))
  assert.ok(posted.some((message) => message.type === "ready" && message.vr === "c1"))
  window.document.getElementById("x")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))
  window.document.getElementById("y")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))
  assert.deepEqual(posted.filter((message) => message.type === "open").map((message) => message.url), ["https://a.dev/"])
})
