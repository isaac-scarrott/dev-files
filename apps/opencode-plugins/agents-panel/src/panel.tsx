import type { Context, MountedSession } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js"
import { formatElapsed, runningAgents, type AgentRow } from "./agents"
import { SessionProgressIndicator } from "./spinner"

type Ctx = Pick<Context, "ui" | "tabs" | "toast">

/** Seconds-resolution clock for the elapsed column, ticking only while `active`. */
function createClock(active: () => boolean) {
  const [now, setNow] = createSignal(Date.now())
  createEffect(() => {
    if (!active()) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })
  return now
}

/**
 * Running agents of a session as one list: the host's expanded subagent rows (the markup of the composer's
 * background-activity menu), so the app's own `menu-v2-item` CSS styles them.
 */
function createAgents(session: () => MountedSession) {
  // Shell start times are not exposed; the first sighting stands in. Cleared per session so a switch starts fresh.
  const seen = new Map<string, number>()
  const shellStarted = (id: string) => {
    const known = seen.get(id)
    if (known !== undefined) return known
    seen.set(id, Date.now())
    return Date.now()
  }
  createEffect(on(() => session().key, () => seen.clear()))

  return createMemo(() => runningAgents(session(), shellStarted), [], {
    equals: (a, b) => a.length === b.length && a.every((row, i) => row.key === b[i].key && row.label === b[i].label && row.started === b[i].started),
  })
}

export function AgentsPanel(props: { ctx: Ctx; session: () => MountedSession }) {
  const rows = createAgents(props.session)
  const now = createClock(() => rows().length > 0)

  const stop = (row: AgentRow) => {
    const session = props.session()
    const request = row.sessionID
      ? session.server.client.session.interrupt({ sessionID: row.sessionID })
      : session.server.client.shell.remove({
          id: row.key,
          location: { directory: session.server.data.shell?.get?.(row.key)?.location.directory ?? session.directory },
        })
    request.catch((error: unknown) => {
      props.ctx.toast.show({
        title: row.type === "shell" ? "Could not kill shell command" : "Could not interrupt subagent",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
      })
    })
  }

  const openRow = (row: AgentRow) => {
    if (!row.sessionID) return
    const session = props.session()
    props.ctx.tabs.open({ server: session.server.id, id: row.sessionID }, { focus: true })
  }

  return (
    <div data-agents-panel role="region" aria-label="Agents">
      <div data-agents-heading>
        <span>Agents</span>
        <span aria-hidden="true">·</span>
        <span data-agents-count>{rows().length} running</span>
      </div>
      <div data-agents-list>
        <For each={rows()}>
          {(row) => (
            <div
              data-component="menu-v2-item"
              data-agents-row
              role="button"
              tabIndex={0}
              onClick={() => openRow(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.target === event.currentTarget) openRow(row)
                if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault()
                  stop(row)
                }
              }}
            >
              <span data-slot="menu-v2-item-content">
                <Show
                  when={row.type === "shell"}
                  fallback={<SessionProgressIndicator class="shrink-0 text-v2-icon-icon-muted" />}
                >
                  <props.ctx.ui.Icon name="console" class="shrink-0 text-v2-icon-icon-muted" />
                </Show>
                <Show
                  when={row.type === "shell"}
                  fallback={
                    <span dir="auto" class="min-w-0 flex-1 truncate text-v2-text-text-base">
                      {row.label}
                    </span>
                  }
                >
                  <span dir="ltr" class="min-w-0 flex-1 truncate font-mono text-[13px] tracking-[-0.04px] text-v2-text-text-base">
                    {row.label}
                  </span>
                </Show>
                <span data-slot="agents-row-end">
                  <span data-slot="agents-row-elapsed" dir="auto" class="text-[11px] tabular-nums whitespace-nowrap text-v2-text-text-muted">
                    {formatElapsed(now() - row.started)}
                  </span>
                  <span
                    data-slot="agents-row-stop"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      stop(row)
                    }}
                  >
                    <props.ctx.ui.IconButton
                      icon="outline-xmark"
                      size="small"
                      variant="ghost-muted"
                      label={row.type === "shell" ? "Kill shell command" : "Interrupt subagent"}
                    />
                  </span>
                </span>
              </span>
            </div>
          )}
        </For>
        <Show when={rows().length === 0}>
          <div data-agents-empty>No agents running</div>
        </Show>
      </div>
    </div>
  )
}

// Bespoke: the host scopes its row/end-swap rules to the composer menu's content, so the heading and the
// elapsed/stop swap are restated here with the host's tokens. Layout, surface and width come from the side region.
export const styles = `
  [data-agents-panel] { display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding: 8px; box-sizing: border-box; }
  [data-agents-heading] {
    display: flex; gap: 4px; padding: 4px 6px 2px; font-size: 12px; font-weight: 440; line-height: 16px;
    letter-spacing: -.04px; color: var(--v2-text-text-muted); font-variant-numeric: tabular-nums;
  }
  [data-agents-empty] { padding: 8px 6px; font-size: 13px; color: var(--v2-text-text-muted); }
  [data-agents-row] { cursor: default; }
  [data-agents-row]:is(:hover, :focus-visible) { background: var(--menu-v2-hover); }
  [data-agents-row] [data-slot=menu-v2-item-content] { flex: auto; min-width: 0; }
  [data-slot=agents-row-end] { display: grid; place-items: center end; margin-inline-start: 8px; }
  [data-slot=agents-row-end] > * { grid-area: 1 / 1; }
  [data-slot=agents-row-stop] { visibility: hidden; }
  [data-agents-row]:is(:hover, :focus-visible) [data-slot=agents-row-stop] { visibility: visible; }
  [data-agents-row]:is(:hover, :focus-visible) [data-slot=agents-row-elapsed] { visibility: hidden; }
  @media (hover: none) {
    [data-slot=agents-row-stop] { visibility: visible; }
    [data-slot=agents-row-end] { display: flex; gap: 2px; }
    [data-agents-row]:is(:hover, :focus-visible) [data-slot=agents-row-elapsed] { visibility: visible; }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-slot=spinner-dots] rect { animation: none !important; opacity: var(--still); }
  }
`
