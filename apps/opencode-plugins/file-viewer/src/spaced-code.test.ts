import assert from "node:assert/strict"
import test from "node:test"
import { Window } from "happy-dom"
import { eligible, watchSpacedCode } from "./spaced-code"

function page(html: string) {
  const window = new Window()
  Object.assign(globalThis, { Element: window.Element })
  window.document.body.innerHTML = html
  return { window, doc: window.document as unknown as Document }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

const fire = (window: Window, target: Element, type: string, init: Record<string, unknown> = {}) => {
  const event = type === "click" ? new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }) : new window.Event(type, { bubbles: true })
  target.dispatchEvent(event as unknown as Event)
  return event
}

const checker = (existing: string[], known: string[] = []) => {
  const asked: string[] = []
  const opened: string[] = []
  return {
    asked,
    opened,
    target: async (href: string) => {
      asked.push(href)
      return existing.includes(href) ? `/abs/${href}` : undefined
    },
    peek: (href: string) => (known.includes(href) ? `/abs/${href}` : undefined),
    open: (href: string) => void opened.push(href),
  }
}

const md = (inner: string) => `<div data-component="markdown"><p>${inner}</p></div>`
const KIND = "data-inline-code-kind"
const MARK = "data-fv-spaced"

test("spaced-code: eligible spans", () => {
  const { doc } = page(
    md(
      "<code>~/Movies/My Video.mp4</code><code>plain.png</code><code>a b</code><code data-inline-code-kind='path'>x y.md</code>" +
        "<code>open a.mp4</code><code data-inline-code-kind='path' data-fv-spaced>docs/My Notes.md</code>",
    ),
  )
  const [spaced, plain, short, host, command, ours] = [...doc.querySelectorAll("code")]
  assert.equal(eligible(spaced!), "~/Movies/My Video.mp4")
  assert.equal(eligible(plain!), undefined)
  assert.equal(eligible(short!), undefined)
  assert.equal(eligible(host!), undefined)
  assert.equal(eligible(command!), undefined)
  assert.equal(eligible(ours!), "docs/My Notes.md")
})

test("spaced-code: nothing runs for spans that merely mount", async () => {
  const { doc } = page(md(""))
  const seen = checker(["~/My Video.mp4"])
  const stop = watchSpacedCode(doc, seen)
  doc.querySelector("p")!.innerHTML = "<code>~/My Video.mp4</code> <code>docs/My Notes.md</code>"
  await settle()
  assert.deepEqual(seen.asked, [])
  assert.equal(doc.querySelectorAll(`[${MARK}]`).length, 0)
  stop()
})

test("spaced-code: pointing at an existing file's span marks it with the host's attribute; others stay plain", async () => {
  const { window, doc } = page(md("<code>~/Movies/My Video.mp4</code> <code>~/Movies/Gone File.mp4</code> <code>npm run build</code>"))
  const seen = checker(["~/Movies/My Video.mp4"])
  const stop = watchSpacedCode(doc, seen)
  const [yes, no, command] = [...doc.querySelectorAll("code")]
  for (const code of [yes!, no!, command!]) fire(window, code, "pointerover")
  await settle()
  assert.equal(yes!.getAttribute(KIND), "path")
  assert.equal(yes!.hasAttribute(MARK), true)
  assert.equal(no!.hasAttribute(KIND), false)
  assert.equal(command!.hasAttribute(KIND), false)
  assert.deepEqual(seen.asked, ["~/Movies/My Video.mp4", "~/Movies/Gone File.mp4"])
  stop()
})

test("spaced-code: pointerdown marks too, and a cached answer marks before the event returns", () => {
  const { window, doc } = page(md("<code>docs/My Notes.md</code>"))
  const seen = checker([], ["docs/My Notes.md"])
  const stop = watchSpacedCode(doc, seen)
  const code = doc.querySelector("code")!
  fire(window, code, "pointerdown")
  assert.equal(code.getAttribute(KIND), "path")
  assert.deepEqual(seen.asked, [])
  stop()
})

test("spaced-code: only markdown, never code blocks, links or the host's own marks", async () => {
  const { window, doc } = page(
    `<div><code>~/My Video.mp4</code></div>` +
      md("<a href='#'><code>~/Link Video.mp4</code></a><code data-inline-code-kind='path'>~/Host Video.mp4</code>") +
      `<div data-component="markdown"><pre><code>~/Block Video.mp4</code></pre></div>`,
  )
  const seen = checker(["~/My Video.mp4", "~/Link Video.mp4", "~/Block Video.mp4", "~/Host Video.mp4"])
  const stop = watchSpacedCode(doc, seen)
  for (const code of doc.querySelectorAll("code")) {
    fire(window, code, "pointerover")
    fire(window, code, "click")
  }
  await settle()
  assert.deepEqual(seen.asked, [])
  assert.deepEqual(seen.opened, [])
  stop()
})

