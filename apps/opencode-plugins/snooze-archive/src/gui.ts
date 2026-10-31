import { Command, Plugin, Store, Style, type ServerRef } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { createEffect, createSignal, untrack } from "solid-js"
import { actionsCss, labels, type ActionName, type Target } from "./actions"
import { iconCss } from "./icons"
import { menuCss } from "./menu"
import { createTabMenu } from "./tabmenu"
import { loadArchive, removeSession, setArchived, type ArchivedSession } from "./archive"
import { createSidebar, css } from "./sidebar"
import { avatarFor } from "./avatar"
import { createHost } from "./host"
import { createTabActions } from "./tabrows"
import { sessionKey, wakeReason, type Snooze } from "./snooze"
import { openCustom, customCss } from "./custom"
import { openMenu, type MenuLine } from "./menu"
import { checkWake, formatHint, formatWake, presets, uses12Hour } from "./time"

const SnoozeSchema = Schema.Struct({
  server: Schema.String, id: Schema.String, title: Schema.String,
  at: Schema.Number, until: Schema.Number, updated: Schema.Number, busy: Schema.Number,
})
const definition = Plugin.define({ stores: { snoozes: Store.global(Schema.Struct({ entries: Schema.Array(SnoozeSchema) }), { entries: [] }) } })

