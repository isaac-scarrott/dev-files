// Runs every plugin's test/smoke.mjs (its built bundle under a fake host) with a wall-clock limit and prints a table.
// Usage: node smoke.mjs [plugin ...]   Exit code 1 when any plugin fails. Plugins without node_modules are skipped.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const LIMIT_MS = 30_000
const only = process.argv.slice(2)

const plugins = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "package.json")))
  .map((entry) => entry.name)
  .filter((name) => only.length === 0 || only.includes(name))
  .filter((name) => existsSync(join(root, name, "test", "smoke.mjs")))
  .sort()

const rows = plugins.map((name) => {
  const dir = join(root, name)
  if (!existsSync(join(dir, "node_modules"))) return { name, status: "skip", ms: 0, detail: "no node_modules" }
  const started = Date.now()
  const run = spawnSync("node", ["--conditions=browser", "test/smoke.mjs"], {
    cwd: dir,
    encoding: "utf8",
    timeout: LIMIT_MS,
    killSignal: "SIGKILL",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1500" },
  })
  const ms = Date.now() - started
  const out = `${run.stdout}${run.stderr}`.trim().split("\n")
  if (run.error?.code === "ETIMEDOUT") return { name, status: "FAIL", ms, detail: `over ${LIMIT_MS / 1000}s` }
  if (run.status !== 0) return { name, status: "FAIL", ms, detail: out.find((line) => /error/i.test(line)) ?? out[0] ?? `exit ${run.status}` }
  return { name, status: "ok", ms, detail: out.at(-1)?.replace(/^ok\s+/, "") ?? "" }
})

const width = Math.max(6, ...rows.map((row) => row.name.length))
console.log(`${"plugin".padEnd(width)}  status  time    registered / error`)
for (const row of rows) console.log(`${row.name.padEnd(width)}  ${row.status.padEnd(6)}  ${String(row.ms).padStart(5)}ms  ${row.detail}`)

const failed = rows.filter((row) => row.status === "FAIL")
console.log(`\n${rows.filter((row) => row.status === "ok").length} ok, ${failed.length} failed, ${rows.filter((row) => row.status === "skip").length} skipped`)
process.exit(failed.length ? 1 : 0)
