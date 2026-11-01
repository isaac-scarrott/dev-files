/** The message metadata key `send_message` sets and the desktop card reads. Only the server side writes it. */
export declare const PEER_KEY = "peerMessage";
export type PeerMessage = {
    readonly sessionID: string;
    readonly title: string;
    readonly ref: string;
    readonly text: string;
};
/** The sender behind a user message the plugin delivered, or undefined for a message the user typed. */
export declare function peerOf(message: {
    readonly type?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
}): PeerMessage | undefined;
