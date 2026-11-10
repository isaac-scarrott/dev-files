import assert from "node:assert/strict"
import test from "node:test"
import { Window } from "happy-dom"
import { attach } from "./pane"

// The markup is the host's own (2.2.5): search-list data-slots, row and header shapes, section ids `<list>-section-<id>`.
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

interface Spec {
  section: string
  title: string
  rows: Array<{ key: string; name: string; provider?: string; tag?: string }>
}

const rowHtml = (row: Spec["rows"][number], active: boolean) =>
  `<button type="button" id="L-list-${row.key}" role="option" data-slot="search-list-row" ${active ? "data-active" : ""} data-option-key="${row.key}"><span data-slot="model-dialog-check"></span><span data-slot="model-dialog-name"><span class="min-w-0 truncate">${row.name}</span>${row.provider ? `<span class="min-w-0 shrink-[999] truncate text-v2-text-text-faint">${row.provider}</span>` : ""}${row.tag ? `<span data-component="tag">${row.tag}</span>` : ""}</span></button>`

const sectionHtml = (spec: Spec) =>
  `<div data-slot="search-list-section" role="group"><div data-slot="search-list-header" id="L-list-section-${spec.section}"><span data-slot="model-dialog-header-label" class="flex"><span class="truncate">${spec.title}</span></span></div>${spec.rows.map((row) => rowHtml(row, false)).join("")}</div>`

function host(specs: Spec[]) {
  doc.body.innerHTML = `<div class="command-palette model-dialog"><div data-component="search-list"><div data-slot="search-list-search"><input data-slot="text-input-v2-input"></div><div data-slot="search-list-body"><div data-slot="search-list-scroll"><div data-slot="search-list-fade"></div><div data-slot="search-list-results" id="L-list" role="listbox" aria-label="Search models">${specs.map(sectionHtml).join("")}</div></div></div></div></div>`
  const dialog = doc.querySelector<HTMLElement>(".model-dialog")!
  const input = dialog.querySelector<HTMLInputElement>("input")!
  const hostRows = () => [...dialog.querySelectorAll<HTMLElement>('[data-mp-hidden] [data-slot="search-list-row"]')]
  // The host's own hover handler: the row under the pointer becomes the active one, and touching the row that is already
  // active changes no markup (a framework re-render), so the pane cannot wait for an observed change to relight. The pane's
  // clones carry the host's data-slots, so only rows in the host's hidden list count.
  dialog.addEventListener("mousemove", (event) => {
    const row = (event.target as HTMLElement).closest?.('[data-slot="search-list-row"]')
    if (!row || row.closest("[data-mp-pane]") || row.hasAttribute("data-active")) return
    hostRows().forEach((item) => item.removeAttribute("data-active"))
    row.setAttribute("data-active", "")
  })
  // The host's own arrow handler: moves its highlight one row through its own order, wrapping.
  let moves = 0
  input.addEventListener("keydown", (event) => {
    const rows = hostRows()
    const at = rows.findIndex((row) => row.hasAttribute("data-active"))
    const delta = (event as KeyboardEvent).key === "ArrowDown" ? 1 : -1
    rows.forEach((row) => row.removeAttribute("data-active"))
    rows[(at + delta + rows.length) % rows.length]!.setAttribute("data-active", "")
    moves++
  })
  rows0(dialog)
  return { dialog, input, hostRows, moves: () => moves }
}

// Before the pane exists the host's first row carries the highlight, as in the real dialog.
const rows0 = (dialog: HTMLElement) => dialog.querySelector('[data-slot="search-list-row"]')?.setAttribute("data-active", "")

const settle = () => new Promise((resolve) => setTimeout(resolve, 5))
const prices = new Map([["alpha:big", 25], ["alpha:mid", 5], ["alpha:low", 5], ["alpha:recent", 12]])
const specs: Spec[] = [
  { section: "favorite", title: "Favorites", rows: [{ key: "zeta:fav", name: "Zeta Fav", provider: "Zeta AI" }] },
  { section: "recent", title: "Recent", rows: [{ key: "alpha:recent", name: "Alpha Recent", provider: "alpha labs", tag: "Free" }] },
  { section: "zeta", title: "Zeta AI", rows: [{ key: "zeta:z", name: "Zeta Z" }] },
  { section: "alpha", title: "alpha labs", rows: [{ key: "alpha:low", name: "Bravo" }, { key: "alpha:big", name: "Big" }, { key: "alpha:mid", name: "Alpha" }] },
]
const keys = (dialog: Element, within = "[data-mp-pane]") => [...dialog.querySelectorAll<HTMLElement>(`${within} [data-slot="search-list-section"]`)].map((section) => [section.querySelector('[data-slot="search-list-header"]')!.textContent, [...section.querySelectorAll<HTMLElement>("[data-mp-row]")].map((row) => row.dataset.optionKey)])

