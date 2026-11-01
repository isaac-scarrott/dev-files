import assert from "node:assert/strict"
import test from "node:test"
import { Window } from "happy-dom"
import { eligible, watchSpacedCode } from "./spaced-code"

function page(html: string) {
  const window = new Window()
  Object.assign(globalThis, {
    MutationObserver: window.MutationObserver,
    Element: window.Element,
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0) as unknown as number,
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  })
  window.document.body.innerHTML = html
  return window.document as unknown as Document
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

const checker = (existing: string[]) => {
  const asked: string[] = []
  return {
    asked,
    target: async (href: string) => {
      asked.push(href)
      return existing.includes(href) ? `/abs/${href}` : undefined
    },
    peek: () => undefined,
  }
}

const md = (inner: string) => `<div data-component="markdown"><p>${inner}</p></div>`

test("spaced-code: eligible spans", () => {
  const doc = page(
    md("<code>~/Movies/My Video.mp4</code><code>plain.png</code><code>a b</code><code data-inline-code-kind='path'>x y.md</code><code>open a.mp4</code>"),
  )
  const [a, b, c, d, e] = [...doc.querySelectorAll("code")]
  assert.equal(eligible(a!), true)
  assert.equal(eligible(b!), false)
  assert.equal(eligible(c!), false)
  assert.equal(eligible(d!), false)
  assert.equal(eligible(e!), false)
})

test("spaced-code: marks an existing file's span with the host's attribute and leaves others", async () => {
  const doc = page(md("<code>~/Movies/My Video.mp4</code> <code>~/Movies/Gone File.mp4</code> <code>npm run build</code>"))
  const stop = watchSpacedCode(doc, checker(["~/Movies/My Video.mp4"]))
  await settle()
  const [yes, no, other] = [...doc.querySelectorAll("code")]
  assert.equal(yes!.getAttribute("data-inline-code-kind"), "path")
  assert.equal(no!.hasAttribute("data-inline-code-kind"), false)
  assert.equal(other!.hasAttribute("data-inline-code-kind"), false)
  stop()
})

test("spaced-code: only markdown, never code blocks or links", async () => {
  const doc = page(
    `<div><code>~/My Video.mp4</code></div>` +
      md("<a href='#'><code>~/Link Video.mp4</code></a>") +
      `<div data-component="markdown"><pre><code>~/Block Video.mp4</code></pre></div>`,
  )
  const seen = checker(["~/My Video.mp4", "~/Link Video.mp4", "~/Block Video.mp4"])
  const stop = watchSpacedCode(doc, seen)
  await settle()
  assert.deepEqual(seen.asked, [])
  stop()
})

test("spaced-code: spans added later are found, and a host-removed mark comes back", async () => {
  const doc = page(md(""))
  const stop = watchSpacedCode(doc, checker(["~/My Video.mp4"]))
  doc.querySelector("p")!.innerHTML = "<code>~/My Video.mp4</code>"
  await settle()
  const code = doc.querySelector("code")!
  assert.equal(code.getAttribute("data-inline-code-kind"), "path")
  code.removeAttribute("data-inline-code-kind")
  await settle()
  assert.equal(code.getAttribute("data-inline-code-kind"), "path")
  stop()
})

test("spaced-code: changed text is rechecked and a stale answer is dropped", async () => {
  const doc = page(md("<code>~/My Video.mp4</code>"))
  const code = doc.querySelector("code")!
  const stop = watchSpacedCode(doc, {
    peek: () => undefined,
    target: async () => {
      code.textContent = "something else here"
      return "/abs"
    },
  })
  await settle()
  assert.equal(code.hasAttribute("data-inline-code-kind"), false)
  stop()
})

test("spaced-code: stop removes every mark and ignores later changes", async () => {
  const doc = page(md("<code>~/My Video.mp4</code>"))
  const seen = checker(["~/My Video.mp4"])
  const stop = watchSpacedCode(doc, seen)
  await settle()
  stop()
  assert.equal(doc.querySelectorAll("[data-fv-spaced], [data-inline-code-kind]").length, 0)
  seen.asked.length = 0
  doc.querySelector("p")!.innerHTML = "<code>~/Other Video.mp4</code>"
  await settle()
  assert.deepEqual(seen.asked, [])
})

test("spaced-code: a large batch is spread over frames", async () => {
  const many = Array.from({ length: 400 }, (_, index) => `<code>~/Dir/File ${index}.mp4</code>`).join(" ")
  const doc = page(md(many))
  const frames: Array<() => void> = []
  Object.assign(globalThis, { requestAnimationFrame: (fn: () => void) => frames.push(fn), cancelAnimationFrame: () => {} })
  const seen = checker([])
  const stop = watchSpacedCode(doc, seen)
  const counts: number[] = []

  while (frames.length > 0 && counts.length < 10) {
    frames.shift()!()
    counts.push(seen.asked.length)
  }

  assert.deepEqual(counts, [150, 300, 400])
  stop()
})
