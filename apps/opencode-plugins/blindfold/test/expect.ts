// The few bun:test matchers the server tests use, over node:assert, so the suite runs on node:test like the other plugins.
import assert from "node:assert/strict"

const marker = Symbol("objectContaining")
type Containing = { [marker]: true; shape: Record<string, unknown> }
const containing = (shape: Record<string, unknown>): Containing => ({ [marker]: true, shape })
const isContaining = (value: unknown): value is Containing => typeof value === "object" && value !== null && marker in value

function matches(actual: unknown, expected: unknown): boolean {
  if (isContaining(expected)) return typeof actual === "object" && actual !== null && Object.entries(expected.shape).every(([key, value]) => matches((actual as Record<string, unknown>)[key], value))
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => matches(actual[index], item))
  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null) return false
    const keys = Object.keys(expected)
    return keys.length === Object.keys(actual).length && keys.every((key) => matches((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]))
  }
  return Object.is(actual, expected)
}

function subset(actual: unknown, expected: unknown): boolean {
  if (typeof expected !== "object" || expected === null) return matches(actual, expected)
  return typeof actual === "object" && actual !== null && Object.entries(expected).every(([key, value]) => subset((actual as Record<string, unknown>)[key], value))
}

function build(actual: unknown, negate: boolean) {
  const check = (ok: boolean, message: string) => assert.ok(negate ? !ok : ok, `${negate ? "not " : ""}${message}`)
  return {
    toBe: (expected: unknown) => check(Object.is(actual, expected), `expected ${String(actual)} to be ${String(expected)}`),
    toEqual: (expected: unknown) => check(matches(actual, expected), `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`),
    toMatchObject: (expected: unknown) => check(subset(actual, expected), `expected ${JSON.stringify(actual)} to match ${JSON.stringify(expected)}`),
    toContain: (expected: string) => check(String(actual).includes(expected), `expected text to contain ${expected}`),
    toHaveLength: (expected: number) => check((actual as { length: number }).length === expected, `expected length ${(actual as { length: number }).length} to be ${expected}`),
    toBeUndefined: () => check(actual === undefined, "expected undefined"),
  }
}

export function expect(actual: unknown) {
  return {
    ...build(actual, false),
    not: build(actual, true),
    rejects: {
      async toThrow(text: string) {
        await assert.rejects(Promise.resolve(actual), (error: Error) => {
          assert.ok(error.message.includes(text), `expected "${error.message}" to include "${text}"`)
          return true
        })
      },
    },
  }
}
expect.objectContaining = containing
export const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
