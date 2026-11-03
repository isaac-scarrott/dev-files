// Loads the built dist/gui-experimental.cjs under a fake host (see ../../test-utils/gui-smoke.mjs). Build first.
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { smokeGui } from "../../test-utils/gui-smoke.mjs"

const { added } = await smokeGui({
  dir: fileURLToPath(new URL("..", import.meta.url)),
  registries: ["style"],
})
assert.deepEqual(added, ["style"])
console.log(`ok  ${added.join(", ")}`)
