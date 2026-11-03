import { execFile } from "node:child_process";
const TIMEOUT_MS = 30_000;
/**
 * Runs a CLI. Secrets reach it only through `input` (stdin) or `env`, never argv (visible in `ps`). The child gets the
 * service's environment minus every variable of the vendors' CLIs, so nothing inherited can switch on the desktop-app
 * integration or an old session; what it needs is passed in `env`.
 */
export function run(bin, args, env, input, signal) {
    return new Promise((resolve) => {
        const base = { ...process.env };
        for (const key of Object.keys(base))
            if (/^(OP_|BW_|BITWARDENCLI_)/.test(key))
                delete base[key];
        const child = execFile(bin, args, { env: { ...base, ...env }, timeout: TIMEOUT_MS, signal, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
            const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
            resolve({ code, stdout: String(stdout), stderr: String(stderr), missing: error?.code === "ENOENT" });
        });
        // A CLI that exits before reading its stdin must not crash the plugin.
        child.stdin?.on("error", () => undefined);
        child.stdin?.end(input ?? "");
    });
}
/** The CLI's first error line, without its log prefix and without any secret it was given. Values never reach errors. */
export function reason(result, secrets = []) {
    if (result.missing)
        return "the CLI is not installed";
    let text = (result.stderr || result.stdout).split("\n").find((line) => line.trim() !== "") ?? `exited with ${result.code}`;
    text = text.replace(/^\[ERROR\] \S+ \S+ /, "").trim();
    for (const secret of secrets)
        if (secret !== "")
            text = text.replaceAll(secret, "[REDACTED]");
    return text.slice(0, 200);
}
