import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { Window } from "happy-dom"
import { attachPicker, type PickerRow } from "./picker"

const windows: Window[] = []
afterEach(() => { windows.splice(0).forEach((win) => win.close()) })

// The host's dialog, reduced to what the picker reads: search input, listbox, rows, separator and the back title.
function dialog(options: { separated?: boolean; drilled?: boolean; projects?: string[] } = {}) {
  const win = new Window()
  windows.push(win)
  const doc = win.document as unknown as Document
  const rows = (options.projects ?? ["alpha"]).map((name) => `<button role="option" id="u-${name}" ${name === (options.projects ?? ["alpha"])[0] ? "data-active aria-selected=true" : ""}><span class="command-palette-description">/p/${name}</span></button>`)
  doc.body.innerHTML = `<div class="new-session-location"><input role="combobox" value=""><div role="listbox" id="u-list"><div class="command-palette-group">
    ${options.drilled ? '<button class="new-session-location-back"></button>' : ""}
    ${rows.join("")}<button role="option" id="u-other"></button>
    ${options.separated === false ? "" : '<div role="separator"></div>'}<button role="option" id="u-add"></button></div></div></div>`
  // The host sets its active row on a pointer move over it.
  doc.querySelectorAll("[role=option]").forEach((el) => el.addEventListener("mousemove", () => {
    doc.querySelectorAll("[role=option]").forEach((other) => { other.removeAttribute("data-active"); other.setAttribute("aria-selected", "false") })
    el.setAttribute("data-active", ""); el.setAttribute("aria-selected", "true")
  }))
  return { win, doc, input: doc.querySelector("input")! }
}

function config(overrides: Partial<PickerRow> = {}) {
  const selected: string[] = []
  const row: PickerRow = {
    title: "No project",
    description: "Scratch folder",
    keywords: ["scratch", "none"],
    path: () => "/h/Documents/No project",
    icon: () => undefined,
    onSelect: () => selected.push("select"),
    ...overrides,
  }
  return { row, selected }
}

const frame = (win: Window) => new Promise((resolve) => win.requestAnimationFrame(() => setTimeout(resolve, 0)))
const ids = (doc: Document) => [...doc.querySelectorAll("[role=option],[role=separator]")].map((el) => el.getAttribute("role") === "separator" ? "---" : el.id)
const key = (doc: Document, name: string) => {
  const event = new (doc.defaultView as unknown as typeof globalThis).KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })
  doc.querySelector("input")!.dispatchEvent(event)
  return event
}

test("the row sits between the host's separator and Add project", async () => {
  const { win, doc } = dialog()
  const stop = attachPicker(doc, config().row)
  await frame(win)
  assert.deepEqual(ids(doc), ["u-alpha", "u-other", "---", "u-no-project", "u-add"])
  stop()
})

test("with nothing before Add project, the row brings its own separator, and it is not duplicated by later syncs", async () => {
  const { win, doc } = dialog({ separated: false, projects: [] })
  const stop = attachPicker(doc, config().row)
  await frame(win)
  doc.querySelector(".command-palette-group")!.append(doc.createElement("i"))
  await frame(win)
  assert.deepEqual(ids(doc).filter((id) => id !== "u-other"), ["u-no-project", "---", "u-add"])
  stop()
})

test("the row copies the host's row markup", async () => {
  const { win, doc } = dialog()
  const stop = attachPicker(doc, config().row)
  await frame(win)
  const row = doc.querySelector("[data-no-project-row]")!
  assert.equal(row.className, "command-palette-row palette-menu-row")
  assert.equal(row.getAttribute("data-size"), "compact")
  assert.equal(row.querySelector(".command-palette-title")!.textContent, "No project")
  assert.equal(row.querySelector(".command-palette-description")!.textContent, "Scratch folder")
  stop()
})

test("it follows the search box: scratch matches, a stranger does not, and a listed scratch project hides it", async () => {
  const { win, doc, input } = dialog()
  const stop = attachPicker(doc, config().row)
  await frame(win)
  input.value = "scr"
  input.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event)
  await frame(win)
  assert.ok(doc.querySelector("[data-no-project-row]"))
  input.value = "zzz"
  input.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event)
  await frame(win)
  assert.equal(doc.querySelector("[data-no-project-row]"), null)
  assert.equal(doc.querySelectorAll("[data-no-project-separator]").length, 0)
  input.value = ""
  input.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event)
  doc.querySelector("#u-alpha .command-palette-description")!.textContent = "/h/Documents/No project"
  await frame(win)
  assert.equal(doc.querySelector("[data-no-project-row]"), null)
  stop()
})

test("it stays out of the worktree and server steps", async () => {
  const { win, doc } = dialog({ drilled: true })
  const stop = attachPicker(doc, config().row)
  await frame(win)
  assert.equal(doc.querySelector("[data-no-project-row]"), null)
  stop()
})

test("arrows pass through the row and Enter selects it and closes the dialog", async () => {
  const { win, doc } = dialog({ projects: ["alpha"] })
  const { row, selected } = config()
  const stop = attachPicker(doc, row)
  await frame(win)
  const active = () => [...doc.querySelectorAll("[data-active]")].map((el) => el.id)
  const escapes: string[] = []
  doc.addEventListener("keydown", (event) => { if (event.key === "Escape") escapes.push("esc") })

  doc.querySelector("#u-other")!.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true }) as unknown as Event)
  assert.deepEqual(active(), ["u-other"])
  assert.equal(key(doc, "ArrowDown").defaultPrevented, true)
  assert.deepEqual(active(), ["u-no-project"])
  assert.equal(doc.querySelector("input")!.getAttribute("aria-activedescendant"), "u-no-project")

  key(doc, "ArrowDown")
  assert.deepEqual(active(), ["u-add"])
  key(doc, "ArrowUp")
  assert.deepEqual(active(), ["u-no-project"])
  key(doc, "ArrowUp")
  assert.deepEqual(active(), ["u-other"])

  key(doc, "ArrowDown")
  key(doc, "Enter")
  assert.deepEqual(selected, ["select"])
  assert.deepEqual(escapes, ["esc"])
  stop()
})

test("a click selects the row and sends Escape to the search box", async () => {
  const { win, doc } = dialog()
  const { row, selected } = config()
  const stop = attachPicker(doc, row)
  await frame(win)
  const escapes: string[] = []
  doc.addEventListener("keydown", (event) => { if (event.key === "Escape") escapes.push("esc") })
  doc.querySelector<HTMLElement>("[data-no-project-row]")!.click()
  assert.deepEqual(selected, ["select"])
  assert.deepEqual(escapes, ["esc"])
  stop()
})

test("cleanup removes the row and its separator", async () => {
  const { win, doc } = dialog({ separated: false, projects: [] })
  const stop = attachPicker(doc, config().row)
  await frame(win)
  stop()
  assert.equal(doc.querySelector("[data-no-project-row],[data-no-project-separator]"), null)
})
