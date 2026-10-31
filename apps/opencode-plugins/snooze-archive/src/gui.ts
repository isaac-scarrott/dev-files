import { Command, Plugin, Store, Style, type ServerRef } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { createEffect, createSignal, untrack } from "solid-js"
import { loadArchive, setArchived, type ArchivedSession } from "./archive"
import { createSidebar, css } from "./sidebar"
import { customTime, presets, sessionKey, wakeReason, type Snooze } from "./snooze"

const SnoozeSchema = Schema.Struct({
  server: Schema.String, id: Schema.String, title: Schema.String,
  at: Schema.Number, until: Schema.Number, updated: Schema.Number, busy: Schema.Number,
})
const definition = Plugin.define({ stores: { snoozes: Store.global(Schema.Struct({ entries: Schema.Array(SnoozeSchema) }), { entries: [] }) } })

export default Plugin.define({
  ...definition,
  setup(ctx) {
    ctx.add(Style, css)
    const sidebar = createSidebar(document, requestAnimationFrame, cancelAnimationFrame)
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
        for (const row of rows) closeTabs(server.id, row.id)
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
    const observe = (server: ServerRef, info: ArchivedSession) => {
      const ids = [info.id, ...server.data.session.family(info.id)]
      return {
        attention: ids.some((id) => server.data.session.permission.list(id).length > 0 || (server.data.session.form.list(id)?.length ?? 0) > 0),
        updated: info.time.updated, busy: info.time.busy ?? 0, idle: info.time.idle ?? 0,
        archived: info.time.archived !== undefined,
      }
    }
    const reconcile = async (entry: Snooze, startup = false) => {
      const server = ctx.servers.get(entry.server)
      if (!server?.connected) return
      try {
        await server.data.session.sync(entry.id, { children: true })
        const info = server.data.session.get(entry.id)
        if (!info || disposed) return
        await Promise.all([entry.id, ...server.data.session.family(entry.id)].flatMap((id) => [
          server.data.session.permission.sync(id), server.data.session.form.sync(id),
        ]))
        const current = entries().find((s) => s.server === entry.server && s.id === entry.id && s.at === entry.at)
        if (!current || disposed) return
        const reason = wakeReason(current, observe(server, info), Date.now())
        if (reason) wake(current, false, reason === "archived")
        else if (startup) {
          closeTabs(entry.server, entry.id)
          hiddenSnoozes.add(sessionKey(entry.server, entry.id))
        }
      } catch (cause) { error(cause) }
    }
    const snooze = async () => {
      const session = ctx.sessions.current()
      if (!session || session.pending) return
      const choices = presets(new Date())
      const choice = await ctx.dialogs.select({
        title: "Snooze session · this device only",
        options: [...choices.map((p) => ({ title: p.label, value: String(p.until), description: new Date(p.until).toLocaleString() })),
          { title: "Custom duration or date…", value: "custom", description: "30m, 2h, 3d, or YYYY-MM-DDTHH:mm (local time)" }],
      })
      if (!choice || disposed) return
      let until = Number(choice)
      if (choice === "custom") {
        const text = await ctx.dialogs.prompt({ title: "Snooze until", description: "30m, 2h, 3d, or YYYY-MM-DDTHH:mm (local time)" })
        if (!text || disposed) return
        until = customTime(text, new Date()) ?? NaN
      }
      try {
        if (!Number.isFinite(until) || until <= Date.now()) throw new Error("Choose a future time; nonexistent DST times are not accepted.")
        const server = session.server
        await server.data.session.sync(session.id, { children: true })
        await Promise.all([session.id, ...server.data.session.family(session.id)].flatMap((id) => [
          server.data.session.permission.sync(id), server.data.session.form.sync(id),
        ]))
        const info = await server.client.session.get({ sessionID: session.id }, { signal: ctx.signal })
        if (disposed) return
        const state = observe(server, info)
        if (info.parentID) throw new Error("Snooze the parent session rather than a subagent.")
        if (state.attention) throw new Error("This session is waiting for your approval or input. Respond before snoozing.")
        if (state.archived) throw new Error("Restore this archived session before snoozing.")
        const entry: Snooze = { server: server.id, id: session.id, title: info.title ?? "Session", at: Date.now(), until, updated: info.time.updated, busy: info.time.busy ?? 0 }
        ctx.stores.snoozes.update((draft) => {
          draft.entries = [...draft.entries.filter((s) => s.server !== entry.server || s.id !== entry.id), entry]
        })
        closeTabs(entry.server, entry.id)
        hiddenSnoozes.add(sessionKey(entry.server, entry.id))
        ctx.toast.show({ title: "Snoozed on this device", description: `Work continues. Wakes ${new Date(until).toLocaleString()} or when attention/work changes.`, actions: [{ label: "Undo", run: () => wake(entry, true) }] })
      } catch (cause) { error(cause) }
    }
    ctx.add(Command, (): Command => ({ id: "snooze", title: "Snooze session…", section: "session", enabled: !!ctx.sessions.current(), run: snooze }))
    ctx.add(Command, (): Command => ({ id: "archive", title: "Archive session", section: "session", enabled: !!ctx.sessions.current(), run: async () => {
      const session = ctx.sessions.current()
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
          data.on("session.archived", (e) => { remove(id, e.data.sessionID); closeTabs(id, e.data.sessionID); void refresh(server) }),
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
        untrack(() => { void refresh(server); entries().filter((e) => e.server === id).forEach((e) => void reconcile(e, true)) })
      }
      changed()
    })
    createEffect(() => {
      revision()
      const ids = ctx.servers.list()
      const snoozes = entries().filter((entry) => ids.includes(entry.server))
      const rows = ids.flatMap((id) => (archives.get(id)?.rows ?? []).map((info) => ({
        key: sessionKey(id, info.id), title: info.title ?? "Session", detail: `${ctx.servers.get(id)?.name ?? id} · ${info.location.directory}`,
        action: "Restore", run: () => { const server = ctx.servers.get(id); if (server) void archiveAction(server, info.id, false) },
      })))
      const errors = ids.flatMap((id) => {
        const server = ctx.servers.get(id)
        const state = archives.get(id)
        return !server?.connected ? [`${server?.name ?? id}: offline`] : !server.compatible ? [`${server.name}: incompatible server version`] : state?.error ? [`${server.name}: ${state.error}`] : []
      })
      const complete = ids.length > 0 && ids.every((id) => archives.get(id)?.complete && ctx.servers.get(id)?.connected && ctx.servers.get(id)?.compatible)
      sidebar.update({ count: snoozes.length, rows: snoozes.map((entry) => ({
        key: sessionKey(entry.server, entry.id), title: ctx.servers.get(entry.server)?.data.session.get(entry.id)?.title ?? entry.title,
        detail: `${new Date(entry.until).toLocaleString()} · device-local`, action: "Wake", run: () => wake(entry, true),
      })) }, { rows, count: complete ? rows.length : undefined, status: errors.length ? errors.join("; ") : complete ? undefined : "Loading complete archived history…" })
    })
    const timer = window.setInterval(() => {
      for (const entry of entries()) {
        if (entry.until <= Date.now()) wake(entry)
        else void reconcile(entry)
      }
    }, 30_000)
    // Hydrated snoozes keep working even when no session tabs are open.
    for (const entry of entries()) if (entry.until <= Date.now()) wake(entry)
    return () => {
      disposed = true
      clearInterval(timer)
      subscriptions.forEach((sub) => sub.off.forEach((off) => off()))
      subscriptions.clear()
      sidebar.dispose()
    }
  },
})
