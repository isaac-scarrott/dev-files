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

const hostRow = (name: string, chips: string[], actions: boolean) => `<div class="settings-extension-row"><div class="settings-extension-lead"><svg></svg>
  <div class="flex min-w-0 flex-col gap-0.5"><div class="settings-provider-main"><bdi dir="ltr" class="settings-extension-name truncate">${name}</bdi>
  ${chips.map((chip) => `<span data-component="tag">${chip}</span>`).join("")}</div></div></div>
  ${actions ? '<div class="settings-servers-actions"><button data-component="button-v2">Reload</button><div data-component="switch"></div></div>' : ""}</div>`

function hostPage(rows: string) {
  const window = new Window()
  const document = window.document as unknown as Document
  document.body.innerHTML = `<div id="panel"><div data-component="settings-list">${rows}</div></div>`
  return { document, panel: document.getElementById("panel")! }
}

const mounted = () => {
  const names: string[] = []
  return { names, mount: (container: HTMLElement, entry: { name: string }) => { names.push(entry.name); container.textContent = "ours"; return () => undefined } }
}

test("host rows without Reload get ours, host rows with Reload keep theirs alone", () => {
  const { document, panel } = hostPage(
    hostRow("orchestrator-tools", ["Server"], false) + hostRow("agents-panel", [], true) + hostRow("claude-proxy", [], false),
  )
  const { names, mount } = mounted()
  const list = [
    { name: "orchestrator-tools", parts: ["desktop", "server"] as const, enabled: true },
    { name: "agents-panel", parts: ["desktop"] as const, enabled: true },
    { name: "claude-proxy", parts: ["server"] as const, enabled: true },
  ]
  sync(document, panel, list, mount)
  sync(document, panel, list, mount)
  const rows = [...panel.querySelectorAll(".settings-extension-row")]
  assert.equal(rows.length, 3)
  assert.deepEqual(names, ["orchestrator-tools", "claude-proxy"])
  assert.equal(rows[0]!.querySelectorAll(".settings-servers-actions").length, 1)
  assert.equal(rows[1]!.querySelectorAll(".settings-servers-actions").length, 1)
  assert.equal(rows[1]!.querySelector(".settings-servers-actions")?.hasAttribute("data-plugin-list-actions"), false)
  assert.equal(rows[2]!.querySelectorAll("[data-plugin-list-actions]").length, 1)
  cleanup(document)
  assert.equal(panel.querySelectorAll("[data-plugin-list-actions]").length, 0)
})

test("our actions leave when the host draws its own Reload later", () => {
  const { document, panel } = hostPage(hostRow("orchestrator-tools", [], false))
  const list = [{ name: "orchestrator-tools", parts: ["desktop"] as const, enabled: true }]
  sync(document, panel, list, mounted().mount)
  assert.equal(panel.querySelectorAll("[data-plugin-list-actions]").length, 1)
  const host = document.createElement("div")
  host.className = "settings-servers-actions"
  panel.querySelector(".settings-extension-row")!.prepend(host)
  sync(document, panel, list, mounted().mount)
  assert.equal(panel.querySelectorAll(".settings-servers-actions").length, 1)
  assert.equal(panel.querySelectorAll("[data-plugin-list-actions]").length, 0)
})

test("rows match across registration styles: path, name@version and plain id", () => {
  const { document, panel } = hostPage(hostRow("/Users/x/apps/orchestrator-tools", [], false) + hostRow("pkg@1.2.0", [], false))
  const { names, mount } = mounted()
  sync(document, panel, [
    { name: "orchestrator-tools", parts: ["server"], enabled: true },
    { name: "pkg", parts: ["server"], enabled: true },
  ], mount)
  assert.equal(panel.querySelectorAll("[data-plugin-list-row]").length, 0)
  assert.deepEqual(names, ["orchestrator-tools", "pkg"])
})
