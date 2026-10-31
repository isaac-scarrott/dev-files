import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { entries, type PluginInfo } from "./entries"
import { disabledNames, setEnabled } from "./config"
import { cleanup, sync } from "./rows"

const info = (partial: Partial<PluginInfo> & Pick<PluginInfo, "features">): PluginInfo => ({
  source: { type: "local", path: "/p/x" },
  state: { status: "active" },
  ...partial,
})

test("lists every non-builtin plugin with its parts in a fixed order", () => {
  const result = entries([
    info({ id: "a", features: { rpc: true, server: true, gui: true } }),
    info({ source: { type: "builtin" }, features: { server: true } }),
    info({ source: { type: "package", target: "pkg@1" }, features: { tui: true } }),
  ])
  assert.deepEqual(result, [
    { name: "a", parts: ["desktop", "server", "rpc"], enabled: true },
    { name: "pkg@1", parts: ["tui"], enabled: true },
  ])
})

test("a failed plugin carries its first error line", () => {
  const [entry] = entries([info({ id: "a", features: {}, state: { status: "failed", error: "boom\nstack" } })])
  assert.equal(entry?.error, "boom")
})

test("a plugin the config turns off is listed again as disabled", () => {
  const result = entries([info({ id: "a", features: { server: true } })], ["gone", "a"])
  assert.deepEqual(result, [
    { name: "a", parts: ["server"], enabled: false },
    { name: "gone", parts: [], enabled: false },
  ])
})

test("config toggling adds and removes the off entry without touching others", () => {
  const plugins = ["/p/a", "-b"]
  assert.deepEqual(disabledNames(plugins), ["b"])
  assert.deepEqual(setEnabled(plugins, "c", false), ["/p/a", "-b", "-c"])
  assert.deepEqual(setEnabled(plugins, "b", true), ["/p/a"])
  assert.deepEqual(setEnabled(setEnabled(plugins, "c", false), "c", false), ["/p/a", "-b", "-c"])
})

function page() {
  const window = new Window()
  const document = window.document as unknown as Document
  document.body.innerHTML = `<div id="panel"><div data-component="settings-list">
    <div class="settings-extension-row"><div class="settings-extension-lead"><svg></svg><div><div class="settings-provider-main">
      <bdi class="settings-extension-name">gui-one</bdi><span data-component="tag">Server</span></div></div></div></div>
  </div></div>`
  return { document, panel: document.getElementById("panel")! }
}

test("adds only the chips the host row lacks and rows the host did not list, idempotently", () => {
  const { document, panel } = page()
  const list = [
    { name: "gui-one", parts: ["desktop", "server"] as const, enabled: true },
    { name: "srv", parts: ["server"] as const, enabled: true, error: "bad" },
  ]
  sync(document, panel, list, () => () => undefined)
  sync(document, panel, list, () => () => undefined)
  const host = panel.querySelectorAll(".settings-extension-row")[0]!
  assert.deepEqual([...host.querySelectorAll("[data-component=tag]")].map((tag) => tag.textContent), ["Server", "Desktop"])
  assert.equal(panel.querySelectorAll("[data-plugin-list-row]").length, 1)
  assert.equal(panel.querySelectorAll("[data-plugin-list-row] .settings-server-dialog-error")[0]?.textContent, "bad")
  assert.equal(panel.querySelectorAll("[data-plugin-list-row] svg").length, 1)
  sync(document, panel, [list[0]!], () => () => undefined)
  assert.equal(panel.querySelectorAll("[data-plugin-list-row]").length, 0)
  cleanup(document)
  assert.equal(panel.querySelectorAll("[data-plugin-list]").length, 0)
})
