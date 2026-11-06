import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createGroup, groupsCss as css } from "./sidebar"
import { fakeHost, withHub } from "./testui"

const avatar = { letter: "R", variant: "gray" }
const SIDE = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"></div></div></aside>`

// Two groups in one stack, as the two plugins build them.
const groups = (doc: Document, hub: Parameters<typeof createGroup>[2]) => ({
  snoozed: createGroup(doc, fakeHost(doc), hub, { kind: "snoozed", name: "Snoozed" }),
  archived: createGroup(doc, fakeHost(doc), hub, { kind: "archived", name: "Archived" }),
})

test("bottom groups default collapsed; keyed counts, native buttons and arrow keys", async () => {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<aside data-slot="vertical-tabs-sidebar"><header>Host controls</header><div id="host"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><span data-slot="tab-title">Rename me</span></div></div></div><footer>Native footer</footer></aside>`
  const rig = withHub(doc, (hub) => groups(doc, hub))
  const { snoozed, archived } = rig.value
  let woke = 0
  const row = { key: "a\ns", title: "Session", detail: "Later", project: "repo · main", action: "Wake", avatar, run: () => { woke++ } }
  snoozed.update({ rows: [row], count: 1 })
  archived.update({ rows: [], count: 100 })
  const buttons = doc.querySelectorAll<HTMLButtonElement>("[data-sa-toggle] button")
  assert.equal(buttons.length, 2)
  assert.equal(buttons[0].getAttribute("aria-expanded"), "false")
  assert.equal(buttons[1].textContent, "Archived100")
  buttons[0].click()
  assert.equal(buttons[0].getAttribute("aria-expanded"), "true")
  buttons[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }) as unknown as Event)
  assert.equal(buttons[0].getAttribute("aria-expanded"), "false")
  buttons[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }) as unknown as Event)
  assert.equal(buttons[0].getAttribute("aria-expanded"), "true")
  const action = doc.querySelector<HTMLButtonElement>("[data-sa-row] button")!
  action.click()
  assert.equal(woke, 1)
  snoozed.update({ rows: [{ ...row, title: "Renamed" }], count: 1 })
  archived.update({ rows: [], status: "Offline" })
  assert.equal(doc.querySelector("[data-sa-row] button"), action)
  assert.equal(doc.querySelectorAll("[data-sa-groups]").length, 1, "one stack for both groups")
  assert.deepEqual([...doc.querySelectorAll("[data-sa-group]")].map((el) => el.getAttribute("data-sa-group")), ["snoozed", "archived"])
  assert.equal(doc.querySelector('[data-slot="tab-title"]')?.textContent, "Rename me")
  assert.equal(buttons[1].textContent, "Archived—")
  assert.doesNotMatch(css, /max-height|overflow-y/)
  assert.match(css, /\[data-sa-host\] \{ flex: 1 1 auto; \}/)
  assert.match(css, /\[data-sa-groups\] > section\[data-sa-group="snoozed"\] \{ order: 10; \}/)
  assert.match(css, /\[data-sa-groups\] > section\[data-sa-group="archived"\] \{ order: 20; \}/)
  rig.stop()
  assert.equal(doc.querySelector("[data-sa-groups]"), null)
  assert.equal(doc.querySelector("[data-sa-host]"), null)
  assert.equal(doc.querySelector("header")?.textContent, "Host controls")
  assert.equal(doc.querySelector("footer")?.textContent, "Native footer")
  await window.happyDOM.close()
})

test("the stack outlives the first group and goes with the last", async () => {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = SIDE
  const rig = withHub(doc, (hub) => ({ snoozed: createGroup(doc, fakeHost(doc), hub, { kind: "snoozed", name: "Snoozed" }) }))
  rig.value.snoozed.update({ rows: [] })
  assert.equal(doc.querySelectorAll("[data-sa-groups]").length, 1)
  rig.stop()
  assert.equal(doc.querySelector("[data-sa-groups]"), null)
  assert.equal(doc.querySelector("[data-sa-host]"), null)
  await window.happyDOM.close()
})

test("attachment survives cold startup, sidebar replacement and cleanup/reload", async () => {
  const window = new Window()
  const doc = window.document as unknown as Document
  const start = () => withHub(doc, (hub) => groups(doc, hub))
  let rig = start()
  assert.equal(doc.querySelector("[data-sa-groups]"), null)
  doc.body.innerHTML = `<div>${SIDE}</div>`
  await window.happyDOM.whenAsyncComplete()
  rig.flush()
  assert.equal(doc.querySelectorAll("[data-sa-groups]").length, 1)
  doc.body.innerHTML = `<main>${SIDE}</main>`
  await window.happyDOM.whenAsyncComplete()
  rig.flush()
  assert.ok(doc.querySelector("main [data-slot=vertical-tabs] > [data-slot=vertical-tabs-scroll][data-sa-host] > [data-sa-groups]"))
  await window.happyDOM.whenAsyncComplete()
  assert.equal(rig.frames.size, 0, "own attachment must not schedule observer loops")
  const strip = doc.querySelector('[data-slot="vertical-tabs"]')!
  strip.setAttribute("data-slot", "titlebar-tabs")
  await window.happyDOM.whenAsyncComplete()
  rig.flush()
  assert.equal(doc.querySelector("[data-sa-groups]"), null)
  strip.setAttribute("data-slot", "vertical-tabs")
  await window.happyDOM.whenAsyncComplete()
  rig.flush()
  assert.equal(doc.querySelectorAll("[data-sa-groups]").length, 1)
  rig.stop()
  rig = start()
  assert.equal(doc.querySelectorAll("[data-sa-groups]").length, 1)
  rig.stop()
  assert.equal(rig.frames.size, 0)
  assert.equal(doc.querySelector("[data-sa-groups]"), null)
  await window.happyDOM.close()
})

test("group toggle sets aria-expanded, data-open and inert together; collapsed content is inert", () => {
  const doc = new Window().document as unknown as Document
  doc.body.innerHTML = SIDE
  const rig = withHub(doc, (hub) => groups(doc, hub))
  const toggle = doc.querySelector<HTMLButtonElement>("[data-sa-toggle] button")!
  const panel = doc.querySelector<HTMLElement>("[data-sa-panel]")!
  assert.equal(panel.hasAttribute("data-open"), false)
  assert.equal(panel.hasAttribute("inert"), true)
  toggle.click()
  assert.equal(toggle.getAttribute("aria-expanded"), "true")
  assert.equal(panel.hasAttribute("data-open"), true)
  assert.equal(panel.hasAttribute("inert"), false)
  toggle.click()
  assert.equal(panel.hasAttribute("inert"), true)
  assert.match(css, /\[data-sa-panel\]:not\(\[data-open\]\) \{ display: none; \}/)
  assert.doesNotMatch(css, /grid-template-rows|opacity 1[58]0ms|prefers-reduced-motion/)
  rig.stop()
})

test("rows and groups have no motion: rows come and go in one frame, only the chevron transitions", () => {
  const doc = new Window().document as unknown as Document
  doc.body.innerHTML = SIDE
  const rig = withHub(doc, (hub) => groups(doc, hub))
  const { snoozed } = rig.value
  const row = (key: string) => ({ key, title: key, detail: "d", project: "d", action: "Wake", avatar, run() {} })
  const empty = { rows: [] }
  doc.querySelectorAll<HTMLButtonElement>("[data-sa-toggle] button")[0].click()
  snoozed.update({ rows: [row("a"), row("b")], count: 2 })
  assert.ok(doc.querySelector('[data-sa-row="b"]'))
  snoozed.update({ rows: [row("a")], count: 1 })
  assert.equal(doc.querySelector('[data-sa-row="b"]'), null, "removed at once, no leaving state")
  assert.equal(doc.querySelector("[data-entering], [data-leaving]"), null)
  assert.deepEqual(css.match(/transition:[^;]*;/g), ["transition: transform .15s;"], "the host's arrow transition is the only one")
  assert.deepEqual(empty, { rows: [] })
  rig.stop()
})

test("rows reuse the session tab markup so the app styles them, without acting as live tabs", async () => {
  const doc = new Window().document as unknown as Document
  doc.body.innerHTML = SIDE
  doc.head.innerHTML = `<style data-plugin="sidebar-repos"></style>`
  const rig = withHub(doc, (hub) => groups(doc, hub))
  const { snoozed, archived } = rig.value
  let deleted = 0
  const row = { key: "k", title: "Fix bug", detail: "Local · /repo", project: "repo · main", action: "Restore", avatar: { letter: "R", variant: "blue" }, run() {}, menu: [{ label: "Restore", run() {} }, "separator" as const, { label: "Delete…", danger: true, run: () => { deleted++ } }] }
  snoozed.update({ rows: [], count: 0 })
  archived.update({ rows: [row], count: 1 })
  const slot = doc.querySelector<HTMLElement>("[data-sa-row]")!
  assert.ok(slot.hasAttribute("data-titlebar-tab-slot"), "the row is the native-ui slot")
  const el = slot.querySelector<HTMLElement>("[data-titlebar-tab]")!
  assert.ok(el)
  assert.equal(el.dataset.slot, "titlebar-tab-item")
  assert.equal(el.dataset.orientation, "vertical")
  assert.equal(el.hasAttribute("data-tab-key"), false, "sidebar-repos and tab logic key on data-tab-key")
  assert.equal(el.querySelector('[data-slot="tab-title"]')?.textContent, "Fix bug")
  assert.equal(el.querySelector("[data-sidebar-repo]")?.textContent, "repo · main")
  assert.equal(el.querySelector('[data-component="project-avatar-v2"] [data-slot="project-avatar-surface"]')?.getAttribute("data-variant"), "blue")
  assert.equal(el.querySelector('[data-slot="project-avatar-surface"]')?.textContent, "R")
  assert.deepEqual([...el.querySelectorAll('[data-slot="tab-close"] button')].map((b) => b.getAttribute("aria-label")), ["Restore Fix bug"], "hover shows one primary action")
  const event = new (doc.defaultView as any).MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
  el.querySelector("a")!.dispatchEvent(event)
  assert.ok(event.defaultPrevented)
  const items = [...doc.querySelectorAll<HTMLElement>('[data-sa-popup] [role="menuitem"]')]
  assert.deepEqual(items.map((i) => i.textContent), ["Restore", "Delete…"])
  assert.equal(items[1].dataset.variant, "critical")
  assert.equal(doc.activeElement, items[0])
  items[0].dispatchEvent(new (doc.defaultView as any).KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
  assert.equal(doc.activeElement, items[1])
  items[1].click()
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(deleted, 1)
  assert.equal(doc.querySelector("[data-sa-popup]"), null, "menu closes after choosing")
  archived.update({ rows: [{ ...row, menu: undefined }], count: 1 })
  el.dispatchEvent(new (doc.defaultView as any).MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
  assert.equal(doc.querySelector("[data-sa-popup]"), null)
  rig.stop()
})

test("snoozed second line keeps the time whole: project truncates, time is its own flex:none part; archived rows are unsplit", () => {
  const doc = new Window().document as unknown as Document
  doc.body.innerHTML = SIDE
  doc.head.innerHTML = `<style data-plugin="sidebar-repos"></style>`
  const rig = withHub(doc, (hub) => groups(doc, hub))
  const { snoozed, archived } = rig.value
  const long = "a-very-long-repository-name · feature/an-extremely-long-branch-name-that-cannot-fit"
  const row = { key: "s", title: "T", project: long, until: "2d 3h", detail: "d", action: "Wake", avatar, run() {} }
  const other = { ...row, key: "a", until: undefined, action: "Restore" }
  snoozed.update({ rows: [row], count: 1 })
  archived.update({ rows: [other], count: 1 })
  const line = doc.querySelector<HTMLElement>('[data-sa-kind="snoozed"] [data-sidebar-repo]')!
  assert.equal(line.querySelector("[data-sidebar-repo-main]")?.textContent, long)
  assert.equal(line.querySelector("[data-sidebar-repo-detail]")?.textContent, " · 2d 3h", "the time is whole and in the DOM")
  assert.equal(line.textContent, `${long} · 2d 3h`)
  const archivedLine = doc.querySelector<HTMLElement>('[data-sa-kind="archived"] [data-sidebar-repo]')!
  assert.equal(archivedLine.querySelector("[data-sidebar-repo-main], [data-sidebar-repo-detail]"), null)
  assert.equal(archivedLine.textContent, long)
  assert.match(css, /\[data-sa-kind="snoozed"\] \[data-sidebar-repo-main\] \{ flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/)
  assert.match(css, /\[data-sa-kind="snoozed"\] \[data-sidebar-repo-detail\] \{ flex: none; white-space: nowrap; \}/)
  rig.stop()
})

test("expanding leaves the free space to margin-top:auto and never scrolls", async () => {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-titlebar-tab-list></div></div></div></aside>`
  const scroller = doc.querySelector<HTMLElement>("[data-slot=vertical-tabs-scroll]")!
  let writes = 0
  Object.defineProperty(scroller, "scrollTop", { get: () => 0, set: () => { writes++ } })
  const rig = withHub(doc, (hub) => groups(doc, hub))
  const { snoozed, archived } = rig.value
  snoozed.update({ rows: [], count: 0 })
  archived.update({ rows: [], count: 0 })
  const root = doc.querySelector<HTMLElement>("[data-sa-groups]")!
  const [first, second] = [...doc.querySelectorAll<HTMLButtonElement>("[data-sa-toggle] button")]
  first.click()
  second.click()
  first.click()
  second.click()
  assert.equal(root.style.marginTop, "")
  assert.match(css, /\[data-sa-groups\] \{[^}]*margin-top: auto/)
  assert.equal(writes, 0)
  rig.stop()
  await window.happyDOM.close()
})

