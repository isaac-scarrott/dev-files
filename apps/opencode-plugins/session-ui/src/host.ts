import { getOwner, runWithOwner, type JSX } from "solid-js"
import { render } from "solid-js/web"
import type { Ui } from "@opencode/plugin/gui"

export interface Host {
  ui: Ui
  // Mounts host components into a node we own. Rendered under the setup owner so ctx.ui keeps the plugin's context.
  mount(el: HTMLElement, view: () => JSX.Element): () => void
}

export function createHost(ui: Ui): Host {
  const owner = getOwner()
  return { ui, mount: (el, view) => runWithOwner(owner, () => render(view, el)) ?? (() => {}) }
}
