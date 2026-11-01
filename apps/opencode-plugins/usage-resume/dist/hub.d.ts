import type { Plugin } from "@opencode/plugin";
import { UsageSource, type UsageDeps } from "./usage.js";
type Storage = Pick<Plugin.Context["storage"], "get" | "set">;
/** A usage source whose readings and backoff schedules persist under one shared storage key. */
export declare function createUsageSource(storage: Storage, deps: UsageDeps): Promise<UsageSource>;
/**
 * The server loads this plugin once per project location, all in one process and sharing one storage. Each instance
 * would otherwise poll the usage endpoint and persist its own copy, tripling the load on an endpoint that rate-limits
 * hard. Instances share one source per auth directory and the last one out releases it.
 */
export declare function acquireUsage(storage: Storage, deps: UsageDeps): {
    source: Promise<UsageSource>;
    release(): void;
};
export {};
