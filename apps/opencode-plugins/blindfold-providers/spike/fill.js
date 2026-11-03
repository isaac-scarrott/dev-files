// In-page fill-and-mask. `fillScript(spec, value)` returns the text for `browser.evaluate({ script })` (or Electron's
// `webContents.executeJavaScript`). The script fills one field the way a user's typing would reach React or Google's
// handlers, masks it and every echo of the value, and returns a report that never carries the value.
//
// spec: { origins: string[] (exact origins allowed, e.g. "https://accounts.google.com"), selector?: string,
//         label?: string (matched against aria-label, <label>, placeholder, name, autocomplete), name: string (secret
//         name, for the report and the mask marker) }

function inPage(spec, value) {
  const report = (ok, extra) => ({ ok, name: spec.name, origin: location.origin, ...extra })
  // Origin binding: the top document and the frame must both be allowed. A cross-origin parent throws on access.
  let topOrigin
  try { topOrigin = window.top.location.origin } catch { topOrigin = "cross-origin" }
  if (!spec.origins.includes(location.origin) || !spec.origins.includes(topOrigin)) return report(false, { reason: "origin", topOrigin })

  const fields = [...document.querySelectorAll("input, textarea")].filter((el) => el.type !== "hidden" && !el.disabled && !el.readOnly)
  const norm = (text) => (text || "").trim().toLowerCase()
  const labelOf = (el) => [el.getAttribute("aria-label"), el.labels && [...el.labels].map((l) => l.textContent).join(" "), el.placeholder, el.name, el.autocomplete, el.id].map(norm)
  let el
  if (spec.selector) el = document.querySelector(spec.selector)
  else if (spec.label) {
    const want = norm(spec.label)
    el = fields.find((f) => labelOf(f).some((t) => t === want)) || fields.find((f) => labelOf(f).some((t) => t.includes(want)))
  }
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return report(false, { reason: "no-field" })
  const box = el.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return report(false, { reason: "hidden-field" })

  // Mask first, so no frame is ever painted with the value in clear. CSS on an attribute survives React re-renders
  // (React does not remove attributes it does not own) and a Show-password toggle (type=text keeps the rule).
  const MARK = "data-blindfold-masked"
  if (!document.getElementById("blindfold-mask-style")) {
    const style = document.createElement("style")
    style.id = "blindfold-mask-style"
    style.textContent = `[${MARK}] { -webkit-text-security: disc !important; } [${MARK}]::selection { background: transparent !important; }`
    document.documentElement.appendChild(style)
  }
  el.setAttribute(MARK, spec.name)

  // React and similar frameworks track the last value they saw on the element; the prototype's setter bypasses the
  // instance tracker so the next input event is treated as a real change.
  el.focus()
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value)
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }))
  el.dispatchEvent(new Event("change", { bubbles: true }))

  // Echoes: the page may repeat the value elsewhere ("Signing in as ..."). Mask the element holding each text node that
  // contains it, now and on later DOM changes, for this document's lifetime.
  const maskEchoes = () => {
    let count = 0
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue && node.nodeValue.includes(value) && node.parentElement && !node.parentElement.hasAttribute(MARK)) {
        node.parentElement.setAttribute(MARK, spec.name)
        count++
      }
    }
    for (const other of document.querySelectorAll("input, textarea")) {
      if (other !== el && other.value && other.value.includes(value) && !other.hasAttribute(MARK)) {
        other.setAttribute(MARK, spec.name)
        count++
      }
    }
    return count
  }
  const registry = (window.__blindfoldMask ||= { values: [], observer: null })
  registry.values.push(maskEchoes)
  if (!registry.observer) {
    registry.observer = new MutationObserver(() => registry.values.forEach((fn) => fn()))
    registry.observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  }
  // The echo of a controlled input renders after React's state update, so look again after the next frames too.
  const echoes = maskEchoes()
  return report(true, {
    field: { tag: el.tagName.toLowerCase(), type: el.type, id: el.id || undefined, role: el.getAttribute("role") || undefined },
    filledLength: el.value.length === value.length,
    echoesMaskedNow: echoes,
  })
}

/** The evaluate script. The value is embedded as a JSON literal: the script text is as secret as the value. */
function fillScript(spec, value) {
  return `(${inPage.toString()})(${JSON.stringify(spec)}, ${JSON.stringify(value)})`
}

export { inPage, fillScript }
