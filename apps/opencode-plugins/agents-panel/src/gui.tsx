import { Command, MenuItem, Panel, Plugin, Style, TitlebarItem } from "@opencode/plugin/gui"
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

    ctx.add(TitlebarItem, (): TitlebarItem | undefined => {
      const session = ctx.sessions.current()
      if (!session) return
      const running = runningAgents(session, () => 0).length
      return {
        id: TAB,
        label: running > 0 ? `Agents · ${running}` : "Agents",
        icon: "bullet-list",
        pressed: ctx.layout.state(key, session) === "visible",
        run: toggle,
      }
    })
  },
})