export default Plugin.define({
  ...definition,
  setup(ctx) {
    ctx.add(Style, css + actionsCss + iconCss + menuCss + customCss)
    const host = createHost(ctx.ui)
    const sidebar = createSidebar(document, host, requestAnimationFrame, cancelAnimationFrame)
    const [revision, setRevision] = createSignal(0)
    const changed = () => setRevision((n) => n + 1)
    const archives = new Map<string, { rows: ArchivedSession[]; error?: string; loading: boolean; complete: boolean }>()
    const subscriptions = new Map<string, { data: ServerRef["data"]; off: (() => void)[] }>()
    const pendingRefresh = new Set<string>()
    const refreshing = new Set<string>()
    const actionKeys = new Set<string>()
    const hiddenSnoozes = new Set<string>()
    let disposed = false
    const entries = () => ctx.stores.snoozes.value.entries
    const error = (cause: unknown) => {
      if (!disposed) ctx.toast.show({ title: "Session action failed", description: String(cause), variant: "error" })
    }
    const remove = (server: string, id: string) => ctx.stores.snoozes.update((draft) => {
      draft.entries = draft.entries.filter((item) => item.server !== server || item.id !== id)
    })
    const wake = (entry: Snooze, focus = false, archived = false) => {
      if (disposed) return
      if (!entries().some((current) => current.server === entry.server && current.id === entry.id && current.at === entry.at)) return
      archived = archived || ctx.servers.get(entry.server)?.data.session.get(entry.id)?.time?.archived !== undefined
      if (!archived && !ctx.servers.get(entry.server)?.connected) {
        if (focus) error(new Error("Reconnect this session's server to wake it."))
        return
      }
      hiddenSnoozes.delete(sessionKey(entry.server, entry.id))
      remove(entry.server, entry.id)
      if (!archived) ctx.tabs.open({ server: entry.server, id: entry.id }, { focus })
    }
    const refresh = async (server: ServerRef) => {
      if (disposed) return
      if (refreshing.has(server.id)) { pendingRefresh.add(server.id); return }
      refreshing.add(server.id)
      const previous = archives.get(server.id)
      archives.set(server.id, { rows: previous?.rows ?? [], loading: true, complete: false })
      changed()
      try {
        const rows = await loadArchive(server, ctx.signal)
        if (disposed) return
        archives.set(server.id, { rows, loading: false, complete: true })
      } catch (cause) {
        if (disposed) return
        archives.set(server.id, { rows: previous?.rows ?? [], loading: false, complete: false, error: String(cause) })
      } finally {
        refreshing.delete(server.id)
        if (!disposed) {
          changed()
          if (pendingRefresh.delete(server.id)) void refresh(server)
        }
      }
    }
    const closeTabs = (server: string, id: string) => {
      for (const tab of ctx.tabs.list()) if (tab.session?.server.id === server && tab.session.id === id) ctx.tabs.close(tab.key)
    }
    const archiveAction = async (server: ServerRef, id: string, archived: boolean) => {
      const key = sessionKey(server.id, id)
      if (actionKeys.has(key)) return
      actionKeys.add(key)
      try {
        await setArchived(server, id, archived, ctx.signal)
        if (disposed) return
        if (archived) { remove(server.id, id); closeTabs(server.id, id) }
        else ctx.tabs.open({ server: server.id, id }, { focus: true })
        await refresh(server)
      } catch (cause) { error(cause) }
      finally { actionKeys.delete(key) }
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
    // Preset menu in the app's menu markup. Times are resolved when it opens, so they are never stale.
    const chooseTime = () => new Promise<number | undefined>((resolve) => {
      const now = new Date()
      const options = { hour12: uses12Hour() ? true : false }
      const lines: MenuLine[] = [
        ...presets(now).map((p): MenuLine => ({ label: p.label, hint: formatHint(p, +now, options), run: () => resolve(p.until) })),
        "separator",
        { label: "Custom…", run: () => { void openCustom((render) => ctx.dialogs.open(render), host).then(resolve) } },
      ]
      openMenu(document, { x: Math.round(window.innerWidth / 2 - 130), y: Math.round(window.innerHeight * 0.22) }, lines, { label: "Snooze until", onClose: (chosen) => { if (!chosen) resolve(undefined) } })
    })
    const snooze = async (session: { id: string; server: ServerRef }) => {
      const until = await chooseTime()
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
        closeTabs(entry.server, entry.id)
        hiddenSnoozes.add(sessionKey(entry.server, entry.id))
        ctx.toast.show({ title: "Snoozed on this device", description: `Work continues. Wakes ${formatWake(until, Date.now())} or when attention/work changes.`, actions: [{ label: "Undo", run: () => wake(entry, true) }] })
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
        hiddenSnoozes.delete(key)
        closeTabs(server.id, id)
        await refresh(server)
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
    ctx.add(Command, (): Command => ({ id: "archive", title: "Archive session", section: "session", enabled: !!currentSession(), run: async () => {
      const session = currentSession()
      if (session) await archiveAction(session.server, session.id, true)
    } }))
    ctx.add(Command, { id: "refresh", title: "Refresh archived sessions", run: () => {
      for (const id of ctx.servers.list()) { const server = ctx.servers.get(id); if (server?.connected) void refresh(server) }
    } })
    createEffect(() => {
      const tabs = ctx.tabs.list()
      for (const entry of entries()) {
        if (hiddenSnoozes.has(sessionKey(entry.server, entry.id)) && tabs.some((tab) => tab.session?.id === entry.id && tab.session.server.id === entry.server)) {
          // Opening a sleeping session through Home or Recently closed is an explicit early wake.
          wake(entry)
        }
      }
    })
    createEffect(() => {
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
        const wakeEvent = (sessionID: string, created: number) => {
          for (const entry of entries()) if (entry.server === id && created > entry.at && (entry.id === sessionID || data.session.root(sessionID) === entry.id)) wake(entry)
        }
        const off = [
          data.on("session.archived", (e) => { remove(id, e.data.sessionID); void refresh(server) }),
          data.on("session.unarchived", () => void refresh(server)),
          data.on("session.deleted", (e) => { remove(id, e.data.sessionID); void refresh(server) }),
          data.on("session.renamed", () => void refresh(server)),
          data.on("session.execution.started", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("session.execution.succeeded", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("session.execution.failed", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("session.inbox.enqueued", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("permission.asked", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("form.created", (e) => wakeEvent(e.data.form.sessionID, e.created)),
        ]
        subscriptions.set(id, { data, off })
        untrack(() => { void refresh(server); entries().filter((e) => e.server === id).forEach((e) => void reconcile(e)) })
      }
      changed()
    })
    createEffect(() => {
      revision()
      const ids = ctx.servers.list()
      const snoozes = entries().filter((entry) => ids.includes(entry.server))
      const rows = ids.flatMap((id) => (archives.get(id)?.rows ?? []).map((info) => ({
        key: sessionKey(id, info.id), title: info.title ?? "Session", detail: `${ctx.servers.get(id)?.name ?? id} · ${info.location.directory}`,
        avatar: avatarOf(id, info), action: "Restore",
        // Reading an archived session does not unarchive it; only Restore does.
        open: () => ctx.tabs.open({ server: id, id: info.id }, { focus: true }),
        run: () => { const server = ctx.servers.get(id); if (server) void archiveAction(server, info.id, false) },
        menu: [
          { label: "Restore", run: () => { const server = ctx.servers.get(id); if (server) void archiveAction(server, info.id, false) } },
          "separator" as const,
          { label: labels.delete, danger: true, run: () => { const server = ctx.servers.get(id); if (server) void deleteAction(server, info.id) } },
        ],
      })))
      const errors = ids.flatMap((id) => {
        const server = ctx.servers.get(id)
        const state = archives.get(id)
        return !server?.connected ? [`${server?.name ?? id}: offline`] : !server.compatible ? [`${server.name}: incompatible server version`] : state?.error ? [`${server.name}: ${state.error}`] : []
      })
      const complete = ids.length > 0 && ids.every((id) => archives.get(id)?.complete && ctx.servers.get(id)?.connected && ctx.servers.get(id)?.compatible)
      sidebar.update({ count: snoozes.length, rows: snoozes.map((entry) => ({
        key: sessionKey(entry.server, entry.id), title: ctx.servers.get(entry.server)?.data.session.get(entry.id)?.title ?? entry.title,
        avatar: avatarOf(entry.server, ctx.servers.get(entry.server)?.data.session.get(entry.id), entry.title), detail: `${formatWake(entry.until, Date.now())} · device-local`, action: "Wake", run: () => wake(entry, true),
        menu: [
          { label: "Wake", run: () => wake(entry, true) },
          { label: labels.archive, run: () => runAction("archive", { server: entry.server, id: entry.id }) },
          "separator" as const,
          { label: labels.delete, danger: true, run: () => runAction("delete", { server: entry.server, id: entry.id }) },
        ],
      })) }, { rows, count: complete ? rows.length : undefined, status: errors.length ? errors.join("; ") : complete ? undefined : "Loading complete archived history…" })
    })
    const tabInfo = (key: string) => {
      const session = ctx.tabs.list().find((tab) => tab.key === key)?.session
      if (!session) return
      return { target: { server: session.server.id, id: session.id }, title: session.server.data.session.get(session.id)?.title ?? "", disabled: !!session.pending }
    }
    const tabActions = createTabActions(document, host, requestAnimationFrame, cancelAnimationFrame, tabInfo, { run: runAction })
    const tabMenu = createTabMenu(document, tabInfo, { run: runAction }, labels)
    createEffect(() => {
      for (const tab of ctx.tabs.list()) tab.session?.server.data.session.get(tab.session.id)?.title
      tabActions.sync()
    })
    const recheck = () => {
      for (const entry of entries()) {
        if (entry.until <= Date.now()) wake(entry)
        else void reconcile(entry)
      }
    }
    const timer = window.setInterval(recheck, 30_000)
    // Sleep, resume and clock or time zone changes: the absolute deadline is re-read as soon as the window is back.
    const visible = () => { if (document.visibilityState !== "hidden") recheck() }
    document.addEventListener("visibilitychange", visible)
    window.addEventListener("focus", recheck)
    // Hydrated snoozes keep working even when no session tabs are open.
    for (const entry of entries()) if (entry.until <= Date.now()) wake(entry)
    return () => {
      disposed = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", visible)
      window.removeEventListener("focus", recheck)
      subscriptions.forEach((sub) => sub.off.forEach((off) => off()))
      subscriptions.clear()
      sidebar.dispose()
      tabActions.dispose()
      tabMenu.dispose()
    }
  },
})
