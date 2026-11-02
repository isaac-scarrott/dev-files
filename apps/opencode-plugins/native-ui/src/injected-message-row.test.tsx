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

// A user turn's footprint (native-ui DESIGN, "Injected-row spacing"): the host's 65px user row (36 + 29) for the last row of a run, 37px inside a run (36 + 1).
test("the row reserves the host user bubble's footer below it, except inside a run of user messages", () => {
  assert.match(injectedMessageRowCss, /\[data-injected-row\] \{[^}]*padding-bottom: 29px;/)
  assert.match(injectedMessageRowCss, /\[data-timeline-key\^="user-message:"\]:has\(\+ \[data-timeline-key\^="turn-gap:"\] \+ \[data-timeline-key\^="user-message:"\]\) \[data-injected-row\] \{ padding-bottom: 1px; \}/)
})

// A full-width row behaves like the host subagent row (native-ui DESIGN, "Injected-row hover"): capped at the container less 24px, one
// clip box around title and preview that cuts mid-glyph (no ellipsis), and the trailing slot last in the head so it takes its width
// from the clip box and the chevron rides the row's right edge.
test("the head is [icon][clip box with title and preview][trailing slot], the slot last", () => {
  const host = dom()
  mount(host, { action: { icon: "chevron-right", label: "Open", onClick() {} } })
  const head = host.querySelector("[data-slot=injected-head]")!
  const slots = [...head.children].map((child) => child.getAttribute("data-slot"))
  assert.deepEqual(slots, ["injected-trigger", "injected-icon", "injected-main", "injected-tail"])
  const main = head.querySelector("[data-slot=injected-main]")!
  assert.deepEqual([...main.children].map((child) => child.getAttribute("data-slot")), ["injected-title", "injected-preview"])
  assert.equal(head.querySelector("[data-slot=injected-tail]")?.nextElementSibling, null)
  assert.equal(host.querySelector("[data-injected-row]")?.hasAttribute("data-action"), true)
  const bare = dom()
  mount(bare)
  assert.equal(bare.querySelector("[data-injected-row]")?.hasAttribute("data-action"), false)
})

test("the stylesheet caps the row, clips the text mid-glyph and sizes the slot like the host's", () => {
  const css = injectedMessageRowCss
  assert.match(css, /max-width: calc\(100% - 24px\)/)
  assert.match(css, /\[data-slot="injected-main"\] \{[^}]*flex: 1 1 auto;[^}]*min-width: 0;[^}]*overflow: hidden;/)
  assert.match(css, /\[data-slot="injected-title"\] \{ flex: none;/)
  assert.match(css, /\[data-slot="injected-preview"\] \{ flex: none;/)
  assert.doesNotMatch(css, /text-overflow/, "the host cuts the text with its clip box, no ellipsis")
  // The slot rests at no width and no margin, grows to 16px + 2px on hover (the host's task-tool-action), 34px with triangle and action.
  assert.match(css, /width: 0; margin-inline: 0;/)
  assert.match(css, /width: 16px; margin-inline: 2px 0;/)
  assert.match(css, /\[data-expandable="true"\]\[data-action\][^{]*\{ width: 34px; margin-inline: 2px 0; \}/)
  // The action slides 8px over the slot's 150ms, which is the host chevron's 4px path in a slot anchored to the row's end.
  assert.match(css, /\.injected-action \{[^}]*transform: translate\(8px\); transition: transform 150ms;/)
  assert.match(css, /justify-content: flex-end/)
  assert.match(css, /:root\[data-motion="reduce"\][^{]*\.injected-action \{ transition: none; \}/)
})

test("a clipped end fades with the host's 16px tab-title ramp, only while the text overflows", async () => {
  const host = dom()
  let measure!: () => void
  ;(globalThis as any).ResizeObserver = class { constructor(fn: () => void) { measure = fn } observe() {} disconnect() {} }
  mount(host, { more: true })
  await tick()
  const row = host.querySelector("[data-injected-row]")!
  const main = host.querySelector("[data-slot=injected-main]") as any
  assert.equal(row.getAttribute("data-clipped"), "false")
  Object.defineProperty(main, "scrollWidth", { configurable: true, value: 400 })
  Object.defineProperty(main, "clientWidth", { configurable: true, value: 300 })
  measure()
  assert.equal(row.getAttribute("data-clipped"), "true")
  Object.defineProperty(main, "scrollWidth", { configurable: true, value: 300 })
  measure()
  assert.equal(row.getAttribute("data-clipped"), "false")
  const css = injectedMessageRowCss
  assert.match(css, /\[data-clipped="true"\] \[data-slot="injected-main"\] \{\s*-webkit-mask-image: linear-gradient\(to right, black 0, black calc\(100% - 16px\), transparent 100%\);\s*mask-image: linear-gradient\(to right, black 0, black calc\(100% - 16px\), transparent 100%\);/)
})
