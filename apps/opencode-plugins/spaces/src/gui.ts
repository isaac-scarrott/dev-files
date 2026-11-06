import { Command, createKeyed, Plugin, Store, Style } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { onCleanup } from "solid-js"
import { createRowFilter } from "./dom"
import { createKeyGuard } from "./keys"
import { createSpaceMenus } from "./menus"
import {
  ACCENTS, addSpace, clampActive, defaultEmoji, deleteSpace, hiddenTabs, initialState, moveSession, newSpaceId,
  reconcile, rememberTab, renameSpace, reorderSpace, selectSpace, selectSpaceId, settle, spaceOf,
  type State, type TabLike,
} from "./model"
import { accentColor, css, swipeCss } from "./style"
import { createStrip } from "./strip"
import { bindWheel } from "./wheel"

const SpaceSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  emoji: Schema.String,
  accent: Schema.optional(Schema.String),
  lastSession: Schema.optional(Schema.Struct({ server: Schema.String, id: Schema.String })),
  lastTab: Schema.optional(Schema.String),
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
    const activeId = () => state().spaces[clampActive(state())]!.id
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

    const tabs = (): TabLike[] =>
      ctx.tabs.list().map((tab) => ({
        key: tab.key,
        ...(tab.active ? { active: true } : {}),
        ...(tab.session ? { session: { server: tab.session.server.id, id: tab.session.id } } : {}),
      }))
    const routed = () => ctx.tabs.list().find((tab) => tab.active)
    const sessionOf = (tab: ReturnType<typeof routed>) => (tab?.session ? { server: tab.session.server.id, id: tab.session.id } : undefined)
    const sessionExists = (server: string, id: string) => !!ctx.servers.get(server)?.data.session.get(id)
    const belongs = (current: State, tab: TabLike) =>
      current.drafts.some((draft) => draft.tab === tab.key) ||
      (tab.session ? current.assigned.some((item) => item.server === tab.session!.server && item.id === tab.session!.id) : false)

    /** Records the tab on screen as its space's last one. */
    const rememberCurrent = () => {
      const tab = routed()
      if (!tab) return
      const current = state()
      const session = sessionOf(tab)
      const owner = spaceOf(current, { key: tab.key, ...(session ? { session } : {}) })
      const space = current.spaces.find((item) => item.id === owner)
      if (space?.lastTab === tab.key) return
      update((now) => rememberTab(now, owner, tab.key, session))
    }

    /** Arrives in a space: the tab it had on screen, else its last session, else the first session it owns. */
    let restoring: string | undefined
    const arrive = (id: string) => {
      const current = state()
      const space = current.spaces.find((item) => item.id === id)
      if (!space) return
      const list = ctx.tabs.list()
      const owned = (tab: (typeof list)[number]) => {
        const session = sessionOf(tab)
        if (session && !sessionExists(session.server, session.id)) return false
        return spaceOf(current, { key: tab.key, ...(session ? { session } : {}) }) === id
      }
      const hold = (key: string) => {
        restoring = key
        setTimeout(() => { if (restoring === key) restoring = undefined }, 1500)
      }
      const byTab = space.lastTab ? list.find((tab) => tab.key === space.lastTab && owned(tab)) : undefined
      if (byTab?.active) return
      if (byTab) {
        hold(byTab.key)
        return ctx.tabs.focus(byTab.key)
      }
      const last = space.lastSession
      const bySession = last ? list.find((tab) => tab.session?.server.id === last.server && tab.session?.id === last.id && owned(tab)) : undefined
      if (bySession?.active) return
      if (bySession) {
        hold(bySession.key)
        return ctx.tabs.focus(bySession.key)
      }
      if (last && sessionExists(last.server, last.id) && spaceOf(current, { session: last }) === id) {
        hold(space.lastTab ?? "")
        void ctx.tabs.open({ server: last.server, id: last.id }, { focus: true })
        return
      }
      const first = list.find((tab) => owned(tab))
      if (first && !first.active) {
        hold(first.key)
        ctx.tabs.focus(first.key)
      }
    }

    /** The one way to change space: remember where you were, move, then land in the new space's tab. */
    const switchTo = (index: number) => {
      const current = state()
      const target = Math.max(0, Math.min(index, current.spaces.length - 1))
      if (target === clampActive(current)) return
      rememberCurrent()
      update((now) => selectSpace(now, target))
      const id = state().spaces[target]?.id
      if (id) arrive(id)
    }
    const switchToId = (id: string) => {
      const index = state().spaces.findIndex((space) => space.id === id)
      if (index >= 0) switchTo(index)
    }

    // ---- sidebar: filter, strip, keys, swipe -------------------------------------------------------------
    const filter = createRowFilter(document, () => new Set(hiddenTabs(state(), tabs())))
    const sidebar = () => document.querySelector<HTMLElement>('[data-slot="vertical-tabs"]')

    const strip = createStrip(
      document,
      {
        select: (index) => switchTo(index),
        reorder: (from, to) => update((current) => reorderSpace(current, from, to)),
      },
      (space) => accentColor(space.accent),
    )

    const createSpace = () => {
      rememberCurrent()
      const current = state()
      update((now) => addSpace(now, { id: newSpaceId(current.spaces), name: `Space ${now.spaces.length + 1}`, emoji: defaultEmoji(now.spaces) }))
    }

    const guard = createKeyGuard({
      visible: () => tabs().filter((tab) => spaceOf(state(), tab) === activeId()).map((tab) => tab.key),
      focused: () => routed()?.key,
      focus: (key) => ctx.tabs.focus(key),
      handled: () => undefined,
      lost: () => undefined,
    })
    let detachGuard: () => void = () => undefined
    const applyGuard = () => {
      detachGuard()
      detachGuard = state().spaces.length > 1 ? guard.attach(document) : () => undefined
    }
    onCleanup(() => detachGuard())
    createKeyed(() => state().spaces.length > 1, () => applyGuard())

    let lastPull = 0
    const wheel = bindWheel(document, {
      ready: () => state().spaces.length > 1,
      atEnd: () => state().active >= state().spaces.length - 1,
      switchTo: (direction) => {
        switchTo(state().active + direction)
        const side = sidebar()
        side?.setAttribute("data-spaces-switch", direction === 1 ? "next" : "previous")
        setTimeout(() => side?.removeAttribute("data-spaces-switch"), 200)
      },
      create: () => createSpace(),
      pull: (value) => {
        strip.pull(value)
        const crossed = (lastPull < 0.5) !== (value < 0.5)
        lastPull = value
        if (!crossed) return
        const element = document.querySelector("[data-spaces-strip]")
        if (!element) return
        element.setAttribute("data-spaces-tick", "")
        setTimeout(() => element.removeAttribute("data-spaces-tick"), 180)
      },
    })
    onCleanup(() => wheel.stop())

    // ---- tabs and spaces ---------------------------------------------------------------------------------
    const startup = new Set<string>()
    const known = new Set<string>()
    let seeded = false

    // A deleted session must not linger as a tab pointing at nothing, nor stay remembered.
    const watched = new Set<string>()
    const watchServers = () => {
      for (const serverId of ctx.servers.list()) {
        if (watched.has(serverId)) continue
        const ref = ctx.servers.get(serverId)
        if (!ref) continue
        watched.add(serverId)
        ref.data.on("session.deleted", (event) => {
          const id = event.data.sessionID
          for (const tab of ctx.tabs.list()) {
            if (tab.session?.server.id === serverId && tab.session.id === id) ctx.tabs.close(tab.key)
          }
          update((now) => ({
            ...now,
            assigned: now.assigned.filter((item) => !(item.server === serverId && item.id === id)),
            spaces: now.spaces.map((space) => {
              const last = space.lastSession
              return last && last.server === serverId && last.id === id ? { ...space, lastSession: undefined, lastTab: undefined } : space
            }),
          }))
        })
      }
    }

    const sync = () => {
      watchServers()
      const list = tabs()
      if (!seeded) {
        for (const tab of list) startup.add(tab.key)
        seeded = true
      }
      const current = state()
      let next = reconcile(current, list, startup, Date.now(), known)
      const activeTab = list.find((tab) => tab.active)
      if (activeTab) {
        const owner = spaceOf(next, activeTab)
        const space = next.spaces.find((item) => item.id === owner)
        if (space && space.lastTab !== activeTab.key) next = rememberTab(next, owner, activeTab.key, activeTab.session)
      }
      if (next !== current) update(() => next)
      filter.poke()
    }

    // The strip lives inside the sidebar, which the host mounts late and may replace; nothing is hidden until it is there
    // and has a real box (a layout we do not understand shows everything and says so once).
    let timer: ReturnType<typeof setInterval> | undefined
    let observer: MutationObserver | undefined
    let warned = false
    let attempts = 0
    let filtering = false
    const standDown = () => {
      if (!filtering && warned) return
      filtering = false
      filter.stop()
      if (warned) return
      warned = true
      ctx.toast.show({ title: "Spaces is off", description: "The sidebar layout changed, so sessions are not being filtered. Spaces will work again after a plugin update.", variant: "default" })
    }
    const landed = () => {
      if (timer !== undefined) {
        clearInterval(timer)
        timer = undefined
      }
      const parent = strip.place() ? document.querySelector('[data-slot="vertical-tabs-mount"]') : undefined
      const side = sidebar()
      const placed = document.querySelector("[data-spaces-strip]")?.getBoundingClientRect()
      if (!side || !placed || placed.width === 0 || placed.height === 0) return standDown()
      filtering = true
      filter.start(side)
      sync()
      observer?.disconnect()
      observer = undefined
      if (!parent) return
      observer = new MutationObserver(() => {
        if (!document.querySelector("[data-spaces-strip]")) ensure()
      })
      observer.observe(parent, { childList: true })
      strip.place()
    }
    const ensure = () => {
      if (strip.place()) return landed()
      if (timer !== undefined) return
      timer = setInterval(() => {
        attempts += 1
        if (strip.place()) return landed()
        if (attempts === 20) standDown()
      }, 400)
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
    createKeyed(
      () => {
        const current = ctx.stores.spaces.value as State
        const spaces = Array.isArray(current.spaces) ? current.spaces : []
        return `${spaces.map((space) => `${space?.id}:${space?.name}:${space?.emoji}:${space?.accent ?? ""}`).join("|")}#${current.active}`
      },
      () => draw(),
    )
    draw()

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

    // The session on screen decides the space: a notification, Home, Search or the palette taking you to a session also
    // takes you to its space. A focus this plugin performed is exempt, so arriving does not bounce.
    let lastRouted: string | undefined
    createKeyed(
      () => routed()?.key ?? "",
      (key) => {
        const tab = routed()
        if (!tab || key === "") return
        if (key === lastRouted) return
        lastRouted = key
        if (key === restoring) {
          restoring = undefined
          return
        }
        const current = state()
        if (!belongs(current, { key: tab.key, ...(sessionOf(tab) ? { session: sessionOf(tab)! } : {}) })) return
        const owner = spaceOf(current, { key: tab.key, ...(sessionOf(tab) ? { session: sessionOf(tab)! } : {}) })
        if (owner !== current.spaces[clampActive(current)]!.id) switchToId(owner)
      },
    )

    // Same rule when the session did not change: clicking into the session area re-aligns a sidebar left on an empty
    // space. Clicks in the sidebar are excluded, so choosing a space there is not undone.
    const realign = () => {
      const tab = routed()
      if (!tab) return
      const current = state()
      const session = sessionOf(tab)
      if (!belongs(current, { key: tab.key, ...(session ? { session } : {}) })) return
      const owner = spaceOf(current, { key: tab.key, ...(session ? { session } : {}) })
      if (owner !== current.spaces[clampActive(current)]!.id) switchToId(owner)
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('[data-slot="vertical-tabs-sidebar"], [data-spaces-strip]')) return
      realign()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    onCleanup(() => document.removeEventListener("pointerdown", onPointerDown, true))

    // ---- commands and menus ------------------------------------------------------------------------------
    const targetSession = () => {
      const current = routed()?.session
      if (current) return { server: current.server.id, id: current.id }
      const tab = ctx.tabs.list().find((item) => item.session)
      return tab?.session ? { server: tab.session.server.id, id: tab.session.id } : undefined
    }

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
        for (const server of ctx.servers.list()) {
          if (ctx.servers.get(server)?.data.session.get(id)) return { server, id }
        }
        return undefined
      },
      current: () => targetSession(),
    })
    onCleanup(() => menus.stop())
    onCleanup(menus.start((inspect) => {
      const menuObserver = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue
            const element = node as HTMLElement
            if (element.matches('[role="menu"][data-component="menu-v2-content"]')) inspect(element)
            else menus.scan(element)
          }
        }
      })
      menuObserver.observe(document.body, { childList: true, subtree: true })
      return () => menuObserver.disconnect()
    }))

    ctx.add(Command, () => ({
      id: "spaces.new",
      title: "New space…",
      section: "general" as const,
      keywords: "spaces group sessions arc",
      async run() {
        const current = state()
        const name = await ctx.dialogs.prompt({ title: "Name this space", placeholder: `Space ${current.spaces.length + 1}` })
        if (name === undefined) return
        rememberCurrent()
        update((now) => addSpace(now, { id: newSpaceId(now.spaces), name: name.trim() === "" ? `Space ${now.spaces.length + 1}` : name.trim(), emoji: defaultEmoji(now.spaces) }))
      },
    }))

    ctx.add(Command, () => {
      if (state().spaces.length < 2) return undefined
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
          switchToId(picked)
        },
      }
    })

    const step = (direction: 1 | -1) => {
      const current = state()
      if (current.spaces.length > 1) switchTo(current.active + direction)
    }
    ctx.add(Command, () => (state().spaces.length < 2 ? undefined : { id: "spaces.next", title: "Next space", section: "navigation" as const, bind: "ctrl+alt+arrowright", keywords: "spaces", run: () => step(1) }))
    ctx.add(Command, () => (state().spaces.length < 2 ? undefined : { id: "spaces.previous", title: "Previous space", section: "navigation" as const, bind: "ctrl+alt+arrowleft", keywords: "spaces", run: () => step(-1) }))

    for (const [id, title, action] of [
      ["spaces.rename", "Rename space…", "rename"],
      ["spaces.emoji", "Change space emoji…", "emoji"],
      ["spaces.accent", "Change space colour…", "accent"],
    ] as const) {
      ctx.add(Command, () => ({ id, title, section: "general" as const, keywords: "spaces", run: () => editSpace(action) }))
    }

    ctx.add(Command, () => {
      if (state().spaces.length < 2) return undefined
      return {
        id: "spaces.move",
        title: "Move session to space…",
        section: "general" as const,
        keywords: "spaces move",
        async run() {
          const session = targetSession()
          if (session) await moveToSpace(session)
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
