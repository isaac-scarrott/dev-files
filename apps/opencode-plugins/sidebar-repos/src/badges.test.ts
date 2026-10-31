import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { attentionKind, badges, basename, label, truncateMiddle } from "./badges"

function fixture(options: { status?: boolean } = {}) {
  const window = new Window()
  const status = options.status === false
    ? ""
    : `<div data-slot="tab-close"><button>Close</button></div>
      <div data-slot="tab-status" aria-hidden="true">
        <span data-mark="attention" data-slot="tab-status-dot"></span>
        <span data-mark="unread" data-slot="tab-status-dot"></span>
      </div>`
  window.document.body.innerHTML = `
    <div data-tab-key="server\nsession" data-orientation="vertical">
      <div data-titlebar-tab data-orientation="vertical" data-editing="false">
        <a data-slot="tab-link">
          <span data-slot="project-avatar-slot"><img src="repo.png" alt="" /></span>
          <span data-slot="tab-title">Original title</span>
        </a>
        ${status}
      </div>
    </div>`
  return window.document as unknown as Document
}

test("repository basenames handle Windows paths and trailing slashes", () => {
  assert.equal(basename("/git/holibob/"), "holibob")
  assert.equal(basename("C:\\git\\opencode\\"), "opencode")
  assert.equal(basename(""), "")
})

test("the separator never matches a branch slash", () => {
  assert.equal(label("holibob", "feature/small-sidebar"), "holibob · feature/small-sidebar")
  assert.equal(label("holibob"), "holibob")
  assert.equal(label("holibob", ""), "holibob")
})

test("first-load attention tolerates request lists that have not synced yet", () => {
  assert.equal(attentionKind(undefined, undefined), undefined)
  assert.equal(attentionKind(undefined, [{}]), "question")
  assert.equal(attentionKind([{}], undefined), "permission")
  assert.equal(attentionKind([], undefined), undefined)
})

test("attention follows hydrated requests, prioritizing permissions", () => {
  assert.equal(attentionKind([], []), undefined)
  assert.equal(attentionKind([], [{}]), "question")
  assert.equal(attentionKind([{}], [{}]), "permission")
  assert.equal(attentionKind([{}], []), "permission")
})

test("middle ellipsis changes nothing when the label fits", () => {
  assert.equal(truncateMiddle("short", 10, (value) => value.length), "short")
})

test("middle ellipsis drops the middle, keeping the repo head and the branch tail", () => {
  const chars = (value: string) => value.length
  assert.equal(truncateMiddle("abcdefghij", 6, chars), "abcd…j")
})

test("middle ellipsis degenerates to only the ellipsis marker in narrow rows", () => {
  assert.equal(truncateMiddle("abcdefghij", 0, (value) => value.length), "…")
})

test("branch changes refresh the top line and tooltip without changing the session title", () => {
  const document = fixture()
  badges(document, new Map([["server\nsession", label("holibob", "main")]]))
  const badge = document.querySelector<HTMLElement>("[data-sidebar-repo]")
  assert.equal(badge?.textContent, "holibob · main")
  badges(document, new Map([["server\nsession", label("holibob", "feature/small-sidebar")]]))
  assert.equal(badge?.textContent, "holibob · feature/small-sidebar")
  assert.equal(badge?.title, "holibob · feature/small-sidebar")
  assert.equal(document.querySelector("[data-slot='tab-title']")?.textContent, "Original title")
})

test("adds a separate badge without changing the editable session title", () => {
  const document = fixture()
  badges(document, new Map([["server\nsession", "holibob"]]))
  assert.equal(document.querySelector("[data-sidebar-repo]")?.textContent, "holibob")
  assert.equal(document.querySelector("[data-slot='tab-title']")?.textContent, "Original title")
  assert.equal(document.querySelector("[data-slot='tab-title']")?.previousElementSibling?.getAttribute("data-sidebar-repo"), "")
})

