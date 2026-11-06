// Pure spacing logic: which space a session belongs to, and the actions that change that. Everything here is plain data
// in and plain data out, so it can be tested without a host. The GUI half only renders and calls these.

export interface SpaceSession {
  server: string
  id: string
}

export interface Space {
  id: string
  name: string
  emoji: string
  accent?: string
  lastSession?: SpaceSession
}

export interface Assignment extends SpaceSession {
  space: string
  /** When it was assigned, for pruning the oldest past the cap. */
  at: number
}

export interface DraftAssignment {
  tab: string
  space: string
}

export interface State {
  version: number
  active: number
  spaces: Space[]
  assigned: Assignment[]
  drafts: DraftAssignment[]
}

export const VERSION = 1
/** Enough for a long-lived install; the oldest are dropped past this. */
export const MAX_ASSIGNED = 2000
/** Drafts are short-lived; a cap keeps the store small if a window never promotes them. */
export const MAX_DRAFTS = 50

export const ACCENTS = ["info", "success", "warning", "danger", "muted"] as const

/** The emoji a new space gets when the user does not pick one: numbered look-alikes so a row of them reads as a series. */
const DEFAULT_EMOJI = ["🌱", "🌿", "🍀", "🌼", "🪴", "🌻", "🌵", "🍃", "🌸", "🌾"]

export function firstSpaceId(state: State): string {
  return state.spaces[0]!.id
}

export function spaceOf(state: State, tab: { key?: string; session?: SpaceSession }): string {
  const draft = tab.key ? state.drafts.find((item) => item.tab === tab.key) : undefined
  if (draft) return draft.space
  const session = tab.session
  if (session) {
    const assigned = state.assigned.find((item) => item.server === session.server && item.id === session.id)
    if (assigned) return assigned.space
  }
  return firstSpaceId(state)
}

export function isActive(state: State, tab: { key?: string; session?: SpaceSession }): boolean {
  return spaceOf(state, tab) === state.spaces[clampActive(state)]!.id
}

export function clampActive(state: { active: number; spaces: Space[] }): number {
  const last = Math.max(0, state.spaces.length - 1)
  const index = Math.trunc(Number.isFinite(state.active) ? state.active : 0)
  return Math.min(Math.max(0, index), last)
}

/** One space, always: the store's initial value and the shape a failed decode falls back to. */
export function initialState(now = 0): State {
  return {
    version: VERSION,
    active: 0,
    spaces: [{ id: "sp_default", name: "Sessions", emoji: DEFAULT_EMOJI[0]! }],
    assigned: [],
    drafts: [],
  }
}

export function newSpaceId(existing: readonly Space[], random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = `sp_${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`
    if (!existing.some((space) => space.id === id)) return id
  }
  return `sp_${Date.now().toString(36)}`
}

export function addSpace(state: State, space: Space): State {
  return { ...state, spaces: [...state.spaces, space], active: state.spaces.length }
}

export function defaultEmoji(existing: readonly Space[]): string {
  const used = new Set(existing.map((space) => space.emoji))
  return DEFAULT_EMOJI.find((emoji) => !used.has(emoji)) ?? "🌱"
}

export function renameSpace(state: State, id: string, patch: { name?: string; emoji?: string; accent?: string | undefined }): State {
  return {
    ...state,
    spaces: state.spaces.map((space) =>
      space.id === id
        ? { ...space, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}), ...("accent" in patch ? { accent: patch.accent } : {}) }
        : space,
    ),
  }
}

/**
 * Deletes a space and gives its sessions to the first one, the fallback owner. The last space is never deleted: there
 * would be nothing left to hold a session. Deleting the active space makes the first one active.
 */
export function deleteSpace(state: State, id: string): State {
  if (state.spaces.length <= 1) return state
  const target = state.spaces.find((space) => space.id === id)
  if (!target) return state
  const fallback = state.spaces[0]!.id
  const spaces = state.spaces.filter((space) => space.id !== id)
  const active = state.spaces[clampActive(state)]!.id
  const index = active === id ? 0 : Math.max(0, spaces.findIndex((space) => space.id === active))
  return {
    ...state,
    spaces,
    active: index < 0 ? 0 : index,
    assigned: state.assigned.map((item) => (item.space === id ? { ...item, space: fallback } : item)),
    drafts: state.drafts.map((item) => (item.space === id ? { ...item, space: fallback } : item)),
  }
}

export function selectSpace(state: State, index: number): State {
  return { ...state, active: Math.min(Math.max(0, Math.trunc(index)), Math.max(0, state.spaces.length - 1)) }
}

export function selectSpaceId(state: State, id: string): State {
  const index = state.spaces.findIndex((space) => space.id === id)
  return index < 0 ? state : selectSpace(state, index)
}

export function moveSession(state: State, session: SpaceSession, space: string, at: number): State {
  if (!state.spaces.some((item) => item.id === space)) return state
  const rest = state.assigned.filter((item) => item.server !== session.server || item.id !== session.id)
  const next = [...rest, { ...session, space, at }]
  const capped = next.length > MAX_ASSIGNED ? next.sort((a, b) => a.at - b.at).slice(next.length - MAX_ASSIGNED) : next
  return { ...state, assigned: capped }
}

