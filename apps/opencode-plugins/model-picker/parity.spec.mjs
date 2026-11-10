// Parity spec for the model picker's results pane against the host's own list, in the same dialog.
// The plugin hides the host's list and shows its own; the prepare script below un-hides the host's list under the
// plugin's (and lifts the dialog's 480px cap), so every plugin element sits beside the host element it clones.
// Needs the harness started with seeded providers (OC_HARNESS_EXTRA_CONFIG, see DESIGN.md) and one starred model,
// alpha:a-big, so Favorites exists on both sides.
// Run: OC_PW_ROOT=<dir with playwright-core> OC_HARNESS_CDP_PORT=<port> node apps/opencode-plugins/.claude/skills/opencode-gui-plugins/scripts/parity.mjs --spec apps/opencode-plugins/model-picker/parity.spec.mjs

const OURS = "[data-mp-pane]"
const NATIVE = '[data-slot="search-list-body"]:not([data-mp-pane])'
const ours = (selector) => `${OURS} ${selector}`
const native = (selector) => `${NATIVE} ${selector}`
const key = (k) => `[data-option-key="${k}"]`

const open = `(async () => {
  if (!document.querySelector('.model-dialog')) {
    document.querySelector('[data-action=composer-model]').click()
    await new Promise((r) => setTimeout(r, 700))
  }
  if (!document.getElementById('mp-parity-style')) {
    const style = document.createElement('style')
    style.id = 'mp-parity-style'
    style.textContent = '[data-component="dialog-v2"]:has(.model-dialog) [data-slot="dialog-container"] { height: 2000px !important; }'
    document.head.append(style)
  }
  for (const body of document.querySelectorAll('[data-slot="search-list-body"][data-mp-hidden]')) body.removeAttribute('data-mp-hidden')
  // The plugin lends the host's rows the box of their clones (so the host's flyout lands beside the clone); measure the real box.
  for (const row of document.querySelectorAll('[data-slot="search-list-body"]:not([data-mp-pane]) [data-slot="search-list-row"]')) delete row.getBoundingClientRect
  await new Promise((r) => setTimeout(r, 200))
})()`

const close = `document.getElementById('mp-parity-style')?.remove(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('.model-dialog input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`

const flyoutProbe = `
  const f = document.querySelector('[data-slot=model-dialog-flyout]');
  const r = el.getBoundingClientRect();
  const fr = f?.getBoundingClientRect();
  return { active: el.hasAttribute('data-active'), flyout: !!f, dx: f ? Math.round(fr.left - r.right) : null, dy: f ? Math.round(fr.top - r.top) : null };
`

const BESIDE = { active: true, flyout: true, dx: 6, dy: -2 }

const row = (name, k, extra = {}) => ({
  name,
  ours: ours(key(k)),
  native: native(key(k)),
  persistent: true,
  prepare: open,
  cleanup: close,
  parts: { check: '[data-slot="model-dialog-check"]', name: '[data-slot="model-dialog-name"]', title: "span.truncate", tag: '[data-component="tag"]' },
  style: { states: ["rest", "hover"] },
  behaviour: [
    { name: "aria", check: "aria", attrs: ["role", "aria-selected", "aria-current", "data-slot", "type", "tabindex", "draggable"] },
    { name: "events", check: "event-contract", events: ["pointerdown", "mousedown", "contextmenu", "dragstart"] },
    // The host's flyout opens 6px beside the end edge of its row and 2px above it; the plugin's rows must give the same.
    { name: "hover-native", check: "scenario", only: "native", steps: [{ do: "hover", settle: 500 }], probe: flyoutProbe, expect: { result: BESIDE } },
  ],
  ...extra,
})

// Ours: the host's rows keep their lent boxes here (the other elements measure the real ones), so the flyout lands
// beside the plugin's row.
const flyout = {
  name: "flyout-beside-plugin-row",
  ours: ours(key("mid:m-1")),
  native: native(key("mid:m-1")),
  persistent: true,
  prepare: open.replace(/  \/\/ The plugin lends[\s\S]*?delete row.getBoundingClientRect\n/, ""),
  cleanup: close,
  style: false,
  behaviour: [{ name: "hover-ours", check: "scenario", only: "ours", steps: [{ do: "hover", settle: 500 }], probe: flyoutProbe, expect: { result: BESIDE } }],
}

const header = (name, id) => ({
  name,
  ours: ours(`[data-slot="search-list-header"][id="mp-section-${id}"]`),
  native: native(`[data-slot="search-list-header"][id$="-section-${id}"]`),
  persistent: true,
  prepare: open,
  cleanup: close,
  parts: { label: '[data-slot="model-dialog-header-label"]', text: "span.truncate" },
  style: { states: ["rest"] },
})

const container = (name, selector, extra = {}) => ({
  name,
  ours: ours(selector),
  native: native(selector),
  persistent: true,
  prepare: open,
  cleanup: close,
  style: { states: ["rest"] },
  ...extra,
})

const lists = "the host's list also holds a Recent section and every starred or recent model once, so its height differs from the plugin's"

export default {
  name: "model-picker",
  viewport: "1600x2300",
  elements: [
    row("row-plain", "mid:m-1", { motion: [{ name: "hover", from: "rest", to: "hover", props: ["background-color"], filmstrip: true }] }),
    row("row-free-tag", "opencode:beam-free"),
    row("row-favorite", "alpha:a-big"),
    flyout,
    header("header-provider", "opencode"),
    header("header-favorites", "favorite"),
    container("results", '[data-slot="search-list-results"]', { allow: { "rest.height": lists, "rest.box.height": lists } }),
    container("scroll", '[data-slot="search-list-scroll"]', { allow: { "rest.height": lists, "rest.box.height": lists } }),
    container("body", "", { ours: OURS, native: NATIVE, allow: { "rest.height": lists, "rest.box.height": lists } }),
  ],
}