test("keeps the existing thumbnail, label, and title as siblings without moving host controls", () => {
  const document = fixture()
  const avatar = document.querySelector("[data-slot='project-avatar-slot']")
  const title = document.querySelector("[data-slot='tab-title']")
  const close = document.querySelector("[data-slot='tab-close']")
  badges(document, new Map([["server\nsession", "holibob"]]))
  const link = document.querySelector("[data-slot='tab-link']")
  assert.deepEqual([...link!.children], [avatar, document.querySelector("[data-sidebar-repo]"), title])
  assert.equal(document.querySelector("[data-slot='project-avatar-slot']"), avatar)
  assert.equal(avatar?.querySelector("img")?.getAttribute("src"), "repo.png")
  assert.equal(document.querySelector("[data-slot='tab-close']"), close)
  assert.equal(close?.parentElement, link?.parentElement)
})

test("refresh is idempotent, updates names, and removes stale badges", () => {
  const document = fixture()
  badges(document, new Map([["server\nsession", "holibob"]]))
  const badge = document.querySelector("[data-sidebar-repo]")
  badges(document, new Map([["server\nsession", "holibob"]]))
  assert.equal(document.querySelectorAll("[data-sidebar-repo]").length, 1)
  assert.equal(document.querySelector("[data-sidebar-repo]"), badge)
  badges(document, new Map([["server\nsession", "opencode"]]))
  assert.equal(badge?.textContent, "opencode")
  badges(document, new Map())
  assert.equal(document.querySelector("[data-sidebar-repo]"), null)
})

test("leaves horizontal tabs alone, including after orientation changes", () => {
  const document = fixture()
  const names = new Map([["server\nsession", "holibob"]])
  badges(document, names)
  document.querySelector("[data-tab-key]")?.setAttribute("data-orientation", "horizontal")
  badges(document, names)
  assert.equal(document.querySelector("[data-sidebar-repo]"), null)
  assert.equal(document.querySelector("[data-slot='tab-title']")?.textContent, "Original title")
})

test("attention tabs get icon slots in the status slot without touching the host dots", () => {
  const document = fixture()
  const mounted: string[] = []
  badges(document, new Map([["server\nsession", "holibob"]]), undefined, new Map([["server\nsession", "permission"]]), (host, kind) => {
    mounted.push(kind)
    host.innerHTML = "<svg></svg>"
  })
  assert.deepEqual(mounted, ["permission", "question"])
  const icons = [...document.querySelectorAll("[data-sidebar-status-icon]")]
  assert.equal(icons.length, 2)
  assert.deepEqual(icons.map((icon) => icon.getAttribute("data-sidebar-status-icon")), ["permission", "question"])
  assert.ok(icons.every((icon) => icon.querySelector("svg")))
  assert.equal(
    document.querySelectorAll("[data-titlebar-tab] [data-slot='tab-status-dot']").length,
    2,
  )
  assert.equal(
    document.querySelector("[data-titlebar-tab]")?.getAttribute("data-sidebar-attention"),
    "permission",
  )
})

test("the attention kind follows the pending request and clears when it is gone", () => {
  const document = fixture()
  const names = new Map([["server\nsession", "holibob"]])
  badges(document, names, undefined, new Map([["server\nsession", "permission"]]))
  const marker = document.querySelector("[data-titlebar-tab]") as HTMLElement
  assert.equal(marker.getAttribute("data-sidebar-attention"), "permission")
  badges(document, names, undefined, new Map([["server\nsession", "question"]]))
  assert.equal(marker.getAttribute("data-sidebar-attention"), "question")
  badges(document, names, undefined)
  assert.equal(marker.getAttribute("data-sidebar-attention"), null)
  assert.equal(marker.querySelectorAll("[data-sidebar-status-icon]").length, 2)
})

test("tabs without a status slot skip icon injection entirely", () => {
  const document = fixture({ status: false })
  badges(document, new Map([["server\nsession", "holibob"]]), undefined, new Map([["server\nsession", "question"]]))
  assert.equal(document.querySelector("[data-sidebar-status-icon]"), null)
  assert.equal(document.querySelector("[data-titlebar-tab]")?.hasAttribute("data-sidebar-attention"), false)
  assert.equal(document.querySelector("[data-sidebar-repo]")?.textContent, "holibob")
})
