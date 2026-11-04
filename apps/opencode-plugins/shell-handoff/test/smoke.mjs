// Loads the built server entry the way the host does and checks it is a plugin definition.
import("../dist/server.js").then((m) => {
  if (m.default?.id !== "shell-handoff" || typeof m.default.setup !== "function") throw new Error("missing plugin export")
  console.log("ok shell-handoff server")
})
