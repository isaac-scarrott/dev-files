import { execFile } from "node:child_process"
import { Error as ToolError } from "@opencode/plugin/promise/tool"
import type { LogEntry } from "./log.js"
import type { Snapshot } from "./ps.js"

/**
 * The kill guard. `pkill`, `killall` and `pgrep … | xargs kill` choose their victims by pattern, and a pattern written
 * for one session's work matches the user's terminals, other sessions' jobs and the host itself. The guard refuses the
 * call when `pgrep -f` finds a process this session does not own, and says to signal by pid instead. Unparseable calls
 * pass: a guard that guessed would block real work.
 */

export type KillKind = "pkill" | "killall" | "xargs"

export interface KillCandidate {
  readonly kind: KillKind
  readonly pattern: string
}

interface Word {
  readonly text: string
  /** The word holds `$…` or a backtick: not a pattern this guard can name. */
  readonly dynamic: boolean
}

const SEPARATOR = new Set([";", "&", "|", "\n"])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

const base = (word: string) => word.slice(word.lastIndexOf("/") + 1)

/** The command line as simple commands of plain words, quotes resolved; a substitution stays one (dynamic) word. */
export function segments(command: string): Word[][] {
  const out: Word[][] = []
  let words: Word[] = []
  let word = ""
  let dynamic = false
  /** The pending word came from quotes or an escape: its digits are not a descriptor and its `>` is text. */
  let quoted = false
  /** A redirection operator with no attached target: the next word is its target and is not an argument. */
  let dropNext = false
  let started = false
  let index = 0
  const endWord = () => {
    if (started) {
      if (dropNext) dropNext = false
      else words.push({ text: word, dynamic })
    }
    word = ""
    dynamic = false
    quoted = false
    started = false
  }
  const endSegment = () => {
    endWord()
    dropNext = false
    if (words.length > 0) out.push(words)
    words = []
  }
  /**
   * An unquoted redirection is not an argument: consume the operator and its target, attached (`2>/dev/null`, `2>&1`,
   * `1>/dev/null`) or a separate word (`> out.log`). A quoted target is consumed whole, separators included.
   */
  const skipRedirect = () => {
    if (command[index] === "&") index++
    if (command[index] === ">") {
      while (command[index] === ">") index++
      if (command[index] === "&") index++
    } else if (command[index] === "<") {
      index++
      if (command[index] === "&") index++
    }
    const target = index
    while (index < command.length) {
      const char = command[index]!
      if (char === " " || char === "\t" || char === "\r" || SEPARATOR.has(char) || char === "(" || char === ")") break
      if (char === "'" || char === '"') {
        index++
        while (index < command.length && command[index] !== char) {
          if (char === '"' && command[index] === "\\" && index + 1 < command.length) index++
          index++
        }
        index++
        continue
      }
      if (char === "\\" && index + 1 < command.length) {
        index += 2
        continue
      }
      index++
    }
    if (index === target) dropNext = true
  }
  while (index < command.length) {
    const char = command[index]!
    if (char === "'") {
      const close = command.indexOf("'", index + 1)
      const end = close === -1 ? command.length : close
      word += command.slice(index + 1, end)
      quoted = true
      started = true
      index = close === -1 ? command.length : close + 1
      continue
    }
    if (char === '"') {
      index++
      started = true
      quoted = true
      while (index < command.length && command[index] !== '"') {
        if (command[index] === "\\" && index + 1 < command.length) {
          word += command[index + 1]
          index += 2
          continue
        }
        if (command[index] === "$" || command[index] === "`") dynamic = true
        word += command[index]
        index++
      }
      index++
      continue
    }
    if (char === "\\" && index + 1 < command.length) {
      word += command[index + 1]
      quoted = true
      started = true
      index += 2
      continue
    }
    if (char === "$" || char === "`") {
      dynamic = true
      word += char
      started = true
      index++
      continue
    }
    if (char === ">" || char === "<" || (char === "&" && command[index + 1] === ">")) {
      // `2>` / `1>>` may already be the pending word: that unquoted number is the descriptor, not an argument.
      if (char !== "&" && started && !quoted && /^\d+$/.test(word)) {
        word = ""
        started = false
      } else {
        endWord()
      }
      skipRedirect()
      continue
    }
    if (char === " " || char === "\t" || char === "\r") {
      endWord()
      index++
      continue
    }
    if (SEPARATOR.has(char) || char === "(" || char === ")") {
      endSegment()
      index++
      continue
    }
    word += char
    started = true
    index++
  }
  endSegment()
  return out
}

/** The last argument that is not an option: the pattern pkill and killall take. */
function patternOf(words: readonly Word[]): string | undefined {
  const args = words.slice(1).filter((word) => !word.text.startsWith("-"))
  const last = args.at(-1)
  if (!last || last.dynamic || last.text === "") return undefined
  return last.text
}

