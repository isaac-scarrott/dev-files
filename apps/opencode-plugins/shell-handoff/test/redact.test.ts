import assert from "node:assert/strict"
import { test } from "node:test"
import { redact } from "../src/redact.js"

// Fixtures are assembled at run time so that no source line looks like a real credential to the commit hook.
const GHP = ["ghp", "_", "abcdefghijklmnopqrstuvwxyz0123"].join("")
const AWS = ["AKIA", "IOSFODNN7EXAMPLE"].join("")
const SK = ["sk", "-", "abcdefghijklmnopqrstuvwxyz123456"].join("")
const DASH = "-----"
const hidden = (input: string, secret: string) => {
  const out = redact(input)
  assert.ok(!out.includes(secret), `leaked ${secret} in: ${out}`)
  assert.ok(out.includes("[REDACTED]"), `nothing redacted in: ${out}`)
  return out
}

test("env assignments with secret names", () => {
  hidden(`GITHUB_TOKEN=${GHP} gh pr list`, GHP.slice(0, 14))
  hidden("export DB_PASSWORD='hunter2 with spaces' && ./run", "hunter2")
  hidden('API_KEY="abc123def" node x.js', "abc123def")
  hidden("AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCY npm run deploy", "wJalrXUtnFEMI")
})

test("flags", () => {
  hidden("mysql --password=s3cr3t -h db", "s3cr3t")
  hidden("tool --token abcdef123456 run", "abcdef123456")
  hidden("login --api-key 'k e y' x", "k e y")
})

test("headers and bearer", () => {
  hidden(`curl -H "Authorization: Bearer abcdef.12345-xyz" https://x.test`, "abcdef.12345-xyz")
  hidden(`curl -H 'X-Api-Key: 9f8e7d6c5b4a' https://x.test`, "9f8e7d6c5b4a")
  hidden(`curl -H 'Cookie: sid=abcdef123456; other=1' https://x.test`, "abcdef123456")
  hidden("echo Bearer abcdefghijklmnop12", "abcdefghijklmnop12")
})

test("urls with credentials", () => {
  const out = hidden("git clone https://user:p4ssw0rd@github.com/org/repo.git", "p4ssw0rd")
  assert.ok(out.includes("github.com/org/repo.git"))
  hidden("psql postgres://admin:secretpw@db.internal:5432/app", "secretpw")
})

test("well-known token shapes and JWTs", () => {
  hidden("echo github_pat_11ABCDEFG0abcdefghijklmnop_qrstuvwxyz", "github_pat_11ABC")
  hidden("echo xoxb-1234567890-abcdefghij", "xoxb-1234567890")
  hidden(`echo ${AWS}`, AWS)
  hidden(`echo ${SK}`, SK.slice(0, 12))
  hidden("echo eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP", "eyJhbGciOiJIUzI1NiJ9")
})

test("long mixed tokens are hidden, paths, git ids and slugs are not", () => {
  hidden("deploy Zm9vYmFyMTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A", "Zm9vYmFyMTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A")
  const kept = "git show 4b825dc642cb6eb9a060e54bf8d69288fbee4904 && cd /Users/someone/git/some-long-repository-name-with-dashes/src"
  assert.equal(redact(kept), kept)
})

test("ordinary commands pass unchanged", () => {
  for (const command of [
    "gh stack merge --wait 10m",
    "sleep 600",
    "pnpm test --filter @scope/pkg -- --watch",
    "./land.sh 1234 && ./wait-green.sh",
    "GIT_AUTHOR_NAME=bob git commit -m 'x'",
    "curl -s https://api.example.com/v1/status?page=2",
  ]) assert.equal(redact(command), command)
})

test("a private key block is hidden to its end", () => {
  const out = redact(`echo '${DASH}BEGIN RSA PRIVATE KEY${DASH}\nMIIEabc\n${DASH}END RSA PRIVATE KEY${DASH}' > k`)
  assert.ok(!out.includes("MIIEabc"))
})