test("spaced-code: a click that lands while the check is pending opens once, after the answer", async () => {
  const { window, doc } = page(md("<code>~/Movies/My Video.mp4</code>"))
  const seen = checker(["~/Movies/My Video.mp4"])
  const stop = watchSpacedCode(doc, seen)
  const code = doc.querySelector("code")!
  fire(window, code, "pointerdown")
  fire(window, code, "click")
  assert.deepEqual(seen.opened, [])
  await settle()
  assert.deepEqual(seen.opened, ["~/Movies/My Video.mp4"])
  assert.equal(code.getAttribute(KIND), "path")
  // The next click finds a marked span: the host's handler opens it, not ours.
  fire(window, code, "click")
  await settle()
  assert.deepEqual(seen.opened, ["~/Movies/My Video.mp4"])
  stop()
})

test("spaced-code: a pending click on a missing file opens nothing; a non-primary or handled click is ignored", async () => {
  const { window, doc } = page(md("<code>~/Movies/Gone File.mp4</code> <code>~/Movies/My Video.mp4</code>"))
  const seen = checker(["~/Movies/My Video.mp4"])
  const stop = watchSpacedCode(doc, seen)
  const [gone, there] = [...doc.querySelectorAll("code")]
  fire(window, gone!, "click")
  fire(window, there!, "click", { button: 1 })
  const handled = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
  handled.preventDefault()
  there!.dispatchEvent(handled as unknown as Event)
  await settle()
  assert.deepEqual(seen.opened, [])
  assert.deepEqual(seen.asked, ["~/Movies/Gone File.mp4"])
  stop()
})

test("spaced-code: a span in a part that is still streaming stays plain, like the host's own, and marks once it completes", () => {
  const { window, doc } = page(`<div data-component="markdown" data-streaming><p><code>docs/My Notes.md</code></p></div>`)
  const seen = checker(["docs/My Notes.md"], ["docs/My Notes.md"])
  const stop = watchSpacedCode(doc, seen)
  const code = doc.querySelector("code")!
  assert.equal(eligible(code), undefined)
  fire(window, code, "pointerover")
  fire(window, code, "click")
  assert.equal(code.hasAttribute(KIND), false)
  assert.deepEqual(seen.asked, [])
  assert.deepEqual(seen.opened, [])
  doc.querySelector("[data-component='markdown']")!.removeAttribute("data-streaming")
  fire(window, code, "pointerover")
  assert.equal(code.getAttribute(KIND), "path")
  assert.equal(code.hasAttribute(MARK), true)
  stop()
})

test("spaced-code: changed text drops a stale answer", async () => {
  const { window, doc } = page(md("<code>~/My Video.mp4</code>"))
  const code = doc.querySelector("code")!
  const stop = watchSpacedCode(doc, {
    peek: () => undefined,
    open: () => assert.fail("nothing to open"),
    target: async () => {
      code.textContent = "something else here"
      return "/abs"
    },
  })
  fire(window, code, "pointerover")
  fire(window, code, "click")
  await settle()
  assert.equal(code.hasAttribute(KIND), false)
  stop()
})

test("spaced-code: a mark the host dropped on re-render comes back on the next pointerover, at once", async () => {
  const { window, doc } = page(md("<code>~/My Video.mp4</code>"))
  const seen = checker(["~/My Video.mp4"], ["~/My Video.mp4"])
  const stop = watchSpacedCode(doc, seen)
  const code = doc.querySelector("code")!
  fire(window, code, "pointerover")
  code.removeAttribute(KIND)
  fire(window, code, "pointerover")
  assert.equal(code.getAttribute(KIND), "path")
  assert.deepEqual(seen.asked, [])
  stop()
})

test("spaced-code: stop removes every mark and its listeners", async () => {
  const { window, doc } = page(md("<code>~/My Video.mp4</code> <code data-inline-code-kind='path' data-fv-spaced>~/Other Video.mp4</code>"))
  const seen = checker(["~/My Video.mp4", "~/Other Video.mp4"])
  const stop = watchSpacedCode(doc, seen)
  const [first, second] = [...doc.querySelectorAll("code")]
  fire(window, first!, "pointerover")
  await settle()
  assert.equal(first!.getAttribute(KIND), "path")
  stop()
  assert.equal(doc.querySelectorAll(`[${MARK}], [${KIND}]`).length, 0)
  seen.asked.length = 0
  fire(window, first!, "pointerover")
  fire(window, second!, "click")
  await settle()
  assert.deepEqual(seen.asked, [])
  assert.deepEqual(seen.opened, [])
  assert.equal(first!.hasAttribute(KIND), false)
})

test("spaced-code: an answer that lands after stop changes nothing", async () => {
  const { window, doc } = page(md("<code>~/My Video.mp4</code>"))
  let release: (value: string) => void = () => {}
  const opened: string[] = []
  const stop = watchSpacedCode(doc, { peek: () => undefined, open: (href) => void opened.push(href), target: () => new Promise((resolve) => (release = resolve)) })
  const code = doc.querySelector("code")!
  fire(window, code, "click")
  stop()
  release("/abs")
  await settle()
  assert.equal(code.hasAttribute(KIND), false)
  assert.deepEqual(opened, [])
})
