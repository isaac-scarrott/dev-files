import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type { Window } from "happy-dom"
import { render } from "solid-js/web"
import type { Ui } from "@opencode/plugin/gui"
import { InjectedMessageRow, injectedMessageRowCss } from "./injected-message-row"

// Stand-ins for the ctx.ui components the row renders; the real ones carry the same attributes.
const ui = {
  Icon: (props: any) => {
    const el = document.createElement("span")
    el.dataset.icon = props.name
    return el as any
  },
  IconButton: (props: any) => {
    const el = document.createElement("button")
    el.type = "button"
    el.className = props.class ?? ""
    el.setAttribute("aria-label", props.label)
    el.onclick = (event) => props.onClick?.(event)
    return el as any
  },
  Tooltip: (props: any) => props.children,
} as unknown as Ui

function dom() {
  const window = (globalThis as any).window as Window
  Object.assign(globalThis, {
    HTMLElement: window.HTMLElement,
    MouseEvent: window.MouseEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
  })
  const doc = window.document as unknown as Document
  doc.body.innerHTML = ""
  const host = doc.createElement("div")
  doc.body.append(host)
  return host
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function mount(host: HTMLElement, props: Partial<Parameters<typeof InjectedMessageRow>[0]> = {}) {
  return render(
    () => <InjectedMessageRow ui={ui} kind="monitor" icon={<i />} title="storefront watch" preview="line one" more body={() => <b data-test="body">full text</b>} {...props} />,
    host,
  )
}

test("closed row shows header parts and mounts no body", () => {
  const host = dom()
  mount(host)
  const row = host.querySelector("[data-injected-row]")!
  assert.equal(row.getAttribute("data-kind"), "monitor")
  assert.equal(row.getAttribute("data-open"), "false")
  assert.equal(host.querySelector("[data-slot=injected-title]")?.textContent, "storefront watch")
  assert.equal(host.querySelector("[data-slot=injected-preview]")?.textContent, "line one")
  assert.equal(host.querySelector("[data-slot=injected-body]"), null)
  assert.equal(host.querySelector("[data-test=body]"), null)
})

test("the trigger opens and closes; the header keeps the same nodes and the preview stays in the DOM", () => {
  const host = dom()
  const seen: boolean[] = []
  mount(host, { onOpenChange: (open) => seen.push(open) })
  const trigger = host.querySelector<HTMLButtonElement>("[data-slot=injected-trigger]")!
  const preview = host.querySelector("[data-slot=injected-preview]")
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  assert.equal(host.querySelector("[data-injected-row]")?.getAttribute("data-open"), "true")
  assert.equal(trigger.getAttribute("aria-expanded"), "true")
  assert.equal(host.querySelector("[data-slot=injected-body] [data-test=body]")?.textContent, "full text")
  assert.equal(trigger.getAttribute("aria-controls"), host.querySelector("[data-slot=injected-body]")?.id)
  assert.equal(host.querySelector("[data-slot=injected-preview]"), preview, "the preview is hidden by CSS, not removed")
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  assert.equal(host.querySelector("[data-slot=injected-body]"), null)
  assert.deepEqual(seen, [true, false])
})

test("a clicked body does not toggle: it lives outside the header", () => {
  const host = dom()
  mount(host, { open: true })
  assert.equal(host.querySelector("[data-slot=injected-head]")?.contains(host.querySelector("[data-slot=injected-body]")), false)
  host.querySelector("[data-slot=injected-body]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  assert.equal(host.querySelector("[data-injected-row]")?.getAttribute("data-open"), "true")
})

test("a row with nothing more to show is not expandable", () => {
  const host = dom()
  mount(host, { more: false })
  assert.equal(host.querySelector("[data-injected-row]")?.getAttribute("data-expandable"), "false")
  host.querySelector("[data-slot=injected-trigger]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  assert.equal(host.querySelector("[data-slot=injected-body]"), null)
})

test("the action is optional, labelled with its title and does not toggle the row", async () => {
  const host = dom()
  let clicks = 0
  mount(host, { action: { icon: "chevron-right", label: "Stop", onClick: () => clicks++ } })
  const action = host.querySelector<HTMLButtonElement>(".injected-action")!
  assert.equal(action.getAttribute("aria-label"), "Stop: storefront watch")
  action.click()
  await tick()
  assert.equal(clicks, 1)
  assert.equal(host.querySelector("[data-injected-row]")?.getAttribute("data-open"), "false")
  const bare = dom()
  mount(bare)
  assert.equal(bare.querySelector(".injected-action"), null)
})

test("the stylesheet uses host tokens and never a pointer cursor or a hard-coded colour", () => {
  assert.doesNotMatch(injectedMessageRowCss, /cursor:\s*pointer/)
  assert.doesNotMatch(injectedMessageRowCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  assert.match(injectedMessageRowCss, /var\(--v2-background-bg-layer-02\)/)
  assert.match(injectedMessageRowCss, /\[data-open="true"\] \[data-slot="injected-preview"\] \{ visibility: hidden; \}/)
})

// The row's measured geometry is the host subagent row's (orchestrator-tools DESIGN.md "Alignment"); these are the rules that carry it.
test("the row keeps the host's spacing, type and trailing-slot reveal, and holds its header on toggle", () => {
  const source = readFileSync(new URL("./injected-message-row.tsx", import.meta.url), "utf8")
  assert.ok(injectedMessageRowCss.includes("padding: 8px 12px"))
  assert.ok(injectedMessageRowCss.includes("border-radius: 8px"))
  assert.ok(injectedMessageRowCss.includes("font: 440 13px/20px"))
  assert.ok(injectedMessageRowCss.includes("transition: width 150ms, margin-inline-start 150ms, opacity 150ms, color 150ms, transform 150ms"))
  assert.ok(source.includes("holdTop(scroller, header, root"))
})
