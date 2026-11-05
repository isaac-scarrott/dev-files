import assert from "node:assert/strict"
import { test } from "node:test"
import { answeredText, dismissedText } from "../src/logic.js"

const Q = (question: string) => ({ question, header: "h", options: [{ label: "a", description: "a" }] })

test("answeredText joins each question with its answer, one line, marking gaps as Unanswered", () => {
  const text = answeredText([Q("A?"), Q("B?")], [["yes"], []])
  assert.equal(text, 'The user answered your background questions: "A?"="yes", "B?"="Unanswered". You can now continue with the user\'s answers in mind.')
})

test("answeredText joins a multi-value answer with commas", () => {
  const text = answeredText([Q("Pick some")], [["red", "blue"]])
  assert.match(text, /"Pick some"="red, blue"/)
})

test("dismissedText names the question(s), falling back when there are none", () => {
  assert.match(dismissedText([Q("A?")]), /\(A\?\) was dismissed without an answer/)
  assert.match(dismissedText([Q("A?"), Q("B?")]), /\(A\?; B\?\) was dismissed/)
  assert.match(dismissedText([]), /\(your question\) was dismissed/)
})
