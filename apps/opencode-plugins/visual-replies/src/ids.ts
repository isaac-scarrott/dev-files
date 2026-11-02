/** What the host's artifact tools leave in a session's messages, reduced to what placing a card needs. */
export interface ToolPart {
  type: string
  id: string
  name: string
  state?: {
    status?: string
    input?: Record<string, unknown>
    content?: { type?: string; text?: string }[]
    metadata?: { toolCalls?: { tool?: string; status?: string; input?: Record<string, unknown> }[] }
  }
  time?: { created?: number | string; ran?: number | string; completed?: number | string }
}

/** The host's `Artifact.Info`, as listed for a session. */
export interface ArtifactInfo {
  id: string
  title: string
  time: { created: number; updated: number }
}

/** The page a tool call carried in its own input; renders when the artifact itself is gone (the agent deleted it). */
export interface Carried {
  title: string
  html: string
}

/** One card (`create`) or compact row (`update`) under a tool row. `artifactID` is absent when it cannot be known. */
export interface Placement {
  callID: string
  kind: "card" | "update"
  artifactID?: string
  title?: string
  carried?: Carried
}

export interface Scan {
  /** Placements by the tool part (the timeline row's id) they sit under. */
  placements: Map<string, Placement[]>
  /** Tool parts that have finished and were examined, with or without a placement. */
  settled: Set<string>
}

const artifactIDPattern = /art_[A-Za-z0-9]+/g
/** Code Mode runs the host's tools as `opencode.artifact_create` inside `execute`; a direct call is `artifact_create`. */
const toolPattern = /(?:^|\.)artifact_(create|update)$/
/** The artifact is stamped by the same server clock while the call runs, so only a small allowance is needed. */
export const matchWindow = { before: 300, after: 300 } as const

const stamp = (value: unknown) => (value === undefined || value === null ? undefined : Number(value))

const textOf = (part: ToolPart) =>
  (part.state?.content ?? [])
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("\n")

/** The entry file of a files map, as the host resolves it: index.html, then index.md, then the only file. */
export function entryOf(files: unknown, entry?: unknown): string | undefined {
  if (!files || typeof files !== "object") return undefined
  const map = files as Record<string, unknown>
  if (typeof entry === "string" && typeof map[entry] === "string") return map[entry] as string
  if (typeof map["index.html"] === "string") return map["index.html"] as string
  const keys = Object.keys(map)
  const only = keys.length === 1 ? map[keys[0]!] : undefined
  return typeof only === "string" ? only : undefined
}

function carriedOf(input: Record<string, unknown> | undefined): Carried | undefined {
  if (!input) return undefined
  const html = entryOf(input.files, input.entry)
  if (html === undefined) return undefined
  return { title: typeof input.title === "string" ? input.title : "", html }
}

const titleOf = (input: Record<string, unknown> | undefined) => (typeof input?.title === "string" ? input.title : undefined)

/**
 * Maps the session's finished tool parts to cards and update rows.
 *
 * Direct parts (`artifact_create`, `artifact_update`) name their artifact in the input (update) or the result text
 * (create). Code Mode, the default, folds the call into `execute`, whose part keeps only `metadata.toolCalls`:
 * updates still carry their id; a create is matched to an id the model returned from `execute`, then to the artifact
 * the session gained while the part ran.
 */
