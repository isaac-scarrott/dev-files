import type { Asked } from "./rpc.js";
export type Pending = Asked & {
    claimed: boolean;
    formID?: string;
};
/**
 * The one pending registry of this service process. The host loads one plugin instance per directory, and every
 * instance hears every form event: a per-instance map would deliver one answer or dismissal once per instance. So the
 * map lives here, held on `globalThis`, and a delivery takes its request out before sending.
 *
 * It holds no `ctx`: the instance that handles an event calls `ctx.session.synthetic` itself, so a disposed instance
 * never leaves the registry pointing at a dead host.
 */
export interface Shared {
    readonly pending: Map<string, Pending>;
    /** The storage load happens once per process; every instance waits for the same one. */
    seed?: Promise<void>;
}
/**
 * Join this process's registry, loading it from storage on the first join. Instances that load after a request was
 * stored keep the same map, so they do not each get their own copy of it.
 */
export declare function acquire(load: () => Promise<Pending[] | undefined>): Promise<Shared>;
/** Tests get a fresh process-like view: the singleton is removed. */
export declare function resetShared(): void;
