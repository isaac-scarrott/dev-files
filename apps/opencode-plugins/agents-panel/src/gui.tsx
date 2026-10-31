import { Command, MenuItem, Panel, Plugin, Slot, Style } from "@opencode/plugin/gui"
import { Show } from "solid-js"
import { runningAgents } from "./agents"
import { AgentsPanel, styles } from "./panel"

const TAB = "agents"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, styles)
    const key = `${ctx.id}:${TAB}`

    // The side region is laid out by the host, so the timeline shrinks and stays centred in the space left.
    ctx.add(Panel, {
      id: TAB,
      region: "side",
      list: ({ open }) => (open.includes(TAB) ? [{ id: TAB, title: "Agents", closable: "hover" as const }] : []),
      render: (props) => <AgentsPanel ctx={ctx} session={() => props.session} />,
    })

    const toggle = () => {
      const session = ctx.sessions.current()
      if (session) ctx.layout.toggle(key, session)
    }

    ctx.add(Command, { id: "toggle", title: "Toggle agents panel", section: "session", run: toggle })

    ctx.add(MenuItem, (): MenuItem | undefined => {
      const session = ctx.sessions.current()
      return {
        menu: "session.panel",
        id: TAB,
        title: "Agents",
        icon: "bullet-list",
        opened: !!session && ctx.layout.state(key, session) !== "closed",
        run: toggle,
      }
    })

    // The host's own toggles are icon-button-v2 in the session header, which a TitlebarItem (an accent pill) cannot
    // match, so the toggle is the host IconButton in the header slot, pressed while the panel shows.
    ctx.add(Slot, {
      at: "session.header",
      render: (input) => {
        const count = () => (input.active ? runningAgents(input.session, () => 0).length : 0)
        const label = () => (count() > 0 ? `Agents · ${count()}` : "Agents")
        return (
          <ctx.ui.Tooltip value={label()}>
            <span data-agents-toggle>
              <ctx.ui.IconButton
                icon="bullet-list"
                size="large"
                label={label()}
                pressed={ctx.layout.state(key, input.session) === "visible"}
                onClick={() => ctx.layout.toggle(key, input.session)}
              />
              <Show when={count() > 0}>
                <span data-agents-badge>{count()}</span>
              </Show>
            </span>
          </ctx.ui.Tooltip>
        )
      },
    })
  },
})
