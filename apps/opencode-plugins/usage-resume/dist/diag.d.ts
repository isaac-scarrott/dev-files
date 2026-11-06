export declare function redact(text: string): string;
export declare function oneLine(text: string | undefined, limit?: number): string;
/** Text that reads like a usage or rate limit but did not match the detector. */
export declare const LIMIT_LIKE: RegExp;
export interface SampleDeps {
    readonly dir: string;
    readonly now: () => number;
    readonly log: (message: string) => void;
}
export declare function defaultSampleDir(): string;
/**
 * Keeps the first real error of each kind as a JSON file, redacted of tokens, so the detector can be tested against what
 * the provider really sends. Never overwrites: the first sighting is the sample.
 */
export declare class Samples {
    private readonly deps;
    private readonly saved;
    constructor(deps: SampleDeps);
    saveFirst(name: "limit-error" | "unmatched-limit-like-error", error: unknown): Promise<void>;
}
/**
 * The plugin API has no logger and the service's stderr is not kept anywhere a user can read, so every line goes both to
 * stderr and to `usage-resume.log` beside the samples. The file is rotated once at startup when it passes 1 MB.
 */
export declare function createLog(dir: string, now: () => number): (message: string) => void;
