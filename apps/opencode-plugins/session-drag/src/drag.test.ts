import assert from "node:assert/strict"
import { test } from "node:test"
import { GHOST_CLASS, GHOST_OFFSET, LABEL_ATTR, LABEL_HOLD, installSessionDrag, type DragHost } from "./drag"
import { LABEL, styles } from "./styles"
import type { SessionTarget } from "./reference"

const win = globalThis.window as unknown as Window & typeof globalThis
const doc = win.document

const LIVE: SessionTarget = { server: "local", id: "ses_LIVE0000000000000000000000", title: "Fix login" }
const ARCHIVED: SessionTarget = { server: "local", id: "ses_ARCH0000000000000000000000", title: "Archived one" }

function fixture() {
  doc.body.innerHTML = `
    <div data-slot="vertical-tabs">
      <div data-tab-key="tab-1"><div data-titlebar-tab>
        <a data-slot="tab-link" href="/s/1"><span data-slot="project-avatar-slot"></span><span data-slot="tab-title">Fix login</span></a>
        <div data-slot="tab-close"><button>x</button></div>
      </div></div>
    </div>
    <div data-sa-row="local\n${ARCHIVED.id}" data-titlebar-tab>
      <a data-slot="tab-link" href="#"><span data-slot="tab-title">Archived one</span></a>
    </div>
    <div data-panel><div data-slot="session-dropzone-blur"></div><p>timeline</p></div>
    <aside>elsewhere</aside>`
  const panel = doc.querySelector("[data-panel]") as HTMLElement
  Object.defineProperty(panel, "getBoundingClientRect", {
    value: () => ({ left: 300, top: 0, right: 900, bottom: 600, width: 600, height: 600, x: 300, y: 0 }),
  })

  const frames: FrameRequestCallback[] = []
  const previousFrame = win.requestAnimationFrame
  win.requestAnimationFrame = (callback: FrameRequestCallback) => {
    frames.push(callback)

    return frames.length
  }

  const calls = { drop: [] as SessionTarget[], icons: 0, disposed: 0 }
  const host: DragHost = {
    resolve: (row) => (row.hasAttribute("data-tab-key") ? LIVE : ARCHIVED),
    drop: (target) => void calls.drop.push(target),
    dropzones: () => [panel],
    icon: (into) => {
      calls.icons++
      into.textContent = "icon"

      return () => void calls.disposed++
    },
  }

  // What the host would see: Solid delegates mousedown and click at the document; dnd-kit listens there too.
  const seen: string[] = []
  const record = (event: Event) => void seen.push(`${event.type}${event instanceof win.MouseEvent ? `:${event.button}` : ""}`)
  const types = ["mousedown", "pointermove", "pointerup", "click", "dragover", "dragleave", "keydown"] as const
  const dragData: string[] = []
  const recordDrag = (event: Event) => {
    const data = (event as DragEvent).dataTransfer

    dragData.push(data?.getData("text/plain") ?? "")
  }
  for (const type of types) doc.addEventListener(type, record)
  doc.addEventListener("dragover", recordDrag)

  const uninstall = installSessionDrag(host, win)

  const link = doc.querySelector('[data-tab-key="tab-1"] [data-slot="tab-link"]') as HTMLElement
  const title = link.querySelector('[data-slot="tab-title"]') as HTMLElement
  const archived = doc.querySelector('[data-sa-row] [data-slot="tab-title"]') as HTMLElement

  const pointer = (type: string, target: EventTarget, x: number, y: number, init: PointerEventInit = {}) => {
    const event = new win.PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: x,
      clientY: y,
      pointerId: 1,
      isPrimary: true,
      ...init,
    })
    target.dispatchEvent(event)

    return event
  }

  const mouse = (type: string, target: EventTarget, x: number, y: number, init: MouseEventInit = {}) => {
    const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, composed: true, button: 0, clientX: x, clientY: y, ...init })
    target.dispatchEvent(event)

    return event
  }

  // A press is a pointerdown then the compat mousedown; a release is pointerup, mouseup, click.
  const press = (target: EventTarget, x: number, y: number) => {
    pointer("pointerdown", target, x, y)
    mouse("mousedown", target, x, y)
  }
  const release = (target: EventTarget, x: number, y: number) => {
    pointer("pointerup", target, x, y)
    mouse("mouseup", target, x, y)
    mouse("click", target, x, y)
  }
  const ghost = () => doc.querySelector<HTMLElement>("[data-session-drag-ghost]")
  const flush = () => {
    const pending = frames.splice(0)
    pending.forEach((callback) => callback(0))
  }

  let installed = true
  const stop = () => {
    if (installed) uninstall()
    installed = false
  }

  const cleanup = () => {
    stop()
    for (const type of types) doc.removeEventListener(type, record)
    doc.removeEventListener("dragover", recordDrag)
    win.requestAnimationFrame = previousFrame
    doc.body.innerHTML = ""
  }

  return { host, calls, seen, dragData, link, title, archived, panel, pointer, mouse, press, release, ghost, flush, uninstall: stop, cleanup }
}

