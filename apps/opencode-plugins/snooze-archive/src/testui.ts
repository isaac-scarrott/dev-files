import { createRenderEffect, type JSX } from "solid-js"
import type { Ui } from "@opencode/plugin/gui"
import type { Host } from "./host"
import { render } from "solid-js/web"

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
      el.append(...([] as unknown[]).concat((props as { children: unknown }).children).filter((c): c is Node => c instanceof (doc.defaultView as any).Node))
      return el
    },
    Tooltip: (props) => props.children,
  }
  return ui as unknown as Ui
}

// Solid's DOM renderer reads the document and Node globals.
export const fakeHost = (doc: Document): Host => {
  Object.assign(globalThis, { document: doc, Node: doc.defaultView!.Node })
  return { ui: fakeUi(doc), mount: (el: HTMLElement, view: () => JSX.Element) => render(view, el) }
}
