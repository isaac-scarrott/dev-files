import assert from "node:assert/strict"
import { test } from "node:test"
import { peerOf, PEER_KEY } from "./card.js"
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
