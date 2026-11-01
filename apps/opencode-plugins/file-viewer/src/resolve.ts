import { parseSpan } from "./detect"
import { kindOfPath, viewerInfo, type KindInfo, type ViewerKind } from "./kinds"
import {
  caseInsensitiveByDefault,
  deniedBy,
  fold,
  isAbsolute,
  isUsableRoot,
  join,
  normalizeAbsolute,
  rootOf,
  type Platform,
} from "./policy"
import type { Candidate } from "./types"

export interface Env {
  /** The project directory. Relative paths resolve against it. */
  readonly cwd: string
  readonly home: string
  readonly platform?: Platform
  /** Allowed roots. Defaults to the project directory and the home directory. */
  readonly roots?: readonly string[]
  /** Defaults to true on macOS and Windows. */
  readonly caseInsensitive?: boolean
}

export type Stat =
  | { readonly type: "file"; readonly real?: string; readonly size?: number }
  | { readonly type: "directory" | "other" | "missing" | "denied"; readonly real?: string }

/** The only file system access the resolver needs. The server or Node implements it; tests use a fake. */
export interface FileIO {
  /** Follows symlinks. `real` is the canonical path, with every symlink resolved. */
  stat(absolute: string): Promise<Stat>
}

export type Refusal =
  | "windows-path-on-posix"
  | "unc-refused"
  | "other-user-home"
  | "unresolved-variable"
  | "outside-roots"
  | "denied-location"
  | "symlink-escape"
  | "symlink-type-mismatch"
  | "not-found"
  | "permission-denied"
  | "is-directory"
  | "not-a-file"
  | "unsupported-type"
  | "too-large"
  | "invalid"
  | "no-usable-root"

export interface Resolved {
  readonly ok: true
  /** The lexical absolute path that exists. */
  readonly absolute: string
  /** The canonical path after symlinks. */
  readonly real: string
  readonly kind: ViewerKind
  readonly mime: string
  readonly size?: number
  /** Which root the real path is under. */
  readonly root: string
  readonly line?: number
  readonly column?: number
  readonly endLine?: number
  readonly endColumn?: number
  readonly time?: number
  readonly page?: number
  readonly anchor?: string
}

export interface Refused {
  readonly ok: false
  readonly reason: Refusal
  readonly absolute?: string
}

export type Resolution = Resolved | Refused

const refuse = (reason: Refusal, absolute?: string): Refused => ({ ok: false, reason, ...(absolute ? { absolute } : {}) })

function platformOf(env: Env): Platform {
  return env.platform ?? "darwin"
}

/**
 * Turns the path of a candidate into an absolute lexical path, or says why it cannot be one. No file system access, and
 * no root check: that is `resolve`.
 */
export function lexicalPath(
  candidate: Pick<Candidate, "form" | "path" | "envVar">,
  env: Env,
): { readonly ok: true; readonly absolute: string } | Refused {
  const platform = platformOf(env)
  const path = candidate.path

  switch (candidate.form) {
    case "unc":
      return refuse("unc-refused")
    case "windows":
      return platform === "win32" ? { ok: true, absolute: normalizeAbsolute(path) } : refuse("windows-path-on-posix")
    case "tilde-user":
      return refuse("other-user-home")
    case "tilde":
      return { ok: true, absolute: join(env.home, path.slice(1)) }
    case "env": {
      const rest = path.replace(/^(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|%[A-Za-z_][A-Za-z0-9_]*%)/, "")

      if (candidate.envVar === "HOME" || candidate.envVar === "USERPROFILE") return { ok: true, absolute: join(env.home, rest) }

      if (candidate.envVar === "PWD") return { ok: true, absolute: join(env.cwd, rest) }

      return refuse("unresolved-variable")
    }
    case "absolute":
    case "file-url":
      return { ok: true, absolute: normalizeAbsolute(path) }
    default:
      return { ok: true, absolute: join(env.cwd, path) }
  }
}

/** Unicode normalization variants of a path to try, as-is first. macOS stores names the way they were written. */
function variants(path: string) {
  return [...new Set([path, path.normalize("NFC"), path.normalize("NFD")])]
}

const cache = new WeakMap<FileIO, WeakMap<Env, Promise<string[]>>>()