test("the group toggle pads 6px a side like the rows' tab item (px-1.5), so label and chevron land on the rows' text edges", () => {
  assert.match(css, /\.sa-toggle \{[^}]*padding-inline: 6px;/)
})

test("a sidebar the layout setting mounts later, as a child of the row that holds <main>, is found without a body-wide observer", async () => {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<div id="root"><div class="row"><div class="inset"></div><main></main></div></div>`
  const rig = withHub(doc, (hub) => groups(doc, hub))
  assert.equal(doc.querySelector("[data-sa-groups]"), null)
  const aside = doc.createElement("aside")
  aside.setAttribute("data-slot", "vertical-tabs-sidebar")
  aside.innerHTML = `<div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"></div></div>`
  doc.querySelector(".row")!.insertBefore(aside, doc.querySelector("main"))
  await window.happyDOM.whenAsyncComplete()
  rig.flush()
  assert.equal(doc.querySelectorAll("[data-slot=vertical-tabs-scroll] > [data-sa-groups]").length, 1)
  aside.remove()
  await window.happyDOM.whenAsyncComplete()
  rig.flush()
  assert.equal(doc.querySelector("[data-sa-groups]"), null, "gone with its sidebar")
  doc.querySelector(".row")!.insertBefore(aside, doc.querySelector("main"))
  await window.happyDOM.whenAsyncComplete()
  rig.flush()
  assert.equal(doc.querySelectorAll("[data-sa-groups]").length, 1, "and back with it")
  rig.stop()
  await window.happyDOM.close()
})
