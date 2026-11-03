import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { test } from "node:test"
import { Window } from "happy-dom"
import { CARD, NEEDS_YOU, PROBES } from "./host-markup"
import { HINT_VAR, toastCss } from "./style"

const here = new URL(".", import.meta.url)

test("only host-markup.ts names the host's toast markup", () => {
  for (const file of readdirSync(here).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "host-markup.ts")) {
    const code = readFileSync(new URL(file, here), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    for (const literal of code.match(/["'`][^"'`]*["'`]/g) ?? []) {
      assert.doesNotMatch(literal, /\[data-|\.toast-v2|sonner|button-v2/, `${file} names host markup: ${literal}`)
    }
    assert.doesNotMatch(code.replace(/`[\s\S]*?`/g, (template) => template.replace(/\$\{[^}]*\}/g, "")), /\[data-|\.toast-v2|sonner|button-v2/, `${file} names host markup in a template`)
  }
})

test("the css is balanced and sets no glyph colour", () => {
  const css = toastCss()
  assert.equal(css.split("{").length, css.split("}").length)
  const glyphRules = css.split("\n").filter((line) => /\[data-icon\](?: [a-z]+)?\s*\{[^}]*\bcolor\s*:/.test(line))
  assert.deepEqual(glyphRules, [], "no rule colours a glyph")
  assert.doesNotMatch(css, /icon-accent|state-fg-danger|--v2-icon-icon-(?:base|muted)/, "every glyph keeps the app's own colour")
})

test("every host selector in use matches the documented markup", () => {
  const window = new Window()
  const document = window.document as unknown as Document
  document.body.innerHTML = `
    <ol class="toast-v2-region" data-sonner-toaster>
      <li class="toast-v2 toast-v2--default" data-sonner-toast data-front="true" data-expanded="false" data-visible="true" data-removed="false">
        <button data-close-button></button>
        <div data-icon><svg><use href="#opencode-v2-icon-notifications"></use></svg></div>
        <div data-content><div data-title>T</div><div data-description>D</div></div>
        <div data-slot="toast-v2-actions"><button data-component="button-v2" data-variant="neutral">Open</button></div>
      </li>
      <li class="toast-v2" data-sonner-toast data-front="false" data-expanded="false" data-visible="false" data-removed="false"></li>
    </ol>`
  for (const probe of PROBES) {
    if (probe.name === "state: collapsed behind") continue
    assert.ok(document.querySelector(probe.selector), `${probe.name}: ${probe.selector}`)
  }
  document.body.innerHTML = `<ol class="toast-v2-region"><li class="toast-v2" data-sonner-toast data-expanded="false" data-front="false"></li></ol>`
  assert.ok(document.querySelector(PROBES.find((probe) => probe.name === "state: collapsed behind")!.selector))
  assert.ok(CARD.startsWith(".toast-v2-region"))
})

test("one hook on a kind only: the waiting request's glyph; nothing is scoped to who raised a toast", () => {
  assert.match(NEEDS_YOU, /icon-notifications/)
  const css = toastCss()
  assert.equal(css.split(NEEDS_YOU).length - 1, 4, "the contrast button (rest, hover, pressed) and its hint")
  assert.doesNotMatch(css, /icon-(?:circle-check|circle-x|info)\b/)
  assert.ok(HINT_VAR.startsWith("--"))
})
