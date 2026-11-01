import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { sync } from "./server.js"

function home(settings) {
  const dir = mkdtempSync(path.join(tmpdir(), "claude-proxy-"))
  if (settings === undefined) return dir
  mkdirSync(path.join(dir, ".claude"))
  writeFileSync(path.join(dir, ".claude", "settings.json"), settings)
  return dir
}

const warnings = []
console.warn = (message) => warnings.push(message)

test("copies proxy keys from settings.json env", () => {
  const target = {}
  sync(home(JSON.stringify({ env: { ANTHROPIC_BASE_URL: "http://x", ANTHROPIC_AUTH_TOKEN: "t", OTHER: "no" } })), target)
  assert.deepEqual(target, { ANTHROPIC_BASE_URL: "http://x", ANTHROPIC_AUTH_TOKEN: "t" })
})

test("removed keys leave the env on the next sync", () => {
  const target = {}
  sync(home(JSON.stringify({ env: { ANTHROPIC_BASE_URL: "http://x", ANTHROPIC_AUTH_TOKEN: "t" } })), target)
  sync(home(JSON.stringify({ env: { ANTHROPIC_BASE_URL: "http://y" } })), target)
  assert.deepEqual(target, { ANTHROPIC_BASE_URL: "http://y" })
})

test("missing settings.json warns and does not throw", () => {
  const target = { KEEP: "1" }
  warnings.length = 0
  sync(home(), target)
  assert.deepEqual(target, { KEEP: "1" })
  assert.equal(warnings.length, 1)
})

test("invalid settings.json warns and does not throw", () => {
  const target = {}
  warnings.length = 0
  sync(home("{nope"), target)
  assert.deepEqual(target, {})
  assert.equal(warnings.length, 1)
})
