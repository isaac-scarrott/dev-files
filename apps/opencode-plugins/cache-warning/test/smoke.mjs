// Loads the built dist/gui-experimental.cjs under a fake host (see ../../test-utils/gui-smoke.mjs). Build first.
import { fileURLToPath } from "node:url"
import { smokeGui } from "../../test-utils/gui-smoke.mjs"

const { added } = await smokeGui({
  dir: fileURLToPath(new URL("..", import.meta.url)),
  registries: ["style"],
  server: "dist/server.js",
})
console.log(`ok  ${added.join(", ") || "no registries"}`)
