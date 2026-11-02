import { spawn as nodeSpawn } from "node:child_process";
export const systemClock = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle),
};
// After the shell exits, a grandchild may still hold the pipes open; do not wait on it forever.
const DRAIN_MS = 300;
/** Runs `command` in the user's shell as the leader of its own process group, stdout and stderr merged. */
export const spawnShell = ({ command, cwd }, events) => {
    const shell = process.env.SHELL || "/bin/sh";
    const child = nodeSpawn(shell, ["-c", command], { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let done = false;
    const finish = (code, signal) => {
        if (done)
            return;
        done = true;
        events.exit(code, signal);
    };
    child.stdout.on("data", (chunk) => events.data(chunk));
    child.stderr.on("data", (chunk) => events.data(chunk));
    child.on("error", (error) => {
        events.data(Buffer.from(`failed to start: ${error.message}\n`));
        finish(127, null);
    });
    child.on("exit", (code, signal) => {
        const timer = setTimeout(() => finish(code, signal), DRAIN_MS);
        child.on("close", () => {
            clearTimeout(timer);
            finish(code, signal);
        });
    });
    return {
        pid: child.pid,
        kill(signal) {
            const pid = child.pid;
            if (pid === undefined)
                return;
            try {
                process.kill(-pid, signal);
            }
            catch {
                try {
                    child.kill(signal);
                }
                catch {
                    // already gone
                }
            }
        },
    };
};
//# sourceMappingURL=process.js.map