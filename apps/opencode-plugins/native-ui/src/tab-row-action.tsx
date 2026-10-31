import type { IconName } from "@opencode/plugin/gui"
import type { Ui } from "@opencode/plugin/gui"
import type { Host } from "./host"
import { TabCloseButton } from "./tab-close-button"

// Host source: app/src/shell/titlebar/tab-nav.tsx, <div data-slot="tab-close">. A row action is that slot again, one
// button-width further from the edge (sibling) or at the same place with the host's X hidden (replace). The CSS below
// is the host's tab-close rules (app/src/shell/titlebar/tab-nav.css) re-keyed on [data-slot=tab-row-action].

export interface TabRowActionProps {
  ui: Ui
  icon: IconName
  label: string
  onClick(): void
  /** Take the X's place instead of sitting beside it. */
  replace?: boolean
}

export function TabRowAction(props: TabRowActionProps) {
  return (
    <div data-slot="tab-row-action" data-replace={props.replace ? "" : undefined}>
      <TabCloseButton ui={props.ui} icon={props.icon} label={props.label} onClick={props.onClick} />
    </div>
  )
}

/**
 * Mounts a row action into a host session tab (`[data-titlebar-tab]`), before its close slot so hover, focus and
 * editing states of the row reveal it. Returns the dispose, which removes the node.
 */
export function attachTabRowAction(tab: HTMLElement, host: Host, props: Omit<TabRowActionProps, "ui">): () => void {
  const el = tab.ownerDocument.createElement("div")
  el.dataset.slot = "tab-row-action"
  if (props.replace) el.dataset.replace = ""
  const close = tab.querySelector(":scope > [data-slot=tab-close]")
  if (close) close.before(el)
  else tab.append(el)
  const dispose = host.mount(el, () => (
    <TabCloseButton ui={host.ui} icon={props.icon} label={props.label} onClick={props.onClick} />
  ))
  return () => {
    dispose()
    el.remove()
  }
}

export const tabRowActionCss = `
[data-titlebar-tab] [data-slot=tab-row-action] { position: absolute; top: 4px; inset-inline-end: 28px; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; }
[data-titlebar-tab][data-orientation=vertical] [data-slot=tab-row-action] { margin-block: auto; top: 0; bottom: 0; }
[data-titlebar-tab] [data-slot=tab-row-action] button { transition: none; }
[data-titlebar-tab]:is(:hover, :has(:focus-visible), [data-editing=true]) [data-slot=tab-row-action] button { opacity: 1; }
[data-titlebar-tab]:is(:hover, :has(:focus-visible), [data-state=pressed], [data-status]) [data-slot=tab-row-action] { background: linear-gradient(var(--tab-overlay), var(--tab-overlay)), var(--tab-base); }
[data-titlebar-tab][data-editing=true] [data-slot=tab-row-action] { display: none; }
[data-titlebar-tab]:has([data-slot=tab-row-action]:not([data-replace])):is(:hover, :has(:focus-visible)):not([data-editing=true]) [data-slot=tab-link] { --tab-title-fade-offset: calc(48px + var(--tab-link-inset, 0px)); }
[data-slot=tab-row-action][data-replace] { inset-inline-end: 4px; }
[data-titlebar-tab]:has([data-slot=tab-row-action][data-replace]) [data-slot=tab-close] > button { display: none; }
@media (hover: none) { [data-titlebar-tab] [data-slot=tab-row-action] { background: linear-gradient(var(--tab-overlay), var(--tab-overlay)), var(--tab-base); } }
`