test("a plain click on a live tab replays the host's mousedown on release, in order", () => {
  const f = fixture()
  try {
    f.press(f.title, 20, 40)
    assert.deepEqual(f.seen, [], "the host's navigate-on-mousedown is held back")
    f.release(f.title, 20, 40)
    assert.deepEqual(f.seen, ["mousedown:0", "pointerup:0", "click:0"])
    assert.equal(f.ghost(), null)
    assert.equal(f.calls.drop.length, 0)
  } finally {
    f.cleanup()
  }
})

test("a vertical move hands the gesture to the host's reorder after replaying its mousedown", () => {
  const f = fixture()
  try {
    f.press(f.title, 20, 40)
    f.pointer("pointermove", f.title, 21, 42)
    assert.deepEqual(f.seen, ["pointermove:0"], "a move under the threshold passes through untouched")
    f.pointer("pointermove", f.title, 22, 46)
    assert.deepEqual(f.seen, ["pointermove:0", "mousedown:0", "pointermove:0"])
    assert.equal(f.ghost(), null)
    f.pointer("pointermove", doc.body, 40, 80)
    assert.equal(f.ghost(), null, "later sideways travel belongs to the reorder")
    f.release(f.title, 40, 80)
    assert.equal(f.seen.filter((type) => type === "mousedown:0").length, 1)
  } finally {
    f.cleanup()
  }
})

test("a sideways move starts a reference drag: ghost, host overlay signal, no navigation", () => {
  const f = fixture()
  try {
    f.press(f.title, 20, 40)
    const move = f.pointer("pointermove", f.title, 26, 41)
    assert.equal(move.defaultPrevented, true)
    assert.deepEqual(f.seen, ["dragover"], "the move never reaches dnd-kit; the host sees a text drag begin")
    assert.deepEqual(f.dragData, [`@session:${LIVE.id}`])
    const ghost = f.ghost()
    assert.ok(ghost)
    assert.equal(ghost.className, GHOST_CLASS)
    assert.equal(ghost.dataset.state, "enter")
    assert.equal(ghost.querySelector('[data-slot="session-drag-ghost-title"]')?.textContent, "Fix login")
    assert.equal(ghost.querySelector('[data-slot="session-drag-ghost-icon"]')?.textContent, "icon")
    assert.equal(ghost.style.transform, `translate3d(${26 - GHOST_OFFSET.x}px, ${41 - GHOST_OFFSET.y}px, 0)`)
    assert.equal(doc.documentElement.hasAttribute("data-session-drag"), true)
    f.flush()
    assert.equal(ghost.dataset.state, "active")
    f.pointer("pointermove", doc.body, 400, 300)
    assert.equal(ghost.style.transform, `translate3d(400px, ${300 - GHOST_OFFSET.y}px, 0)`)
  } finally {
    f.cleanup()
  }
})

