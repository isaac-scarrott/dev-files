import assert from "node:assert/strict"
import test from "node:test"
import { unreadRoots } from "./unread"

test("unread roots are the sessions idle after they were last viewed; subagents, archived and never-run ones are left out", () => {
  const stops = unreadRoots("s", {
    session: {
      list: () => [
        { id: "a", time: { idle: 20, viewed: 10 } },
        { id: "b", time: { idle: 10, viewed: 10 } },
        { id: "c", parentID: "a", time: { idle: 30, viewed: 0 } },
        { id: "d", time: { idle: 30, viewed: 0, archived: 40 } },
        { id: "e", time: {} },
        { id: "f", time: { idle: 5 } },
      ],
    },
  })
  assert.deepEqual(stops, [{ server: "s", session: "a", kind: "done", at: 20 }, { server: "s", session: "f", kind: "done", at: 5 }])
  assert.deepEqual(unreadRoots("s", { session: { list: () => undefined } }), [])
})
