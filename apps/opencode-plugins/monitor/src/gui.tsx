import { createKeyed, createLatest, Plugin, Style, type SessionRef } from "@opencode/plugin/gui"
import { createMemo, createSignal, For } from "solid-js"
import { createSessionChip, firstLine, InjectedMessageRow, injectedMessageRowCss, laneChipCss, mountInjectedRows } from "../../native-ui/src"
import { monitorDeadlines, monitorStatus } from "./chip"
import type { MonitorItem } from "./control"
import { monitorOf, summarize, type MonitorWake } from "./parse"
import { MonitorControl } from "./rpc"

type Located = { readonly id: string; readonly wake: MonitorWake; readonly session: SessionRef }

const css = `
[data-monitor-block] { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
[data-monitor-block="event"] { max-height: 360px; overflow: auto; font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace); letter-spacing: 0; }
[data-monitor-block="notice"] { color: var(--v2-text-text-muted); }
[data-monitor-block] + [data-monitor-block] { margin-top: 8px; }
`

// A monitor's wake is the shared injected-message row: the monitor's name, what happened in one line, the real output in a card
// below. The model still gets the wrapped text; this reads it back, unescaped, from the user message.
export default Plugin.define({
  i18n: {
    en: {
      stop: "Stop monitor",
      gone: "That monitor is no longer running.",
      "chip.one": "{{count}} monitor",
      "chip.other": "{{count}} monitors",
      "events.one": "{{count}} event",
      "events.other": "{{count}} events",
      "eventsOf.other": "{{count}} of {{max}} events",
      rearm: "re-arms in {{span}}",
      expires: "expires in {{span}}",
      paused: "paused",
    },
  },
  setup(ctx) {
    ctx.add(Style, injectedMessageRowCss)
    ctx.add(Style, css)
    ctx.add(Style, laneChipCss)

    // The monitors aimed at the session on screen, as a chip beside the host's own background-activity capsule.
    const words = {
      events: (count: number, max: number | undefined) => (max !== undefined ? ctx.t("eventsOf.other", { count: String(count), max: String(max) }) : ctx.plural("events", count)),
      rearm: (span: string) => ctx.t("rearm", { span }),
      expires: (span: string) => ctx.t("expires", { span }),
      get paused() {
        return ctx.t("paused")
      },
    }
    createSessionChip<MonitorItem>(ctx, {
      id: "monitors",
      icon: "outline-console",
      rowIcon: () => <ctx.ui.Icon name="outline-console" size="small" />,
      label: (count) => ctx.plural("chip", count),
      get actionLabel() {
        return ctx.t("stop")
      },
      get gone() {
        return ctx.t("gone")
      },
      load: async (session, signal) =>
        ((await session.server.client.rpc(MonitorControl).list({ sessionID: session.id }, { signal, location: session.location })) as { items: MonitorItem[] }).items,
      rows: (items, now) => items.map((item) => ({ id: item.id, name: item.name, status: monitorStatus(item, now, words) })),
      deadlines: monitorDeadlines,
      act: async (session, item) =>
        ((await session.server.client.rpc(MonitorControl).stop({ id: item.id, sessionID: session.id }, { location: session.location })) as { stopped: boolean }).stopped,
    })

    // The same text is parsed once, not on every change of the message store.
    const parsed = new Map<string, { text: string; wake: MonitorWake | undefined }>()
    const wakes = createMemo(() => {
      const found = new Map<string, Located>()
      const seen = new Set<string>()
      for (const session of ctx.sessions.list()) {
        for (const message of session.server.data.session.message.list(session.id)) {
          const raw = message as Parameters<typeof monitorOf>[0] & { readonly id: string }
          if (raw.type !== "user" || !raw.metadata?.monitor) continue
          seen.add(raw.id)
          const text = typeof raw.text === "string" ? raw.text : ""
          let entry = parsed.get(raw.id)
          if (!entry || entry.text !== text) {
            entry = { text, wake: monitorOf(raw) }
            parsed.set(raw.id, entry)
          }
          if (entry.wake) found.set(raw.id, { id: raw.id, wake: entry.wake, session })
        }
      }
      for (const id of parsed.keys()) if (!seen.has(id)) parsed.delete(id)
      return found
    })

    // Which of those monitors still run, asked of the server half whenever the set of monitors on screen changes (a monitor
    // that ends sends its last message, so that is when this changes). The server half runs once per directory and a monitor
    // lives in the one its session runs in, so each question goes to that session's location. Without the server half nothing
    // is offered to stop.
    const where = (located: Located) => `${located.session.server.id}\n${located.session.location?.directory ?? ""}`
    const handle = (located: Located) => `${where(located)}\n${located.wake.monitorID}`
    const ids = createMemo(() => [...new Set([...wakes().values()].map(handle))].sort().join("\u0000"))
    const running = createLatest(ids, async (key, signal) => {
      const found = new Set<string>()
      const groups = new Map<string, { located: Located; ids: string[] }>()
      for (const located of wakes().values()) {
        const group = groups.get(where(located)) ?? { located, ids: [] }
        group.ids.push(located.wake.monitorID)
        groups.set(where(located), group)
      }
      await Promise.all(
        [...groups.values()].map(async ({ located, ids: asked }) => {
          const reply = (await located.session.server.client.rpc(MonitorControl).running({ ids: [...new Set(asked)] }, { signal, location: located.session.location }).catch(() => ({ ids: [] }))) as { ids: string[] }
          for (const id of reply.ids) found.add(`${where(located)}\n${id}`)
        }),
      )
      return { key, found }
    })
    const [stopped, setStopped] = createSignal<ReadonlySet<string>>(new Set())
    const isRunning = (located: Located) => running.latest?.found.has(handle(located)) === true && !stopped().has(handle(located))

    const stop = async (located: Located) => {
      const reply = (await located.session.server.client
        .rpc(MonitorControl)
        .stop({ id: located.wake.monitorID, sessionID: located.session.id }, { location: located.session.location })
        .catch(() => ({ stopped: false }))) as { stopped: boolean }
      if (reply.stopped) setStopped((current) => new Set(current).add(handle(located)))
      else ctx.toast.show({ title: ctx.t("gone") })
    }

    const opened = new Set<string>()
    const rows = mountInjectedRows({
      kind: "monitor",
      known: wakes,
      render: (located) => {
        const wake = located.wake
        const single = wake.blocks.length === 1 && wake.blocks[0]!.kind === "event" && wake.blocks[0]!.lines.filter((line) => line.trim() !== "").length <= 1
        return (
          <InjectedMessageRow
            ui={ctx.ui}
            kind="monitor"
            icon={<ctx.ui.Icon name="outline-console" size="small" />}
            title={wake.name}
            preview={firstLine(summarize(wake))}
            more={!single}
            action={isRunning(located) ? { icon: "close", label: ctx.t("stop"), onClick: () => void stop(located) } : undefined}
            open={opened.has(located.id)}
            onOpenChange={(next) => (next ? opened.add(located.id) : opened.delete(located.id))}
            body={() => (
              <For each={wake.blocks}>{(block) => <pre data-monitor-block={block.kind}>{block.lines.join("\n")}</pre>}</For>
            )}
          />
        )
      },
    })
    createKeyed(wakes, rows.schedule)
    createKeyed(() => ctx.sessions.current()?.key, rows.look, { otherwise: rows.look })
  },
})
