import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { test } from "node:test"
import { escapeMarkup, peerOf, PEER_KEY } from "./card.js"
import { deliver, peerMetadata, TRAILER } from "./peers.js"

test("peerOf reads what the server writes", () => {
  const metadata = peerMetadata({ id: "ses_abcdefgh12345678", title: "Greeting" }, "hi <b>")
  assert.deepEqual(peerOf({ type: "user", metadata }), { sessionID: "ses_abcdefgh12345678", title: "Greeting", ref: "12345678", text: "hi <b>" })
})

test("a typed look-alike is not a peer message", () => {
  assert.equal(peerOf({ type: "user" }), undefined)
  assert.equal(peerOf({ type: "user", metadata: {} }), undefined)
})

test("peerOf rejects malformed metadata and non-user messages", () => {
  assert.equal(peerOf({ type: "user", metadata: { [PEER_KEY]: { sessionID: 1, title: "x", ref: "r", text: "t" } } }), undefined)
  assert.equal(peerOf({ type: "user", metadata: { [PEER_KEY]: "x" } }), undefined)
  const ok = peerMetadata({ id: "ses_x", title: "T" }, "t")
  assert.equal(peerOf({ type: "assistant", metadata: ok }), undefined)
})

test("the card text is the plain body: the trailer is never in it", () => {
  const from = { id: "ses_abcdefgh12345678", title: "Greeting" }
  const shown = peerOf({ type: "user", metadata: peerMetadata(from, "hello") })
  assert.equal(shown?.text, "hello")
  assert.ok(deliver(from, "hello").includes(TRAILER))
  assert.ok(!shown?.text.includes(TRAILER))
})

// The host reads a package's `features` (server, gui) once when its service starts and never re-detects them, so the
// card only reaches a window if this export and bundle already existed at that start. Keep both in the package.
test("the package exports a built GUI bundle that carries the card", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { exports: Record<string, string> }
  const entry = pkg.exports["./gui-experimental"]
  assert.equal(entry, "./dist/gui-experimental.cjs")
  const bundle = readFileSync(new URL(`../${entry}`, import.meta.url), "utf8")
  assert.ok(bundle.includes("data-peer-card"))
})

test("escapeMarkup shows tags as typed and leaves code alone", () => {
  assert.equal(escapeMarkup("a <b>x</b> & y"), "a &lt;b>x&lt;/b> &amp; y")
  assert.equal(escapeMarkup("run `<div> & 1` now"), "run `<div> & 1` now")
  assert.equal(escapeMarkup("```html\n<p>&</p>\n```\n<i>"), "```html\n<p>&</p>\n```\n&lt;i>")
  assert.equal(escapeMarkup("```open <x>"), "```open <x>")
  assert.equal(escapeMarkup("plain"), "plain")
})

// The row takes every colour from the host's --v2 tokens so both themes follow.
test("the card's styles hard-code no colour", () => {
  const source = readFileSync(new URL("./gui.tsx", import.meta.url), "utf8")
  const css = source.slice(source.indexOf("const css = `"), source.indexOf("`\n\ntype Located"))
  assert.ok(css.length > 500)
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(css))
  assert.ok(css.includes("var(--v2-background-bg-layer-02)"))
})
