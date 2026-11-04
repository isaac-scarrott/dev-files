import { type Run } from "./run.js";
/** How long a connection test waits for a CLI. A CLI that is asking the 1Password app for permission never answers. */
export declare const PROBE_MS = 15000;
export type ProbeCode = "ok" | "no_token" | "token_rejected" | "vault_not_found" | "rate_limited" | "cli_missing" | "app_prompt" | "timeout" | "locked" | "not_logged_in" | "other";
/** The outcome of a test. Counts and titles only: no value, no token, no session. */
export type Probe = {
    ok: boolean;
    code: ProbeCode;
    /** The CLI's first error line with every secret scrubbed out. */
    detail?: string;
    count?: number;
    items?: {
        id: string;
        title: string;
    }[];
};
/**
 * Names a failed CLI run. The patterns are the vendors' documented messages and are NOT measured against the real CLIs
 * (DESIGN, onboarding): an unrecognised failure is `other` and shows the CLI's own first line.
 */
export declare function classify(result: Run, secrets?: readonly string[], vault?: string): Probe;