test("shows Favorites, then providers A to Z with recent models back under their provider, sorted by price", () => {
  const { dialog } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  assert.deepEqual(keys(dialog), [
    ["Favorites", ["zeta:fav"]],
    ["alpha labs", ["alpha:big", "alpha:recent", "alpha:mid", "alpha:low"]],
    ["Zeta AI", ["zeta:fav", "zeta:z"]],
  ])
  assert.equal(dialog.querySelector('[data-slot="search-list-body"]:not([data-mp-pane])')!.hasAttribute("data-mp-hidden"), true)
  pane.dispose()
})

test("a recent row loses its provider label under its own provider; a favorite keeps it in Favorites only", () => {
  const { dialog } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  const recent = dialog.querySelector('[data-mp-pane] [data-option-key="alpha:recent"]')!
  const copies = [...dialog.querySelectorAll<HTMLElement>('[data-mp-pane] [data-option-key="zeta:fav"]')]
  assert.equal(recent.querySelector(".text-v2-text-text-faint"), null)
  assert.equal(recent.querySelector('[data-component="tag"]')?.textContent, "Free")
  assert.equal(copies.length, 2, "a favorite is listed in Favorites and under its provider")
  assert.equal(copies[0]!.closest('[data-slot="search-list-section"]')!.querySelector('[data-slot="search-list-header"]')!.textContent, "Favorites")
  assert.equal(copies[0]!.querySelector(".text-v2-text-text-faint")?.textContent, "Zeta AI")
  assert.equal(copies[1]!.closest('[data-slot="search-list-section"]')!.querySelector('[data-slot="search-list-header"]')!.textContent, "Zeta AI")
  assert.equal(copies[1]!.querySelector(".text-v2-text-text-faint"), null, "the provider name is not repeated under its header")
  assert.equal(dialog.querySelectorAll('[data-mp-pane] [id]').length, dialog.querySelectorAll('[data-mp-pane] [data-slot="search-list-header"]').length)
  pane.dispose()
})

test("the host's highlight starts on the pane's first row", async () => {
  const { dialog, hostRows } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  await settle()
  assert.equal(hostRows().find((row) => row.hasAttribute("data-active"))!.dataset.optionKey, "zeta:fav")
  assert.equal(dialog.querySelector("[data-mp-row][data-active]")!.getAttribute("data-option-key"), "zeta:fav")
  pane.dispose()
})

test("arrow keys walk the pane's order and drive the host's own handler to the same row", async () => {
  const { dialog, input, hostRows, moves } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  await settle()
  const press = (key: string) => input.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }) as unknown as Event)
  const active = () => dialog.querySelector<HTMLElement>("[data-mp-row][data-active]")!.dataset.optionKey
  const walked = [active()]
  for (let i = 0; i < 3; i++) (press("ArrowDown"), await settle(), walked.push(active()))
  assert.deepEqual(walked, ["zeta:fav", "alpha:big", "alpha:recent", "alpha:mid"])
  assert.equal(hostRows().find((row) => row.hasAttribute("data-active"))!.dataset.optionKey, "alpha:mid")
  press("ArrowUp")
  await settle()
  assert.equal(active(), "alpha:recent")
  assert.ok(moves() > 0)
  pane.dispose()
})

test("a favorite listed under its provider is one stop for the arrow keys, not two", async () => {
  const { dialog, input, hostRows } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  await settle()
  const press = (key: string) => input.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }) as unknown as Event)
  const active = () => hostRows().find((row) => row.hasAttribute("data-active"))!.dataset.optionKey
  const walked = [active()]
  for (let i = 0; i < 6; i++) (press("ArrowDown"), await settle(), walked.push(active()))
  assert.deepEqual(walked, ["zeta:fav", "alpha:big", "alpha:recent", "alpha:mid", "alpha:low", "zeta:z", "zeta:fav"])
  pane.dispose()
})

test("a favorite is lit once: only the copy the pointer is on", async () => {
  const { dialog, hostRows } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  await settle()
  // The favorite is the host's active model already: hovering its other copy changes no host markup, so the pane must
  // relight on the move itself rather than wait for a re-render.
  hostRows().forEach((row) => row.removeAttribute("data-active"))
  hostRows().find((row) => row.dataset.optionKey === "zeta:fav")!.setAttribute("data-active", "")
  await settle()
  const copies = [...dialog.querySelectorAll<HTMLElement>('[data-mp-pane] [data-option-key="zeta:fav"]')]
  const lit = () => [...dialog.querySelectorAll<HTMLElement>('[data-mp-pane] [data-option-key="zeta:fav"][data-active]')]
  const header = (row: Element) => row.closest('[data-slot="search-list-section"]')!.querySelector('[data-slot="search-list-header"]')!.textContent

  assert.equal(lit().length, 1)
  assert.equal(header(lit()[0]!), "Favorites")

  copies[1]!.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, clientX: 4, clientY: 4 }) as unknown as Event)
  await settle()
  assert.equal(lit().length, 1, "the copy under the pointer only")
  assert.equal(header(lit()[0]!), "Zeta AI")
  pane.dispose()
})

