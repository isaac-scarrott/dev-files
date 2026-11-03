import { createDomHub as createNativeDomHub, elementsChangedBut, SIDEBAR, type DomHub } from "../../native-ui/src/dom-hub"
import { TAB_MARK_OWN } from "../../native-ui/src/tab-marks"

// The observer is native-ui's; this file says what this plugin puts inside the sidebar, so its own writes wake nothing.
export { SIDEBAR, type DomHub }

const OWN = `[data-snooze-archive], [data-sa-actions], ${TAB_MARK_OWN}`

// An element was added or removed that is not ours.
export const elementsChanged = elementsChangedBut(OWN)

export const createDomHub = (doc: Document, schedule: (fn: () => void) => number, cancel: (id: number) => void): DomHub =>
  createNativeDomHub(doc, schedule, cancel, OWN, "snooze-archive")
