import { Command, createKeyed, Plugin, Store, Style, type ServerRef } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { actionsCss, labels, type ActionName, type Target } from "./actions"
import { iconCss } from "./icons"
import { menuCss } from "./menu"
import { createSessionMenus } from "./sessionmenu"
import { appendPage, archivedActivity, dropArchived, emptyPage, loadArchivePage, removeSession, setArchived, upsertArchived, type ArchivedSession, type ArchivePage } from "./archive"
import { FIRST_PAGE, firstOf, moreLabel, moreStep } from "./page"
import { tabRowActionCss } from "../../native-ui/src"
import { createSidebar, css, type GroupState } from "./sidebar"
import { avatarFor } from "./avatar"
import { createHost } from "./host"
import { createDomHub } from "./hub"
import { createGuard, parseArchiveOption } from "./guard"
import { createTabActions } from "./tabrows"
import { openInCurrentTab } from "./route"
import { isUserSend, sessionKey, wakeReason, type Snooze } from "./snooze"
import { openCustom, customCss } from "./custom"
import { openMenu, type MenuLine } from "./menu"
import { createWokeMarks, isWoke, withWoke, withoutWoke, wokeCss } from "./woke"
import { checkWake, formatHint, formatRemaining, formatWake, presets, uses12Hour, zoneLabel } from "./time"

const SnoozeSchema = Schema.Struct({
  server: Schema.String, id: Schema.String, title: Schema.String,
  at: Schema.Number, until: Schema.Number, updated: Schema.Number, busy: Schema.Number,
})
// A store of its own: adding a field to `snoozes` would fail to decode, and so drop, the snoozes already saved.
const WokeSchema = Schema.Struct({ entries: Schema.Array(Schema.Struct({ server: Schema.String, id: Schema.String })) })
const definition = Plugin.define({ stores: {
  snoozes: Store.global(Schema.Struct({ entries: Schema.Array(SnoozeSchema) }), { entries: [] }),
  woke: Store.global(WokeSchema, { entries: [] }),
} })

