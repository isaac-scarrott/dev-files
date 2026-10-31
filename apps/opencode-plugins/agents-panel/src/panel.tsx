import type { Context, MountedSession } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js"
import { formatElapsed, runningSubagents, type SubagentRow } from "./agents"
import { openInCurrentTab } from "./open-child"
import { SessionProgressIndicator } from "./spinner"

type Ctx = Pick<Context, "ui" | "toast">

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
 * Running subagents of a session as one list: the host's expanded subagent rows (the markup of the composer's
 * background-activity menu), so the app's own `menu-v2-item` CSS styles them.
 */
export function createSubagents(session: () => MountedSession) {
  // Shell start times are not exposed; the first sighting stands in. Cleared per session so a switch starts fresh.
  const seen = new Map<string, number>()
  const shellStarted = (id: string) => {
    const known = seen.get(id)
    if (known !== undefined) return known
    seen.set(id, Date.now())
    return Date.now()
  }
  createEffect(on(() => session().key, () => seen.clear()))

  return createMemo(() => runningSubagents(session(), shellStarted), [], {
    equals: (a, b) => a.length === b.length && a.every((row, i) => row.key === b[i].key && row.label === b[i].label && row.started === b[i].started),
  })
}

export function SubagentsList(props: { ctx: Ctx; session: () => MountedSession }) {
  const rows = createSubagents(props.session)
  const now = createClock(() => rows().length > 0)

  const stop = (row: SubagentRow) => {
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

  const openRow = (row: SubagentRow) => {
    if (!row.sessionID) return
    openInCurrentTab(props.session(), row.sessionID)
  }

  return (
    <div data-agents-panel role="region" aria-label="Subagents">
      <div data-agents-heading>
        <span>Subagents</span>
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
          <div data-agents-empty>No subagents running</div>
        </Show>
      </div>
    </div>
  )
}

// Bespoke: the host scopes its row/end-swap rules to the composer menu's content, so the heading and the
// elapsed/stop swap are restated here with the host's tokens. Layout, surface and width come from the side region.
export const styles = `
  [data-agents-panel] { display: flex; flex-direction: column; min-height: 0; max-height: inherit; overflow-y: auto; padding: 4px; box-sizing: border-box; }
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
  [data-agents-toggle] { position: relative; display: inline-flex; }
  [data-agents-badge] {
    position: absolute; top: -2px; right: -4px; min-width: 14px; height: 14px; padding: 0 3px; box-sizing: border-box;
    box-shadow: 0 0 0 1.5px var(--v2-background-bg-base); border-radius: 7px; background: var(--v2-icon-icon-accent);
    color: var(--v2-background-bg-base); font-size: 10px; line-height: 14px; font-weight: 530; text-align: center;
    font-variant-numeric: tabular-nums; pointer-events: none;
  }
  /* The host lays the header actions out as a flex row, and slot content renders before the host's own items. The
     context button moves ahead of the toggle so the toggle sits directly after it. */
  .session-header-actions > :has(> button[data-component="button-v2"]) { order: -1 }
  /* The popover reuses the host's menu surface; the host positions menu-v2-content itself, so it is made static here. */
  [data-agents-popover] { position: fixed; z-index: 60; width: 320px; max-width: calc(100vw - 32px); outline: none; }
  [data-agents-popover] > [data-component=menu-v2-content] {
    position: static; display: flex; flex-direction: column; min-width: 0; width: 100%; max-height: min(270px, 50vh);
    overflow-y: auto; box-sizing: border-box; padding: 0;
  }
  /* Settings > Background activity: with the mode on, the host's value is "Hidden" underneath. Show the mode's name
     instead and move the check from the host's Hidden option to ours. */
  [data-agents-on] [data-slot="select-v2-value-text"]:not([data-agents-value]) { display: none }
  [role="listbox"][data-agents-on] [data-key="off"] [data-slot="menu-v2-item-indicator"] { visibility: hidden }
`
