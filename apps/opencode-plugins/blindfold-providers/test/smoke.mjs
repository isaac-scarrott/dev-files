// Loads the built server entry the way the host does and checks it is a plugin definition.
import("../dist/server.js").then((m) => {
  if (m.default?.id !== "blindfold-providers" || typeof m.default.setup !== "function") throw new Error("missing plugin export")
  console.log("ok blindfold-providers server")
})
