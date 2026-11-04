// Rewrites the private harness's opencode.json for the onboarding run: blindfold-providers with NO accounts in its options (the
// page adds them), pointed at the fixture CLIs and a private accounts file; blindfold beside it. Usage: node config.mjs <harness root>
import { readFileSync, writeFileSync } from "node:fs"
const root = process.argv[2]
const file = `${root}/config/opencode/opencode.json`
const config = JSON.parse(readFileSync(file, "utf8"))
const repo = new URL("../..", import.meta.url).pathname.replace(/\/$/, "")
const fx = "/private/tmp/bf-onb/fx"
config.plugins = [
  { package: `${repo}/blindfold-providers`, options: { bins: { "1password": `${fx}/op`, bitwarden: `${fx}/bw` }, tokenStore: `${fx}/security`, accountsFile: "/private/tmp/bf-onb/accounts.json" } },
  { package: `${repo}/blindfold`, options: { audit: { file: "/private/tmp/bf-onb/audit.jsonl" } } },
]
writeFileSync(file, JSON.stringify(config, null, 2))
console.log("config written")
