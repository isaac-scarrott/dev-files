import { register } from "node:module"
import { Window } from "happy-dom"

// Solid's browser build reads `window` while it loads, before any test builds its own DOM.
const window = new Window()
// Solid's Portal checks `mount instanceof HTMLHeadElement`.
Object.assign(globalThis, { window, document: window.document, HTMLHeadElement: window.HTMLHeadElement })
register("./solid-hooks.mjs", import.meta.url)
