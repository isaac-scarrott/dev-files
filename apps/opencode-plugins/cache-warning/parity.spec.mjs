// Parity: the cache-warning tray next to the host's own DockTray. The host mounts a DockTray only on the "session
// location unavailable" screen, which replaces the composer and its lane, so the real tray and the host's cannot share a
// window. The spec stands a twin of our tray (same attributes and text, the plugin's stylesheet applies by attribute)
// beside the host's footer tray in that screen. Run with the plugin loaded, on a session whose directory is missing.
//   OC_PW_ROOT=/private/tmp/agents-live-pw OC_HARNESS_CDP_PORT=9355 \
//     node .claude/skills/opencode-gui-plugins/scripts/parity.mjs --spec apps/opencode-plugins/cache-warning/parity.spec.mjs

const twin = `(() => {
  document.querySelectorAll("[data-parity-twin]").forEach((node) => node.remove())
  const footer = document.querySelector('[data-slot="location-footer"]')
  const tray = document.createElement("div")
  tray.setAttribute("data-parity-twin", "")
  tray.setAttribute("data-cache-warning", "")
  tray.setAttribute("data-dock-surface", "tray")
  tray.setAttribute("role", "status")
  tray.setAttribute("data-state", "rest")
  tray.innerHTML = '<span data-cache-warning-lead>Cache expired</span> · next message re-reads ~181k tokens'
  footer.parentElement.parentElement.append(tray)
})()`

export default {
  name: "cache-warning",
  viewport: "1400x900",
  elements: [
    {
      name: "tray-surface",
      ours: "[data-parity-twin]",
      native: '[data-slot="location-footer"]',
      prepare: twin,
      parts: {},
      style: {
        states: ["rest"],
        props: ["background-color", "border-top-color", "border-top-style", "border-bottom-color", "opacity", "visibility", "cursor", "user-select", "box-shadow", "overflow"],
        partProps: [],
      },
      allow: {
        "rest.box.width": "hugs its text; the host footer is the composer's full width",
        "rest.box.height": "a text row, not a button row",
        "rest.background-color": "the DockTray contract's --background-base (248) is the surface the user chose; the location footer paints bg-layer-01 (250) over it",
      },
    },
  ],
}