test("the host's flyout follows the copy of a favorite the pointer or the arrow last took", async () => {
  const { dialog, hostRows } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  await settle()
  const copies = [...dialog.querySelectorAll<HTMLElement>('[data-mp-pane] [data-option-key="zeta:fav"]')]
  const box = (left: number) => ({ left, top: 1, right: left + 2, bottom: 3, width: 2, height: 2, x: left, y: 1, toJSON() {} }) as DOMRect
  copies[0]!.getBoundingClientRect = () => box(10)
  copies[1]!.getBoundingClientRect = () => box(20)
  copies[1]!.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, clientX: 5, clientY: 6 }) as unknown as Event)
  await settle()
  const real = hostRows().find((row) => row.dataset.optionKey === "zeta:fav")!
  assert.equal(real.getBoundingClientRect().left, 20, "the copy under its provider, where the pointer is")
  pane.dispose()
})

test("a click on a pane row clicks the host's row; a pointer move reaches it with its coordinates", () => {
  const { dialog, hostRows } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  const target = hostRows().find((row) => row.dataset.optionKey === "alpha:big")!
  let clicks = 0
  let moved: { x: number; y: number } | undefined
  target.addEventListener("click", () => clicks++)
  target.addEventListener("mousemove", (event) => (moved = { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }))
  const row = dialog.querySelector('[data-mp-pane] [data-option-key="alpha:big"]')!
  row.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, clientX: 41, clientY: 17 }) as unknown as Event)
  row.dispatchEvent(new win.MouseEvent("click", { bubbles: true }) as unknown as Event)
  assert.equal(clicks, 1)
  assert.deepEqual(moved, { x: 41, y: 17 })
  pane.dispose()
})

test("the host places its flyout from the pane row's box", () => {
  const { dialog, hostRows } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  const ours = dialog.querySelector<HTMLElement>('[data-mp-pane] [data-option-key="alpha:big"]')!
  ours.getBoundingClientRect = () => ({ left: 7, top: 8, right: 9, bottom: 10, width: 2, height: 2, x: 7, y: 8, toJSON() {} }) as DOMRect
  assert.equal(hostRows().find((row) => row.dataset.optionKey === "alpha:big")!.getBoundingClientRect().left, 7)
  pane.dispose()
})

test("host changes follow: a highlight, a new model, a favorite moving, a model removed", async () => {
  const { dialog, hostRows } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  await settle()
  hostRows().find((row) => row.dataset.optionKey === "zeta:z")!.setAttribute("data-active", "")
  hostRows().find((row) => row.dataset.optionKey === "zeta:fav")!.removeAttribute("data-active")
  await settle()
  assert.equal(dialog.querySelector("[data-mp-row][data-active]")!.getAttribute("data-option-key"), "zeta:z")
  const section = dialog.querySelector('[data-slot="search-list-header"][id="L-list-section-alpha"]')!.parentElement!
  section.insertAdjacentHTML("beforeend", rowHtml({ key: "alpha:new", name: "New" }, false))
  await settle()
  assert.ok(dialog.querySelector('[data-mp-pane] [data-option-key="alpha:new"]'))
  dialog.querySelector('[data-mp-hidden] [data-option-key="alpha:low"]')!.remove()
  await settle()
  assert.equal(dialog.querySelector('[data-mp-pane] [data-option-key="alpha:low"]'), null)
  pane.dispose()
})

test("a model with no price sorts last and a provider with only recent models gets a header", async () => {
  const { dialog } = host([
    { section: "recent", title: "Recent", rows: [{ key: "solo:one", name: "Solo", provider: "Solo Co" }] },
    { section: "alpha", title: "alpha labs", rows: [{ key: "alpha:nop", name: "Aardvark" }, { key: "alpha:big", name: "Big" }] },
  ])
  const pane = attach(dialog, { price: () => prices })!
  assert.deepEqual(keys(dialog), [["alpha labs", ["alpha:big", "alpha:nop"]], ["Solo Co", ["solo:one"]]])
  pane.dispose()
})

test("dispose puts the host's list back and leaves no node or patch behind", async () => {
  const { dialog, hostRows } = host(specs)
  const pane = attach(dialog, { price: () => prices })!
  await settle()
  const first = hostRows()[0]!
  assert.equal(Object.hasOwn(first, "getBoundingClientRect"), true)
  pane.dispose()
  assert.equal(dialog.querySelector("[data-mp-pane]"), null)
  assert.equal(dialog.querySelector("[data-mp-hidden]"), null)
  assert.equal(Object.hasOwn(first, "getBoundingClientRect"), false)
  const press = () => dialog.querySelector("input")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }) as unknown as Event)
  assert.equal(press(), true)
})

test("a dialog without the host's list is left alone", () => {
  doc.body.innerHTML = `<div class="model-dialog"></div>`
  assert.equal(attach(doc.querySelector<HTMLElement>(".model-dialog")!, { price: () => prices }), undefined)
})
