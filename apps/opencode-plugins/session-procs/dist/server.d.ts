import { Plugin } from "@opencode/plugin";
/** The host's mark that a shell call left the foreground. 2.3.0 puts it in `result.output`; 2.2.x in `result.metadata`. */
export declare function backgroundShellID(result: unknown): string | undefined;
/**
 * The host's timestamps are Effect `DateTime.Utc` values, whose milliseconds live on `epochMilliseconds`; a plain number
 * or a Date is accepted too, and anything else is unknown.
 */
export declare const timestampMs: (value: unknown) => number | undefined;
declare const _default: Plugin.Plugin;
export default _default;