export function moveDraft(state: State, tab: string, space: string): State {
  if (!state.spaces.some((item) => item.id === space)) return state
  const rest = state.drafts.filter((item) => item.tab !== tab)
  return { ...state, drafts: [...rest, { tab, space }].slice(-MAX_DRAFTS) }
}

/** A draft tab becomes a real session tab once its first prompt is sent; its space follows it. */
export function promoteDraft(state: State, fromTab: string, session: SpaceSession, at: number): State {
  const draft = state.drafts.find((item) => item.tab === fromTab)
  const cleared = { ...state, drafts: state.drafts.filter((item) => item.tab !== fromTab) }
  return draft ? moveSession(cleared, session, draft.space, at) : cleared
}

export function forgetSession(state: State, session: SpaceSession): State {
  return { ...state, assigned: state.assigned.filter((item) => item.server !== session.server || item.id !== session.id) }
}

export function rememberLastSession(state: State, session: SpaceSession & { space: string }): State {
  return {
    ...state,
    spaces: state.spaces.map((space) => (space.id === session.space ? { ...space, lastSession: { server: session.server, id: session.id } } : space)),
  }
}

/** What is left of a decoded store after a schema change or a hand-edited value: never throws, never loses the first space. */
export function settle(state: Partial<State> | undefined): State {
  const base = initialState()
  if (!state || !Array.isArray(state.spaces) || state.spaces.length === 0) return base
  const spaces = state.spaces
    .filter((space): space is Space => !!space && typeof space.id === "string" && space.id !== "")
    .map((space, index) => ({
      id: space.id,
      name: typeof space.name === "string" && space.name.trim() !== "" ? space.name : `Space ${index + 1}`,
      emoji: typeof space.emoji === "string" && space.emoji !== "" ? space.emoji : DEFAULT_EMOJI[index % DEFAULT_EMOJI.length]!,
      ...(typeof space.accent === "string" ? { accent: space.accent } : {}),
      ...(space.lastSession && typeof space.lastSession.server === "string" && typeof space.lastSession.id === "string" ? { lastSession: space.lastSession } : {}),
    }))
  if (spaces.length === 0) return base
  const ids = new Set(spaces.map((space) => space.id))
  const assigned = (Array.isArray(state.assigned) ? state.assigned : [])
    .filter((item): item is Assignment => !!item && typeof item.server === "string" && typeof item.id === "string" && typeof item.space === "string" && ids.has(item.space))
    .map((item, index) => ({ ...item, at: Number.isFinite(item.at) ? item.at : index }))
    .slice(-MAX_ASSIGNED)
  const drafts = (Array.isArray(state.drafts) ? state.drafts : [])
    .filter((item): item is DraftAssignment => !!item && typeof item.tab === "string" && typeof item.space === "string" && ids.has(item.space))
    .slice(-MAX_DRAFTS)
  return { version: VERSION, active: clampActive({ active: state.active ?? 0, spaces }), spaces, assigned, drafts }
}

/** A tab as the host lists it: a key, whether it is routed, and its session when it has one. */
export interface TabLike {
  key: string
  active?: boolean
  session?: SpaceSession
}

/**
 * Gives every tab a space: one it already has, its startup space the first time this plugin sees a tab that was already
 * open, else the active space. Drafts that vanished are pruned, and a draft's space follows the session its tab became.
 */
export function reconcile(state: State, tabs: readonly TabLike[], startup: ReadonlySet<string>, at: number, known: Set<string>): State {
  let next = state
  const live = new Set(tabs.map((tab) => tab.key))
  const vanished = next.drafts.filter((draft) => !live.has(draft.tab))
  if (vanished.length > 0) next = { ...next, drafts: next.drafts.filter((draft) => live.has(draft.tab)) }
  const activeId = next.spaces[clampActive(next)]!.id
  for (const tab of tabs) {
    if (next.drafts.some((draft) => draft.tab === tab.key)) continue
    if (tab.session && next.assigned.some((item) => item.server === tab.session!.server && item.id === tab.session!.id)) continue
    if (tab.session && vanished.length > 0) {
      // The draft whose tab became this session: its space comes along, and the draft is consumed.
      const draft = vanished[vanished.length - 1]!
      vanished.pop()
      next = moveSession(next, tab.session, draft.space, at)
      known.add(tab.key)
      continue
    }
    const space = !known.has(tab.key) && startup.has(tab.key) ? firstSpaceId(next) : activeId
    next = tab.session ? moveSession(next, tab.session, space, at) : moveDraft(next, tab.key, space)
    known.add(tab.key)
  }
  return next
}

/** Tab keys whose rows belong to another space, and so are hidden. */
export function hiddenTabs(state: State, tabs: readonly TabLike[]): string[] {
  const activeId = state.spaces[clampActive(state)]!.id
  return tabs.filter((tab) => spaceOf(state, tab) !== activeId).map((tab) => tab.key)
}

/** Where a switch should land: the session the space last had open, if it still has one. */
export function restoreTarget(state: State, spaceId: string): SpaceSession | undefined {
  return state.spaces.find((space) => space.id === spaceId)?.lastSession
}