export default Plugin.define({
  ...definition,
  setup(ctx) {
    ctx.add(Style, tabRowActionCss + css + actionsCss + iconCss + menuCss + customCss + wokeCss)
    const host = createHost(ctx.ui)
    let disposed = false
    onCleanup(() => { disposed = true })
    const hub = createDomHub(document, requestAnimationFrame, cancelAnimationFrame)
    // Our Archived group and Archive actions yield to a host archive UI (`archive` option: auto, ours, theirs).
    const guard = createGuard({
      doc: document, option: parseArchiveOption(ctx.options.archive),
      path: () => ctx.router.path(), hub,
    })
    // `groupDown`: the host has its own archived group. `actionsDown`: the host has any archive UI, an Archive action included.
    const { groupDown, actionsDown } = guard
    // Archived loads on first expand and by page; nothing is fetched while the group has never been opened.
    let archiveOpened = false
    const sidebar = createSidebar(document, host, hub, {
      toggled: (kind, open) => {
        if (kind === "snoozed") { setSnoozedOpen(open); return }
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
    const [snoozeLimit, setSnoozeLimit] = createSignal(FIRST_PAGE)
    const [archiveLimit, setArchiveLimit] = createSignal(FIRST_PAGE)
    const [revision, setRevision] = createSignal(0)
    const [tick, setTick] = createSignal(0)
    const [snoozedOpen, setSnoozedOpen] = createSignal(false)
    const changed = () => setRevision((n) => n + 1)
    const archives = new Map<string, ArchivePage>()
    const subscriptions = new Map<string, { data: ServerRef["data"]; off: (() => void)[] }>()
    onCleanup(() => {
      subscriptions.forEach((sub) => sub.off.forEach((off) => off()))
      subscriptions.clear()
    })
    const actionKeys = new Set<string>()
    const hiddenSnoozes = new Set<string>()
    const entries = () => ctx.stores.snoozes.value.entries
    const wokeEntries = () => ctx.stores.woke.value.entries
    const markWoke = (server: string, id: string) => ctx.stores.woke.update((draft) => { draft.entries = withWoke(draft.entries, server, id) })
    const clearWoke = (server: string, id: string) => {
      if (isWoke(untrack(wokeEntries), server, id)) ctx.stores.woke.update((draft) => { draft.entries = withoutWoke(draft.entries, server, id) })
    }
    const error = (cause: unknown) => {
      if (!disposed) ctx.toast.show({ title: "Session action failed", description: String(cause), variant: "error" })
    }
    const remove = (server: string, id: string) => ctx.stores.snoozes.update((draft) => {
      draft.entries = draft.entries.filter((item) => item.server !== server || item.id !== id)
    })
    // `opened`: the user already opened the session (Home, Recently closed), so there is nothing left to point at.
    const wake = (entry: Snooze, focus = false, archived = false, opened = false) => {
      if (disposed) return
      if (!entries().some((current) => current.server === entry.server && current.id === entry.id && current.at === entry.at)) return
      archived = archived || ctx.servers.get(entry.server)?.data.session.get(entry.id)?.time?.archived !== undefined
      if (!archived && !ctx.servers.get(entry.server)?.connected) {
        if (focus) error(new Error("Reconnect this session's server to wake it."))
        return
      }
      hiddenSnoozes.delete(sessionKey(entry.server, entry.id))
      remove(entry.server, entry.id)
      if (archived || opened) clearWoke(entry.server, entry.id)
      if (archived) return
      ctx.tabs.open({ server: entry.server, id: entry.id }, { focus })
      const current = untrack(currentSession)
      if (!focus && !opened && !(current?.id === entry.id && current.server.id === entry.server)) markWoke(entry.server, entry.id)
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
    const closeTabs = (server: string, id: string) => {
      for (const tab of ctx.tabs.list()) if (tab.session?.server.id === server && tab.session.id === id) ctx.tabs.close(tab.key)
    }
    const archiveAction = async (server: ServerRef, id: string, archived: boolean) => {
      const key = sessionKey(server.id, id)
      if (actionKeys.has(key)) return
      actionKeys.add(key)
      try {
        const info = await setArchived(server, id, archived, ctx.signal)
        if (disposed) return
        if (archived) { remove(server.id, id); clearWoke(server.id, id); closeTabs(server.id, id) }
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
    // A snooze wakes by the same events whoever sent (see `wakeEvent`); only the user's own send also unarchives, clears
    // the woke mark and counts as "already opened" (no mark, whatever the session on screen is).
    const userSent = (server: ServerRef, id: string) => {
      clearWoke(server.id, id)
      if (server.data.session.get(id)?.time?.archived !== undefined) void unarchiveOnSend(server, id)
    }
    const observe = (server: ServerRef, id: string, info: ArchivedSession | undefined) => {
      const family = server.data.session.family(id)
      const requests = [id, ...(family ?? [])].map((sessionID) => ({
        permissions: server.data.session.permission.list(sessionID),
        forms: server.data.session.form.list(sessionID),
      }))
      return {
        hydrated: Array.isArray(family) && requests.every((request) => Array.isArray(request.permissions) && Array.isArray(request.forms)) && Number.isFinite(info?.time?.updated),
        attention: requests.some((request) => (request.permissions?.length ?? 0) > 0 || (request.forms?.length ?? 0) > 0),
        updated: info?.time?.updated ?? 0, busy: info?.time?.busy ?? 0, idle: info?.time?.idle ?? 0,
        archived: info?.time?.archived !== undefined,
      }
    }
    const reconcile = async (entry: Snooze) => {
      const server = ctx.servers.get(entry.server)
      if (!server?.connected) return
      try {
        const knownReason = wakeReason(entry, observe(server, entry.id, server.data.session.get(entry.id)), Date.now())
        if (knownReason) { wake(entry, false, knownReason === "archived"); return }
        await server.data.session.sync(entry.id, { children: true })
        if (disposed) return
        const initial = observe(server, entry.id, server.data.session.get(entry.id))
        const initialReason = wakeReason(entry, initial, Date.now())
        if (initialReason) { wake(entry, false, initialReason === "archived"); return }
        await Promise.all([entry.id, ...(server.data.session.family(entry.id) ?? [])].flatMap((id) => [
          server.data.session.permission.sync(id), server.data.session.form.sync(id),
        ]))
        if (disposed) return
        const current = entries().find((s) => s.server === entry.server && s.id === entry.id && s.at === entry.at)
        if (!current) return
        const state = observe(server, entry.id, server.data.session.get(entry.id))
        const reason = wakeReason(current, state, Date.now())
        if (reason) wake(current, false, reason === "archived")
        else if (state.hydrated && !hiddenSnoozes.has(sessionKey(entry.server, entry.id))) {
          closeTabs(entry.server, entry.id)
          hiddenSnoozes.add(sessionKey(entry.server, entry.id))
        }
      } catch (cause) { error(cause) }
    }
    // Presets in the app's menu markup. Times are resolved when this is called, so they are never stale.
    // `custom` opens the Custom dialog; `choose` receives the deadline.
    const presetLines = (choose: (until: number) => void, custom: () => void): MenuLine[] => {
      const now = new Date()
      const options = { hour12: uses12Hour() }
      return [
        ...presets(now).map((p): MenuLine => ({ label: p.label, hint: formatHint(p, +now, options), run: () => choose(p.until) })),
        "separator",
        { label: "Custom…", run: custom },
      ]
    }
    const customTimeDialog = () => openCustom((render) => ctx.dialogs.open(render), host)
    // Where a menu opened without a pointer (palette, keyboard) appears: under the session's own tab row, else the tab list.
    const tabElement = (session: { id: string; server: ServerRef }) => {
      const key = ctx.tabs.list().find((tab) => tab.session?.id === session.id && tab.session.server.id === session.server.id)?.key
      return key ? [...document.querySelectorAll<HTMLElement>("[data-tab-key]")].find((e) => e.dataset.tabKey === key) : undefined
    }
    const anchor = (session: { id: string; server: ServerRef }) => {
      const el = tabElement(session) ?? document.querySelector<HTMLElement>('[data-slot="vertical-tabs"]') ?? undefined
      const rect = el?.getBoundingClientRect()
      return rect ? { x: Math.round(rect.left + 8), y: Math.round(rect.bottom + 2) } : { x: 16, y: 48 }
    }
    const chooseTime = (session: { id: string; server: ServerRef }) => new Promise<number | undefined>((resolve) => {
      const lines = presetLines(resolve, () => { void customTimeDialog().then(resolve) })
      openMenu(document, anchor(session), lines, { label: "Snooze until", restore: () => tabElement(session)?.querySelector<HTMLElement>("a"), onClose: (chosen) => { if (!chosen) resolve(undefined) } })
    })
    const snooze = async (session: { id: string; server: ServerRef }, picked?: number | "custom") => {
      const until = picked === undefined ? await chooseTime(session) : picked === "custom" ? await customTimeDialog() : picked
      if (until === undefined || disposed) return
      try {
        const valid = checkWake(until, Date.now())
        if (!valid.ok) throw new Error(valid.reason)
        const server = session.server
        await server.data.session.sync(session.id, { children: true })
        if (disposed) return
        await Promise.all([session.id, ...(server.data.session.family(session.id) ?? [])].flatMap((id) => [
          server.data.session.permission.sync(id), server.data.session.form.sync(id),
        ]))
        if (disposed) return
        const info = await server.client.session.get({ sessionID: session.id }, { signal: ctx.signal })
        if (disposed) return
        const state = observe(server, session.id, info)
        if (state.attention) throw new Error("This session is waiting for your approval or input. Respond before snoozing.")
        if (state.archived) throw new Error("Restore this archived session before snoozing.")
        if (!info?.time || !state.hydrated) throw new Error("Session details or pending requests are still loading. Retry snooze once loading finishes.")
        if (info.parentID) throw new Error("Snooze the parent session rather than a subagent.")
        const entry: Snooze = { server: server.id, id: session.id, title: info.title ?? "Session", at: Date.now(), until, updated: info.time.updated, busy: info.time.busy ?? 0 }
        ctx.stores.snoozes.update((draft) => {
          draft.entries = [...draft.entries.filter((s) => s.server !== entry.server || s.id !== entry.id), entry]
        })
        clearWoke(entry.server, entry.id)
        closeTabs(entry.server, entry.id)
        hiddenSnoozes.add(sessionKey(entry.server, entry.id))
      } catch (cause) { error(cause) }
    }
    const deleteAction = async (server: ServerRef, id: string) => {
      const key = sessionKey(server.id, id)
      if (actionKeys.has(key)) return
      actionKeys.add(key)
      try {
        const title = server.data.session.get(id)?.title ?? "this session"
        const confirmed = await ctx.dialogs.confirm({
          title: `Delete “${title}” permanently?`,
          description: `This permanently deletes the session and its history from ${server.name}. It cannot be undone. To keep it, archive it instead.`,
          confirm: "Delete permanently", danger: true,
        })
        if (!confirmed || disposed) return
        await removeSession(server, id, ctx.signal)
        if (disposed) return
        remove(server.id, id)
        clearWoke(server.id, id)
        hiddenSnoozes.delete(key)
        closeTabs(server.id, id)
        showApplied(server.id, (state) => dropArchived(state, id))
      } catch (cause) { error(cause) }
      finally { actionKeys.delete(key) }
    }
    const runAction = (action: ActionName, target: Target) => {
      const server = ctx.servers.get(target.server)
      if (!server) return
      if (action === "snooze") void snooze({ id: target.id, server })
      else if (action === "archive") void archiveAction(server, target.id, true)
      else void deleteAction(server, target.id)
    }
    // Cold stores may lack the session or its project; the letter then falls back to the fallback name.
    // Same label as the live rows (sidebar-repos): the project's name, falling back to the folder name.
    const repoLabel = (server: string, info: { projectID?: string; location?: { directory: string } } | undefined, fallback = "") => {
      const data = ctx.servers.get(server)?.data
      const directory = info?.location?.directory ?? fallback
      let canonical: string | undefined
      try { canonical = info?.projectID ? data?.project.get(info.projectID)?.canonical : undefined } catch {}
      const path = canonical ?? directory
      const name = path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || path
      return name
    }
    const avatarOf = (server: string, info: { projectID?: string; location?: { directory: string } } | undefined, fallback = "") =>
      avatarFor(info?.projectID ? ctx.servers.get(server)?.data.project?.get(info.projectID) : undefined, info?.location?.directory ?? fallback)
    const currentSession = () => { const s = ctx.sessions.current(); return s && !s.pending ? s : undefined }
    ctx.add(Command, (): Command => ({ id: "delete", title: "Delete session…", section: "session", enabled: !!currentSession(), run: () => {
      const session = currentSession()
      if (session) return deleteAction(session.server, session.id)
    } }))
    ctx.add(Command, (): Command => ({ id: "snooze", title: "Snooze session…", section: "session", enabled: !!currentSession(), run: () => {
      const session = currentSession()
      if (session) return snooze(session)
    } }))
    ctx.add(Command, (): Command => ({ id: "archive", title: "Archive session", section: "session", enabled: !!currentSession() && !actionsDown(), run: async () => {
      const session = currentSession()
      if (session) await archiveAction(session.server, session.id, true)
    } }))
    ctx.add(Command, (): Command => ({ id: "refresh", title: "Refresh archived sessions", enabled: !groupDown(), run: () => {
      for (const id of ctx.servers.list()) { const server = ctx.servers.get(id); if (server?.connected && server.compatible) refresh(server) }
    } }))
    // Own effect: the clock ticks and the snooze list changes here without rebuilding the Archived window.
    const snoozedState = createMemo((): GroupState => {
      tick()
      const ids = ctx.servers.list()
      const snoozes = entries().filter((entry) => ids.includes(entry.server))
      const snoozeShown = snoozeLimit()
      const snoozeStep = moreStep(Math.min(snoozeShown, snoozes.length), snoozes.length, false)
      return { count: snoozes.length, more: snoozeStep ? { label: moreLabel(snoozeStep), run: () => setSnoozeLimit((n) => n + snoozeStep) } : undefined, rows: snoozes.slice(0, snoozeShown).map((entry) => ({
        key: sessionKey(entry.server, entry.id), title: ctx.servers.get(entry.server)?.data.session.get(entry.id)?.title ?? entry.title,
        avatar: avatarOf(entry.server, ctx.servers.get(entry.server)?.data.session.get(entry.id), entry.title), project: repoLabel(entry.server, ctx.servers.get(entry.server)?.data.session.get(entry.id), entry.title), until: formatRemaining(entry.until, Date.now()), detail: `Wakes ${formatWake(entry.until, Date.now())} (${zoneLabel(entry.until)}) · device-local`, action: "Wake", run: () => wake(entry, true),
        menu: [
          { label: "Wake", run: () => wake(entry, true) },
          ...(actionsDown() ? [] : [{ label: labels.archive, run: () => runAction("archive", { server: entry.server, id: entry.id }) }]),
          "separator" as const,
          { label: labels.delete, danger: true, run: () => runAction("delete", { server: entry.server, id: entry.id }) },
        ],
      })) }
    })
    createKeyed(snoozedState, (state) => sidebar.snoozed(state))
    const archivedState = createMemo((): { hidden: boolean; why: string[]; group: GroupState } => {
      revision()
      const ids = ctx.servers.list()
      const archiveShown = archiveLimit()
      // Only the window is turned into rows: the DOM and the work stay proportional to what is visible, not to the archive.
      const rows = firstOf(ids.map((id) => ({ id, rows: archives.get(id)?.rows ?? [] })), archiveShown).map(({ server: id, row: info }) => ({
        key: sessionKey(id, info.id), title: info.title ?? "Session", project: repoLabel(id, info), detail: `${ctx.servers.get(id)?.name ?? id} · ${info.location.directory}`,
        avatar: avatarOf(id, info), action: "Restore", activeAt: archivedActivity(info.time),
        // Reading an archived session does not unarchive it; only Restore does.
        open: () => openInCurrentTab(document, id, info.id),
        active: () => ctx.sessions.current()?.server.id === id && ctx.sessions.current()?.id === info.id,
        run: () => { const server = ctx.servers.get(id); if (server) void archiveAction(server, info.id, false) },
        menu: [
          { label: "Restore", run: () => { const server = ctx.servers.get(id); if (server) void archiveAction(server, info.id, false) } },
          "separator" as const,
          { label: labels.delete, danger: true, run: () => { const server = ctx.servers.get(id); if (server) void deleteAction(server, info.id) } },
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
    createKeyed(archivedState, ({ hidden, why, group }) => {
      sidebar.archiveUi(hidden, why)
      sidebar.archived(group)
      guard.recheck()
    })
    const tabInfo = (key: string) => {
      const session = ctx.tabs.list().find((tab) => tab.key === key)?.session
      if (!session) return
      return { target: { server: session.server.id, id: session.id }, title: session.server.data.session.get(session.id)?.title ?? "", disabled: !!session.pending || actionsDown(), archived: !groupDown() && session.server.data.session.get(session.id)?.time?.archived !== undefined }
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
    const tabActions = createTabActions(hub, host, tabInfo, { run: runAction })
    const menuSession = (server: ServerRef, id: string, pending = false) => {
      const info = server.data.session.get(id)
      return { target: { server: server.id, id }, disabled: pending, archived: info?.time?.archived !== undefined, subagent: !!info?.parentID }
    }
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
    }, { run: runAction }, labels, (target) => {
      const server = ctx.servers.get(target.server)
      if (!server) return []
      return presetLines((until) => void snooze({ id: target.id, server }, until), () => void snooze({ id: target.id, server }, "custom"))
    }, { archive: () => !actionsDown(), native: guard.menu })
    const wokeMarks = createWokeMarks(document, hub, (key) => tabInfo(key)?.target, (target) => isWoke(wokeEntries(), target.server, target.id))
    // Deadlines are checked on every tick. Events keep every connected snooze current, so the server is asked again
    // only after a stretch when events may have been missed: the window was away, or the timer was suspended (sleep).
    const RELABEL = 30_000
    const AWAY = 60_000
    // setTimeout keeps a 32-bit delay.
    const LONGEST = 2 ** 31 - 1
    let awaySince: number | undefined
    const recheck = (reconcileAll: boolean) => {
      if (!entries().length) return
      setTick((n) => n + 1)
      for (const entry of entries()) {
        if (entry.until <= Date.now()) wake(entry)
        else if (reconcileAll) void reconcile(entry)
      }
    }
    const resume = () => {
      const missed = awaySince !== undefined && Date.now() - awaySince >= AWAY
      awaySince = undefined
      recheck(missed)
    }
    // No polling. One timeout waits for the nearest deadline, and none exists while nothing is snoozed. Events keep every
    // connected snooze current; the server is asked again only when this fires long after it was due (the machine slept).
    const nextDeadline = createMemo(() => entries().reduce<number | undefined>((soonest, entry) => soonest === undefined ? entry.until : Math.min(soonest, entry.until), undefined))
    const [rearm, setRearm] = createSignal(0)
    createKeyed(() => { const at = nextDeadline(); return at === undefined ? undefined : { at, rearm: rearm() } }, ({ at }) => {
      const timer = window.setTimeout(() => {
        const late = Date.now() - at > AWAY
        if (late || at <= Date.now()) recheck(late)
        else setRearm((n) => n + 1)
      }, Math.min(Math.max(0, at - Date.now()), LONGEST))
      onCleanup(() => window.clearTimeout(timer))
    }, { equals: (previous, next) => previous.at === next.at && previous.rearm === next.rearm })
    // "in 2h 5m" is current only while the Snoozed group is open and looked at.
    createKeyed(() => snoozedOpen() && entries().length > 0, () => {
      const timer = window.setInterval(() => setTick((n) => n + 1), RELABEL)
      onCleanup(() => window.clearInterval(timer))
    })
    // Sleep, resume and clock or time zone changes: the absolute deadline is re-read as soon as the window is back.
    const visible = () => {
      if (document.visibilityState === "hidden") awaySince ??= Date.now()
      else resume()
    }
    const blurred = () => { awaySince ??= Date.now() }
    document.addEventListener("visibilitychange", visible)
    onCleanup(() => document.removeEventListener("visibilitychange", visible))
    window.addEventListener("focus", resume)
    onCleanup(() => window.removeEventListener("focus", resume))
    window.addEventListener("blur", blurred)
    onCleanup(() => window.removeEventListener("blur", blurred))
    // Hydrated snoozes keep working even when no session tabs are open.
    for (const entry of entries()) if (entry.until <= Date.now()) wake(entry)
    // Reactive syncs start after setup's own first pass: the due wake above, and the timer and listeners, come first.
    // The host's archive UI went away (or the option changed): the group is back, so it loads what it missed.
    const groupUp = createMemo(() => !groupDown())
    createKeyed(groupUp, () => {
      for (const id of ctx.servers.list()) { const server = ctx.servers.get(id); if (server?.connected && server.compatible) fill(server) }
    })
    // Opening a sleeping session through Home or Recently closed is an explicit early wake. The source also reads what
    // `wake` checks (connection, archived), so a session opened while its server was down wakes on reconnect.
    const openedSleepers = createMemo(() => {
      const tabs = ctx.tabs.list()
      const opened = entries().filter((entry) => hiddenSnoozes.has(sessionKey(entry.server, entry.id)) && tabs.some((tab) => tab.session?.id === entry.id && tab.session.server.id === entry.server))
      for (const entry of opened) {
        const server = ctx.servers.get(entry.server)
        void server?.data.session.get(entry.id)?.time?.archived
        void server?.connected
      }
      return opened.length ? opened : undefined
    })
    createKeyed(openedSleepers, (opened) => { for (const entry of opened) wake(entry, false, false, true) })
    // Opening the session by any route (tab click, palette, keyboard, Home) makes it the mounted one.
    createKeyed(() => { const session = currentSession(); return session && { session } }, ({ session }) => clearWoke(session.server.id, session.id))
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
        const wakeEvent = (sessionID: string, created: number, userSend = false) => {
          for (const entry of entries()) if (entry.server === id && created > entry.at && (entry.id === sessionID || data.session.root(sessionID) === entry.id)) wake(entry, false, false, userSend && entry.id === sessionID)
        }
        const off = [
          data.on("session.archived", (e) => { remove(id, e.data.sessionID); clearWoke(id, e.data.sessionID); void settle(server, e.data.sessionID) }),
          data.on("session.unarchived", (e) => showApplied(id, (state) => dropArchived(state, e.data.sessionID))),
          data.on("session.deleted", (e) => { remove(id, e.data.sessionID); clearWoke(id, e.data.sessionID); showApplied(id, (state) => dropArchived(state, e.data.sessionID)) }),
          data.on("session.renamed", (e) => { if (archives.get(id)?.rows.some((row) => row.id === e.data.sessionID)) void settle(server, e.data.sessionID) }),
          data.on("session.execution.started", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("session.execution.succeeded", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("session.execution.failed", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("session.inbox.enqueued", (e) => {
            const userSend = isUserSend(e.data.item)
            if (userSend) userSent(server, e.data.sessionID)
            wakeEvent(e.data.sessionID, e.created, userSend)
          }),
          data.on("permission.asked", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("form.created", (e) => wakeEvent(e.data.form.sessionID, e.created)),
        ]
        subscriptions.set(id, { data, off })
        refresh(server)
        entries().filter((e) => e.server === id).forEach((e) => void reconcile(e))
      }
      changed()
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
    const wokeRows = createMemo(() => ({ woke: wokeEntries(), rows: ctx.tabs.list().map((tab) => tabInfo(tab.key)) }))
    createKeyed(wokeRows, () => wokeMarks.sync())
  },
})