export function mapParts(parts: readonly ToolPart[], artifacts: readonly ArtifactInfo[]): Scan {
  const placements = new Map<string, Placement[]>()
  const settled = new Set<string>()
  const done = parts.filter((part) => part.state?.status === "completed" || part.state?.status === "error")
  for (const part of done) settled.add(part.id)
  const finished = done.filter((part) => part.state?.status === "completed")
  // Ids that something names outright (a result, a returned value, an update's target) are never taken by a window match.
  const claimed = new Set<string>()
  for (const part of finished) for (const id of textOf(part).match(artifactIDPattern) ?? []) claimed.add(id)
  for (const part of finished) {
    const id = part.state?.input?.id
    if (typeof id === "string") claimed.add(id)
  }
  const started = (part: ToolPart) => stamp(part.time?.ran) ?? stamp(part.time?.created) ?? 0
  const ordered = [...finished].sort((a, b) => started(a) - started(b))
  // Pass 1 takes only artifacts created while a call ran; pass 2 lets a call that found none take one just outside its
  // window, so a near miss can never steal what belongs inside the next call.
  for (const part of ordered) {
    const found = part.name === "execute" ? fromExecute(part, artifacts, claimed, 0) : fromDirect(part)
    if (found.length) placements.set(part.id, found)
  }
  for (const part of ordered) {
    const found = placements.get(part.id)
    if (part.name !== "execute" || !found?.some((item) => item.kind === "card" && !item.artifactID)) continue
    const near = windowed(part, artifacts, claimed, matchWindow.before)
    for (const item of found) {
      if (item.kind !== "card" || item.artifactID) continue
      const artifactID = near.shift()
      if (artifactID) claimed.add(artifactID)
      item.artifactID = artifactID
    }
  }
  return { placements, settled }
}

function fromDirect(part: ToolPart): Placement[] {
  const match = toolPattern.exec(part.name)
  if (!match) return []
  const input = part.state?.input
  if (match[1] === "update") {
    const artifactID = typeof input?.id === "string" ? input.id : textOf(part).match(artifactIDPattern)?.[0]
    return [{ callID: part.id, kind: "update", artifactID, title: titleOf(input) }]
  }
  const artifactID = textOf(part).match(artifactIDPattern)?.[0]
  return [{ callID: part.id, kind: "card", artifactID, title: titleOf(input), carried: carriedOf(input) }]
}

function windowed(part: ToolPart, artifacts: readonly ArtifactInfo[], claimed: ReadonlySet<string>, margin: number) {
  const from = (stamp(part.time?.ran) ?? stamp(part.time?.created) ?? 0) - margin
  const to = (stamp(part.time?.completed) ?? Number.MAX_SAFE_INTEGER - margin) + margin
  return artifacts
    .filter((item) => !claimed.has(item.id) && item.time.created >= from && item.time.created <= to)
    .sort((a, b) => a.time.created - b.time.created)
    .map((item) => item.id)
}

function fromExecute(part: ToolPart, artifacts: readonly ArtifactInfo[], claimed: Set<string>, margin: number): Placement[] {
  const calls = (part.state?.metadata?.toolCalls ?? []).filter((call) => call.status !== "error" && toolPattern.test(call.tool ?? ""))
  if (!calls.length) return []
  const updated = new Set(
    calls.flatMap((call) => (toolPattern.exec(call.tool!)![1] === "update" && typeof call.input?.id === "string" ? [call.input.id] : [])),
  )
  const returned = [...new Set(textOf(part).match(artifactIDPattern) ?? [])].filter((id) => !updated.has(id))
  const gained = windowed(part, artifacts, new Set([...claimed, ...updated]), margin)
  const candidates = returned.length ? returned : gained
  let next = 0
  const rows = new Set<string>()
  const result: Placement[] = []
  for (const call of calls) {
    const input = call.input
    if (toolPattern.exec(call.tool!)![1] === "update") {
      const artifactID = typeof input?.id === "string" ? input.id : undefined
      if (artifactID && rows.has(artifactID)) continue
      if (artifactID) rows.add(artifactID)
      result.push({ callID: part.id, kind: "update", artifactID, title: titleOf(input) })
      continue
    }
    const artifactID = candidates[next++]
    if (artifactID) claimed.add(artifactID)
    result.push({ callID: part.id, kind: "card", artifactID, title: titleOf(input), carried: carriedOf(input) })
  }
  return result
}

/** The text of an update row: the update's own title, else the artifact's current title. */
export function rowLabel(placement: Placement, info?: { title: string }) {
  return placement.title || info?.title || ""
}
