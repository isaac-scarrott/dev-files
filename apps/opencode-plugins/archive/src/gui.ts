import { Command, createKeyed, Plugin, Style, type ServerRef } from "@opencode/plugin/gui"
import { createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { avatarOf, createGroup, createHost, createDomHub, createSessionMenus, deleteSession, groupsCss, isUserSend, menuCss, moreLabel, moreStep, repoLabel, sessionKey, setArchived, tabSession, toastError, ARCHIVE_LABEL, DELETE_LABEL, type GroupState, type Target } from "../../session-ui/src"
import { tabRowActionCss } from "../../native-ui/src"
import { appendPage, archivedActivity, dropArchived, emptyPage, loadArchivePage, upsertArchived, type ArchivePage } from "./archive"
import { createGuard, hasNativeArchive, parseArchiveOption } from "./guard"
import { actionsCss, createTabActions } from "./tabrows"
import { openInCurrentTab } from "./route"
import { FIRST_PAGE, firstOf } from "../../session-ui/src/page"

const OWNER = "archive"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, groupsCss + menuCss + tabRowActionCss + actionsCss)
    const host = createHost(ctx.ui)
    let disposed = false
    onCleanup(() => { disposed = true })
    const hub = createDomHub(document, requestAnimationFrame, cancelAnimationFrame, OWNER)
    // Our Archived group and Archive actions yield to a host archive UI (`archive` option: auto, ours, theirs).
    const guard = createGuard({
      doc: document, option: parseArchiveOption(ctx.options.archive),
      path: () => ctx.router.path(), hub,
    })
    // `groupDown`: the host has its own archived group. `actionsDown`: the host has any archive UI, an Archive action included.
    const { groupDown, actionsDown } = guard
    // Archived loads on first expand and by page; nothing is fetched while the group has never been opened.
    let archiveOpened = false
    const group = createGroup(document, host, hub, {
      kind: "archived", name: "Archived",
      toggled: (open) => {
        if (!open) return
        archiveOpened = true
        for (const id of ctx.servers.list()) {
          const server = ctx.servers.get(id)
          if (!server?.connected || !server.compatible) continue
          const state = archives.get(id)
          if (state?.error) archives.set(id, { ...state, error: undefined })
          fill(server)
        }
        changed()
      },
    })
    // The group stack can outlive this plugin (the snooze plugin's group may still be in it), so its archive markers go.
    onCleanup(() => { delete group.root.dataset.saArchive; delete group.root.dataset.saStanddown })
    const [archiveLimit, setArchiveLimit] = createSignal(FIRST_PAGE)
    const [revision, setRevision] = createSignal(0)
    const changed = () => setRevision((n) => n + 1)
    const archives = new Map<string, ArchivePage>()
    const subscriptions = new Map<string, { data: ServerRef["data"]; off: (() => void)[] }>()
    onCleanup(() => {
      subscriptions.forEach((sub) => sub.off.forEach((off) => off()))
      subscriptions.clear()
    })
    const actionKeys = new Set<string>()
    const error = (cause: unknown) => { if (!disposed) toastError(ctx, cause) }
    const closeTabs = (server: string, id: string) => {
      for (const tab of ctx.tabs.list()) if (tab.session?.server.id === server && tab.session.id === id) ctx.tabs.close(tab.key)
    }
    const loadedTotal = () => ctx.servers.list().reduce((n, id) => n + (archives.get(id)?.rows.length ?? 0), 0)
    // Fetch the next page of a server's archive while the window wants more rows than are loaded. An error stops the chain until the next press, expand or refresh.
    const fill = (server: ServerRef) => {
      if (disposed || !archiveOpened || untrack(groupDown)) return
      const state = archives.get(server.id)
      if (state?.busy || state?.error) return
      if (!state || !state.loaded || state.stale || (state.more && loadedTotal() < untrack(archiveLimit))) void fetchPage(server)
    }
    const fetchPage = async (server: ServerRef) => {
      const state = archives.get(server.id) ?? emptyPage()
      const first = !state.loaded || state.stale
      archives.set(server.id, { ...state, busy: true })
      changed()
      try {
        const page = await loadArchivePage(server, first ? undefined : state.next, first ? FIRST_PAGE : 25, ctx.signal)
        if (disposed) return
        const current = archives.get(server.id)
        if (!current || current.gen !== state.gen) return
        archives.set(server.id, { ...appendPage(current, page.rows, page.next), busy: false })
      } catch (cause) {
        if (disposed) return
        const current = archives.get(server.id)
        if (current && current.gen === state.gen) archives.set(server.id, { ...current, busy: false, error: String(cause) })
      }
      if (disposed) return
      changed()
      fill(server)
    }
    // Reload from the first page, keeping what is shown until it arrives and refilling to the rows already asked for.
    const refresh = (server: ServerRef) => {
      const state = archives.get(server.id)
      if (state) archives.set(server.id, { ...state, stale: true, busy: false, error: undefined, gen: state.gen + 1 })
      fill(server)
    }
    const showApplied = (server: string, change: (state: ArchivePage) => ArchivePage) => {
      const state = archives.get(server)
      if (!state?.loaded) return
      archives.set(server, change(state))
      changed()
      const connected = ctx.servers.get(server)
      if (connected) fill(connected)
    }
    const settle = async (server: ServerRef, id: string) => {
      try {
        const info = await server.client.session.get({ sessionID: id }, { signal: ctx.signal })
        if (!disposed) showApplied(server.id, (state) => upsertArchived(state, info))
      } catch { if (!disposed) refresh(server) }
    }
    const loadMoreArchived = () => {
      const servers = ctx.servers.list().flatMap((id) => { const server = ctx.servers.get(id); return server?.connected && server.compatible ? [server] : [] })
      const loaded = servers.reduce((n, server) => n + (archives.get(server.id)?.rows.length ?? 0), 0)
      const step = moreStep(Math.min(untrack(archiveLimit), loaded), loaded, servers.some((server) => archives.get(server.id)?.more))
      if (step) setArchiveLimit((n) => n + step)
      for (const server of servers) {
        const state = archives.get(server.id)
        if (state?.error) archives.set(server.id, { ...state, error: undefined })
        fill(server)
      }
      changed()
    }
    const archiveAction = async (server: ServerRef, id: string, archived: boolean) => {
      const key = sessionKey(server.id, id)
      if (actionKeys.has(key)) return
      actionKeys.add(key)
      try {
        const info = await setArchived(server, id, archived, ctx.signal)
        if (disposed) return
        if (archived) closeTabs(server.id, id)
        else ctx.tabs.open({ server: server.id, id }, { focus: true })
        showApplied(server.id, (state) => upsertArchived(state, info))
      } catch (cause) { error(cause) }
      finally { actionKeys.delete(key) }
    }
    // The user sent a prompt into an archived session: it is in use again. No tab is opened or focused (the user is in it).
    // A failed write leaves everything as it was and says so; the next send tries again. Every window that sees the event
    // asks for the same state, so the write is idempotent and each window makes it at most once at a time.
    const unarchiveOnSend = async (server: ServerRef, id: string) => {
      const key = sessionKey(server.id, id)
      if (actionKeys.has(key)) return
      actionKeys.add(key)
      try {
        const info = await setArchived(server, id, false, ctx.signal)
        if (!disposed) showApplied(server.id, (state) => upsertArchived(state, info))
      } catch (cause) { error(cause) }
      finally { actionKeys.delete(key) }
    }
    const deleteAction = async (server: ServerRef, id: string) => {
      const key = sessionKey(server.id, id)
      if (actionKeys.has(key)) return
      actionKeys.add(key)
      try {
        await deleteSession(ctx, server, id, { keep: "restore it", done: () => {
          closeTabs(server.id, id)
          showApplied(server.id, (state) => dropArchived(state, id))
        } })
      } catch (cause) { error(cause) }
      finally { actionKeys.delete(key) }
    }
    const runAction = (action: "archive" | "restore" | "delete", target: Target) => {
      const server = ctx.servers.get(target.server)
      if (!server) return
      if (action === "delete") void deleteAction(server, target.id)
      else void archiveAction(server, target.id, action === "archive")
    }
    const currentSession = () => { const s = ctx.sessions.current(); return s && !s.pending ? s : undefined }
    ctx.add(Command, (): Command => ({ id: "archive", title: "Archive session", section: "session", enabled: !!currentSession() && !actionsDown(), run: async () => {
      const session = currentSession()
      if (session) await archiveAction(session.server, session.id, true)
    } }))
    ctx.add(Command, (): Command => ({ id: "refresh", title: "Refresh archived sessions", enabled: !groupDown(), run: () => {
      for (const id of ctx.servers.list()) { const server = ctx.servers.get(id); if (server?.connected && server.compatible) refresh(server) }
    } }))
    const archivedState = createMemo((): { hidden: boolean; why: string[]; group: GroupState } => {
      revision()
      const ids = ctx.servers.list()
      const archiveShown = archiveLimit()
      // Only the window is turned into rows: the DOM and the work stay proportional to what is visible, not to the archive.
      const rows = firstOf(ids.map((id) => ({ id, rows: archives.get(id)?.rows ?? [] })), archiveShown).map(({ server: id, row: info }) => ({
        key: sessionKey(id, info.id), title: info.title ?? "Session", project: repoLabel(ctx, id, info), detail: `${ctx.servers.get(id)?.name ?? id} · ${info.location.directory}`,
        avatar: avatarOf(ctx, id, info), action: "Restore", activeAt: archivedActivity(info.time),
        // Reading an archived session does not unarchive it; only Restore does.
        open: () => openInCurrentTab(document, id, info.id),
        active: () => ctx.sessions.current()?.server.id === id && ctx.sessions.current()?.id === info.id,
        run: () => { const server = ctx.servers.get(id); if (server) void archiveAction(server, info.id, false) },
        menu: [
          { label: "Restore", run: () => { const server = ctx.servers.get(id); if (server) void archiveAction(server, info.id, false) } },
          "separator" as const,
          { label: DELETE_LABEL, danger: true, run: () => { const server = ctx.servers.get(id); if (server) void deleteAction(server, info.id) } },
        ],
      }))
      const errors = ids.flatMap((id) => {
        const server = ctx.servers.get(id)
        const state = archives.get(id)
        return !server?.connected ? [`${server?.name ?? id}: offline`] : !server.compatible ? [`${server.name}: incompatible server version`] : state?.error ? [`${server.name}: ${state.error}`] : []
      })
      const complete = ids.length > 0 && ids.every((id) => archives.get(id)?.loaded && ctx.servers.get(id)?.connected && ctx.servers.get(id)?.compatible)
      const states = ids.map((id) => archives.get(id)).filter((state): state is ArchivePage => !!state)
      const archivedLoaded = states.reduce((n, state) => n + state.rows.length, 0)
      const archivedStep = moreStep(rows.length, archivedLoaded, states.some((state) => state.more))
      return { hidden: groupDown(), why: guard.reasons(), group: {
        rows, count: null,
        more: archivedStep ? { label: moreLabel(archivedStep), busy: states.some((state) => state.busy && state.loaded && !state.stale), run: loadMoreArchived } : undefined,
        status: errors.length ? errors.join("; ") : complete ? undefined : "Loading archived sessions…",
      } }
    })
    createKeyed(archivedState, ({ hidden, why, group: state }) => {
      group.update(state)
      group.setHidden(hidden)
      // `data-sa-standdown` names the signals that fired (see guard.ts), so "why is Archived gone" is one attribute read.
      const root = group.root
      root.dataset.saArchive = hidden ? "theirs" : "ours"
      if (why.length) root.dataset.saStanddown = why.join(","); else delete root.dataset.saStanddown
      guard.recheck()
    })
    const tabInfo = (key: string) => {
      const session = tabSession(ctx, key)
      return session && { target: session.target, title: session.title, disabled: session.pending || actionsDown(), archived: !groupDown() && session.archived }
    }
    const archivedClosing = new Map<string, number>()
    onCleanup(() => {
      archivedClosing.forEach((id) => window.clearTimeout(id))
      archivedClosing.clear()
    })
    const isViewed = (tab: { key: string; active?: boolean; session?: { server: { id: string }; id: string } }) => {
      const viewing = ctx.sessions.current()
      return !!tab.active || !!(viewing && tab.session && viewing.server.id === tab.session.server.id && viewing.id === tab.session.id)
    }
    const sweepArchivedTabs = () => {
      if (groupDown()) return
      for (const tab of untrack(() => ctx.tabs.list())) {
        const archived = tab.session?.server.data.session.get(tab.session.id)?.time?.archived !== undefined
        if (archived && !isViewed(tab) && !archivedClosing.has(tab.key)) {
          archivedClosing.set(tab.key, window.setTimeout(() => {
            archivedClosing.delete(tab.key)
            const current = ctx.tabs.list().find((item) => item.key === tab.key)
            if (current && current.session?.server.data.session.get(current.session.id)?.time?.archived !== undefined && !isViewed(current)) ctx.tabs.close(tab.key)
          }, 1500))
        }
      }
    }
    const scheduleArchivedTabSweep = () => { untrack(sweepArchivedTabs) }
    const tabActions = createTabActions(hub, host, tabInfo, (target) => runAction("archive", target))
    const menuSession = (server: ServerRef, id: string, pending = false) => {
      const info = server.data.session.get(id)
      return { target: { server: server.id, id }, disabled: pending, archived: info?.time?.archived !== undefined, subagent: !!info?.parentID }
    }
    // Archive sits in every host session menu above Delete…, in this plugin's own marker so the snooze plugin's Snooze
    // submenu can sit next to it in the same menu. It stands down for a host archive item, and for any host archive UI.
    createSessionMenus(document, hub, {
      tab(key) {
        const session = ctx.tabs.list().find((tab) => tab.key === key)?.session
        return session ? menuSession(session.server, session.id, !!session.pending) : undefined
      },
      // Home rows carry only the session id: the server is the connected one that knows it, else the only connected one.
      row(id) {
        const servers = ctx.servers.list().flatMap((s) => { const server = ctx.servers.get(s); return server?.connected ? [server] : [] })
        const server = servers.find((s) => s.data.session.get(id)) ?? (servers.length === 1 ? servers[0] : undefined)
        return server ? menuSession(server, id) : undefined
      },
      current() {
        const session = ctx.sessions.current()
        return session ? menuSession(session.server, session.id, !!session.pending) : undefined
      },
    }, {
      owner: OWNER,
      native: guard.menu,
      hasNativeArchive,
      lines(session) {
        if (actionsDown()) return []
        return [{ label: ARCHIVE_LABEL, disabled: session.disabled, run: () => runAction("archive", session.target) }]
      },
    })
    // Reads what the subscriptions depend on: the server list and each server's connection and data.
    const serverLinks = createMemo(() => ctx.servers.list().map((id) => {
      const server = ctx.servers.get(id)
      return [id, server?.connected && server.compatible ? server.data : undefined] as const
    }))
    createKeyed(serverLinks, () => {
      const ids = new Set(ctx.servers.list())
      for (const [id, sub] of subscriptions) if (!ids.has(id)) { sub.off.forEach((off) => off()); subscriptions.delete(id); archives.delete(id) }
      for (const id of ids) {
        const server = ctx.servers.get(id)
        if (!server?.connected || !server.compatible) {
          subscriptions.get(id)?.off.forEach((off) => off())
          subscriptions.delete(id)
          continue
        }
        const data = server.data
        if (subscriptions.get(id)?.data === data) continue
        subscriptions.get(id)?.off.forEach((off) => off())
        const off = [
          data.on("session.archived", (e) => void settle(server, e.data.sessionID)),
          data.on("session.unarchived", (e) => showApplied(id, (state) => dropArchived(state, e.data.sessionID))),
          data.on("session.deleted", (e) => showApplied(id, (state) => dropArchived(state, e.data.sessionID))),
          data.on("session.renamed", (e) => { if (archives.get(id)?.rows.some((row) => row.id === e.data.sessionID)) void settle(server, e.data.sessionID) }),
          // Only the user's own send unarchives, and only a session the server still has archived; peer messages, subagents
          // and monitor or scheduler wakes never do.
          data.on("session.inbox.enqueued", (e) => { if (isUserSend(e.data.item) && server.data.session.get(e.data.sessionID)?.time?.archived !== undefined) void unarchiveOnSend(server, e.data.sessionID) }),
        ]
        subscriptions.set(id, { data, off })
        refresh(server)
      }
      changed()
    })
    // The host's archive UI went away (or the option changed): the group is back, so it loads what it missed.
    const groupUp = createMemo(() => !groupDown())
    createKeyed(groupUp, () => {
      for (const id of ctx.servers.list()) { const server = ctx.servers.get(id); if (server?.connected && server.compatible) fill(server) }
    })
    // Tab rows read `tabInfo` (title, pending, archived), so the source reads it for every tab; each change re-syncs.
    const tabRows = createMemo(() => ({ rows: ctx.tabs.list().map((tab) => tabInfo(tab.key)), groupDown: groupDown(), actionsDown: actionsDown() }))
    createKeyed(tabRows, () => {
      // An archived session lives in the Archived group, shown active while viewed. Opening it creates a host tab; hide it
      // while viewed and close it (it stays in Recently closed) once the user has moved on. Closing is deferred and
      // re-checked so a tab that is mid-navigation, or about to be viewed again, is never closed under the user.
      scheduleArchivedTabSweep()
      tabActions.sync()
    })
  },
})

