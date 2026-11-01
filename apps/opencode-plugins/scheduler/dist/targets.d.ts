import type { Host, SessionInfo } from "./host.js";
import type { Options } from "./options.js";
export declare const refOf: (id: string) => string;
/** `name [ref]`: the address a session is known by, the same label orchestrate_list_peers shows. */
export declare function label(info: Pick<SessionInfo, "id" | "title">): string;
/** Accepts `ref`, `title`, the whole `title [ref]` label, or a full session id. */
export declare function matches(info: SessionInfo, query: string): boolean;
/** The session a task wakes: the caller by default, otherwise one found by ref, title, `title [ref]` or id within the caller's reach. */
export declare function resolveTarget(host: Host, me: SessionInfo, query: string | undefined, scope: Options["scope"]): Promise<SessionInfo>;
