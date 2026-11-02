import assert from "node:assert/strict"
import { test } from "node:test"
import { firstLine, hasMore, unescapeMarkup } from "./injected-text.js"

test("unescapeMarkup undoes the wrapper escaping once", () => {
  assert.equal(unescapeMarkup("OK -&gt; Alert &amp; &lt;b&gt; &quot;x&quot;"), 'OK -> Alert & <b> "x"')
  assert.equal(unescapeMarkup("-&amp;gt;"), "-&gt;")
  assert.equal(unescapeMarkup("plain & text < 3"), "plain & text < 3")
  assert.equal(unescapeMarkup("&nbsp; &#62;"), "&nbsp; &#62;")
})

test("firstLine skips blank lines and trims", () => {
  assert.equal(firstLine("\n  \n  hello  \nworld"), "hello")
  assert.equal(firstLine(""), "")
  assert.equal(firstLine("   "), "")
})

test("hasMore is true only when a second non-empty line exists", () => {
  assert.equal(hasMore("one"), false)
  assert.equal(hasMore("one\n\n  \n"), false)
  assert.equal(hasMore("one\ntwo"), true)
})
