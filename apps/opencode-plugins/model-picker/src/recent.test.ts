import assert from "node:assert/strict"
import test from "node:test"
import { Window } from "happy-dom"
import { hideRecent } from "./recent"

const dialog = (search: boolean, headers: string[]) => `<div class="model-dialog" role="dialog">${search ? '<input placeholder="Search models">' : ""}<div data-slot="search-list-results">${headers.map((h) => `<div data-slot="search-list-section" role="group" data-section="${h}"><div data-slot="search-list-header"><span data-slot="model-dialog-header-label" class="flex"><span class="truncate">${h}</span></span></div><div>item</div></div>`).join("")}</div></div>`
const page = (html: string) => { const w = new Window(); w.document.body.innerHTML = html; return w.document as unknown as Document }

test("hides only the Recent section of the model picker", () => {
  const doc = page(dialog(true, ["Recent", "OpenCode", "OpenAI"]))
  assert.equal(hideRecent(doc), 1)
  const sections = [...doc.querySelectorAll<HTMLElement>("[data-section]")]
  assert.deepEqual(sections.map((s) => s.hasAttribute("data-mp-hidden")), [true, false, false])
  assert.equal(sections[0]!.inert, true)
})

test("is idempotent and leaves other dialogs alone", () => {
  const doc = page(dialog(true, ["Recent"]) + dialog(false, ["Recent"]))
  assert.equal(hideRecent(doc), 1)
  assert.equal(hideRecent(doc), 0)
  assert.equal(doc.querySelectorAll("[data-mp-hidden]").length, 1)
})

test("no Recent section, no change", () => {
  const doc = page(dialog(true, ["OpenCode"]))
  assert.equal(hideRecent(doc), 0)
})
