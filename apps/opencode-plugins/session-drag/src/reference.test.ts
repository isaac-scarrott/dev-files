import assert from "node:assert/strict"
import { test } from "node:test"
import { href, note, parseHref, rowFromTarget, rowLink, rowRef, rowTitle, token } from "./reference"

const doc = globalThis.document

const sidebar = () => {
  doc.body.innerHTML = `
    <div data-slot="vertical-tabs">
      <div data-tab-key="tab-1"><div data-titlebar-tab data-editing="false">
        <a data-slot="tab-link" href="/s/1"><span data-slot="project-avatar-slot"></span><span data-slot="tab-title"> Fix login </span></a>
        <div data-slot="tab-close"><button>x</button></div>
      </div></div>
      <div data-tab-key="tab-2"><div data-titlebar-tab data-editing="true"><a data-slot="tab-link"><input value="Renaming"></a></div></div>
    </div>
    <div data-sa-host data-sa-kind="archived">
      <div data-sa-row="local\nses_ABCDEFGHIJKLMNOPQRSTUVWXYZ" data-titlebar-tab>
        <a data-slot="tab-link" href="#"><span data-slot="project-avatar-slot"></span><span data-slot="tab-title">Archived one</span></a>
        <div data-slot="tab-close"><button>restore</button></div>
      </div>
    </div>
    <div data-sa-kind="snoozed"><div data-sa-row="local\nses_SNOOZED" data-titlebar-tab><a data-slot="tab-link" href="#"><span data-slot="tab-title">Snoozed one</span></a></div></div>
    <main><p>timeline</p></main>`

  return doc
}

test("note carries the host's wire token and the quoted title for the model", () => {
  const id = "00000000-0000-4000-8000-000000000001"
  const value = note({ server: "local", id: "ses_ABCDEFGHIJKLMNOPQRSTUVWXYZ", title: 'Fix "login"' }, id)
  assert.equal(value.type, "note")
  assert.equal(value.origin, "session-drag")
  assert.equal(value.commentID, id)
  assert.equal(value.label, 'Fix "login"')
  assert.equal(value.title, 'Fix "login"')
  assert.equal(value.subtitle, "Session")
  assert.equal(value.icon, "speech-bubble")
  assert.equal(value.comment, "")
  assert.equal(value.subject, 'session @session:ses_ABCDEFGHIJKLMNOPQRSTUVWXYZ ("Fix \\"login\\"")')
  assert.equal(value.href, "session-drag:local/ses_ABCDEFGHIJKLMNOPQRSTUVWXYZ")
  assert.equal(token("ses_x"), "@session:ses_x")
})

test("note gets a fresh comment id per call", () => {
  const target = { server: "local", id: "ses_ABCDEFGHIJKLMNOPQRSTUVWXYZ", title: "A" }
  assert.notEqual(note(target).commentID, note(target).commentID)
})

test("href round-trips through parseHref and rejects other links", () => {
  const target = { server: "remote-1", id: "ses_ABCDEFGHIJKLMNOPQRSTUVWXYZ" }
  assert.deepEqual(parseHref(href(target)), target)
  assert.equal(parseHref("session-drag:local/notasession"), undefined)
  assert.equal(parseHref("session-drag:/ses_x"), undefined)
  assert.equal(parseHref("https://example.com"), undefined)
})

test("rowFromTarget finds the live tab row from its title", () => {
  const doc = sidebar()
  const title = doc.querySelector('[data-tab-key="tab-1"] [data-slot="tab-title"]')!
  const row = rowFromTarget(title)
  assert.equal(row?.getAttribute("data-tab-key"), "tab-1")
  assert.deepEqual(rowRef(row!), { kind: "tab", key: "tab-1" })
  assert.equal(rowTitle(row!), "Fix login")
  assert.equal(rowLink(row!).getAttribute("href"), "/s/1")
})

test("rowFromTarget finds an archive plugin row and parses server and id", () => {
  const doc = sidebar()
  const row = rowFromTarget(doc.querySelector('[data-sa-kind="archived"] [data-sa-row] [data-slot="tab-title"]'))
  assert.ok(row)
  assert.deepEqual(rowRef(row), { kind: "archive", server: "local", id: "ses_ABCDEFGHIJKLMNOPQRSTUVWXYZ" })
  assert.equal(rowTitle(row), "Archived one")
})

test("rowFromTarget ignores the close control, a row being renamed, and everything outside rows", () => {
  const doc = sidebar()
  assert.equal(rowFromTarget(doc.querySelector('[data-tab-key="tab-1"] [data-slot="tab-close"] button')), undefined)
  assert.equal(rowFromTarget(doc.querySelector('[data-sa-kind="archived"] [data-sa-row] [data-slot="tab-close"] button')), undefined)
  assert.equal(rowFromTarget(doc.querySelector('[data-sa-kind="snoozed"] [data-slot="tab-title"]')), undefined, "a snoozed row is not a drag source")
  assert.equal(rowFromTarget(doc.querySelector('[data-tab-key="tab-2"] input')), undefined)
  assert.equal(rowFromTarget(doc.querySelector("main p")), undefined)
  assert.equal(rowFromTarget(null), undefined)
})

test("rowRef is undefined for a row with neither key", () => {
  const doc = sidebar()
  const stray = doc.createElement("div")
  doc.body.append(stray)
  assert.equal(rowRef(stray), undefined)
  const bad = doc.createElement("div")
  bad.setAttribute("data-sa-row", "no-newline")
  assert.equal(rowRef(bad), undefined)
})