test("release over the session panel drops: host overlay cleared, ghost gone at once, click swallowed", () => {
  const f = fixture()
  try {
    f.press(f.title, 20, 40)
    f.pointer("pointermove", f.title, 26, 41)
    f.pointer("pointermove", f.panel, 400, 300)
    f.release(f.panel, 400, 300)
    assert.deepEqual(f.calls.drop, [LIVE])
    assert.equal(f.ghost(), null)
    assert.equal(f.calls.disposed, 1)
    assert.equal(doc.documentElement.hasAttribute("data-session-drag"), false)
    assert.deepEqual(f.seen, ["dragover", "dragleave", "pointerup:0"], "no mousedown replay, and the click never reaches the host")
    f.mouse("click", f.panel, 400, 300)
    assert.deepEqual(f.seen.at(-1), "click:0", "only the one click after the drop is swallowed")
  } finally {
    f.cleanup()
  }
})

test("release elsewhere does nothing but fade the ghost out", () => {
  const f = fixture()
  try {
    f.press(f.title, 20, 40)
    f.pointer("pointermove", f.title, 26, 41)
    const ghost = f.ghost()!
    f.pointer("pointermove", doc.body, 100, 300)
    f.release(doc.body, 100, 300)
    assert.equal(f.calls.drop.length, 0)
    assert.equal(ghost.dataset.state, "leave")
    assert.equal(ghost.isConnected, true)
    ghost.dispatchEvent(new win.Event("transitionend"))
    assert.equal(ghost.isConnected, false)
    assert.equal(f.calls.disposed, 1)
    assert.ok(f.seen.includes("dragleave"))
  } finally {
    f.cleanup()
  }
})

test("Escape cancels the drag and the release that follows drops nothing", () => {
  const f = fixture()
  try {
    f.press(f.title, 20, 40)
    f.pointer("pointermove", f.title, 26, 41)
    const escape = new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    doc.body.dispatchEvent(escape)
    assert.equal(escape.defaultPrevented, true)
    assert.equal(f.seen.includes("keydown"), false, "Escape belongs to the drag, as it does to a native one")
    assert.equal(f.ghost()?.dataset.state, "leave")
    assert.equal(doc.documentElement.hasAttribute("data-session-drag"), false)
    f.release(f.panel, 400, 300)
    assert.equal(f.calls.drop.length, 0)
    assert.equal(f.seen.includes("click:0"), false)
  } finally {
    f.cleanup()
  }
})

test("a snooze-archive row drags too, without holding back its mousedown", () => {
  const f = fixture()
  try {
    f.press(f.archived, 20, 200)
    assert.deepEqual(f.seen, ["mousedown:0"], "archive rows act on click, so their mousedown passes")
    f.pointer("pointermove", f.archived, 30, 201)
    assert.equal(f.ghost()?.querySelector('[data-slot="session-drag-ghost-title"]')?.textContent, "Archived one")
    f.release(f.panel, 400, 300)
    assert.deepEqual(f.calls.drop, [ARCHIVED])
    assert.equal(f.seen.includes("click:0"), false, "the row's own click action is swallowed after a drag")
  } finally {
    f.cleanup()
  }
})

test("presses on a row's close control, other buttons, and non-rows are left alone", () => {
  const f = fixture()
  try {
    const close = doc.querySelector('[data-slot="tab-close"] button')!
    f.press(close, 90, 40)
    assert.deepEqual(f.seen, ["mousedown:0"])
    f.pointer("pointermove", close, 120, 41)
    assert.equal(f.ghost(), null)
    f.release(close, 120, 41)
    f.seen.length = 0
    f.pointer("pointerdown", f.title, 20, 40, { button: 2 })
    f.mouse("mousedown", f.title, 20, 40, { button: 2 })
    assert.deepEqual(f.seen, ["mousedown:2"])
    f.seen.length = 0
    f.press(doc.querySelector("aside")!, 500, 500)
    assert.deepEqual(f.seen, ["mousedown:0"])
  } finally {
    f.cleanup()
  }
})

