import { Command, createKeyed, Plugin, Store, Style } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { onCleanup } from "solid-js"
import { createRowFilter } from "./dom"
import { bindWheel } from "./wheel"
import { createSpaceMenus } from "./menus"
import { ACCENTS, addSpace, clampActive, defaultEmoji, deleteSpace, hiddenTabs, initialState, moveSession, newSpaceId, reconcile, rememberLastSession, renameSpace, restoreTarget, selectSpace, selectSpaceId, settle, spaceOf, type State, type TabLike } from "./model"
import { accentColor, css, swipeCss } from "./style"
import { createStrip } from "./strip"

const SpaceSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  emoji: Schema.String,
  accent: Schema.optional(Schema.String),
  lastSession: Schema.optional(Schema.Struct({ server: Schema.String, id: Schema.String })),
})
const AssignmentSchema = Schema.Struct({ server: Schema.String, id: Schema.String, space: Schema.String, at: Schema.Number })
const DraftSchema = Schema.Struct({ tab: Schema.String, space: Schema.String })
const StateSchema = Schema.Struct({
  version: Schema.Number,
  active: Schema.Number,
  spaces: Schema.Array(SpaceSchema),
  assigned: Schema.Array(AssignmentSchema),
  drafts: Schema.Array(DraftSchema),
})

const definition = Plugin.define({
  stores: { spaces: Store.global(StateSchema, initialState()) },
})