async function allowedRoots(env: Env, io: FileIO) {
  const byEnv = cache.get(io) ?? new WeakMap<Env, Promise<string[]>>()
  cache.set(io, byEnv)
  const known = byEnv.get(env)

  if (known) return known

  // A root can itself sit behind a symlink (`/var` on macOS), so its real path is a root too.
  const pending = (async () => {
    const declared = (env.roots ?? [env.cwd, env.home]).filter(isUsableRoot).map(normalizeAbsolute)
    const real = await Promise.all(
      declared.map(async (root) => {
        const stat = await io.stat(root).catch(() => undefined)
        return stat && stat.type === "directory" && stat.real ? normalizeAbsolute(stat.real) : undefined
      }),
    )

    return [...new Set([...declared, ...real.filter((item): item is string => !!item && isUsableRoot(item))])]
  })()

  byEnv.set(env, pending)

  return pending
}

/**
 * Decides whether a candidate names a file the viewer may open, and what kind it is.
 *
 * Order matters for safety: the lexical path is checked against the roots and the denylist before any file system call,
 * so a model-written path outside the roots is never probed. After `stat`, the real path (symlinks resolved) is checked
 * against the same rules, and its kind must match the name's, so `a.png -> notes.json` is refused.
 */
export async function resolve(candidate: Candidate, env: Env, io: FileIO): Promise<Resolution> {
  const ci = env.caseInsensitive ?? caseInsensitiveByDefault(platformOf(env))
  const roots = await allowedRoots(env, io)

  if (roots.length === 0) return refuse("no-usable-root")

  const readings = [candidate.path, ...candidate.alternatives.map((alternative) => reparse(alternative, candidate))]
    .filter((path): path is string => path !== undefined)
    .slice(0, 4)

  let first: Refused | undefined

  for (const [index, path] of readings.entries()) {
    const reading = index === 0 ? candidate : { ...candidate, path, ...formOf(path, candidate) }
    const kind = kindOfPath(path)
    const lexical = lexicalPath(reading, env)

    if (!lexical.ok) {
      first ??= lexical
      continue
    }

    if (!rootOf(lexical.absolute, roots, ci)) {
      first ??= refuse("outside-roots", lexical.absolute)
      continue
    }

    if (deniedBy(lexical.absolute, { home: env.home, caseInsensitive: ci })) {
      first ??= refuse("denied-location", lexical.absolute)
      continue
    }

    if (!kind) {
      first ??= refuse("unsupported-type", lexical.absolute)
      continue
    }

    for (const variant of variants(lexical.absolute)) {
      const stat = await io.stat(variant)

      if (stat.type === "missing") continue

      if (stat.type === "denied") return refuse("permission-denied", variant)

      if (stat.type === "directory") return refuse("is-directory", variant)

      if (stat.type !== "file") return refuse("not-a-file", variant)

      const real = normalizeAbsolute(stat.real ?? variant)
      const root = rootOf(real, roots, ci)

      if (!root) return refuse("symlink-escape", variant)

      if (deniedBy(real, { home: env.home, caseInsensitive: ci })) return refuse("denied-location", variant)

      const target = kindOfPath(real)

      if (!target || target.kind !== kind.kind) return refuse("symlink-type-mismatch", variant)

      if (kind.maxBytes !== undefined && stat.size !== undefined && stat.size > kind.maxBytes) return refuse("too-large", variant)

      return {
        ok: true,
        absolute: variant,
        real,
        kind: kind.kind,
        mime: kind.mime,
        ...(stat.size !== undefined ? { size: stat.size } : {}),
        root,
        ...(candidate.line !== undefined ? { line: candidate.line } : {}),
        ...(candidate.column !== undefined ? { column: candidate.column } : {}),
        ...(candidate.endLine !== undefined ? { endLine: candidate.endLine } : {}),
        ...(candidate.endColumn !== undefined ? { endColumn: candidate.endColumn } : {}),
        ...(candidate.time !== undefined ? { time: candidate.time } : {}),
        ...(candidate.page !== undefined ? { page: candidate.page } : {}),
        ...(candidate.anchor !== undefined ? { anchor: candidate.anchor } : {}),
      }
    }

    first ??= refuse("not-found", lexical.absolute)
  }

  return first ?? refuse("not-found")
}

/** An alternative reading is plain text; read it with the same rules, keeping only the path. */
function reparse(alternative: string, candidate: Candidate) {
  const parsed = parseSpan(alternative, { origin: "code", minConfidence: "low", quoted: candidate.quoted })

  return parsed.ok ? parsed.candidate.path : undefined
}

function formOf(path: string, fallback: Candidate) {
  const parsed = parseSpan(path, { origin: "code", minConfidence: "low", quoted: true })

  return parsed.ok ? { form: parsed.candidate.form, envVar: parsed.candidate.envVar } : { form: fallback.form, envVar: fallback.envVar }
}

export type { KindInfo }

/** Whether a name is a file the viewer would open, judged by extension alone. */
export const isViewable = (path: string) => kindOfPath(path) !== undefined

export { viewerInfo, isAbsolute, fold }
