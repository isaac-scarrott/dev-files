import { Command, createKeyed, Plugin, Store, Style, type ServerRef } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { avatarOf, createGroup, createHost, createDomHub, createSessionMenus, deleteSession, menuCss, moreLabel, moreStep, openMenu, repoLabel, groupsCss, sessionKey, setArchived, tabSession, toastError, FIRST_PAGE, isUserSend, type GroupState, type MenuLine, type Target } from "../../session-ui/src"
import { tabRowActionCss } from "../../native-ui/src"
import { iconCss } from "./icons"
import { isLocationGone } from "./location"
import { wakeReason, type Observation, type Snooze } from "./snooze"
import { openCustom, customCss } from "./custom"
import { createWokeMarks, isWoke, WOKE_LABEL, withWoke, withoutWoke } from "./woke"
import { clearNotification, notify } from "../../native-ui/src/notify-contract"
import { tabMarkCss } from "../../native-ui/src/tab-marks"
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

const OWNER = "snooze"
const ARCHIVE_LABEL = "Archive"
const DELETE_LABEL = "Delete…"

export default Plugin.define({
  ...definition,
  setup(ctx) {
    ctx.add(Style, groupsCss + iconCss + menuCss + customCss + tabMarkCss + tabRowActionCss)
    const host = createHost(ctx.ui)
    let disposed = false
    onCleanup(() => { disposed = true })
    const hub = createDomHub(document, requestAnimationFrame, cancelAnimationFrame, OWNER)
    const [snoozeLimit, setSnoozeLimit] = createSignal(FIRST_PAGE)
    const [revision, setRevision] = createSignal(0)
    const [tick, setTick] = createSignal(0)
    const [snoozedOpen, setSnoozedOpen] = createSignal(false)
    const changed = () => setRevision((n) => n + 1)
    const group = createGroup(document, host, hub, { kind: "snoozed", name: "Snoozed", toggled: (open) => setSnoozedOpen(open) })
    const subscriptions = new Map<string, { data: object; off: (() => void)[] }>()
    onCleanup(() => {
      subscriptions.forEach((sub) => sub.off.forEach((off) => off()))
      subscriptions.clear()
    })
    const actionKeys = new Set<string>()
    const hiddenSnoozes = new Set<string>()
    const entries = () => ctx.stores.snoozes.value.entries
    const wokeEntries = () => ctx.stores.woke.value.entries
    // A wake starts no turn, so it is `info`: the `notifications` plugin marks the tab when installed, else the clock below does.
    const wokeKey = (server: string, id: string) => `${OWNER}:woke:${server}/${id}`
    const markWoke = (server: string, id: string) => {
      ctx.stores.woke.update((draft) => { draft.entries = withWoke(draft.entries, server, id) })
      notify(ctx, { kind: "info", title: WOKE_LABEL, key: wokeKey(server, id), target: { server, session: id } })
    }
    const clearWoke = (server: string, id: string) => {
      if (isWoke(untrack(wokeEntries), server, id)) ctx.stores.woke.update((draft) => { draft.entries = withoutWoke(draft.entries, server, id) })
      clearNotification(ctx, wokeKey(server, id))
    }
    const error = (cause: unknown) => { if (!disposed) toastError(ctx, cause) }
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
    const closeTabs = (server: string, id: string) => {
      for (const tab of ctx.tabs.list()) if (tab.session?.server.id === server && tab.session.id === id) ctx.tabs.close(tab.key)
    }
    // The Snoozed row's own Archive: the native state, then the row and its clock go.
    const archiveAction = async (server: ServerRef, id: string) => {
      const key = sessionKey(server.id, id)
      if (actionKeys.has(key)) return
      actionKeys.add(key)
      try {
        await setArchived(server, id, true, ctx.signal)
        if (disposed) return
        remove(server.id, id)
        clearWoke(server.id, id)
        closeTabs(server.id, id)
      } catch (cause) { error(cause) }
      finally { actionKeys.delete(key) }
    }
    const deleteAction = async (server: ServerRef, id: string) => {
      const key = sessionKey(server.id, id)
      if (actionKeys.has(key)) return
      actionKeys.add(key)
      try {
        const removed = await deleteSession(ctx, server, id, { keep: "snooze it", done: () => {
          remove(server.id, id)
          clearWoke(server.id, id)
          hiddenSnoozes.delete(key)
          closeTabs(server.id, id)
        } })
        if (!removed) return
      } catch (cause) { error(cause) }
      finally { actionKeys.delete(key) }
    }
    const runAction = (action: "snooze" | "archive" | "delete", target: Target) => {
      const server = ctx.servers.get(target.server)
      if (!server) return
      if (action === "snooze") void snooze({ id: target.id, server })
      else if (action === "archive") void archiveAction(server, target.id)
      else void deleteAction(server, target.id)
    }
    const currentSession = () => { const s = ctx.sessions.current(); return s && !s.pending ? s : undefined }
    // Sessions whose folder is gone (see location.ts): their requests cannot be read and cannot exist.
    const goneFolders = new Set<string>()
    const syncRequests = (server: ServerRef, ids: string[]) => Promise.all(ids.flatMap((id) =>
      [server.data.session.permission.sync(id), server.data.session.form.sync(id)].map((read) =>
        Promise.resolve(read).catch((cause) => { if (!isLocationGone(cause)) throw cause; goneFolders.add(sessionKey(server.id, id)) }),
      ),
    ))
    const observe = (server: ServerRef, id: string, info: ReturnType<ServerRef["data"]["session"]["get"]>) => {
      const family = server.data.session.family(id)
      const requests = [id, ...(family ?? [])].map((sessionID) => ({
        permissions: server.data.session.permission.list(sessionID) ?? (goneFolders.has(sessionKey(server.id, sessionID)) ? [] : undefined),
        forms: server.data.session.form.list(sessionID) ?? (goneFolders.has(sessionKey(server.id, sessionID)) ? [] : undefined),
      }))
      return {
        hydrated: Array.isArray(family) && requests.every((request) => Array.isArray(request.permissions) && Array.isArray(request.forms)) && Number.isFinite(info?.time?.updated),
        attention: requests.some((request) => (request.permissions?.length ?? 0) > 0 || (request.forms?.length ?? 0) > 0),
        updated: info?.time?.updated ?? 0, busy: info?.time?.busy ?? 0, idle: info?.time?.idle ?? 0,
        archived: info?.time?.archived !== undefined,
      } satisfies Observation
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
        await syncRequests(server, [entry.id, ...(server.data.session.family(entry.id) ?? [])])
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
      openMenu(document, anchor(session), lines, { label: "Snooze until", owner: OWNER, restore: () => tabElement(session)?.querySelector<HTMLElement>("a"), onClose: (chosen) => { if (!chosen) resolve(undefined) } })
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
        await syncRequests(server, [session.id, ...(server.data.session.family(session.id) ?? [])])
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
    ctx.add(Command, (): Command => ({ id: "snooze", title: "Snooze session…", section: "session", enabled: !!currentSession(), run: () => {
      const session = currentSession()
      if (session) return snooze(session)
    } }))
    // Delete belongs to the Snoozed rows as much as to the palette; the archive plugin leaves the palette entry to this one
    // so two plugins never list the same command.
    ctx.add(Command, (): Command => ({ id: "delete", title: "Delete session…", section: "session", enabled: !!currentSession(), run: () => {
      const session = currentSession()
      if (session) return deleteAction(session.server, session.id)
    } }))
    const snoozedState = createMemo((): GroupState => {
      revision()
      tick()
      const ids = ctx.servers.list()
      const snoozes = entries().filter((entry) => ids.includes(entry.server)).sort((a, b) => a.until - b.until)
      const snoozeShown = snoozeLimit()
      const snoozeStep = moreStep(Math.min(snoozeShown, snoozes.length), snoozes.length, false)
      return { count: snoozes.length, more: snoozeStep ? { label: moreLabel(snoozeStep), run: () => setSnoozeLimit((n) => n + snoozeStep) } : undefined, rows: snoozes.slice(0, snoozeShown).map((entry) => ({
        key: sessionKey(entry.server, entry.id), title: ctx.servers.get(entry.server)?.data.session.get(entry.id)?.title ?? entry.title,
        avatar: avatarOf(ctx, entry.server, ctx.servers.get(entry.server)?.data.session.get(entry.id), entry.title), project: repoLabel(ctx, entry.server, ctx.servers.get(entry.server)?.data.session.get(entry.id), entry.title), until: formatRemaining(entry.until, Date.now()), detail: `Wakes ${formatWake(entry.until, Date.now())} (${zoneLabel(entry.until)}) · device-local`, action: "Wake", run: () => wake(entry, true),
        menu: [
          { label: "Wake", run: () => wake(entry, true) },
          { label: ARCHIVE_LABEL, run: () => runAction("archive", { server: entry.server, id: entry.id }) },
          "separator" as const,
          { label: DELETE_LABEL, danger: true, run: () => runAction("delete", { server: entry.server, id: entry.id }) },
        ],
      })) }
    })
    createKeyed(snoozedState, (state) => group.update(state))
    const menuSession = (server: ServerRef, id: string, pending = false) => {
      const info = server.data.session.get(id)
      return { target: { server: server.id, id }, disabled: pending, archived: info?.time?.archived !== undefined, subagent: !!info?.parentID }
    }
    // The Snooze submenu sits in every host session menu above Delete…, in this plugin's own marker so the archive
    // plugin's item can sit next to it in the same menu.
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
      lines(session) {
        if (session.subagent) return []
        return [{ label: "Snooze", disabled: session.disabled, submenu: () => presetLines((until) => void snooze({ id: session.target.id, server: ctx.servers.get(session.target.server)! }, until), () => void snooze({ id: session.target.id, server: ctx.servers.get(session.target.server)! }, "custom")), run() {} }]
      },
    })
    const wokeMarks = createWokeMarks(document, hub, (key) => tabSession(ctx, key)?.target, (target) => isWoke(wokeEntries(), target.server, target.id))
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
      for (const [id, sub] of subscriptions) if (!ids.has(id)) { sub.off.forEach((off) => off()); subscriptions.delete(id) }
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
        // A send of the user's own also clears the clock: it is in use again. Unarchiving on that send belongs to the
        // archive plugin, which owns the archive state.
        const userSent = (sessionID: string) => clearWoke(id, sessionID)
        const off = [
          data.on("session.archived", (e) => { remove(id, e.data.sessionID); clearWoke(id, e.data.sessionID) }),
          data.on("session.deleted", (e) => { remove(id, e.data.sessionID); clearWoke(id, e.data.sessionID) }),
          data.on("session.execution.started", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("session.execution.succeeded", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("session.execution.failed", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("session.inbox.enqueued", (e) => {
            const userSend = isUserSend(e.data.item)
            if (userSend) userSent(e.data.sessionID)
            wakeEvent(e.data.sessionID, e.created, userSend)
          }),
          data.on("permission.asked", (e) => wakeEvent(e.data.sessionID, e.created)),
          data.on("form.created", (e) => wakeEvent(e.data.form.sessionID, e.created)),
        ]
        subscriptions.set(id, { data, off })
        entries().filter((e) => e.server === id).forEach((e) => void reconcile(e))
      }
      changed()
    })
    const wokeRows = createMemo(() => ({ woke: wokeEntries(), rows: ctx.tabs.list().map((tab) => tabSession(ctx, tab.key)?.target) }))
    createKeyed(wokeRows, () => wokeMarks.sync())
  },
})
