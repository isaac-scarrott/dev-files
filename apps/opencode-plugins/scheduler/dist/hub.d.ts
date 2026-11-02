import type { Host, SessionInfo } from "./host.js";
import type { Options } from "./options.js";
import { Scheduler, type AddInput, type Clock } from "./scheduler.js";
/** What the tools talk to: one scheduler for the whole process, with a timer that keeps it ticking. */
export interface Hub {
    add(host: Host, caller: SessionInfo, input: AddInput): ReturnType<Scheduler["add"]>;
    list: Scheduler["list"];
    cancel: Scheduler["cancel"];
}
/**
 * The server loads this plugin once per project location, all in one process over one shared storage. Two schedulers
 * would each fire every due job and overwrite each other's state, so instances share one scheduler and one timer; any
 * live instance's host can reach every session. The last instance out stops the timer.
 */
export declare function acquire(host: Host, options: Options, clock: Clock, log: (message: string) => void): Promise<{
    hub: Hub;
    release(): void;
}>;