test("window blur cancels a drag in progress", () => {
  const f = fixture()
  try {
    f.press(f.title, 20, 40)
    f.pointer("pointermove", f.title, 26, 41)
    win.dispatchEvent(new win.Event("blur"))
    assert.equal(doc.documentElement.hasAttribute("data-session-drag"), false)
    f.release(f.panel, 400, 300)
    assert.equal(f.calls.drop.length, 0)
  } finally {
    f.cleanup()
  }
})

test("uninstall stops listening", () => {
  const f = fixture()
  try {
    f.uninstall()
    f.press(f.title, 20, 40)
    assert.deepEqual(f.seen, ["mousedown:0"], "nothing holds the host's mousedown back any more")
    f.pointer("pointermove", f.title, 26, 41)
    assert.equal(f.ghost(), null)
  } finally {
    f.cleanup()
  }
})

const labelOn = () => doc.documentElement.hasAttribute(LABEL_ATTR)
const wait = () => new Promise((resolve) => setTimeout(resolve, LABEL_HOLD + 50))

test("the overlay wording is ours only while our drag is active, held through the host's fade, then restored", async () => {
  for (const end of ["drop", "outside", "escape", "pointercancel", "blur"] as const) {
    const f = fixture()
    try {
      assert.equal(labelOn(), false, `${end}: untouched before the drag`)
      f.press(f.title, 20, 40)
      assert.equal(labelOn(), false, `${end}: a press alone does not change it`)
      f.pointer("pointermove", f.title, 26, 41)
      assert.equal(labelOn(), true, `${end}: ours during the drag`)
      if (end === "drop") f.release(f.panel, 400, 300)
      if (end === "outside") f.release(doc.body, 100, 300)
      if (end === "escape") doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
      if (end === "pointercancel") win.dispatchEvent(new win.Event("pointercancel"))
      if (end === "blur") win.dispatchEvent(new win.Event("blur"))
      assert.equal(labelOn(), true, `${end}: held while the overlay fades out`)
      await wait()
      assert.equal(labelOn(), false, `${end}: host wording restored`)
    } finally {
      f.cleanup()
    }
  }
})

test("a drag that starts inside the hold keeps the label; cleanup restores it at once", async () => {
  const f = fixture()
  try {
    f.press(f.title, 20, 40)
    f.pointer("pointermove", f.title, 26, 41)
    f.release(doc.body, 100, 300)
    f.press(f.title, 20, 40)
    f.pointer("pointermove", f.title, 26, 41)
    await wait()
    assert.equal(labelOn(), true, "the first drag's timer must not clear the second drag's label")
    f.uninstall()
    assert.equal(labelOn(), false)
  } finally {
    f.cleanup()
  }
})

test("the host's own drags never get our wording", () => {
  const f = fixture()
  try {
    const files = new win.DragEvent("dragover", { bubbles: true, cancelable: true })
    doc.body.dispatchEvent(files)
    assert.equal(labelOn(), false)
    f.press(f.title, 20, 40)
    f.pointer("pointermove", f.title, 20, 80)
    assert.equal(labelOn(), false, "a vertical (reorder) gesture is not ours")
  } finally {
    f.cleanup()
  }
})

test("the label styles hit only the host's unslotted label inside the overlay, gated on our attribute", () => {
  assert.equal(LABEL, "Drop to attach session")
  assert.match(styles, new RegExp(`html\\[${LABEL_ATTR}\\] \\[data-slot="session-dropzone-content"\\] > div:not\\(\\[data-slot\\]\\) \\{ font-size: 0; line-height: 0; \\}`))
  assert.ok(styles.includes(`::after { content: "${LABEL}"; display: block; font-size: 15px; line-height: 24px; }`))
})
