/** The nearest ancestor that scrolls vertically (the host timeline's viewport), or undefined. */
export declare function scrollerOf(el: Element): HTMLElement | undefined;
/**
 * Keeps `target` at the screen y it has now for `ms`, scrolling `scroller` to cancel whatever moves it: the timeline
 * sticks to the bottom while a row above grows, which would push the row's header up with it. A ResizeObserver on
 * `watch` runs after layout and before paint in the frame the size changed, so the correction lands in the same frame;
 * the rAF loop covers frames where the size did not. Returns a function that stops early.
 */
export declare function holdTop(scroller: HTMLElement, target: Element, watch: Element, ms: number): () => void;
