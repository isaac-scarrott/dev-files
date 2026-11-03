import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const here = new URL("..", import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), "bf-check-"))
const state = join(dir, "state")
const config = join(dir, "config.json")
writeFileSync(config, JSON.stringify({
  accounts: {
    agent: { provider: "1password", label: "Agent (1Password)", bin: join(here, "fixture-cli/op"), tokenStore: "memory" },
    work: { provider: "bitwarden", label: "Work (Bitwarden)", bin: join(here, "fixture-cli/bw"), appDataDir: join(dir, "bw"), organizationId: "org-work" },
  },
}))
const VALUES = ["fixture-gh-pw", "fixture-holibob-pw", "ops_fixture_service_token", "fixture-bw-master", "fixture-client-secret", "personal.fixture@example.test"]

function check(args: string[], stdin: string) {
  const result = spawnSync("node", [join(here, "check.mjs"), "--config", config, ...args], { input: stdin, encoding: "utf8", env: { ...process.env, FIXTURE_STATE: state }, timeout: 60_000 })
  return { code: result.status, out: result.stdout + result.stderr }
}
const clean = (out: string) => VALUES.every((value) => !out.includes(value))

test("check: a 1Password account unlocks with the token, lists logins by origin and reads one field, printing only its length", () => {
  const { code, out } = check(["--account", "agent", "--origin", "https://github.com", "--item", "GitHub", "--field", "password"], "ops_fixture_service_token\n")
  assert.equal(code, 0, out)
  assert.match(out, /status: locked \(\d+ ms\), unlock by serviceAccount/)
  assert.match(out, /unlock \(serviceAccount\): unlocked/)
  assert.match(out, /logins for https:\/\/github\.com: 1/)
  assert.match(out, /read password of "GitHub": 13 characters/)
  assert.ok(clean(out), "no value or secret is printed")
})

test("check: a Bitwarden account logs in with the API key, unlocks, and reads a one-time code as digits only", () => {
  const { code, out } = check(["--account", "work", "--origin", "https://admin.holibob.tech", "--field", "otp"], "user.fixture-client\nfixture-client-secret\nfixture-bw-master\n")
  assert.equal(code, 0, out)
  assert.match(out, /unlock by apiKey/)
  assert.match(out, /read otp of "Holibob admin": 6 characters, a numeric code/)
  assert.ok(clean(out))
})

test("check: a wrong credential fails with the CLI's reason and exit 1, never echoing it", () => {
  const { code, out } = check(["--account", "agent"], "ops_not_the_token_123\n")
  assert.equal(code, 1)
  assert.match(out, /FAIL unlock: .*token was rejected/)
  assert.ok(!out.includes("ops_not_the_token_123"))
})

test("check: the keychain step writes, reads and deletes a dummy item and checks for an echo", () => {
  const { code, out } = check(["--account", "agent", "--keychain", "--security", join(here, "fixture-cli/security")], "ops_fixture_service_token\n")
  assert.equal(code, 0, out)
  assert.match(out, /ok\s+write through `security -i` on stdin/)
  assert.match(out, /does not echo the token/)
  assert.match(out, /ok\s+deleted/)
})

test("check: bad configuration and unknown account exit 2 with a message", () => {
  assert.equal(check(["--account", "nobody"], "").code, 2)
  const result = spawnSync("node", [join(here, "check.mjs"), "--config", join(dir, "missing.json")], { encoding: "utf8" })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Could not read the configuration/)
  rmSync(dir, { recursive: true, force: true })
})
