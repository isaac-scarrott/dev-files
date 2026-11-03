import assert from "node:assert/strict"
import { test } from "node:test"
import { check, defaultKind, normalize, parseFields, resolveField } from "../plugin/src/fields"

test("defaultKind follows whole words and long parts of the name", () => {
  for (const name of ["PASSWORD", "DB_PASSWD", "PASS", "GITHUB_TOKEN", "GITHUBTOKEN", "API_KEY", "CLIENT_SECRET", "EMAIL_PASSWORD", "USER_TOKEN"]) assert.equal(defaultKind(name), "secret", name)
  for (const name of ["EMAIL", "LOGIN_EMAIL", "MAIL"]) assert.equal(defaultKind(name), "email", name)
  for (const name of ["USER", "USERNAME", "LOGIN", "SSH_USER"]) assert.equal(defaultKind(name), "text", name)
  assert.equal(defaultKind("KEYBOARD_LAYOUT"), "secret") // unknown names are masked, not matched on a substring of KEY
  assert.equal(defaultKind("WHATEVER"), "secret")
})

test("resolveField masks a secret-looking name unless kind is text", () => {
  assert.deepEqual(resolveField({ name: "PASSWORD", kind: "email" }), { name: "PASSWORD", label: "Password", kind: "secret", masked: true })
  assert.deepEqual(resolveField({ name: "PASSWORD", kind: "text" }), { name: "PASSWORD", label: "Password", kind: "text", masked: false })
  assert.deepEqual(resolveField({ name: "EMAIL", kind: "secret" }), { name: "EMAIL", label: "Email", kind: "secret", masked: true })
  assert.equal(resolveField({ name: "API_BASE_URL", kind: "text", label: "  Base URL " }).label, "Base URL")
  assert.equal(resolveField({ name: "GITHUB_TOKEN" }).label, "Github token")
})

test("check blocks only what cannot be an email, and warns on the rest", () => {
  assert.equal(check("email", "").level, "ok")
  assert.equal(check("email", "ada@example.com").level, "ok")
  assert.equal(check("email", " ada@example.com ").level, "ok")
  assert.deepEqual(check("email", "ada@localhost"), { level: "warn", message: "email-domain" })
  for (const value of ["ada", "@example.com", "ada@", "a b@example.com", "a@@b.co"]) assert.deepEqual(check("email", value), { level: "invalid", message: "email" }, value)
  assert.deepEqual(check("secret", " pass "), { level: "warn", message: "space" })
  assert.equal(check("secret", "pass").level, "ok")
  assert.equal(check("text", "anything at all").level, "ok")
})

test("check results never carry the value", () => {
  assert.ok(!JSON.stringify(check("email", "hunter2 not an email")).includes("hunter2"))
})

test("normalize trims plain fields and leaves a secret as typed", () => {
  assert.equal(normalize("email", " ada@example.com\n"), "ada@example.com")
  assert.equal(normalize("text", " ada "), "ada")
  assert.equal(normalize("secret", " p w "), " p w ")
})

test("parseFields keeps a single name as one field", () => {
  const [one] = parseFields({ name: "API_TOKEN" })
  assert.equal(one!.field.name, "API_TOKEN")
  assert.equal(parseFields({ fields: [{ name: "A_B", replace: true }] })[0]!.replace, true)
})
