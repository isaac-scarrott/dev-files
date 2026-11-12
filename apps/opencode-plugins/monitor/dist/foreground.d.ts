/**
 * Refuses a foreground wait in the shell tool. A command that sleeps, or loops with a sleep, holds the turn open until
 * it finishes and is lost with a service restart; a monitor does the same work and wakes the session instead, even after
 * a restart. The monitor runs its own commands through `spawnShell`, not the shell tool, so they never reach this.
 */
/** The host's shell tool: the only tool whose call runs a command in the foreground. */
export declare const SHELL_TOOL = "shell";
/** What the agent is told when the call is refused: exactly what to do instead. */
export declare const FOREGROUND_WAIT = "This is a foreground wait. Start the command with monitor.start (Code Mode: `await tools.monitor.start({command, name})`). Then either end your turn: the monitor wakes you when it prints or exits, even after a restart. Or, if you are a sub-agent, or you need the result before you can continue, call monitor.wait({id}): it blocks until the monitor prints or exits (20 minutes by default) and returns its lines. Never sleep or loop in the foreground to wait.";
/** The part of a tool call the guard reads; the host's `execute.before` event has these fields and more. */
export interface ToolCall {
    readonly tool: string;
    readonly input: unknown;
}
/** Whether the command would hold the turn open: a sleep of `thresholdSeconds` or longer, or a loop that sleeps. */
export declare function isForegroundWait(command: string, thresholdSeconds: number): boolean;
/** The `execute.before` hook: refuses a foreground wait in the shell tool, and nothing else. */
export declare function createShellGuard(thresholdSeconds: number): (event: ToolCall) => void;
