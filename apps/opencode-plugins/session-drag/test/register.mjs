import { register } from "node:module"
import { Window } from "happy-dom"

// Solid's browser build reads `window` while it loads, before any test builds its own DOM.
const window = new Window()
Object.assign(globalThis, { window, document: window.document })
register("./solid-hooks.mjs", import.meta.url)
