import type { MountedSession, Context } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js"
import { formatElapsed, runningAgents, type AgentRow } from "./agents"

type Ctx = Pick<Context, "ui" | "tabs" | "toast">

/**
 * The Agents section: a count and the host's expanded subagent rows (the markup of the composer's background-activity
 * menu), so the app's own `menu-v2-item` CSS styles them. Hidden while nothing runs.
 */
export function AgentsPanel(props: { ctx: Ctx; session: () => MountedSession }) {
  const [now, setNow] = createSignal(Date.now())
  // Shell start times are not exposed; the first sighting stands in. Cleared per session so a switch starts fresh.
  const seen = new Map<string, number>()
  const shellStarted = (id: string) => {
    const known = seen.get(id)
    if (known !== undefined) return known
    seen.set(id, Date.now())
    return Date.now()
  }
  createEffect(on(() => props.session().key, () => seen.clear()))

  const rows = createMemo(() => runningAgents(props.session(), shellStarted), [], {
    equals: (a, b) => a.length === b.length && a.every((row, i) => row.key === b[i].key && row.label === b[i].label && row.agent === b[i].agent && row.started === b[i].started),
  })

  // The clock runs only while rows exist.
  createEffect(() => {
    if (rows().length === 0) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  // Rows stay for the fade-out. A session that opens with work running starts open, with no entrance.
  const [shown, setShown] = createSignal<AgentRow[]>(rows())
  createEffect(() => {
    if (rows().length > 0) setShown(rows())
  })
  // Another session's rows must not fade out here.
  createEffect(on(() => props.session().key, () => setShown(rows()), { defer: true }))
  const open = () => rows().length > 0
  const [ready, setReady] = createSignal(false)
  const frame = requestAnimationFrame(() => setReady(true))
  onCleanup(() => cancelAnimationFrame(frame))

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
    <div data-agents-panel data-open={open() || undefined} data-ready={ready() || undefined} aria-hidden={!open() || undefined} inert={!open() || undefined}>
      <div data-agents-card data-component="menu-v2-content" role="region" aria-label="Agents">
        <div data-agents-heading>
          <span>Agents</span>
          <span aria-hidden="true">·</span>
          <span data-agents-count>{rows().length || shown().length} running</span>
        </div>
        <div data-agents-list>
          <For each={open() ? rows() : shown()}>
            {(row) => (
              <div
                data-component="menu-v2-item"
                data-agents-row
                data-stoppable
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
                    fallback={<props.ctx.ui.Loader class="shrink-0 text-v2-icon-icon-muted" />}
                  >
                    <props.ctx.ui.Icon name="console" class="shrink-0 text-v2-icon-icon-muted" />
                  </Show>
                  <Show
                    when={row.type === "shell"}
                    fallback={
                      <>
                        <span class="shrink-0 font-[530]">
                          <bdi>{row.agent || "Agent"}</bdi>
                        </span>
                        <span dir="auto" class="min-w-0 flex-1 truncate text-v2-text-text-muted">
                          {row.label}
                        </span>
                      </>
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
        </div>
      </div>
    </div>
  )
}

// Bespoke: the host scopes its row/end-swap rules to the composer menu's content, and floats no panel at the timeline's
// corner, so the corner box, the heading and the elapsed/stop swap are restated here with the host's tokens.
export const styles = `
  [data-agents-host] { position: fixed; z-index: 40; width: 320px; max-width: calc(100vw - 32px); pointer-events: none; }
  [data-agents-panel] {
    pointer-events: none; opacity: 0; visibility: hidden; transform-origin: top right;
    transform: translateY(-4px) scale(0.97);
  }
  [data-agents-panel][data-ready] {
    transition: opacity 150ms cubic-bezier(0.23, 1, 0.32, 1), transform 150ms cubic-bezier(0.23, 1, 0.32, 1), visibility 0s 150ms;
  }
  [data-agents-panel][data-open] {
    pointer-events: auto; opacity: 1; visibility: visible; transform: none;
    transition-delay: 0s;
  }
  [data-agents-card] {
    position: static; display: flex; flex-direction: column; min-width: 0; width: 100%; max-height: min(270px, 50vh);
    overflow-y: auto; box-sizing: border-box; padding: 4px; border: .5px solid var(--v2-border-border-muted);
    border-radius: 10px; background: var(--v2-background-bg-layer-01);
  }
  [data-agents-heading] {
    display: flex; gap: 4px; padding: 4px 6px 2px; font-size: 12px; font-weight: 440; line-height: 16px;
    letter-spacing: -.04px; color: var(--v2-text-text-muted); font-variant-numeric: tabular-nums;
  }
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
    [data-agents-panel] { transform: none; }
  }
`
