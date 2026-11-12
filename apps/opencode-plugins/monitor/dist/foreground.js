import { Error as ToolError } from "@opencode/plugin/promise/tool";
/**
 * Refuses a foreground wait in the shell tool. A command that sleeps, or loops with a sleep, holds the turn open until
 * it finishes and is lost with a service restart; a monitor does the same work and wakes the session instead, even after
 * a restart. The monitor runs its own commands through `spawnShell`, not the shell tool, so they never reach this.
 */
/** The host's shell tool: the only tool whose call runs a command in the foreground. */
export const SHELL_TOOL = "shell";
/** What the agent is told when the call is refused: exactly what to do instead. */
export const FOREGROUND_WAIT = "This is a foreground wait. Start the command with monitor.start (Code Mode: `await tools.monitor.start({command, name})`). Then either end your turn: the monitor wakes you when it prints or exits, even after a restart. Or, if you are a sub-agent, or you need the result before you can continue, call monitor.wait({id}): it blocks until the monitor prints or exits (20 minutes by default) and returns its lines. Never sleep or loop in the foreground to wait.";
const OPERATORS = new Set([";", "&", "|", "(", ")", "{", "}", "<", ">", "\n", "`"]);
/** Words that keep the command position open: the next word is still a command. */
const KEYWORDS = new Set(["!", "builtin", "command", "do", "elif", "else", "env", "exec", "if", "nohup", "sudo", "then", "time", "until", "while"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const DURATION = /^(\d+(?:\.\d+)?)([smhd]?)$/i;
/** A command as words and separators, with quotes resolved: a quoted argument stays one word, kept whole. */
function words(command) {
    const words = [];
    let index = 0;
    while (index < command.length) {
        const char = command[index];
        if (char === " " || char === "\t" || char === "\r") {
            index++;
            continue;
        }
        if (OPERATORS.has(char)) {
            const start = index;
            while (index < command.length && OPERATORS.has(command[index]))
                index++;
            words.push({ separator: true, text: command.slice(start, index) });
            continue;
        }
        let text = "";
        while (index < command.length) {
            const char = command[index];
            if (char === "'") {
                const close = command.indexOf("'", index + 1);
                text += command.slice(index + 1, close === -1 ? command.length : close);
                index = close === -1 ? command.length : close + 1;
                continue;
            }
            if (char === '"') {
                const close = closingQuote(command, index + 1);
                text += command.slice(index + 1, close);
                index = close + 1;
                continue;
            }
            if (char === "\\" && index + 1 < command.length) {
                text += command[index + 1];
                index += 2;
                continue;
            }
            if (char === " " || char === "\t" || char === "\r" || OPERATORS.has(char))
                break;
            text += char;
            index++;
        }
        words.push({ separator: false, text });
    }
    return words;
}
/** The index of the `"` that ends the string starting at `from`, or the end of the command when it never closes. */
function closingQuote(command, from) {
    for (let index = from; index < command.length; index++) {
        if (command[index] === "\\")
            index++;
        else if (command[index] === '"')
            return index;
    }
    return command.length;
}
/** `/usr/bin/sleep` and `sleep` run the same program. */
const name = (word) => word.slice(word.lastIndexOf("/") + 1);
/** How long `sleep`'s argument lasts, or undefined when it is not a plain duration (`$DELAY`). */
function duration(argument) {
    const match = DURATION.exec(argument);
    if (!match)
        return undefined;
    const suffix = (match[2] ?? "").toLowerCase();
    const scale = suffix === "m" ? 60 : suffix === "h" ? 3600 : suffix === "d" ? 86_400 : 1;
    return Number(match[1]) * scale;
}
/** Whether the command would hold the turn open: a sleep of `thresholdSeconds` or longer, or a loop that sleeps. */
export function isForegroundWait(command, thresholdSeconds) {
    if (thresholdSeconds <= 0)
        return false;
    const tokens = words(command);
    let atCommand = true;
    let looping = false;
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.separator) {
            atCommand = true;
            continue;
        }
        if (!atCommand)
            continue;
        const word = name(token.text);
        // `for … do … sleep …; done` polls like `while`, whatever the sleep's length. A for loop that does other work
        // (`for f in *.ts; do echo $f; done`) still passes: only a sleep inside it is refused.
        if (word === "while" || word === "until" || word === "for")
            looping = true;
        if (ASSIGNMENT.test(token.text) || KEYWORDS.has(word))
            continue;
        if (word !== "sleep") {
            atCommand = false;
            continue;
        }
        // A polling loop is a wait whatever the sleep's length; anywhere else only a long sleep is.
        const argument = tokens.slice(index + 1).find((next) => !next.separator);
        const seconds = argument ? duration(argument.text) : undefined;
        if (looping || (seconds !== undefined && seconds >= thresholdSeconds))
            return true;
        atCommand = false;
    }
    return false;
}
/** The `execute.before` hook: refuses a foreground wait in the shell tool, and nothing else. */
export function createShellGuard(thresholdSeconds) {
    return (event) => {
        if (event.tool !== SHELL_TOOL)
            return;
        const input = event.input;
        // A background shell call does not hold the turn open.
        if (!input || typeof input.command !== "string" || input.background === true)
            return;
        if (isForegroundWait(input.command, thresholdSeconds))
            throw new ToolError({ message: FOREGROUND_WAIT });
    };
}
//# sourceMappingURL=foreground.js.map