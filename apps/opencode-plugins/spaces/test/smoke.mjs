// Loads the built dist/gui-experimental.cjs under a fake host (see ../../test-utils/gui-smoke.mjs). Build first.
import { fileURLToPath } from "node:url"
import { smokeGui } from "../../test-utils/gui-smoke.mjs"

const { added, leaks } = await smokeGui({
  dir: fileURLToPath(new URL("..", import.meta.url)),
  registries: ["style", "command"],
})
if (leaks.length) throw new Error(`left running: ${leaks.join(", ")}`)
if (!added.includes("command")) throw new Error("no commands registered")
console.log(`ok  ${added.join(", ")}`)
