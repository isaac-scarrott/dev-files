/** The nearest ancestor that scrolls vertically (the host timeline's viewport), or undefined. */
export function scrollerOf(el) {
    for (let node = el.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight)
            return node;
    }
    return undefined;
}
/**
 * Keeps `target` at the screen y it has now for `ms`, scrolling `scroller` to cancel whatever moves it: the timeline
 * sticks to the bottom while a row above grows, which would push the row's header up with it. A ResizeObserver on
 * `watch` runs after layout and before paint in the frame the size changed, so the correction lands in the same frame;
 * the rAF loop covers frames where the size did not. Returns a function that stops early.
 */
export function holdTop(scroller, target, watch, ms) {
    const top = target.getBoundingClientRect().top;
    const started = performance.now();
    let frame = 0;
    let done = false;
    const fix = () => {
        const drift = target.getBoundingClientRect().top - top;
        if (Math.abs(drift) > 0.01)
            scroller.scrollTop += drift;
    };
    const observer = new ResizeObserver(fix);
    observer.observe(watch);
    const stop = () => {
        if (done)
            return;
        done = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
    };
    const tick = () => {
        if (done)
            return;
        fix();
        if (performance.now() - started < ms)
            frame = requestAnimationFrame(tick);
        else
            stop();
    };
    tick();
    return stop;
}
//# sourceMappingURL=anchor.js.map