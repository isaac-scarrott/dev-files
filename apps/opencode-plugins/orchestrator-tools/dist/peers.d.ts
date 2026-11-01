import type { SessionInfo } from "./host.js";
export declare const TAG = "cross-session-message";
export type Relation = "parent" | "child" | "sibling" | "other";
export declare const refOf: (id: string) => string;
/** `name [ref]`: the address a peer is known by. */
export declare function label(info: Pick<SessionInfo, "id" | "title">): string;
/** The text the receiver sees. Title and body are escaped so neither can close the tag or forge another sender. */
export declare function wrap(from: Pick<SessionInfo, "id" | "title">, text: string): string;
/** What the desktop plugin reads to draw the message as a peer card: set only here, so typed look-alike text stays the user's own. */
export declare function peerMetadata(from: Pick<SessionInfo, "id" | "title">, text: string): {
    peerMessage: {
        sessionID: string;
        title: string;
        ref: string;
        text: string;
    };
};
export declare function relation(me: SessionInfo, other: SessionInfo): Relation;
/** Accepts `ref`, `title`, or the whole `title [ref]` label. */
export declare function matches(info: SessionInfo, query: string): boolean;
