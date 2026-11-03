import { createKeyed, createLatest, Plugin, Style, type SessionRef } from "@opencode/plugin/gui"
import { createMemo, createSignal, onCleanup } from "solid-js"
import { ClockGaugeIcon, CLOCK_PLACEHOLDER, createChipClock, createMinuteTick, createSessionChip, drawnIconCss, InjectedMessageRow, injectedMessageRowCss, laneChipCss, mountInjectedRows } from "../../native-ui/src"
import { scheduleDeadlines, scheduleStatus } from "./chip"
import type { ScheduleItem } from "./control"
import { scheduledOf, type ScheduledRun } from "./message"
import { ScheduleControl } from "./rpc"
import { acquirePublisher, notifyFromServer } from "../../native-ui/src/notify-contract"

type Located = { readonly id: string; readonly run: ScheduledRun; readonly session: SessionRef }

const css = `
[data-scheduler-text] { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; max-height: 360px; overflow: auto; }
`

// A scheduled run is the shared injected-message row: the task's name, "scheduled run", and the prompt as the user wrote it in a
// card below. The model still gets the wrapped text; this reads the real prompt from the message's metadata.
export default Plugin.define({
  i18n: {
    en: {
      run: "scheduled run",
      cancel: "Cancel schedule",
      gone: "That schedule is no longer active.",
      "chip.one": "{{count}} schedule",
      "chip.other": "{{count}} schedules",
      once: "once",
      next: "next in {{span}}",
      "runs.one": "{{count}} run",
      "runs.other": "{{count}} runs",
      "runsOf.other": "{{count}} of {{max}} runs",
      paused: "paused",
    },
  },
  setup(ctx) {
    ctx.add(Style, drawnIconCss)
    ctx.add(Style, injectedMessageRowCss)
    ctx.add(Style, css)
    ctx.add(Style, laneChipCss)

    // What the server half has to tell the user goes through the shared hub: the `notifications` plugin when it is installed, else a toast of our own.
    onCleanup(acquirePublisher(ctx.id))
    createKeyed(
      () => ctx.client,
      (client) => void onCleanup(client.rpc(ScheduleControl).events.on("notify", (event) => void notifyFromServer(ctx, event.data), { signal: ctx.signal })),
    )

    // The tasks aimed at the session on screen, as a chip beside the host's own background-activity capsule. The pill API takes
    // catalog icons only and the catalog has no clock, so the chip names a placeholder icon that laneChipCss draws as the clock.
    const words = {
      get once() {
        return ctx.t("once")
      },
      next: (span: string) => ctx.t("next", { span }),
      runs: (count: number, max: number | undefined) => (max !== undefined ? ctx.t("runsOf.other", { count: String(count), max: String(max) }) : ctx.plural("runs", count)),
      get paused() {
        return ctx.t("paused")
      },
    }
    // The chip's clock shows the soonest of the schedules aimed at the session on screen: the last answer for that session.
    const [loaded, setLoaded] = createSignal<{ key: string; items: readonly ScheduleItem[] } | undefined>()
    const tick = createMinuteTick()
    createChipClock(tick, () => {
      const answer = loaded()
      return answer && answer.key === ctx.sessions.current()?.key ? answer : undefined
    })
    createSessionChip<ScheduleItem>(ctx, {
      id: "schedules",
      icon: CLOCK_PLACEHOLDER,
      rowIcon: (row) => <ClockGaugeIcon tick={tick} input={row()?.clock} />,
      label: (count) => ctx.plural("chip", count),
      get actionLabel() {
        return ctx.t("cancel")
      },
      get gone() {
        return ctx.t("gone")
      },
      load: async (session, signal) => {
        const items = ((await session.server.client.rpc(ScheduleControl).pending({ sessionID: session.id }, { signal, location: session.location })) as { items: ScheduleItem[] }).items
        if (!signal.aborted) setLoaded({ key: session.key, items })
        return items
      },
      rows: (items, now) => items.map((item) => ({ id: item.id, name: item.name, status: scheduleStatus(item, now, words), clock: item })),
      deadlines: scheduleDeadlines,
      act: async (session, item) =>
        ((await session.server.client.rpc(ScheduleControl).cancel({ id: item.id, sessionID: session.id }, { location: session.location })) as { cancelled: boolean }).cancelled,
    })

    const runs = createMemo(() => {
      const found = new Map<string, Located>()
      for (const session of ctx.sessions.list()) {
        for (const message of session.server.data.session.message.list(session.id)) {
          const run = scheduledOf(message as Parameters<typeof scheduledOf>[0])
          if (run) found.set(message.id, { id: message.id, run, session })
        }
      }
      return found
    })

    // Which repeating tasks are still scheduled, asked of the server half whenever the set on screen changes. The server half runs
    // once per directory, so each question goes to the location of the session the task wakes. Without the server half nothing is
    // offered to cancel; a one-off task has nothing to cancel once it has run.
    const repeating = (located: Located) => located.run.kind !== "once"
    const where = (located: Located) => `${located.session.server.id}\n${located.session.location?.directory ?? ""}`
    const handle = (located: Located) => `${where(located)}\n${located.run.id}`
    const ids = createMemo(() => [...new Set([...runs().values()].filter(repeating).map(handle))].sort().join("\u0000"))
    const active = createLatest(ids, async (key, signal) => {
      const found = new Set<string>()
      const groups = new Map<string, { located: Located; ids: string[] }>()
      for (const located of runs().values()) {
        if (!repeating(located)) continue
        const group = groups.get(where(located)) ?? { located, ids: [] }
        group.ids.push(located.run.id)
        groups.set(where(located), group)
      }
      await Promise.all(
        [...groups.values()].map(async ({ located, ids: asked }) => {
          const reply = (await located.session.server.client.rpc(ScheduleControl).active({ ids: [...new Set(asked)] }, { signal, location: located.session.location }).catch(() => ({ ids: [] }))) as { ids: string[] }
          for (const id of reply.ids) found.add(`${where(located)}\n${id}`)
        }),
      )
      return { key, found }
    })
    const [cancelled, setCancelled] = createSignal<ReadonlySet<string>>(new Set())
    const canCancel = (located: Located) => repeating(located) && active.latest?.found.has(handle(located)) === true && !cancelled().has(handle(located))

    const cancel = async (located: Located) => {
      const reply = (await located.session.server.client
        .rpc(ScheduleControl)
        .cancel({ id: located.run.id, sessionID: located.session.id }, { location: located.session.location })
        .catch(() => ({ cancelled: false }))) as { cancelled: boolean }
      if (reply.cancelled) setCancelled((current) => new Set(current).add(handle(located)))
      else ctx.toast.show({ title: ctx.t("gone") })
    }

    const opened = new Set<string>()
    const rows = mountInjectedRows({
      kind: "scheduler",
      known: runs,
      render: (located) => (
        <InjectedMessageRow
          ui={ctx.ui}
          kind="scheduler"
          icon={<ClockGaugeIcon still />}
          title={located.run.name}
          preview={ctx.t("run")}
          more
          action={canCancel(located) ? { icon: "close", label: ctx.t("cancel"), onClick: () => void cancel(located) } : undefined}
          open={opened.has(located.id)}
          onOpenChange={(next) => (next ? opened.add(located.id) : opened.delete(located.id))}
          body={() => <div data-scheduler-text>{located.run.text}</div>}
        />
      ),
    })
    createKeyed(runs, rows.schedule)
    createKeyed(() => ctx.sessions.current()?.key, rows.look, { otherwise: rows.look })
  },
})
