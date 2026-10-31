import { Command, Plugin, Slot, type SlotMap } from "@opencode/plugin/gui"
import type { Context } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js"
import { currentTarget, jump, type Host } from "./jump"
import { candidates, type Target } from "./target"

const TITLE = "Jump to previous message you sent"
const LABEL = "Previous message you sent"

type Instance = { active(): boolean; ready(): boolean; run(): void }

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

function JumpButton(props: {
  ctx: Context
  input: SlotMap["session.header"]
  register(instance: Instance): () => void
}) {
  const [scroller, setScroller] = createSignal<HTMLElement>()
  const [target, setTarget] = createSignal<Target>()
  const [loading, setLoading] = createSignal(false)
  const session = () => props.input.session
  const data = () => session().server.data.session
  const ids = createMemo(() => candidates(data().message.list(session().id), data().get(session().id)?.revert?.messageID))
  const more = () => data().message.more(session().id)

  // The slot's element joins the timeline after it is created; the scroller is its nearest scrollable ancestor.
  let element: HTMLElement | undefined
  let locating: number | undefined
  const locate = (left: number) => {
    locating = undefined
    const root = element?.closest<HTMLElement>("[data-scrollable]")

    if (root) setScroller(root)
    else if (left > 0) locating = requestAnimationFrame(() => locate(left - 1))
  }

  onMount(() => locate(10))
  onCleanup(() => {
    if (locating !== undefined) cancelAnimationFrame(locating)
  })

  const host = (): Host | undefined => {
    const root = scroller()

    if (!root) return undefined

    return {
      scroller: root,
      ids,
      more,
      loadMore: (signal) => data().message.loadMore(session().id, { signal }),
      run: (command) => props.ctx.commands.run(command),
      reducedMotion,
      frame,
      loading: setLoading,
    }
  }

  let pending: number | undefined

  const refresh = () => {
    pending = undefined

    if (!props.input.active) return
    const current = host()
    setTarget(current ? currentTarget(current) : undefined)
  }

  const schedule = () => {
    if (pending !== undefined) return
    pending = requestAnimationFrame(refresh)
  }

  onCleanup(() => {
    if (pending !== undefined) cancelAnimationFrame(pending)
  })

  createEffect(() => {
    const root = scroller()

    if (!root) return
    root.addEventListener("scroll", schedule, { passive: true })
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : undefined
    observer?.observe(root)
    schedule()
    onCleanup(() => {
      root.removeEventListener("scroll", schedule)
      observer?.disconnect()
    })
  })

  createEffect(on([ids, more, () => props.input.active], schedule, { defer: true }))

  let inflight: AbortController | undefined

  const run = () => {
    if (inflight || !props.input.active) return
    const current = host()

    if (!current) return
    const controller = new AbortController()
    inflight = controller
    void jump(current, controller.signal).finally(() => {
      if (inflight === controller) inflight = undefined
      schedule()
    })
  }

  onCleanup(() => inflight?.abort())
  onMount(() => onCleanup(props.register({ active: () => props.input.active, ready: () => !!target(), run })))

  return (
    <span ref={(el) => (element = el)} style={{ display: "contents" }}>
      <Show when={ids().length > 0}>
        <props.ctx.ui.Tooltip value={LABEL} keys={props.ctx.keybinds.keybind(`${props.ctx.id}.previous`)}>
          <props.ctx.ui.IconButton
            icon="arrow-up"
            label={LABEL}
            size="small"
            disabled={!target()}
            busy={loading()}
            onClick={run}
          />
        </props.ctx.ui.Tooltip>
      </Show>
    </span>
  )
}

export default Plugin.define({
  setup(ctx) {
    const [instances, setInstances] = createSignal<readonly Instance[]>([])
    const current = () => instances().find((instance) => instance.active())

    ctx.add(Command, (): Command => ({
      id: "previous",
      title: TITLE,
      section: "session",
      enabled: !!current()?.ready(),
      run: () => current()?.run(),
    }))

    ctx.add(Slot, {
      at: "session.header",
      render: (input) => (
        <JumpButton
          ctx={ctx}
          input={input}
          register={(instance) => {
            setInstances((list) => [...list, instance])

            return () => setInstances((list) => list.filter((item) => item !== instance))
          }}
        />
      ),
    })
  },
})
