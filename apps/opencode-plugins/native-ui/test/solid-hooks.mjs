import { readFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createRequire } from "node:module"

// `--conditions=browser` makes Babel resolve its browser build, which loads no presets. Load the Node entry by path.
const require = createRequire(import.meta.url)
const root = (name) => require.resolve(`${name}/package.json`).replace(/package\.json$/, "")
const babel = await import(pathToFileURL(`${root("@babel/core")}lib/index.js`).href)
const solid = pathToFileURL(`${root("babel-preset-solid")}index.js`).href
const typescript = pathToFileURL(`${root("@babel/preset-typescript")}lib/index.js`).href

// Compiles Solid JSX for the tests the way the plugin build does (tsx would emit React calls).
export async function load(url, context, next) {
  if (!url.endsWith(".tsx")) return next(url, context)
  const filename = fileURLToPath(url)
  const result = await babel.transformAsync(await readFile(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: [[(await import(typescript)).default, { onlyRemoveTypeImports: false }], [(await import(solid)).default, { generate: "dom", hydratable: false }]],
  })
  return { format: "module", source: result.code, shortCircuit: true }
}
