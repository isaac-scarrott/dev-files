import { Error as ToolError } from "@opencode/plugin/promise/tool"

/**
 * Refuses a foreground wait in the shell tool. A command that sleeps, or loops with a sleep, holds the turn open until
 * it finishes and is lost with a service restart; a monitor does the same work and wakes the session instead, even after
 * a restart. The monitor runs its own commands through `spawnShell`, not the shell tool, so they never reach this.
 */

/** The host's shell tool: the only tool whose call runs a command in the foreground. */
export const SHELL_TOOL = "shell"

/** What the agent is told when the call is refused: exactly what to do instead. */
export const FOREGROUND_WAIT =
  "This is a foreground wait. Start the command with monitor.start (Code Mode: `await tools.monitor.start({command, name})`). Then either end your turn: the monitor wakes you when it prints or exits, even after a restart. Or, if you are a sub-agent, or you need the result before you can continue, call monitor.wait({id}): it blocks until the monitor prints or exits (20 minutes by default) and returns its lines. Never sleep or loop in the foreground to wait."

/** The part of a tool call the guard reads; the host's `execute.before` event has these fields and more. */
export interface ToolCall {
  readonly tool: string
  readonly input: unknown
}

const OPERATORS = new Set([";", "&", "|", "(", ")", "{", "}", "<", ">", "\n", "`"])
/** Words that keep the command position open: the next word is still a command. */
const KEYWORDS = new Set(["!", "builtin", "command", "do", "elif", "else", "env", "exec", "if", "nohup", "sudo", "then", "time", "until", "while"])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const DURATION = /^(\d+(?:\.\d+)?)([smhd]?)$/i

interface Word {
  readonly separator: boolean
  readonly text: string
}

/** A command as words and separators, with quotes resolved: a quoted argument stays one word, kept whole. */
function words(command: string): Word[] {
  const words: Word[] = []
  let index = 0
  while (index < command.length) {
    const char = command[index]!
    if (char === " " || char === "\t" || char === "\r") {
      index++
      continue
    }
    if (OPERATORS.has(char)) {
      const start = index
      while (index < command.length && OPERATORS.has(command[index]!)) index++
      words.push({ separator: true, text: command.slice(start, index) })
      continue
    }
    let text = ""
    while (index < command.length) {
      const char = command[index]!
      if (char === "'") {
        const close = command.indexOf("'", index + 1)
        text += command.slice(index + 1, close === -1 ? command.length : close)
        index = close === -1 ? command.length : close + 1
        continue
      }
      if (char === '"') {
        const close = closingQuote(command, index + 1)
        text += command.slice(index + 1, close)
        index = close + 1
        continue
      }
      if (char === "\\" && index + 1 < command.length) {
        text += command[index + 1]
        index += 2
        continue
      }
      if (char === " " || char === "\t" || char === "\r" || OPERATORS.has(char)) break
      text += char
      index++
    }
    words.push({ separator: false, text })
  }
  return words
}

/** The index of the `"` that ends the string starting at `from`, or the end of the command when it never closes. */
function closingQuote(command: string, from: number): number {
  for (let index = from; index < command.length; index++) {
    if (command[index] === "\\") index++
    else if (command[index] === '"') return index
  }
  return command.length
}

interface Heredoc {
  readonly delimiter: string
  /** `<<-` lets the closing line be indented with tabs. */
  readonly tabs: boolean
}

/** `<<` at `at` opening a heredoc: its delimiter and the index just past it, or undefined when it is not one. */
function heredocAt(command: string, at: number): { heredoc: Heredoc; end: number } | undefined {
  let index = at + 2
  let tabs = false
  if (command[index] === "-") {
    tabs = true
    index++
  }
  while (command[index] === " " || command[index] === "\t") index++
  const quote = command[index]
  if (quote === "'" || quote === '"') {
    const close = command.indexOf(quote, index + 1)
    const end = close === -1 ? command.length : close
    const delimiter = command.slice(index + 1, end)
    return delimiter === "" ? undefined : { heredoc: { delimiter, tabs }, end: close === -1 ? command.length : close + 1 }
  }
  const start = index
  while (index < command.length && !/[\s|&;()<>]/.test(command[index]!)) index += command[index] === "\\" ? 2 : 1
  const delimiter = command.slice(start, index)
  return delimiter === "" ? undefined : { heredoc: { delimiter, tabs }, end: index }
}

