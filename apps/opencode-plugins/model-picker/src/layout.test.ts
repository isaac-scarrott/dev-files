import assert from "node:assert/strict"
import test from "node:test"
import { layout, outputPrice, presses, step, type HostModel } from "./layout"

const m = (key: string, name: string, section: string): HostModel => ({ key, name, section })
const names = new Map([["zeta", "Zeta AI"], ["alpha", "alpha labs"], ["mid", "Mid Co"]])
const providerName = (id: string) => names.get(id) ?? id
const price = (entries: Record<string, number>) => new Map(Object.entries(entries))

test("sections are providers only, A to Z by displayed name, ignoring case", () => {
  const out = layout({ models: [m("zeta:a", "A", "zeta"), m("mid:a", "A", "mid"), m("alpha:a", "A", "alpha")], price: price({}), providerName })
  assert.deepEqual(out.map((section) => section.id), ["alpha", "mid", "zeta"])
})

test("models sort by output price descending, then name A to Z; no price counts as 0", () => {
  const models = [
    m("alpha:free", "Free One", "alpha"),
    m("alpha:tie-b", "Bravo", "alpha"),
    m("alpha:big", "Big", "alpha"),
    m("alpha:tie-a", "Alpha", "alpha"),
    m("alpha:none", "Aardvark", "alpha"),
  ]
  const out = layout({ models, price: price({ "alpha:free": 0, "alpha:tie-b": 5, "alpha:big": 25, "alpha:tie-a": 5 }), providerName })
  assert.deepEqual(out[0]!.keys, ["alpha:big", "alpha:tie-a", "alpha:tie-b", "alpha:none", "alpha:free"])
})

test("a recent model sits under its own provider; nothing is lost", () => {
  const models = [m("alpha:r", "Recent One", "recent"), m("alpha:p", "Plain", "alpha"), m("mid:r", "Mid Recent", "recent")]
  const out = layout({ models, price: price({}), providerName })
  assert.deepEqual(out.map((section) => [section.id, [...section.keys].sort()]), [["alpha", ["alpha:p", "alpha:r"]], ["mid", ["mid:r"]]])
})

test("Favorites lead as the host lists them and their models stay out of the provider group", () => {
  const models = [m("zeta:f2", "Two", "favorite"), m("zeta:f1", "One", "favorite"), m("zeta:p", "Plain", "zeta")]
  const out = layout({ models, price: price({ "zeta:p": 1 }), providerName })
  assert.deepEqual(out, [{ id: "favorite", keys: ["zeta:f2", "zeta:f1"] }, { id: "zeta", keys: ["zeta:p"] }])
})

test("a provider with only favorites has no section of its own", () => {
  const out = layout({ models: [m("zeta:f", "F", "favorite")], price: price({}), providerName })
  assert.deepEqual(out.map((section) => section.id), ["favorite"])
})

test("price ties are decided by name, case-insensitively", () => {
  const out = layout({ models: [m("alpha:b", "beta", "alpha"), m("alpha:a", "Alpha", "alpha")], price: price({}), providerName })
  assert.deepEqual(out[0]!.keys, ["alpha:a", "alpha:b"])
})

test("outputPrice reads the base tier, else the first, else 0", () => {
  assert.equal(outputPrice(undefined), 0)
  assert.equal(outputPrice([]), 0)
  assert.equal(outputPrice([{ tier: { type: "context" }, output: 9 }, { output: 4 }]), 4)
  assert.equal(outputPrice([{ tier: { type: "context" }, output: 9 }]), 9)
})

test("step wraps both ways and starts at the ends when nothing is active", () => {
  const order = ["a", "b", "c"]
  assert.equal(step(order, "c", 1), "a")
  assert.equal(step(order, "a", -1), "c")
  assert.equal(step(order, undefined, 1), "a")
  assert.equal(step(order, undefined, -1), "c")
  assert.equal(step([], "a", 1), undefined)
})

test("presses takes the shorter way round the host's order", () => {
  const host = ["a", "b", "c", "d", "e"]
  assert.deepEqual(presses(host, "a", "b"), { key: "ArrowDown", count: 1 })
  assert.deepEqual(presses(host, "a", "e"), { key: "ArrowUp", count: 1 })
  assert.deepEqual(presses(host, "c", "c"), { key: "ArrowDown", count: 0 })
  assert.deepEqual(presses(host, undefined, "c"), { key: "ArrowDown", count: 2 })
  assert.deepEqual(presses(host, "a", "zzz"), { key: "ArrowDown", count: 0 })
})
