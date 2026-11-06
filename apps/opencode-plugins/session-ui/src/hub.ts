import { createDomHub as createNativeDomHub, elementsChangedBut, SIDEBAR, type DomHub } from "../../native-ui/src/dom-hub"
import { TAB_MARK_OWN } from "../../native-ui/src/tab-marks"

// The observer is native-ui's; this file says what these plugins put inside the sidebar, so their own writes wake nothing.
export { SIDEBAR, type DomHub }

// Every marker of both plugins, not just the calling one: a plugin ignores the other's writes as well as its own, so two of
// them in one window never wake each other. `[data-sa-menu]` covers the submenu and separator nodes too.
export const OWN = `[data-sa-groups], [data-sa-menu], [data-sa-actions], [data-sa-popup], ${TAB_MARK_OWN}`

// An element was added or removed that is not ours.
export const elementsChanged = elementsChangedBut(OWN)

export const createDomHub = (doc: Document, schedule: (fn: () => void) => number, cancel: (id: number) => void, label: string): DomHub =>
  createNativeDomHub(doc, schedule, cancel, OWN, label)
