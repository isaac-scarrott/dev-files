// Loads the built dist/gui-experimental.cjs under a fake host (see ../../test-utils/gui-smoke.mjs). Build first.
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { smokeGui } from "../../test-utils/gui-smoke.mjs"

const quiet = (signal) =>
  (async function* () {
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
  })()

const { added } = await smokeGui({
  dir: fileURLToPath(new URL("..", import.meta.url)),
  registries: ["settings-page"],
  host: { client: { event: { subscribe: ({ signal }) => quiet(signal) } } },
})
assert.equal(globalThis[Symbol.for("opencode-plugins.notify.v1")], undefined, "the hub registry is gone after cleanup")
console.log(`ok  ${added.join(", ") || "no registries"}`)