/** Words that run the command after them: `sudo pkill foo` and `env FOO=1 pkill foo` are still a pkill. */
const WRAPPERS = new Set(["sudo", "env", "command", "nohup", "time", "exec", "builtin", "do", "then"])

/** Where the command word starts, past assignments, wrappers and the wrappers' own options. */
function commandAt(words: readonly Word[]): number {
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!
    if (ASSIGNMENT.test(word.text) || word.text.startsWith("-")) continue
    if (WRAPPERS.has(base(word.text))) continue
    return index
  }
  return -1
}

/** `pkill` / `killall` segments, and `pgrep … | xargs kill` pairs. Anything else, or anything dynamic, yields nothing. */
export function killCandidates(command: string): KillCandidate[] {
  const found: KillCandidate[] = []
  const groups = segments(command)
  for (let index = 0; index < groups.length; index++) {
    const words = groups[index]!
    const at = commandAt(words)
    if (at === -1) continue
    const first = words[at]!
    if (first.dynamic) continue
    const name = base(first.text)
    if (name === "pkill" || name === "killall") {
      const pattern = patternOf(words.slice(at))
      if (pattern !== undefined) found.push({ kind: name, pattern })
      continue
    }
    if (name === "xargs") {
      if (!words.slice(at + 1).some((word) => base(word.text) === "kill")) continue
      const previous = groups[index - 1]
      if (!previous) continue
      const source = commandAt(previous)
      if (source === -1 || base(previous[source]!.text) !== "pgrep") continue
      const pattern = patternOf(previous.slice(source))
      if (pattern !== undefined) found.push({ kind: "xargs", pattern })
    }
  }
  return found
}

/** `pgrep -f <pattern>`, the same pattern a pkill would expand. Its own misses and errors yield no pids. */
export function pgrep(pattern: string): Promise<number[]> {
  return new Promise((resolve) => {
    execFile("/bin/pgrep", ["-f", "--", pattern], { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error && (error as NodeJS.ErrnoException).code !== "1") return resolve([])
      resolve(
        stdout
          .split("\n")
          .map((line) => Number(line.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0),
      )
    })
  })
}

export interface GuardDeps {
  readonly pgrep: (pattern: string) => Promise<number[]>
  readonly snapshot: () => Promise<Snapshot | undefined>
  /** The pids this session owns, from the ledger, in that snapshot. */
  readonly tracked: (sessionID: string, snapshot: Snapshot) => ReadonlySet<number>
  readonly log: (entry: LogEntry) => void
}

export interface ToolCall {
  readonly tool: string
  readonly sessionID: string
  readonly input: unknown
}

const LIMIT = 8

/**
 * The `execute.before` hook. Refuses a kill by pattern that would reach a process the calling session does not own.
 * Runs in `dryRun` too: refusing is safe, and the pattern is dangerous whether or not this plugin would kill.
 */
export function createKillGuard(deps: GuardDeps) {
  return async (event: ToolCall): Promise<void> => {
    if (event.tool !== "shell") return
    const input = event.input as { command?: unknown } | null | undefined
    if (!input || typeof input.command !== "string") return
    const candidates = killCandidates(input.command)
    if (candidates.length === 0) return
    const snapshot = await deps.snapshot().catch(() => undefined)
    // No process table means no basis for a refusal: blocking on the guard's own failure is worse than passing.
    if (!snapshot) return
    const tracked = deps.tracked(event.sessionID, snapshot)
    const foreign = new Map<number, KillCandidate>()
    for (const candidate of candidates) {
      for (const pid of await deps.pgrep(candidate.pattern)) {
        if (pid <= 1 || pid === process.pid || tracked.has(pid)) continue
        foreign.set(pid, candidate)
      }
    }
    if (foreign.size === 0) return
    const pids = [...foreign.keys()]
    const commands = pids.map((pid) => snapshot.byPid.get(pid)?.command).filter((command): command is string => command !== undefined)
    const detail = pids.slice(0, LIMIT).map((pid, index) => (commands[index] ? `${pid} (${commands[index].slice(0, 80)})` : `${pid}`))
    const more = pids.length > LIMIT ? ` and ${pids.length - LIMIT} more` : ""
    const kinds = [...new Set([...foreign.values()].map((candidate) => (candidate.kind === "xargs" ? "pgrep | xargs kill" : candidate.kind)))].join(" / ")
    const message = [
      `${kinds} would signal ${pids.length} process${pids.length === 1 ? "" : "es"} this session does not own: ${detail.join(", ")}${more}.`,
      `Those belong to the user's terminals, another session, a monitor or the host, and are never killed here.`,
      `Signal your own by pid instead: ${pids.slice(0, LIMIT).map((pid) => `kill ${pid}`).join(" or ")} — pick the pid of the process you started, or use killall on a name only your work uses.`,
    ].join(" ")
    deps.log({ event: "guard-refused", sessionID: event.sessionID, kinds, pids, command: input.command })
    throw new ToolError({ message })
  }
}
