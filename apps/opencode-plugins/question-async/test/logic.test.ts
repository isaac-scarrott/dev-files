import assert from "node:assert/strict"
import { test } from "node:test"
import { answeredText, answersFromForm, dismissedText, failedText, formMetadata, toFields } from "../src/logic.js"

const Q = (question: string, multiple?: boolean) => ({ question, header: "Head", multiple, options: [{ label: "a", description: "da" }, { label: "b", description: "db" }] })

test("toFields maps header→title, question→description, options→options, free text on, multiple→multiselect", () => {
  const fields = toFields([Q("A?"), Q("B?", true)])
  assert.deepEqual(fields[0], {
    key: "q0", type: "string", title: "Head", description: "A?", custom: true,
    options: [{ value: "a", label: "a", description: "da" }, { value: "b", label: "b", description: "db" }],
  })
  assert.equal(fields[1].key, "q1")
  assert.equal(fields[1].type, "multiselect")
})

test("formMetadata carries the request and the tool call the form belongs to", () => {
  assert.deepEqual(formMetadata("r1", "m1", "c1"), { kind: "question", requestID: "r1", tool: { messageID: "m1", id: "c1" } })
})

test("answersFromForm reads strings, arrays and gaps in question order", () => {
  assert.deepEqual(answersFromForm([Q("A"), Q("B"), Q("C")], { q0: "a", q1: ["a", "b"] }), [["a"], ["a", "b"], []])
  assert.deepEqual(answersFromForm([Q("A")], { q0: "" }), [[]])
})

test("answeredText joins each question with its answer, one line, marking gaps as Unanswered", () => {
  const text = answeredText([Q("A?"), Q("B?")], [["yes"], []])
  assert.equal(text, 'The user answered your background questions: "A?"="yes", "B?"="Unanswered". You can now continue with the user\'s answers in mind.')
})

test("answeredText joins a multi-value answer with commas", () => {
  assert.match(answeredText([Q("Pick some")], [["red", "blue"]]), /"Pick some"="red, blue"/)
})

test("dismissedText and failedText name the question(s), falling back when there are none", () => {
  assert.match(dismissedText([Q("A?")]), /\(A\?\) was dismissed without an answer/)
  assert.match(dismissedText([Q("A?"), Q("B?")]), /\(A\?; B\?\) was dismissed/)
  assert.match(dismissedText([]), /\(your question\) was dismissed/)
  assert.match(failedText([Q("A?")], "boom"), /\(A\?\) could not be shown to the user: boom/)
})
