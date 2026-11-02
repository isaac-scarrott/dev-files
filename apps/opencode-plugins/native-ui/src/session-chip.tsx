import { createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { ComposerPill, createKeyed, createLatest, type IconName, type MountedSession, type SessionRef, type Ui } from "@opencode/plugin/gui"
import { messageSignature } from "./chip-signature"
import { nextChange } from "./chip-time"
import { createLaneChip } from "./lane-chip"
import { LaneChipRows, type LaneChipRow } from "./lane-chip-rows"

// A composer chip for "things aimed at this session" that a server half can list: counts them, opens a popover of rows, and
// takes one away. The plugin supplies the words and the two server calls; everything reactive is here, so monitor and
// scheduler stay small. Data is event driven: it is asked for when the current session changes, when its messages change
// (a wake, a notice, a tool call finishing), when the popover opens and after the user's own action. The only timer runs while
// the popover is open, and sleeps until the next displayed span changes.

/** What the chip uses of the plugin's context, so a plugin whose SDK copy differs from this package's still passes its own. */
export interface ChipContext {
  readonly ui: Ui
  readonly sessions: { current(): MountedSession | undefined }
  readonly toast: { show(options: { title: string }): unknown }
  add(registry: typeof ComposerPill, item: ComposerPill): unknown
}

export interface SessionChipOptions<Item extends { readonly id: string }> {
  id: string
  icon: IconName
  rowIcon: () => JSX.Element
  /** "2 monitors". */
  label(count: number): string
  /** Accessible name of a row's action: "Stop monitor". */
  actionLabel: string
  /** Toast when the action finds nothing left to act on. */
  gone: string
  /** The items aimed at the session, from the server half that runs where the session runs. */
  load(session: SessionRef, signal: AbortSignal): Promise<readonly Item[]>
  rows(items: readonly Item[], now: number): LaneChipRow[]
  /** Times (ms) whose remaining span a row shows; the popover refreshes when one of them ticks over a minute. */
  deadlines(items: readonly Item[]): number[]
  act(session: SessionRef, item: Item): Promise<boolean>
}

interface Loaded<Item> {
  readonly key: string
  readonly stamp: number
  readonly items: readonly Item[]
}

export function createSessionChip<Item extends { readonly id: string }>(ctx: ChipContext, options: SessionChipOptions<Item>): void {
  const [stamp, setStamp] = createSignal(0)
  const refresh = () => setStamp((value) => value + 1)
  // Items the user just removed stay out of any answer that was asked before the removal.
  const [removed, setRemoved] = createSignal<ReadonlyMap<string, number>>(new Map())

  const signature = createMemo(() => {
    const session = ctx.sessions.current()
    return session ? messageSignature(session.server.data.session.message.list(session.id)) : ""
  })
  const request = createMemo(() => {
    const session = ctx.sessions.current()
    if (!session) return undefined
    signature()
    return { session, stamp: stamp() }
  })
  const answer = createLatest(request, async ({ session, stamp: asked }, signal): Promise<Loaded<Item>> => ({
    key: session.key,
    stamp: asked,
    items: await options.load(session, signal).catch(() => []),
  }))

  const itemsOf = (key: string): readonly Item[] => {
    const latest = answer.latest
    if (!latest || latest.key !== key) return []
    const gone = removed()
    return latest.items.filter((item) => (gone.get(item.id) ?? 0) <= latest.stamp)
  }

  const chip = createLaneChip({
    id: options.id,
    icon: options.icon,
    label: options.label,
    menu: (input) => {
      const [now, setNow] = createSignal(Date.now())
      const items = () => itemsOf(input.session.key)
      refresh()
      createKeyed(
        () => options.deadlines(items()).join(","),
        () => {
          let timer: ReturnType<typeof setTimeout> | undefined
          const arm = () => {
            const wait = nextChange(options.deadlines(items()), Date.now())
            if (wait === undefined) return
            timer = setTimeout(() => {
              setNow(Date.now())
              arm()
            }, wait)
          }
          arm()
          onCleanup(() => clearTimeout(timer))
        },
      )
      return (
        <LaneChipRows
          ui={ctx.ui}
          rows={options.rows(items(), now())}
          icon={options.rowIcon}
          actionLabel={options.actionLabel}
          onAction={(id, keyboard) => {
            const item = items().find((candidate) => candidate.id === id)
            const session = ctx.sessions.current()
            if (!item || !session) return
            // The chip and its popover go with the last item, taking focus with them: a keyboard user lands in the prompt, as the host's own capsule does.
            if (keyboard && items().length === 1) input.screen.composer.focus()
            // Out of the list at once; any answer asked before the server finished stays without it, the next one is the truth.
            setRemoved((current) => new Map(current).set(id, Infinity))
            const done = (ok: boolean) => {
              if (!ok) ctx.toast.show({ title: options.gone })
              const next = stamp() + 1
              setStamp(next)
              setRemoved((current) => new Map(current).set(id, next))
            }
            void options.act(session, item).then(done, () => done(false))
          }}
        />
      )
    },
  })
  ctx.add(ComposerPill, chip.pill)

  // Tell the chip how many there are for the session on screen, once an answer for that session has arrived.
  createKeyed(
    () => {
      const session = ctx.sessions.current()
      return session && answer.latest?.key === session.key ? { key: session.key, visit: session.visit, count: itemsOf(session.key).length } : undefined
    },
    (value) => chip.settle(value, value.count),
    { equals: (a, b) => a.key === b.key && a.visit === b.visit && a.count === b.count },
  )
}
