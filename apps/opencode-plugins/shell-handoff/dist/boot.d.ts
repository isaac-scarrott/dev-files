export declare function bootId(): string;
/** When the process with this boot id started, in epoch milliseconds; `undefined` for an id that is not ours. */
export declare function bootStart(id: string): number | undefined;
