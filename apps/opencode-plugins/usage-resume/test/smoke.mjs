// Loads the built dist/gui-experimental.cjs under a fake host (see ../../test-utils/gui-smoke.mjs). Build first.
import { fileURLToPath } from "node:url"
import { smokeGui } from "../../test-utils/gui-smoke.mjs"

const { added } = await smokeGui({
  dir: fileURLToPath(new URL("..", import.meta.url)),
  registries: ["settings-page", "composer-pill"],
  server: "dist/server.js",
  host: { client: { rpc: () => ({ events: { on: () => () => undefined } }) } },
})
console.log(`ok  ${added.join(", ") || "no registries"}`)
