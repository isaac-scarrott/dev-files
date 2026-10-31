// Demo plugin for the native-ui parity run: every library component rendered next to its native sibling in one window.
import { Plugin, Slot, Style } from "@opencode/plugin/gui"
import { createSignal, onCleanup, Show } from "solid-js"
import {
  attachTabRowAction, createHost, HeaderIconButton, MenuContent, MenuItem, MenuSeparator, nativeUiCss, Popover,
  ProjectAvatar, ProgressSpinner, SessionTabList, SessionTabRow, SummaryCard, SummaryHeading, SummaryRow, SummaryRows,
  TabCloseButton, TabRowAction,
} from "../../src"

declare global {
  interface Window {
    __nativeUiDemo: {
      openMenu(at: { x: number; y: number }, options?: { focus?: boolean; autofocus?: boolean }): void
      closeMenu(): void
      openPopover(options?: { sticky?: boolean }): void
      closePopover(): void
    }
  }
}

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, nativeUiCss + `
      [data-native-ui-demo] { margin-top: 4px; }
      [data-native-ui-demo-popover] [data-component=menu-v2-content] { width: 320px; }
    `)
    const host = createHost(ctx.ui)

    // --- rows under the native list ---------------------------------------------------------------------------------
    const [menu, setMenu] = createSignal<{ x: number; y: number; focus: boolean; autofocus: boolean } | undefined>()
    const openMenu = (at: { x: number; y: number }, options: { focus?: boolean; autofocus?: boolean } = {}) =>
      setMenu({ x: at.x, y: at.y, focus: options.focus ?? true, autofocus: options.autofocus ?? false })
    const closeMenu = () => setMenu(undefined)

    const Rows = () => (
      <>
        <SessionTabList label="Demo rows">
          <SessionTabRow
            ui={ctx.ui}
            title="Seeded long session"
            project="project · master"
            href="#demo-live"
            onOpen={() => ctx.toast.show({ title: "row opened" })}
            onContextMenu={(event) => { event.preventDefault(); openMenu({ x: event.clientX, y: event.clientY }, { focus: true }) }}
            action={<TabCloseButton ui={ctx.ui} label="Close tab" onClick={() => ctx.toast.show({ title: "close" })} />}
            ref={(el) => el.setAttribute("data-demo-row", "live-twin")}
          />
          <SessionTabRow
            ui={ctx.ui}
            title="Archived session"
            project="project · master"
            detail="archived"
            href="#demo-archived"
            onOpen={() => ctx.toast.show({ title: "restore" })}
            onContextMenu={(event) => { event.preventDefault(); openMenu({ x: event.clientX, y: event.clientY }, { focus: true }) }}
            action={<TabRowAction ui={ctx.ui} replace icon="xmark-small" label="Delete" onClick={() => ctx.toast.show({ title: "delete" })} />}
            ref={(el) => el.setAttribute("data-demo-row", "archived")}
          />
          <SessionTabRow
            ui={ctx.ui}
            title="Snoozed session"
            project="project · master"
            detail="09:00"
            status="unread"
            action={<TabRowAction ui={ctx.ui} icon="lock" label="Wake" onClick={() => ctx.toast.show({ title: "wake" })} />}
            ref={(el) => el.setAttribute("data-demo-row", "snoozed")}
          />
        </SessionTabList>
        <Show when={menu()}>
          {(m) => (
            <Popover anchor={{ x: m().x, y: m().y }} label="Row actions" placement="bottom-start" surface="none" focus={m().focus ? "card" : "none"} onClose={closeMenu} ref={(el) => el.setAttribute("data-demo-menu", "")}>
              {/* snooze-archive adds its Snooze ▸ and Archive items to this menu as it does to the host's. */}
              <MenuContent focus={m().focus} autofocus={m().autofocus} onClose={closeMenu}>
                <MenuItem onSelect={closeMenu}>Rename</MenuItem>
                <MenuItem onSelect={closeMenu}>Close tab</MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={closeMenu} variant="critical">Delete…</MenuItem>
              </MenuContent>
            </Popover>
          )}
        </Show>
      </>
    )

    let rowsDispose: (() => void) | undefined
    let rowsEl: HTMLElement | undefined
    const actions = new Map<HTMLElement, () => void>()
    const sync = () => {
      const scroll = document.querySelector<HTMLElement>("[data-slot=vertical-tabs-scroll]")
      if (scroll && !rowsEl?.isConnected) {
        rowsDispose?.()
        rowsEl = document.createElement("div")
        rowsEl.setAttribute("data-native-ui-demo", "")
        scroll.append(rowsEl)
        rowsDispose = host.mount(rowsEl, Rows)
      }
      // Row actions on the live tabs: sibling on the first seeded session (the parity run's native sibling, whose X
      // must stay visible), replace on every other.
      const tabs = [...document.querySelectorAll<HTMLElement>("[data-tab-key]:not([data-tab-key^=draft]) [data-titlebar-tab]")]
      tabs.forEach((tab) => {
        if (actions.has(tab)) return
        actions.set(tab, attachTabRowAction(tab, host, tab.closest("[data-tab-key]")?.getAttribute("data-tab-key")?.includes("ses_19343c361000yjXl0nHdC0JKeo")
          ? { icon: "lock", label: "Snooze", onClick: () => ctx.toast.show({ title: "snooze" }) }
          : { icon: "xmark-small", label: "Archive", replace: true, onClick: () => ctx.toast.show({ title: "archive" }) }))
      })
      for (const [tab, dispose] of actions) if (!tab.isConnected) { dispose(); actions.delete(tab) }
    }
    const observer = new MutationObserver(() => sync())
    observer.observe(document.documentElement, { subtree: true, childList: true })
    sync()

    // --- header button + popover -----------------------------------------------------------------------------------
    const [popover, setPopover] = createSignal<{ sticky: boolean } | undefined>()
    let trigger: HTMLButtonElement | undefined
    ctx.add(Slot, {
      at: "session.header",
      render: () => (
        <>
          <HeaderIconButton
            ui={ctx.ui}
            icon="console"
            label="Native UI demo"
            expanded={!!popover()}
            controls="native-ui-demo-popover"
            onClick={() => setPopover(popover() ? undefined : { sticky: false })}
            ref={(el) => { trigger = el; el.setAttribute("data-demo-trigger", "") }}
          />
          {/* The host keeps a detached header render alive across session changes; anchor to the trigger that is in the document now. */}
          <Show when={popover() && document.querySelector<HTMLButtonElement>("[data-demo-trigger]")}>
            {(live) => (
            <Popover
              anchor={live()}
              end={live().closest<HTMLElement>(".session-header-actions") ?? undefined}
              id="native-ui-demo-popover"
              label="Native UI demo"
              onClose={() => { if (!popover()?.sticky) setPopover(undefined) }}
              ref={(el) => el.setAttribute("data-native-ui-demo-popover", "")}
            >
              <SummaryCard section="demo">
                <SummaryHeading>Subagents</SummaryHeading>
                <SummaryRows>
                  <SummaryRow ui={ctx.ui} leading={<ProgressSpinner class="shrink-0 text-v2-icon-icon-muted" />} label="Running subagent" expanded={false} controls="demo-a" />
                  <SummaryRow ui={ctx.ui} leading={<ProjectAvatar fallback="project" variant="blue" />} label="project" count={3} expanded={false} controls="demo-b" />
                </SummaryRows>
              </SummaryCard>
            </Popover>
            )}
          </Show>
        </>
      ),
    })

    window.__nativeUiDemo = {
      openMenu, closeMenu,
      openPopover: (options = {}) => setPopover({ sticky: options.sticky ?? false }),
      closePopover: () => setPopover(undefined),
    }
    onCleanup(() => {
      observer.disconnect()
      rowsDispose?.()
      rowsEl?.remove()
      actions.forEach((dispose) => dispose())
      actions.clear()
    })
  },
})
