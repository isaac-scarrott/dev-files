// The script that runs in the page. Kept as text, not as a function whose toString() a bundler could rewrite: what is
// evaluated must be exactly this.
//
// (spec, values): spec = { origins: string[] (exact origins allowed), fields: [{ name, kind, selector?, label? }] }, values
// = one string per field, same order. It checks the origin of the document and of the top frame first, and only then
// touches a field. It fills the way typing reaches React or Google's handlers (the prototype's value setter, then input
// and change events), masks the field and every echo of the value before the next paint, and returns a report that never
// carries a value.
export const FILL_SOURCE = String.raw`(function (spec, values) {
  const origin = location.origin
  let top
  try { top = window.top.location.origin } catch (error) { top = "cross-origin" }
  if (!spec.origins.includes(origin) || !spec.origins.includes(top)) {
    return { ok: false, reason: "origin", origin, fields: spec.fields.map((field) => ({ name: field.name, ok: false, reason: "origin" })) }
  }
  const MARK = "data-blindfold-masked"
  const norm = (text) => (text || "").trim().toLowerCase()
  const visible = (el) => {
    const box = el.getBoundingClientRect()
    return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden"
  }
  const SKIP = ["hidden", "checkbox", "radio", "submit", "button", "file", "image", "reset", "range", "color"]
  const inputs = [...document.querySelectorAll("input, textarea")].filter((el) => !SKIP.includes(el.type) && !el.disabled && !el.readOnly)
  const words = (el) => [el.getAttribute("aria-label"), el.labels && [...el.labels].map((l) => l.textContent).join(" "), el.placeholder, el.name, el.autocomplete, el.id, el.getAttribute("data-testid")].map(norm).join(" ")
  const byLabel = (label) => {
    const want = norm(label)
    const each = (el) => [el.getAttribute("aria-label"), el.labels && [...el.labels].map((l) => l.textContent).join(" "), el.placeholder, el.name, el.autocomplete, el.id].map(norm)
    return inputs.find((el) => each(el).some((text) => text === want)) || inputs.find((el) => each(el).some((text) => text.includes(want)))
  }
  const find = (field) => {
    if (field.selector) return document.querySelector(field.selector)
    if (field.label) return byLabel(field.label)
    const shown = inputs.filter(visible)
    if (field.kind === "password") return shown.find((el) => el.type === "password")
    if (field.kind === "otp") return shown.find((el) => el.autocomplete === "one-time-code") || shown.find((el) => /otp|one-time|verification|2fa|totp|code|token/.test(words(el))) || shown.find((el) => el.inputMode === "numeric" && el.maxLength >= 4 && el.maxLength <= 8)
    if (field.kind === "username") {
      const named = shown.find((el) => el.type !== "password" && (/username|email/.test(el.autocomplete) || /user|email|login|identifier/.test(words(el))))
      if (named) return named
      const password = shown.find((el) => el.type === "password")
      const before = password ? shown.slice(0, shown.indexOf(password)).filter((el) => el.type !== "password") : shown.filter((el) => el.type !== "password")
      return before[before.length - 1]
    }
    return byLabel(field.kind)
  }
  if (!document.getElementById("blindfold-mask-style")) {
    const style = document.createElement("style")
    style.id = "blindfold-mask-style"
    style.textContent = "[" + MARK + "] { -webkit-text-security: disc !important; } [" + MARK + "]::selection { background: transparent !important; }"
    document.documentElement.appendChild(style)
  }
  const registry = (window.__blindfoldMask = window.__blindfoldMask || { sweeps: [], observer: null })
  const reports = spec.fields.map((field, index) => {
    const value = values[index]
    const el = find(field)
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return { name: field.name, ok: false, reason: "no-field" }
    if (!visible(el)) return { name: field.name, ok: false, reason: "hidden-field" }
    // Mask first, so no frame is painted with the value in the clear. An attribute rule survives React re-renders and a
    // Show-password toggle.
    el.setAttribute(MARK, field.name)
    el.focus()
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value)
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    // The page may repeat the value elsewhere ("Signing in as ..."): mask each element holding it, now and later.
    const sweep = () => {
      let count = 0
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.includes(value) && node.parentElement && !node.parentElement.hasAttribute(MARK)) {
          node.parentElement.setAttribute(MARK, field.name)
          count++
        }
      }
      for (const other of document.querySelectorAll("input, textarea")) {
        if (other !== el && other.value && other.value.includes(value) && !other.hasAttribute(MARK)) {
          other.setAttribute(MARK, field.name)
          count++
        }
      }
      return count
    }
    registry.sweeps.push(sweep)
    return { name: field.name, ok: true, synced: el.value === value, echoesMasked: sweep(), field: { tag: el.tagName.toLowerCase(), type: el.type, id: el.id || undefined, role: el.getAttribute("role") || undefined } }
  })
  if (!registry.observer && registry.sweeps.length > 0) {
    registry.observer = new MutationObserver(() => registry.sweeps.forEach((sweep) => sweep()))
    registry.observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  }
  return { ok: reports.every((report) => report.ok), origin, fields: reports }
})`
