import assert from "node:assert/strict"
import { test } from "node:test"
import { glide, glideTargets, motionReduced, present } from "./dock-motion"

type Call = { target: Element; keyframes: any; options: any }

function chat() {
  const doc = globalThis.document
  doc.documentElement.removeAttribute("data-motion")
  doc.body.innerHTML = `<div id="card">
    <div data-slot="session-timeline-scroll"><div class="scroll-view__viewport">
      <div class="sticky" id="header"></div><div class="session-header-fade"></div><div id="list"></div><div class="shrink-0" id="spacer"></div>
    </div></div>
    <div><form></form><div class="shrink-0 items-center"><div id="column"></div></div></div>
  </div>`
  const calls: Call[] = []
  for (const el of doc.querySelectorAll<HTMLElement>("#list, #column, #header, #spacer, #card")) {
    ;(el as any).animate = (keyframes: any, options: any) => { calls.push({ target: el, keyframes, options }); return { finished: Promise.resolve() } }
    ;(el as any).getAnimations = () => []
  }
  return { doc, calls, card: doc.getElementById("card")! }
}

test("glideTargets: the timeline's content and the composer's column, never the header, fade or spacer", () => {
  const { card } = chat()
  assert.deepEqual(glideTargets(card).map((el) => el.id), ["list", "column"])
})

test("glide: nothing is animated until the padding is written; then each target starts where the content was", () => {
  const { calls, card } = chat()
  const play = glide(card, 328)
  assert.equal(calls.length, 0)
  play()
  assert.deepEqual(calls.map((c) => c.target.id), ["list", "column"])
  // The end padding grows by 328, so the centre moves 164 toward the start; the content starts 164 to the end of it.
  assert.deepEqual(calls[0].keyframes.translate, ["164px 0", "0px 0"])
  assert.equal(calls[0].options.id, "agents-dock-glide")
  assert.match(calls[0].options.easing, /^linear\(0 0%/)
  // The host's panel spring: 0.3s, run to its rest test.
  assert.ok(calls[0].options.duration > 600 && calls[0].options.duration < 700)
})

test("glide: closing starts to the start side; no change or reduced motion animates nothing", () => {
  const { calls, card, doc } = chat()
  glide(card, -328)()
  assert.deepEqual(calls[0].keyframes.translate, ["-164px 0", "0px 0"])
  calls.length = 0
  glide(card, 0)()
  doc.documentElement.setAttribute("data-motion", "reduce")
  glide(card, 328)()
  assert.equal(calls.length, 0)
})

test("motionReduced: data-motion beats the media query, as the host's own check", () => {
  const { doc } = chat()
  doc.documentElement.setAttribute("data-motion", "reduce")
  assert.equal(motionReduced(doc), true)
  doc.documentElement.setAttribute("data-motion", "full")
  assert.equal(motionReduced(doc), false)
})

test("present: the window slides on the spring and fades 150ms; reduced motion keeps only the fade", async () => {
  const { doc, calls } = chat()
  const el = doc.getElementById("list") as HTMLElement
  await present(el, true, true)
  assert.deepEqual(calls.map((c) => c.options.id), ["agents-dock-slide", "agents-dock-fade"])
  assert.deepEqual(calls[0].keyframes.map((k: any) => k.transform), ["translateX(16px)", "translateX(0px)"])
  assert.equal(calls[1].options.duration, 150)
  calls.length = 0
  doc.documentElement.setAttribute("data-motion", "reduce")
  await present(el, false)
  assert.deepEqual(calls.map((c) => c.options.id), ["agents-dock-fade"])
  assert.equal(calls[0].keyframes[0].visibility, "visible")
})