export default Plugin.define({
  ...definition,
  setup(ctx) {
    ctx.add(Style, css + swipeCss)

    const state = (): State => settle(ctx.stores.spaces.value as State)
    const update = (change: (current: State) => State) => {
      ctx.stores.spaces.update((draft) => {
        const next = change(settle(draft as State))
        draft.version = next.version
        draft.active = next.active
        draft.spaces = next.spaces as never
        draft.assigned = next.assigned as never
        draft.drafts = next.drafts as never
      })
    }

    const strip = createStrip(
      document,
      {
        select(index) {
          update((current) => ({
            ...current,
            active: Math.max(0, Math.min(index, current.spaces.length - 1)),
          }))
        },
        create() {
          createSpace()
        },
      },
      (space) => accentColor(space.accent),
    )

    // Rows are hidden by attribute; the host keeps its own list, so navigation is guarded in milestone 5.
    const filter = createRowFilter(document, () => new Set(hiddenTabs(state(), tabs())))

    // Two-finger swipes over the sidebar change space; past the last one, the strip's plus fills and creates a space.
    const wheel = bindWheel(document, {
      ready: () => state().spaces.length > 1,
      atEnd: () => state().active >= state().spaces.length - 1,
      switchTo(direction) {
        const current = state()
        const index = current.active + direction
        if (index < 0 || index >= current.spaces.length) return
        update((now) => selectSpace(now, index))
        const side = sidebar()
        side?.setAttribute("data-spaces-switch", direction === 1 ? "next" : "previous")
        setTimeout(() => side?.removeAttribute("data-spaces-switch"), 200)
      },
      create: () => createSpace(),
      reveal: (on) => document.querySelector("[data-spaces-strip]")?.toggleAttribute("data-spaces-reveal", on),
      progress: () => undefined,
      animate: () => undefined,
    })
    onCleanup(() => wheel.stop())

    // Which tabs were already open when this plugin started: they belong to the first space, not to whatever is active.
    const startup = new Set<string>()
    const known = new Set<string>()
    let seeded = false
    const tabs = (): TabLike[] =>
      ctx.tabs.list().map((tab) => ({
        key: tab.key,
        ...(tab.active ? { active: true } : {}),
        ...(tab.session ? { session: { server: tab.session.server.id, id: tab.session.id } } : {}),
      }))

    /** Gives new tabs a space, then shows the active space's rows. One place, so both stay in step. */
    const sync = () => {
      const list = tabs()
      if (!seeded) {
        for (const tab of list) startup.add(tab.key)
        seeded = true
      }
      const current = state()
      const next = reconcile(current, list, startup, Date.now(), known)
      if (next !== current) update(() => next)
      filter.poke()
    }

    const sidebar = () => document.querySelector<HTMLElement>('[data-slot="vertical-tabs"]')

    const createSpace = () => {
      const current = state()
      const id = newSpaceId(current.spaces)
      const emoji = defaultEmoji(current.spaces)
      update((now) => addSpace(now, { id, name: `Space ${now.spaces.length + 1}`, emoji }))
    }

    // The strip lives inside the sidebar, which the host mounts late and may replace on a layout change. Try now, then keep
    // trying until it lands; afterwards re-place only when the host detaches our row.
    let timer: ReturnType<typeof setInterval> | undefined
    let observer: MutationObserver | undefined
    const landed = () => {
      if (timer !== undefined) {
        clearInterval(timer)
        timer = undefined
      }
      const parent = strip.place() ? document.querySelector('[data-slot="vertical-tabs-mount"]') : undefined
      const side = sidebar()
      if (side) filter.start(side)
      sync()
      observer?.disconnect()
      observer = undefined
      if (!parent) return
      observer = new MutationObserver(() => {
        if (!document.querySelector(`[data-spaces-strip]`)) ensure()
      })
      observer.observe(parent, { childList: true })
      strip.place()
    }
    const ensure = () => {
      if (strip.place()) landed()
      else if (timer === undefined) timer = setInterval(() => { if (strip.place()) landed() }, 400)
    }
    ensure()
    onCleanup(() => {
      if (timer !== undefined) clearInterval(timer)
      observer?.disconnect()
      filter.stop()
      strip.dispose()
    })

    const draw = () => {
      const current = state()
      strip.update(
        current.spaces.map((space) => ({ id: space.id, name: space.name, emoji: space.emoji, ...(space.accent ? { accent: space.accent } : {}) })),
        current.active,
      )
    }
    // The store's value keeps its identity as it is written, so a key over the fields is what tells the strip to redraw.
    createKeyed(
      () => {
        const current = ctx.stores.spaces.value as State
        const spaces = Array.isArray(current.spaces) ? current.spaces : []
        return `${spaces.map((space) => `${space?.id}:${space?.name}:${space?.emoji}:${space?.accent ?? ""}`).join("|")}#${current.active}`
      },
      () => draw(),
    )
    draw()

    // Tabs, the active space and the assignments all feed one pass: reconcile (assign or migrate), then hide.
    createKeyed(
      () => {
        const current = ctx.stores.spaces.value as State
        const spaces = Array.isArray(current.spaces) ? current.spaces : []
        const assigned = Array.isArray(current.assigned) ? current.assigned : []
        const drafts = Array.isArray(current.drafts) ? current.drafts : []
        const list = ctx.tabs.list()
        return [
          spaces.map((space) => space?.id).join("|"),
          current.active,
          assigned.map((item) => `${item?.server}/${item?.id}=${item?.space}`).join("|"),
          drafts.map((item) => `${item?.tab}=${item?.space}`).join("|"),
          list.map((tab) => `${tab.key}:${tab.active ? "a" : ""}:${tab.session ? `${tab.session.server.id}/${tab.session.id}` : ""}`).join("|"),
        ].join("#")
      },
      () => sync(),
    )

    // A switch lands on the space's last session; a space that has none stays empty, as chosen.
    createKeyed(
      () => {
        const current = ctx.stores.spaces.value as State
        const spaces = Array.isArray(current.spaces) ? current.spaces : []
        return `${spaces[clampActive({ active: current.active, spaces })]?.id ?? ""}`
      },
      (id) => {
        if (!id) return
        const target = restoreTarget(state(), id)
        if (!target) return
        const tab = ctx.tabs.list().find((item) => item.session?.server.id === target.server && item.session?.id === target.id)
        if (tab && !tab.active) ctx.tabs.focus(tab.key)
      },
    )

    // The active space remembers the session on screen, so a switch away and back returns to it.
    createKeyed(
      () => {
        const routed = ctx.sessions.current()
        return routed ? `${routed.server.id}/${routed.id}` : ""
      },
      () => {
        const routed = ctx.sessions.current()
        if (!routed) return
        const current = state()
        const space = current.spaces[clampActive(current)]!.id
        const assigned = current.assigned.find((item) => item.server === routed.server.id && item.id === routed.id)
        if (!assigned || assigned.space !== space) return
        const last = current.spaces.find((item) => item.id === space)?.lastSession
        if (last?.server === routed.server.id && last?.id === routed.id) return
        update((now) => rememberLastSession(now, { server: routed.server.id, id: routed.id, space }))
      },
    )
    sync()

    // The session a command acts on: what is routed, else the first visible row's session.
    const targetSession = () => {
      const routed = ctx.sessions.current()
      if (routed) return { server: routed.server.id, id: routed.id }
      const tab = ctx.tabs.list().find((item) => item.session)
      return tab?.session ? { server: tab.session.server.id, id: tab.session.id } : undefined
    }
    /** Rename, emoji, colour: one dialog-free flow, the palette asks only for what it needs. */
    const editSpace = async (action: "rename" | "emoji" | "accent") => {
      const current = state()
      const picked = current.spaces.length === 1 ? current.spaces[0]!.id : await ctx.dialogs.select({
        title: action === "rename" ? "Rename which space" : action === "emoji" ? "Change which space's emoji" : "Colour which space",
        options: current.spaces.map((space) => ({ title: `${space.emoji}  ${space.name}`, value: space.id })),
      })
      if (picked === undefined) return
      const space = current.spaces.find((item) => item.id === picked)
      if (!space) return
      if (action === "rename") {
        const name = await ctx.dialogs.prompt({ title: "Name this space", value: space.name })
        if (name === undefined || name.trim() === "") return
        update((now) => renameSpace(now, picked, { name: name.trim() }))
        return
      }
      if (action === "emoji") {
        const emoji = await ctx.dialogs.prompt({ title: "Emoji for this space", value: space.emoji })
        if (emoji === undefined || emoji.trim() === "") return
        update((now) => renameSpace(now, picked, { emoji: [...emoji.trim()][0] ?? space.emoji }))
        return
      }
      const accent = await ctx.dialogs.select({
        title: "Colour for this space",
        options: [
          { title: "No colour", value: "muted", description: "The strip's neutral look" },
          ...ACCENTS.filter((item) => item !== "muted").map((item) => ({ title: item[0]!.toUpperCase() + item.slice(1), value: item })),
        ],
      })
      if (accent === undefined) return
      update((now) => renameSpace(now, picked, { accent: accent === "muted" ? undefined : accent }))
    }

    const moveToSpace = async (session: { server: string; id: string }) => {
      const current = state()
      if (current.spaces.length < 2) return
      const owner = spaceOf(current, { session })
      const picked = await ctx.dialogs.select({
        title: "Move this session to",
        options: current.spaces.map((space) => ({
          title: `${space.emoji}  ${space.name}`,
          description: space.id === owner ? "It is here" : undefined,
          value: space.id,
        })),
      })
      if (picked === undefined || picked === owner) return
      update((now) => moveSession(now, session, picked, Date.now()))
      filter.poke()
    }

    // "Move to space ▸" in the host's own tab, Home-row and header menus. Only with two or more spaces, and only for a
    // session this plugin knows.
    const menus = createSpaceMenus(document, (session) => {
      const current = state()
      if (current.spaces.length < 2) return []
      const owner = spaceOf(current, { session })
      return [{
        label: "Move to space",
        submenu: () => current.spaces.map((space) => ({
          label: `${space.emoji}  ${space.name}`,
          ...(space.id === owner ? { disabled: true } : {}),
          run: () => {
            update((now) => moveSession(now, session, space.id, Date.now()))
            filter.poke()
          },
        })),
        run: () => undefined,
      }]
    }, {
      tab: (key) => {
        const tab = ctx.tabs.list().find((item) => item.key === key)
        return tab?.session ? { server: tab.session.server.id, id: tab.session.id } : undefined
      },
      row: (id) => {
        const servers = ctx.servers.list()
        for (const server of servers) {
          const ref = ctx.servers.get(server)
          if (ref?.data.session.get(id)) return { server, id }
        }
        return undefined
      },
      current: () => targetSession(),
    })
    onCleanup(() => menus.stop())
    const stopMenus = menus.start((inspect) => {
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue
            const el = node as HTMLElement
            if (el.matches('[role="menu"][data-component="menu-v2-content"]')) inspect(el)
            else menus.scan(el)
          }
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      return () => observer.disconnect()
    })
    onCleanup(stopMenus)

    ctx.add(Command, () => ({
      id: "spaces.new",
      title: "New space…",
      section: "general" as const,
      keywords: "spaces group sessions arc",
      async run() {
        const current = state()
        const name = await ctx.dialogs.prompt({ title: "Name this space", placeholder: `Space ${current.spaces.length + 1}` })
        if (name === undefined) return
        const id = newSpaceId(current.spaces)
        update((now) => addSpace(now, { id, name: name.trim() === "" ? `Space ${now.spaces.length + 1}` : name.trim(), emoji: defaultEmoji(now.spaces) }))
      },
    }))

    ctx.add(Command, () => {
      const current = state()
      if (current.spaces.length < 2) return undefined
      return {
        id: "spaces.switch",
        title: "Switch space…",
        section: "general" as const,
        keywords: "spaces",
        async run() {
          const now = state()
          const picked = await ctx.dialogs.select({
            title: "Switch space",
            options: now.spaces.map((space) => ({ title: `${space.emoji}  ${space.name}`, value: space.id })),
          })
          if (picked === undefined) return
          update((current) => selectSpaceId(current, picked))
        },
      }
    })

    for (const [id, title, action] of [
      ["spaces.rename", "Rename space…", "rename"],
      ["spaces.emoji", "Change space emoji…", "emoji"],
      ["spaces.accent", "Change space colour…", "accent"],
    ] as const) {
      ctx.add(Command, () => ({ id, title, section: "general" as const, keywords: "spaces", run: () => editSpace(action) }))
    }

    ctx.add(Command, () => {
      const current = state()
      if (current.spaces.length < 2) return undefined
      return {
        id: "spaces.move",
        title: "Move session to space…",
        section: "general" as const,
        keywords: "spaces move",
        async run() {
          const session = targetSession()
          if (!session) return
          await moveToSpace(session)
        },
      }
    })

    ctx.add(Command, () => {
      const current = state()
      if (current.spaces.length < 2) return undefined
      return {
        id: "spaces.delete",
        title: "Delete space…",
        section: "general" as const,
        keywords: "spaces delete",
        async run() {
          const now = state()
          const picked = await ctx.dialogs.select({ title: "Delete which space", options: now.spaces.slice(1).map((space) => ({ title: `${space.emoji}  ${space.name}`, value: space.id })) })
          if (picked === undefined) return
          const space = now.spaces.find((item) => item.id === picked)
          if (!space) return
          const count = now.assigned.filter((item) => item.space === picked).length
          const ok = await ctx.dialogs.confirm({
            title: `Delete “${space.name}”?`,
            description: count === 0 ? "Its sessions move to the first space. You can undo this by moving them back." : `${count} session${count === 1 ? "" : "s"} move${count === 1 ? "s" : ""} to the first space. You can undo this by moving them back.`,
            confirm: "Delete space",
          })
          if (!ok) return
          update((current) => deleteSpace(current, picked))
          filter.poke()
        },
      }
    })
  },
})
