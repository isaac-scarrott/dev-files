export type Run = {
    code: number;
    stdout: string;
    stderr: string;
    missing: boolean;
    timedOut: boolean;
};
/**
 * Runs a CLI. Secrets reach it only through `input` (stdin) or `env`, never argv (visible in `ps`). The child gets the
 * service's environment minus every variable of the vendors' CLIs, so nothing inherited can switch on the desktop-app
 * integration or an old session; what it needs is passed in `env`.
 */
export declare function run(bin: string, args: string[], env: Record<string, string>, input?: string, signal?: AbortSignal, timeoutMs?: number): Promise<Run>;
/** The CLI's first error line, without its log prefix and without any secret it was given. Values never reach errors. */
export declare function reason(result: Run, secrets?: readonly string[]): string;
