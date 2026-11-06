import assert from "node:assert/strict"
import { test } from "node:test"
import {
  addSpace,
  clampActive,
  defaultEmoji,
  deleteSpace,
  forgetSession,
  hiddenTabs,
  initialState,
  isActive,
  MAX_ASSIGNED,
  MAX_DRAFTS,
  moveDraft,
  moveSession,
  newSpaceId,
  promoteDraft,
  reconcile,
  rememberLastSession,
  renameSpace,
  selectSpace,
  selectSpaceId,
  restoreTarget,
  settle,
  spaceOf,
} from "./model"

const S = (id: string, name = id) => ({ id, name, emoji: "🌱" })

test("a fresh store is one space, active, and owns everything unassigned", () => {
  const state = initialState()
  assert.equal(state.spaces.length, 1)
  assert.equal(state.active, 0)
  assert.equal(spaceOf(state, { session: { server: "s", id: "ses_1" } }), state.spaces[0]!.id)
  assert.ok(isActive(state, { session: { server: "s", id: "ses_1" } }))
})

test("creating a space adds it and makes it active", () => {
  const state = addSpace(initialState(), S("sp_a", "Work"))
  assert.equal(state.spaces.length, 2)
  assert.equal(state.spaces[1]!.id, "sp_a")
  assert.equal(state.active, 1)
})

test("ids never collide with an existing space", () => {
  const spaces = [S("sp_000000"), S("sp_000001")]
  const ids = new Set<string>()
  for (let value = 0; value < 2; value += 1) ids.add(newSpaceId(spaces, () => value / 2))
  assert.ok([...ids].every((id) => !spaces.some((space) => space.id === id)))
  assert.equal(newSpaceId([S("sp_x")], () => 0), newSpaceId([S("sp_x")], () => 0))
})

test("default emoji avoids the ones already used", () => {
  assert.notEqual(defaultEmoji([{ ...S("a"), emoji: "🌱" }]), "🌱")
})

test("renaming changes only the named fields", () => {
  let state = addSpace(initialState(), S("sp_a", "Work"))
  state = renameSpace(state, "sp_a", { name: "Studio", emoji: "🎨" })
  assert.deepEqual(state.spaces[1], { id: "sp_a", name: "Studio", emoji: "🎨" })
  state = renameSpace(state, "sp_a", { accent: "info" })
  assert.equal(state.spaces[1]!.accent, "info")
  assert.equal(state.spaces[1]!.name, "Studio")
})

test("a session resolves to its space, drafts first, then the first space", () => {
  let state = addSpace(initialState(), S("sp_a"))
  const first = state.spaces[0]!.id
  state = moveSession(state, { server: "s", id: "ses_1" }, "sp_a", 1)
  assert.equal(spaceOf(state, { session: { server: "s", id: "ses_1" } }), "sp_a")
  assert.equal(spaceOf(state, { session: { server: "s", id: "ses_2" } }), first)
  state = moveDraft(state, "draft:1", "sp_a")
  assert.equal(spaceOf(state, { key: "draft:1" }), "sp_a")
  // A draft's space wins over any assignment the tab's session may carry.
  state = moveSession(state, { server: "s", id: "ses_3" }, first, 2)
  assert.equal(spaceOf(state, { key: "draft:1", session: { server: "s", id: "ses_3" } }), "sp_a")
})

test("moving a session replaces its previous assignment instead of adding one", () => {
  let state = addSpace(initialState(), S("sp_a"))
  state = moveSession(state, { server: "s", id: "ses_1" }, "sp_a", 1)
  state = moveSession(state, { server: "s", id: "ses_1" }, state.spaces[0]!.id, 2)
  assert.equal(state.assigned.length, 1)
  assert.equal(state.assigned[0]!.space, state.spaces[0]!.id)
  // A space that does not exist is refused, leaving the assignment alone.
  const before = state
  assert.equal(moveSession(state, { server: "s", id: "ses_1" }, "sp_missing", 3), before)
})

test("assignments are capped, oldest dropped first", () => {
  let state = initialState()
  for (let index = 0; index < MAX_ASSIGNED + 5; index += 1) {
    state = moveSession(state, { server: "s", id: `ses_${index}` }, state.spaces[0]!.id, index)
  }
  assert.equal(state.assigned.length, MAX_ASSIGNED)
  assert.ok(!state.assigned.some((item) => item.id === "ses_0"))
  assert.ok(state.assigned.some((item) => item.id === `ses_${MAX_ASSIGNED + 4}`))
})

