export declare const NAME = "No project";
/** Under the server's data dir (`<XDG data>/opencode`), where each scratch session gets `<uuid>/No project`. */
export declare const BASE_NAME = "no-project";
export declare const BASE_UNDER_HOME = ".local/share/opencode/no-project";
export declare const UUID: RegExp;
export declare const readme: () => Uint8Array<ArrayBuffer>;
/**
 * The `directory` option: undefined when unset, else an absolute path without `.` or `..` segments.
 * Throws on anything else so a typo fails the plugin at setup instead of opening sessions somewhere unintended.
 */
export declare function directoryOption(option: unknown): string | undefined;
/**
 * A fresh scratch folder for one session. The leaf is always `No project` so the host labels every one of them the
 * same; the unique part is the parent. A validated `directory` pins a single shared folder instead.
 */
export declare function scratchDirectory(home: string, pinned: string | undefined, id?: string): string;
