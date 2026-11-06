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

// A plugin's tests import native-ui's and session-ui's source, and each package has its own copy of Solid: an `onCleanup`
// from a shared copy would find no owner in the plugin's roots. Resolve Solid from the package the tests run in, as the
// plugin's bundle does.
const home = pathToFileURL(`${process.cwd()}/`).href
const shared = (url) => !!url && (url.includes("/native-ui/src/") || url.includes("/session-ui/src/"))
export async function resolve(specifier, context, next) {
  if (/^solid-js(\/|$)/.test(specifier) && shared(context.parentURL)) return next(specifier, { ...context, parentURL: `${home}resolve.mjs` })
  return next(specifier, context)
}
