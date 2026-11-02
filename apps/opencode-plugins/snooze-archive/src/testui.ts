import { createRenderEffect, createRoot, type JSX } from "solid-js"
import { createDomHub, type DomHub } from "./hub"
import type { Ui } from "@opencode/plugin/gui"
import type { Host } from "./host"
import { delegateEvents, render } from "solid-js/web"

// Stand-ins for the host components: same props contract, plain elements. The real look comes from the app.
export function fakeUi(doc: Document): Ui {
  const node = (tag: string, props: Record<string, unknown>) => {
    const el = doc.createElement(tag) as HTMLButtonElement
    createRenderEffect(() => {
      if (props.label !== undefined) el.setAttribute("aria-label", String(props.label))
      if (props.icon !== undefined) el.dataset.icon = String(props.icon)
      if (props.name !== undefined) el.dataset.icon = String(props.name)
      el.disabled = !!props.disabled
    })
    if (props.class) el.setAttribute("class", String(props.class))
    el.onclick = (event) => (props.onClick as ((e: MouseEvent) => void) | undefined)?.(event as MouseEvent)
    return el
  }
  const ui: Record<string, (props: any) => unknown> = {
    Icon: (props) => node("span", props as never),
    IconButton: (props) => node("button", props as never),
    Button: (props) => {
      const el = node("button", props as never)
      el.append(...([] as unknown[]).concat((props as { children: unknown }).children).filter((c) => c != null).map((c) => c instanceof (doc.defaultView as any).Node ? (c as Node) : doc.createTextNode(String(c))))
      if (props.variant) el.dataset.variant = String(props.variant)
      return el
    },
    Tooltip: (props) => props.children,
    TextInput: (props) => {
      const el = doc.createElement("input") as HTMLInputElement
      createRenderEffect(() => { el.value = String(props.value); el.setAttribute("aria-label", String(props.label)); if (props.invalid) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid") })
      el.oninput = () => props.onInput(el.value)
      el.onkeydown = (event) => { if (event.key === "Enter") props.onSubmit?.(el.value) }
      return el
    },
    Dialog: (props) => { const el = doc.createElement("div"); el.setAttribute("role", "dialog"); el.append(props.children as Node, props.footer as Node); return el },
  }
  return ui as unknown as Ui
}

// Solid delegates these once per document, when the compiled component loads; a Window made later needs them registered.
export const delegate = (doc: Document) => delegateEvents(["click", "mousedown", "contextmenu", "auxclick", "dragstart"], doc)

// Solid's DOM renderer reads the document and Node globals.
export const fakeHost = (doc: Document): Host => {
  Object.assign(globalThis, { document: doc, Node: doc.defaultView!.Node, HTMLElement: doc.defaultView!.HTMLElement })
  delegate(doc)
  return { ui: fakeUi(doc), mount: (el: HTMLElement, view: () => JSX.Element) => render(view, el) }
}

// A hub under its own owner, with the frames it schedules collected: `flush()` runs them. `stop()` is the plugin going away.
export function withHub<T>(doc: Document, build: (hub: DomHub) => T, schedule?: (fn: () => void) => number) {
  const frames = new Map<number, () => void>()
  let next = 0
  const queue = schedule ?? ((fn: () => void) => { frames.set(++next, fn); return next })
  return createRoot((stop) => {
    const hub = createDomHub(doc, queue, (id) => { frames.delete(id) })
    const value = build(hub)
    const flush = () => { const run = [...frames.values()]; frames.clear(); run.forEach((fn) => fn()) }
    return { value, hub, stop, frames, flush }
  })
}