test("drafts are capped, newest kept", () => {
  let state = initialState()
  for (let index = 0; index < MAX_DRAFTS + 3; index += 1) state = moveDraft(state, `draft:${index}`, state.spaces[0]!.id)
  assert.equal(state.drafts.length, MAX_DRAFTS)
  assert.ok(!state.drafts.some((item) => item.tab === "draft:0"))
})

test("promoting a draft carries its space to the session and clears the draft", () => {
  let state = addSpace(initialState(), S("sp_a"))
  state = moveDraft(state, "draft:1", "sp_a")
  state = promoteDraft(state, "draft:1", { server: "s", id: "ses_9" }, 5)
  assert.equal(state.drafts.length, 0)
  assert.equal(spaceOf(state, { session: { server: "s", id: "ses_9" } }), "sp_a")
})

test("promoting an unknown draft changes nothing but clears nothing", () => {
  const state = addSpace(initialState(), S("sp_a"))
  assert.deepEqual(promoteDraft(state, "draft:none", { server: "s", id: "ses_1" }, 1), state)
})

test("deleting a space gives its sessions and drafts to the first space", () => {
  let state = addSpace(addSpace(initialState(), S("sp_a")), S("sp_b"))
  const first = state.spaces[0]!.id
  state = moveSession(state, { server: "s", id: "ses_1" }, "sp_b", 1)
  state = moveDraft(state, "draft:1", "sp_b")
  state = deleteSpace(state, "sp_b")
  assert.deepEqual(state.spaces.map((space) => space.id), [first, "sp_a"])
  assert.equal(state.assigned[0]!.space, first)
  assert.equal(state.drafts[0]!.space, first)
  // Deleting the active space falls back to the first.
  state = selectSpace(state, 1)
  state = deleteSpace(state, "sp_a")
  assert.equal(state.active, 0)
})

test("the last space cannot be deleted", () => {
  const state = initialState()
  assert.equal(deleteSpace(state, state.spaces[0]!.id), state)
})

test("deleting an unknown space is a no-op", () => {
  const state = addSpace(initialState(), S("sp_a"))
  assert.equal(deleteSpace(state, "sp_nope"), state)
})

test("active index is clamped in both directions", () => {
  const state = addSpace(addSpace(initialState(), S("sp_a")), S("sp_b"))
  assert.equal(clampActive({ ...state, active: 9 }), 2)
  assert.equal(clampActive({ ...state, active: -3 }), 0)
  assert.equal(clampActive({ ...state, active: Number.NaN }), 0)
  assert.equal(clampActive({ ...state, active: 1.7 }), 1)
})

test("selecting by index or id keeps the active space in range", () => {
  let state = addSpace(addSpace(initialState(), S("sp_a")), S("sp_b"))
  assert.equal(selectSpace(state, 0).active, 0)
  assert.equal(selectSpace(state, 99).active, 2)
  assert.equal(selectSpaceId(state, "sp_a").active, 1)
  assert.equal(selectSpaceId(state, "nope"), state)
})

test("forgetting a deleted session prunes only that one", () => {
  let state = addSpace(initialState(), S("sp_a"))
  state = moveSession(state, { server: "s", id: "ses_1" }, "sp_a", 1)
  state = moveSession(state, { server: "s", id: "ses_2" }, "sp_a", 2)
  state = forgetSession(state, { server: "s", id: "ses_1" })
  assert.deepEqual(state.assigned.map((item) => item.id), ["ses_2"])
})

test("remembering the last session only touches its own space", () => {
  let state = addSpace(addSpace(initialState(), S("sp_a")), S("sp_b"))
  state = rememberLastSession(state, { server: "s", id: "ses_1", space: "sp_a" })
  assert.deepEqual(state.spaces[1]!.lastSession, { server: "s", id: "ses_1" })
  assert.equal(state.spaces[2]!.lastSession, undefined)
})

