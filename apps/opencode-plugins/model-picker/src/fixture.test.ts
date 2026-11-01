import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { Window } from "happy-dom"
import { attach } from "./pane"

// The fixtures are the model dialog of OpenCode 2.2.5 as the desktop app rendered it (stub providers, captured over
// CDP with the plugin's own pane and hiding attribute removed): see test/fixtures/README.md.
const win = new Window()
Object.assign(globalThis, {
  window: win,
  document: win.document,
  MutationObserver: win.MutationObserver,
  KeyboardEvent: win.KeyboardEvent,
  MouseEvent: win.MouseEvent,
  Element: win.Element,
  HTMLElement: win.HTMLElement,
  requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
})
const doc = win.document as unknown as Document
const fixture = (name: string) => readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), "utf8")
const settle = () => new Promise((resolve) => setTimeout(resolve, 5))
const price = () => new Map<string, number>()

function open(name: string, edit: (html: string) => string = (html) => html) {
  doc.body.innerHTML = `<div data-dialog-layer="0">${edit(fixture(name))}</div>`
  const dialog = doc.querySelector<HTMLElement>(".model-dialog")!
  const hostBody = dialog.querySelector<HTMLElement>('[data-slot="search-list-body"]')!
  return { dialog, hostBody, pane: () => dialog.querySelector("[data-mp-pane]"), hidden: () => hostBody.hasAttribute("data-mp-hidden") }
}

test("the real dialog: every host model is shown once, the host's list is hidden", () => {
  const { dialog, hostBody, pane, hidden } = open("dialog-2.2.5.html")
  const hostKeys = [...hostBody.querySelectorAll<HTMLElement>('[data-slot="search-list-row"]')].map((row) => row.dataset.optionKey)
  assert.ok(hostKeys.length > 3)
  const handle = attach(dialog, { price })!
  assert.ok(pane())
  assert.equal(hidden(), true)
  const ours = [...dialog.querySelectorAll<HTMLElement>("[data-mp-row]")].map((row) => row.dataset.optionKey)
  assert.deepEqual([...ours].sort(), [...hostKeys].sort())
  assert.equal(new Set(ours).size, ours.length)
  const headers = [...dialog.querySelectorAll("[data-mp-pane] [data-slot=search-list-header]")].map((header) => header.textContent!.trim().toLowerCase())
  assert.deepEqual(headers, [...headers].sort((a, b) => a.localeCompare(b)))
  handle.dispose()
})

test("the real dialog with a starred model: Favorites first, then providers", () => {
  const { dialog } = open("dialog-2.2.5-starred.html")
  const handle = attach(dialog, { price })!
  const sections = [...dialog.querySelectorAll("[data-mp-pane] [data-slot=search-list-section]")].map((section) => section.querySelector("[data-slot=search-list-header]")!.textContent!.trim())
  assert.equal(sections[0], "Favorites")
  assert.equal(sections.length > 1, true)
  handle.dispose()
})

for (const [name, edit] of [
  ["the results container is renamed", (html: string) => html.replace(/data-slot="search-list-results"/g, 'data-slot="search-list-items"')],
  ["the row slot is renamed", (html: string) => html.replace(/data-slot="search-list-row"/g, 'data-slot="search-list-item"')],
  ["the rows lose their option key", (html: string) => html.replace(/data-option-key=/g, "data-key=")],
] as const) {
  test(`${name}: the host's list stays visible and no pane is added`, async () => {
    const { dialog, hostBody, pane, hidden } = open("dialog-2.2.5.html", edit)
    const handle = attach(dialog, { price })!
    await settle()
    assert.equal(pane() === null, true)
    assert.equal(hidden(), false)
    assert.equal(hostBody.isConnected, true)
    handle.dispose()
  })
}

test("a host update after the pane is up steps the pane aside, and it returns when the structure does", async () => {
  const { dialog, hostBody, pane, hidden } = open("dialog-2.2.5.html")
  const handle = attach(dialog, { price })!
  assert.equal(hidden(), true)
  const rows = [...hostBody.querySelectorAll<HTMLElement>('[data-slot="search-list-row"]')]
  const first = rows[0]!
  await settle()
  assert.equal(Object.hasOwn(first, "getBoundingClientRect"), true)
  // The host re-renders its rows: new nodes, here under another slot name.
  const renamed = rows.map((row) => {
    const copy = row.cloneNode(true) as HTMLElement
    copy.setAttribute("data-slot", "search-list-item")
    row.replaceWith(copy)
    return copy
  })
  await settle()
  assert.equal(pane() === null, true)
  assert.equal(hidden(), false)
  assert.equal(Object.hasOwn(first, "getBoundingClientRect"), false)
  for (const row of renamed) {
    const copy = row.cloneNode(true) as HTMLElement
    copy.setAttribute("data-slot", "search-list-row")
    row.replaceWith(copy)
  }
  await settle()
  assert.ok(pane())
  assert.equal(hidden(), true)
  handle.dispose()
  assert.equal(pane() === null, true)
  assert.equal(hidden(), false)
})

test("an error while laying out steps aside instead of leaving the host's list hidden", async () => {
  const { dialog, pane, hidden } = open("dialog-2.2.5.html")
  let broken = false
  const log = console.error
  console.error = () => undefined
  try {
    const handle = attach(dialog, { price: () => (broken ? (() => { throw new Error("boom") })() : new Map()) })!
    assert.equal(hidden(), true)
    broken = true
    handle.refresh()
    await settle()
    assert.equal(pane() === null, true)
    assert.equal(hidden(), false)
    handle.dispose()
  } finally {
    console.error = log
  }
})

test("an empty host list that says so is engaged; one with unknown content is left alone", async () => {
  const empty = open("dialog-2.2.5.html", (html) => html.replace(/(<div data-slot="search-list-results"[^>]*>)[\s\S]*?(<\/div><\/div><\/div><\/div>[\s\S]*$)/, '$1<div data-slot="search-list-empty">No results</div>$2'))
  const emptyPane = attach(empty.dialog, { price })
  if (empty.dialog.querySelector('[data-slot="search-list-results"]')?.textContent?.includes("No results")) {
    assert.equal(empty.hidden(), true)
    assert.match(empty.dialog.querySelector("[data-mp-pane]")?.textContent ?? "", /No results/)
  }
  emptyPane?.dispose()
  const unknown = open("dialog-2.2.5.html", (html) => html.replace(/(<div data-slot="search-list-results"[^>]*>)[\s\S]*?(<\/div><\/div><\/div><\/div>[\s\S]*$)/, '$1<div data-slot="something-new">x</div>$2'))
  const unknownPane = attach(unknown.dialog, { price })
  assert.equal(unknown.hidden(), false)
  unknownPane?.dispose()
})
