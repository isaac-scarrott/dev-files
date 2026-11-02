#!/usr/bin/env node
// Core-team GUI plugin rules, enforced against a baseline of today's violations.
// `node lint.mjs` fails only on violations beyond lint-baseline.json; `--update` rewrites the baseline
// (only ever to shrink it). Dependency-free so it runs in well under a second.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, relative, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const baselinePath = join(root, "lint-baseline.json")
const SKIP_DIRS = new Set(["node_modules", "dist", "media", "test", "blindfold"])

const RULES = {
  "no-effect": "createEffect/createRenderEffect/createComputed: use createKeyed/createLatest or derive instead",
  "no-module-state": "module-level let/var/Map/Set/WeakMap/signal/store survives reload and leaks across windows: scope it to the plugin",
  "no-host-import": "import from '@/', '@opencode/app' or '@opencode/desktop': use only @opencode/plugin/gui and contract.ts",
  "no-style-element": "inject CSS with ctx.add(Style, css), not a hand-made <style> element",
  "no-pointer-cursor": "cursor: pointer is reserved for links in the desktop app (a, [role=link]); controls keep the default cursor",
}

const PATTERNS = [
  ["no-effect", /\b(?:createEffect|createRenderEffect|createComputed)\b/g],
  ["no-module-state", /^(?:export\s+)?(?:let|var)\s/gm],
  ["no-module-state", /^(?:export\s+)?const\s+\w+(?:\s*:[^=\n]+)?\s*=\s*new\s+(?:Map|Set|WeakMap|WeakSet)\s*(?:<[^()\n]*>)?\s*\(\s*\)/gm],
  ["no-module-state", /^(?:export\s+)?const\s+(?:\[[^\]]*\]|\w+)\s*=\s*(?:createSignal|createStore|createMutable)\b/gm],
  ["no-host-import", /\bfrom\s+(?:@\/|@opencode\/(?:app|desktop)\b)/g], // quotes are scrubbed first
  ["no-style-element", /createElement\(\s*["']style["']\s*\)/g],
]

// Blank out comments, strings and template text (keeping newlines and import specifiers) so patterns only see code.
function scrub(src, keepStrings = false) {
  let out = ""
  let i = 0
  const n = src.length
  const blank = (s) => s.replace(/[^\n]/g, " ")
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); const end = e < 0 ? n : e; out += blank(src.slice(i, end)); i = end; continue }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); const end = e < 0 ? n : e + 2; out += blank(src.slice(i, end)); i = end; continue }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1
      while (j < n && src[j] !== c) j += src[j] === "\\" ? 2 : 1
      const body = src.slice(i + 1, j)
      const prev = src.slice(Math.max(0, i - 40), i)
      if (keepStrings) out += c + body + c
      else if (/\bfrom\s*$/.test(prev)) out += " " + body + " "
      else if (c !== "`" && /createElement\(\s*$/.test(prev)) out += c + body + c
      else out += c + blank(body) + c
      i = j + 1
      continue
    }
    out += c
    i++
  }
  return out
}

function files(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) files(join(dir, e.name), acc) }
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) acc.push(join(dir, e.name))
  }
  return acc
}

// A pointer cursor is allowed only on a link: the rule's selector names `a` or `[role=link]`.
function pointerCursors(src) {
  const text = scrub(src, true)
  const lines = []
  for (const m of text.matchAll(/cursor\s*:\s*pointer\b/g)) {
    const open = text.lastIndexOf("{", m.index)
    const start = Math.max(text.lastIndexOf("}", open), text.lastIndexOf("`", open), text.lastIndexOf(";", open), 0)
    const selector = text.slice(start + 1, open)
    if (/(^|[\s,>+~(])a(?![\w-])|role\s*=\s*["']?link/.test(selector)) continue
    lines.push(text.slice(0, m.index).split("\n").length)
  }
  return lines
}

const found = {} // "file|rule" -> [lines]
for (const file of files(root)) {
  const source = readFileSync(file, "utf8")
  const code = scrub(source)
  const rel = relative(root, file)
  const pointers = pointerCursors(source)
  if (pointers.length) found[`${rel}|no-pointer-cursor`] = pointers
  for (const [rule, re] of PATTERNS) {
    for (const m of code.matchAll(re)) {
      if (rule === "no-effect" && /^\s*import\b[^;\n]*$/.test(code.slice(code.lastIndexOf("\n", m.index) + 1, code.indexOf("\n", m.index) < 0 ? undefined : code.indexOf("\n", m.index)))) continue
      const line = code.slice(0, m.index).split("\n").length
      ;(found[`${rel}|${rule}`] ??= []).push(line)
    }
  }
}

if (process.argv.includes("--update")) {
  const next = Object.fromEntries(Object.entries(found).sort().map(([k, v]) => [k, v.length]))
  writeFileSync(baselinePath, JSON.stringify(next, null, 2) + "\n")
  console.log(`baseline written: ${Object.values(next).reduce((a, b) => a + b, 0)} violations in ${Object.keys(next).length} file/rule pairs`)
  process.exit(0)
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {}
let failed = 0, shrunk = 0
for (const [key, lines] of Object.entries(found)) {
  const allowed = baseline[key] ?? 0
  if (lines.length <= allowed) continue
  const [file, rule] = key.split("|")
  failed += lines.length - allowed
  console.error(`${file}: ${rule} ${lines.length} > baseline ${allowed} (lines ${lines.join(", ")})\n  ${RULES[rule]}`)
}
for (const [key, allowed] of Object.entries(baseline)) if ((found[key]?.length ?? 0) < allowed) shrunk += allowed - (found[key]?.length ?? 0)
if (shrunk) console.log(`${shrunk} baselined violation(s) fixed: run \`node lint.mjs --update\` to shrink lint-baseline.json`)
if (failed) { console.error(`\n${failed} new violation(s)`); process.exit(1) }
console.log("lint ok")