test("settle repairs a damaged store instead of throwing", () => {
  assert.equal(settle(undefined).spaces.length, 1)
  assert.equal(settle({ spaces: [] }).spaces.length, 1)
  assert.equal(settle({ spaces: null as never }).spaces.length, 1)
  const repaired = settle({
    active: 42,
    spaces: [{ id: "sp_a", name: "", emoji: "" }, { id: "", name: "x", emoji: "🌱" } as never, { id: "sp_b", name: "B", emoji: "🌿" }],
    assigned: [
      { server: "s", id: "ses_1", space: "sp_b", at: 1 },
      { server: "s", id: "ses_2", space: "sp_missing", at: 2 },
      null as never,
    ],
    drafts: [{ tab: "draft:1", space: "sp_a" }, { tab: "draft:2", space: "gone" }, null as never],
  })
  assert.deepEqual(repaired.spaces.map((space) => space.id), ["sp_a", "sp_b"])
  assert.equal(repaired.spaces[0]!.name, "Space 1")
  assert.ok(repaired.spaces[0]!.emoji !== "")
  assert.equal(repaired.active, 1)
  assert.deepEqual(repaired.assigned.map((item) => item.id), ["ses_1"])
  assert.deepEqual(repaired.drafts.map((item) => item.tab), ["draft:1"])
})

test("settle keeps assignments whose space survives, and drops ones pointing at a missing space", () => {
  const state = settle({
    spaces: [S("sp_a"), S("sp_b")],
    assigned: [{ server: "s", id: "ses_1", space: "sp_b", at: 1 }],
    drafts: [],
  })
  assert.equal(state.assigned.length, 1)
  assert.equal(spaceOf(state, { session: { server: "s", id: "ses_1" } }), "sp_b")
})

test("a tab that was already open at startup joins the first space, a later one the active space", () => {
  let state = addSpace(initialState(), S("sp_a"))
  const startup = new Set(["ses:A"])
  const known = new Set<string>()
  state = reconcile(state, [{ key: "ses:A", session: { server: "s", id: "A" } }], startup, 1, known)
  assert.equal(spaceOf(state, { session: { server: "s", id: "A" } }), state.spaces[0]!.id)
  state = reconcile(state, [
    { key: "ses:A", session: { server: "s", id: "A" } },
    { key: "ses:B", session: { server: "s", id: "B" } },
  ], startup, 2, known)
  assert.equal(spaceOf(state, { session: { server: "s", id: "B" } }), "sp_a")
})

test("reconcile leaves an existing assignment alone and drafts in their own space", () => {
  let state = addSpace(initialState(), S("sp_a"))
  state = moveSession(state, { server: "s", id: "A" }, "sp_a", 1)
  state = moveDraft(state, "draft:1", state.spaces[0]!.id)
  const before = state
  state = reconcile(state, [{ key: "ses:A", session: { server: "s", id: "A" } }, { key: "draft:1" }], new Set(), 2, new Set())
  assert.deepEqual(state.assigned, before.assigned)
  assert.deepEqual(state.drafts, before.drafts)
})

test("a draft that became a session keeps its space, and the draft is consumed", () => {
  let state = addSpace(initialState(), S("sp_a"))
  state = moveDraft(state, "draft:x", "sp_a")
  state = reconcile(state, [{ key: "s/new", session: { server: "s", id: "N" } }], new Set(), 3, new Set())
  assert.equal(spaceOf(state, { session: { server: "s", id: "N" } }), "sp_a")
  assert.equal(state.drafts.length, 0)
})

test("hidden tabs are exactly the ones of other spaces", () => {
  let state = addSpace(initialState(), S("sp_a"))
  state = moveSession(state, { server: "s", id: "B" }, "sp_a", 1)
  state = selectSpace(state, 0)
  const tabs = [
    { key: "ses:A", session: { server: "s", id: "A" } },
    { key: "ses:B", session: { server: "s", id: "B" } },
    { key: "draft:1" },
  ]
  assert.deepEqual(hiddenTabs(state, tabs), ["ses:B"])
  state = selectSpace(state, 1)
  assert.deepEqual(hiddenTabs(state, tabs), ["ses:A", "draft:1"])
})

test("a switch targets the space's last session, and nothing when it has none", () => {
  let state = addSpace(addSpace(initialState(), S("sp_a")), S("sp_b"))
  state = rememberLastSession(state, { server: "s", id: "L", space: "sp_a" })
  assert.deepEqual(restoreTarget(state, "sp_a"), { server: "s", id: "L" })
  assert.equal(restoreTarget(state, "sp_b"), undefined)
  assert.equal(restoreTarget(state, "nope"), undefined)
})
