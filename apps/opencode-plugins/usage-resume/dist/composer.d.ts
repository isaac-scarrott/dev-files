export declare const MOUNT_ATTR = "data-usage-resume-toggle";
/**
 * The row of the composer that is on screen. The app keeps composers of other sessions mounted but hidden, and a draft
 * composer shows when no session is routed, so the visible one is the routed session's.
 */
export declare function visibleControls(root: ParentNode): HTMLElement | undefined;
/** The slot our button occupies: right after the model picker, in the same row, so it scrolls and truncates with it. */
export declare function placeMount(row: HTMLElement, make: () => HTMLElement): HTMLElement;
