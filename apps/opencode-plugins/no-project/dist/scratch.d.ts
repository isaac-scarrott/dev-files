export declare const NAME = "No project";
/** Under the server's data dir (`<XDG data>/opencode`), where each scratch session gets `<uuid>/No project`. */
export declare const BASE_NAME = "no-project";
export declare const BASE_UNDER_HOME = ".local/share/opencode/no-project";
export declare const UUID: RegExp;
export declare const readme: () => Uint8Array<ArrayBuffer>;
/**
 * A fresh scratch folder for one session. The leaf is always `No project` so the host labels every one of them the
 * same; the unique part is the parent. An absolute `directory` option pins a single shared folder instead.
 */
export declare function scratchDirectory(home: string, option: unknown, id?: string): string;
/** The pinned folder from the `directory` option, if one is set. */
export declare function pinnedDirectory(option: unknown): string | undefined;