/**
 * The command with heredoc bodies blanked out of the text. Everything from `<<WORD` (`<<'WORD'`, `<<"WORD"`, `<<-WORD`)
 * to the line that is WORD alone is data fed to a command's stdin, never a command of its own, so a `sleep` in it is not
 * a foreground wait: `cargo test … --nocapture` was refused three times because `sleep 0.02` appeared in the body of the
 * heredoc that wrote its helper script. `<<<` is a here-string, not a heredoc, and `<<` inside `(( … ))` is a shift.
 */
function withoutHeredocs(command: string): string {
  let out = ""
  let index = 0
  while (index < command.length) {
    const lineStart = index
    const pending: Heredoc[] = []
    let quote: string | undefined
    let arithmetic = 0
    while (index < command.length && command[index] !== "\n") {
      const char = command[index]!
      if (quote) {
        if (char === "\\" && quote === '"') index += 2
        else {
          if (char === quote) quote = undefined
          index++
        }
        continue
      }
      if (char === "'" || char === '"') {
        quote = char
        index++
        continue
      }
      if (char === "\\") {
        index += 2
        continue
      }
      // Arithmetic: `$((x << 2))` and `for ((…))` shift, they do not redirect.
      if (char === "(" && command[index + 1] === "(") {
        arithmetic++
        index += 2
        continue
      }
      if (char === ")" && command[index + 1] === ")" && arithmetic > 0) {
        arithmetic--
        index += 2
        continue
      }
      if (arithmetic === 0 && char === "<" && command[index + 1] === "<" && command[index + 2] !== "<") {
        const found = heredocAt(command, index)
        if (found) {
          pending.push(found.heredoc)
          index = found.end
          continue
        }
      }
      index++
    }
    out += command.slice(lineStart, index)
    if (index < command.length) {
      out += "\n"
      index++
    }
    // The bodies follow, in the order the line opened them; each one's closing line goes with it.
    for (const heredoc of pending) {
      while (index < command.length) {
        const newline = command.indexOf("\n", index)
        const end = newline === -1 ? command.length : newline
        const body = command.slice(index, end)
        index = newline === -1 ? command.length : newline + 1
        if ((heredoc.tabs ? body.replace(/^\t+/, "") : body) === heredoc.delimiter) break
      }
    }
  }
  return out
}

/** `/usr/bin/sleep` and `sleep` run the same program. */
const name = (word: string) => word.slice(word.lastIndexOf("/") + 1)

/** How long `sleep`'s argument lasts, or undefined when it is not a plain duration (`$DELAY`). */
function duration(argument: string): number | undefined {
  const match = DURATION.exec(argument)
  if (!match) return undefined
  const suffix = (match[2] ?? "").toLowerCase()
  const scale = suffix === "m" ? 60 : suffix === "h" ? 3600 : suffix === "d" ? 86_400 : 1
  return Number(match[1]) * scale
}

/** Whether the command would hold the turn open: a sleep of `thresholdSeconds` or longer, or a loop that sleeps. */
export function isForegroundWait(command: string, thresholdSeconds: number): boolean {
  if (thresholdSeconds <= 0) return false
  const tokens = words(withoutHeredocs(command))
  let atCommand = true
  let looping = false
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token.separator) {
      atCommand = true
      continue
    }
    if (!atCommand) continue
    const word = name(token.text)
    // `for … do … sleep …; done` polls like `while`, whatever the sleep's length. A for loop that does other work
    // (`for f in *.ts; do echo $f; done`) still passes: only a sleep inside it is refused.
    if (word === "while" || word === "until" || word === "for") looping = true
    if (ASSIGNMENT.test(token.text) || KEYWORDS.has(word)) continue
    if (word !== "sleep") {
      atCommand = false
      continue
    }
    // A polling loop is a wait whatever the sleep's length; anywhere else only a long sleep is.
    const argument = tokens.slice(index + 1).find((next) => !next.separator)
    const seconds = argument ? duration(argument.text) : undefined
    if (looping || (seconds !== undefined && seconds >= thresholdSeconds)) return true
    atCommand = false
  }
  return false
}

/** The `execute.before` hook: refuses a foreground wait in the shell tool, and nothing else. */
export function createShellGuard(thresholdSeconds: number) {
  return (event: ToolCall): void => {
    if (event.tool !== SHELL_TOOL) return
    const input = event.input as { command?: unknown; background?: unknown } | null | undefined
    // A background shell call does not hold the turn open.
    if (!input || typeof input.command !== "string" || input.background === true) return
    if (isForegroundWait(input.command, thresholdSeconds)) throw new ToolError({ message: FOREGROUND_WAIT })
  }
}
