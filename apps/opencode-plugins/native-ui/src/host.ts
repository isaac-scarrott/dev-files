import { getOwner, runWithOwner, type JSX } from "solid-js"
import { render } from "solid-js/web"
import type { Ui } from "@opencode/plugin/gui"

export interface Host {
  ui: Ui
  /** Renders host components into a node the plugin owns; returns the dispose. */
  mount(el: HTMLElement, view: () => JSX.Element): () => void
}

/**
 * Call inside `setup(ctx)` with `ctx.ui`. Mounts run under the setup owner, so `ctx.ui` components rendered later
 * (from a MutationObserver callback, a timer, a DOM event) still find the plugin's Solid context.
 */
export function createHost(ui: Ui): Host {
  const owner = getOwner()
  return { ui, mount: (el, view) => runWithOwner(owner, () => render(view, el)) ?? (() => {}) }
}
