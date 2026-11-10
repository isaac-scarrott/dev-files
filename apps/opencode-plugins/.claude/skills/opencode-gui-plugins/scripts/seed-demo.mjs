#!/usr/bin/env node
// Seed a throwaway OpenCode server with invented, realistic content for README media: four projects, a dozen live
// sessions, a 12-prompt session with tool calls and markdown, two running subagents and 34 archived sessions.
// Nothing here comes from real threads. No model calls.
// Usage: node seed-demo.mjs <baseUrl> <password> <projectsRoot>
import { randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

const [base, password, root] = process.argv.slice(2)
if (!password || !root) throw new Error("usage: seed-demo.mjs <baseUrl> <password> <projectsRoot>")

const headers = {
  "content-type": "application/json",
  authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64"),
}
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const rand = (n) => Array.from(randomBytes(n), (b) => B62[b % 62]).join("")
let seq = Date.now() * 4096
const id = (prefix) => `${prefix}_${(seq++).toString(16).padStart(12, "0").slice(-12)}${rand(14)}`
const model = { id: "seed", providerID: "seed" }
const zero = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
// Subagents that must read as running use this model: point a provider "stub" at a server that never finishes a reply, then prompt them.
const STUB = { id: "stub-1", providerID: "stub" }
const MIN = 60_000
const now = Date.now()

// Each project is a git repo with one empty commit (its message names the repo, or equal commits would share a hash and project), so the server derives its own project id from the root commit.
// Creating (then deleting) a probe session in each directory registers the project and returns that id.
const dirs = {}
const projectIDs = {}
for (const name of ["billing-api", "web-dashboard", "docs-site", "mobile-app"]) {
  dirs[name] = join(root, name)
  mkdirSync(dirs[name], { recursive: true })
  execFileSync("git", ["init", "-q", dirs[name]])
  execFileSync("git", ["-C", dirs[name], "-c", "user.name=demo", "-c", "user.email=demo@example.com", "commit", "-q", "--allow-empty", "-m", `init ${name}`])
  const probe = await fetch(base + "/api/session", { method: "POST", headers, body: JSON.stringify({ location: { directory: dirs[name] } }) })
  const { data } = await probe.json()
  projectIDs[name] = data.projectID
  await fetch(`${base}/api/session/${data.id}`, { method: "DELETE", headers })
}

const send = async (info, messages) => {
  const res = await fetch(base + "/api/experimental/session/import", {
    method: "POST", headers,
    body: JSON.stringify({ info, messages, location: { directory: info.location.directory } }),
  })
  if (!res.ok) throw new Error(`import ${res.status} ${await res.text()}`)
}
const info = (title, project, agoMin, extra = {}) => ({
  id: id("ses"), projectID: projectIDs[project], agent: "build", model: extra.model ?? model, cost: 0, tokens: zero, title,
  time: { created: now - agoMin * MIN - 30 * MIN, updated: now - agoMin * MIN, ...extra.time },
  location: { directory: dirs[project] }, ...(extra.parentID ? { parentID: extra.parentID } : {}),
})
const user = (t, text) => ({ id: id("msg"), type: "user", time: { created: t }, text })
const text = (s) => ({ type: "text", text: s })
const tool = (name, input, output) => ({
  type: "tool", id: id("tool"), name, executed: true,
  state: { status: "completed", input, content: [{ type: "text", text: output }] },
  time: { created: now, completed: now },
})
const reply = (t, content, done = true) => ({
  id: id("msg"), type: "assistant", agent: "build", model, finish: done ? "stop" : undefined,
  time: done ? { created: t, completed: t } : { created: t }, content,
})

const turns = [
  ["Add a CSV export to the invoices page. Finance wants one row per line item.",
    [tool("read", { path: "src/routes/invoices.ts" }, "export const list = ..."), tool("grep", { pattern: "lineItems" }, "src/models/invoice.ts:41")],
    "The invoices route already loads line items, so the export can reuse `listInvoices`. I'll add a `/invoices/export.csv` handler that streams rows instead of building the file in memory."],
  ["Stream it, invoices can have 50k rows for the big accounts.",
    [tool("edit", { path: "src/routes/invoices.ts" }, "Edited src/routes/invoices.ts (+38 -2)")],
    "Done. The handler pages through invoices 500 at a time and writes each page to the response as it arrives.\n\n```ts\nfor await (const page of pages(filter, 500)) {\n  res.write(toCsv(page.flatMap(lineItems)))\n}\n```"],
  ["What happens with commas and quotes in the description column?",
    [tool("read", { path: "src/lib/csv.ts" }, "export const toCsv = ...")],
    "`toCsv` quotes any field containing a comma, quote or newline and doubles embedded quotes, as RFC 4180 asks. Fields starting with `=`, `+`, `-` or `@` are not guarded yet, which matters if someone opens the file in a spreadsheet."],
  ["Guard those too.",
    [tool("edit", { path: "src/lib/csv.ts" }, "Edited src/lib/csv.ts (+9 -1)")],
    "Fields that start with a formula character now get a leading apostrophe, the same approach most exporters use."],
  ["Add tests for the quoting and the formula guard.",
    [tool("write", { path: "src/lib/csv.test.ts" }, "Wrote src/lib/csv.test.ts"), tool("bash", { command: "pnpm test csv" }, "✓ quotes commas\n✓ doubles quotes\n✓ guards formulas\n3 passed")],
    "Three tests added and passing: commas, embedded quotes and the formula guard."],
  ["Does the export respect the date filter on the page?",
    [tool("grep", { pattern: "dateRange" }, "src/routes/invoices.ts:22")],
    "Not yet. The page passes `from` and `to` as query params, but the export route only reads `status`. I'll forward all three."],
  ["Yes please, and name the file after the range.",
    [tool("edit", { path: "src/routes/invoices.ts" }, "Edited src/routes/invoices.ts (+11 -3)")],
    "The file is now `invoices-2026-10-01_2026-10-31.csv`, from the `from` and `to` params, or `invoices-all.csv` without them."],
  ["Show me the diff summary.",
    [tool("bash", { command: "git diff --stat" }, " src/lib/csv.test.ts    | 31 +++\n src/lib/csv.ts         | 10 +-\n src/routes/invoices.ts | 49 ++++-\n 3 files changed, 87 insertions(+), 3 deletions(-)")],
    "Three files, 87 additions and 3 deletions. Most of it is the new test file."],
  ["Is there anything in the docs I should update?",
    [tool("grep", { pattern: "export", path: "docs" }, "docs/api.md:112: ## Exports")],
    "`docs/api.md` has an Exports section that lists only the PDF endpoint. I'd add the CSV route with its query params."],
  ["Add it.",
    [tool("edit", { path: "docs/api.md" }, "Edited docs/api.md (+14 -0)")],
    "Added `GET /invoices/export.csv` with `status`, `from` and `to`, plus a note on the formula guard."],
  ["One more thing: large exports should respect the 30s gateway timeout.",
    [tool("read", { path: "infra/gateway.yaml" }, "timeout: 30s")],
    "Streaming keeps the connection active, so the gateway timeout applies to idle time rather than total time. I checked `infra/gateway.yaml` and the idle timeout is 30s, which each flushed page resets."],
  ["Great. Summarise what changed for the PR description.",
    [],
    "## CSV export for invoices\n\n- New `GET /invoices/export.csv`, streamed 500 invoices at a time.\n- One row per line item; filters `status`, `from`, `to`.\n- Formula-looking fields are prefixed with an apostrophe.\n- Tests for quoting and the guard; docs updated."],
]
const main = info("Add CSV export to invoices", "billing-api", 2)
{
  const msgs = []
  let t = now - 40 * MIN
  for (const [prompt, tools, answer] of turns) {
    msgs.push(user((t += 90_000), prompt))
    msgs.push(reply((t += 60_000), [...tools, text(answer)]))
  }
  await send(main, msgs)
}

const small = async (title, project, agoMin, prompt, answer, o = {}) => {
  const i = info(title, project, agoMin, o)
  const t = i.time.updated - 3 * MIN
  await send(i, [user(t, prompt), reply(t + MIN, answer ? [text(answer)] : [], Boolean(answer))])
  return i
}
await small("Fix flaky checkout test", "web-dashboard", 25, "checkout.spec fails about one run in ten on CI.", "The test clicks Pay before the card form finishes mounting. Waiting on the form's `data-ready` attribute removes the race.")
await small("Migrate docs to MDX", "docs-site", 180, "Move the guides folder from Markdown to MDX.", "Converted 41 files; the 3 with raw HTML needed manual fixes.")
await small("Dark mode for settings page", "web-dashboard", 300, "The settings page ignores the theme toggle.", "Three components hard-coded colours. They use the theme tokens now.")
await small("Upgrade Stripe SDK to v17", "billing-api", 1440, "Bump the Stripe SDK and fix the breaking changes.", "Only `paymentIntents.confirm` changed signature; updated its two call sites.")
await small("Offline sync crash on resume", "mobile-app", 2880, "The app crashes when it resumes after being offline for a while.", "The queue replay assumed a non-empty token. It now refreshes the token first.")
await small("Rate limit webhook retries", "billing-api", 5760, "Failed webhooks retry every second forever.", "Retries now back off exponentially up to 10 minutes and stop after 24 hours.")

// Two running subagents (assistant message with no finish) and one finished, children of the main session.
await small("Audit CSV edge cases (@general subagent)", "billing-api", 1, "List inputs that could break the CSV writer.", "", { parentID: main.id, model: STUB })
await small("Write export tests (@general subagent)", "billing-api", 1, "Cover the export route with tests.", "", { parentID: main.id, model: STUB })
await small("Check gateway timeouts (@explore subagent)", "billing-api", 8, "Find the idle and total timeouts for the gateway.", "Idle timeout is 30s, total is 300s.", { parentID: main.id })

// 34 archived sessions, newest first.
const topics = [
  ["billing-api", ["Backfill missing tax IDs", "Add idempotency keys to refunds", "Split invoice PDF rendering", "Fix rounding on multi-currency totals", "Cache exchange rates", "Remove deprecated v1 endpoints", "Audit log for plan changes", "Fix timezone bug in monthly statements"]],
  ["web-dashboard", ["Add keyboard shortcuts to the table", "Fix sticky header on Safari", "Lazy-load the charts", "Empty state for new accounts", "Replace moment with date-fns", "Accessibility pass on forms", "Debounce the search box", "Fix pagination off-by-one"]],
  ["docs-site", ["Fix broken anchors", "Add search to the sidebar", "Versioned docs for v2", "Dead link checker in CI", "Rewrite the quickstart", "Add an API changelog"]],
  ["mobile-app", ["Fix push notification deep links", "Reduce cold start time", "Biometric login", "Crash on rotating the camera view", "Upgrade React Native", "Fix keyboard covering inputs", "Localise onboarding", "Reduce bundle size"]],
]
const flat = topics.flatMap(([project, titles]) => titles.map((title) => [project, title]))
for (let i = 0; i < 34; i++) {
  const [project, title] = flat[(i * 7) % flat.length]
  const ago = 6000 + i * 520
  const archivedAt = now - (ago - 30) * MIN
  await small(`${title}${i >= flat.length ? " (follow-up)" : ""}`, project, ago, "Please handle this.", "Done.", { time: { archived: archivedAt } })
}
console.log(JSON.stringify({ main: main.id, dirs }))
