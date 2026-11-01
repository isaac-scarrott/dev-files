import assert from "node:assert/strict"
import { test } from "node:test"
import { vetoNavigation } from "./guard"

const nav = (url: string, frameUrl: string | undefined, isMainFrame = false) => ({ url, frameUrl, isMainFrame })

test("a page in a srcdoc frame may not navigate anywhere", () => {
  for (const url of ["https://evil.test/?d=1", "http://127.0.0.1:9/x", "data:text/html,x", "blob:https://a/b", "file:///etc/passwd", "about:blank", "javascript:1"]) {
    assert.equal(vetoNavigation(nav(url, "about:srcdoc")), true, url)
  }
})

test("our own srcdoc load and reload are allowed", () => {
  assert.equal(vetoNavigation(nav("about:srcdoc", "about:srcdoc")), false)
  assert.equal(vetoNavigation(nav("about:srcdoc", "about:blank")), false)
  assert.equal(vetoNavigation(nav("about:srcdoc", undefined)), false)
})

test("the main frame and the app's other frames are never touched", () => {
  assert.equal(vetoNavigation(nav("https://a.dev/", "about:srcdoc", true)), false)
  assert.equal(vetoNavigation(nav("https://a.dev/", "blob:oc://renderer/x")), false)
  assert.equal(vetoNavigation(nav("https://a.dev/", "about:blank")), false)
  assert.equal(vetoNavigation(nav("https://a.dev/", undefined)), false)
})
