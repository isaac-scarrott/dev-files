import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

// tsc emits the server into dist/ first; the GUI bundle is added beside it.
export default defineConfig({ plugins: [gui({ entry: "src/gui.tsx" })], build: { emptyOutDir: false } })
