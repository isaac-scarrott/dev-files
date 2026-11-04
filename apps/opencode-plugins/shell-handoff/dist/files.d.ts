import type { Files } from "./tracker.js";
/** The handoff files: private to the user (0600 in a 0700 directory), replaced whole through a rename. */
export declare function diskFiles(dir: string): Files;
