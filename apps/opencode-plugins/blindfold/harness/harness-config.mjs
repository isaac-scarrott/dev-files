// Rewrites the private harness's opencode.json: both plugins with options pointing at the fixture CLIs (see harness/setup-fixtures.sh). Usage: node harness-config.mjs <harness root> [Work auto-lock minutes]
import { readFileSync, writeFileSync } from "node:fs"
const root = process.argv[2]
const file = `${root}/config/opencode/opencode.json`
const config = JSON.parse(readFileSync(file, "utf8"))
const repo = new URL("../..", import.meta.url).pathname.replace(/\/$/, "")
const fx = "/private/tmp/bf-fixtures"
config.plugins = [
  {
    package: `${repo}/blindfold-providers`,
    options: {
      // Never the user's own ~/.config/blindfold/accounts.json or login keychain: a private account file and the fixture `security`.
      accountsFile: `${root}/blindfold-accounts.json`,
      tokenStore: `${fx}/security`,
      accounts: {
        personal: { provider: "1password", label: "Personal (1Password)", unlock: "serviceAccount", bin: `${fx}/op`, tokenStore: `${fx}/security` },
        work: { provider: "bitwarden", label: "Work (Bitwarden)", bin: `${fx}/bw`, appDataDir: `${fx}/bw-work`, organizationId: "org-work", allowedOrigins: ["*.holibob.tech", "accounts.google.com"], autoLockMinutes: Number(process.argv[3] ?? 10) },
      },
    },
  },
  {
    package: `${repo}/blindfold`,
    options: {
      rules: [
        { origin: "*.holibob.tech", account: "work" },
        { origin: "http://127.0.0.1:47321", account: "personal" },
      ],
      audit: { file: process.env.BF_AUDIT ?? "/private/tmp/bf-run/audit.jsonl" },
      ...(process.env.BF_FLOW_MINUTES ? { flowMinutes: Number(process.env.BF_FLOW_MINUTES) } : {}),
    },
  },
]
writeFileSync(file, JSON.stringify(config, null, 2))
console.log("config written")
