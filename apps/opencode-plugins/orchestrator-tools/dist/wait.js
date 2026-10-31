import { running } from "./scope.js";
const TERMINAL = [
    "session.execution.succeeded",
    "session.execution.failed",
    "session.execution.interrupted",
    "session.idle",
    "session.deleted",
];
const POLL_START_MS = 500;
const POLL_MAX_MS = 5_000;
const SUBSCRIPTION_GRACE_MS = 1_000;
function sleep(ms, signal) {
    return new Promise((resolve) => {
        if (signal.aborted)
            return resolve();
        const timer = setTimeout(done, ms);
        signal.addEventListener("abort", done, { once: true });
        function done() {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
        }
    });
}
export async function waitForSessions(host, sessionIDs, options) {
    const pending = new Set(sessionIDs);
    const results = new Map();
    const controller = new AbortController();
    let timedOut = false;
    const stop = () => controller.abort();
    const timer = setTimeout(() => {
        timedOut = true;
        stop();
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", stop, { once: true });
    const settle = (result) => {
        if (!pending.delete(result.sessionID))
            return;
        results.set(result.sessionID, result);
        options.onProgress?.(pending.size);
        if (options.mode === "any" || pending.size === 0)
            stop();
    };
    const check = async (sessionID) => {
        let info;
        try {
            info = await host.session.get({ sessionID });
        }
        catch {
            return { sessionID, state: "missing" };
        }
        if (running(info))
            return undefined;
        if (options.since !== undefined && (info.time.idle ?? 0) < options.since)
            return undefined;
        return { sessionID, state: "finished", outcome: info.outcome };
    };
    const events = (async () => {
        try {
            for await (const event of host.event.subscribe({ types: TERMINAL, signal: controller.signal })) {
                const sessionID = event.data.sessionID;
                if (!pending.has(sessionID))
                    continue;
                switch (event.type) {
                    case "session.deleted":
                        settle({ sessionID, state: "deleted" });
                        break;
                    case "session.execution.failed":
                        settle({ sessionID, state: "finished", outcome: "failed", reason: event.data.error.message });
                        break;
                    case "session.execution.interrupted":
                        settle({ sessionID, state: "finished", outcome: "interrupted", reason: event.data.reason });
                        break;
                    case "session.execution.succeeded":
                        settle({ sessionID, state: "finished", outcome: "succeeded" });
                        break;
                    case "session.idle": {
                        const result = await check(sessionID);
                        if (result)
                            settle(result);
                        break;
                    }
                }
            }
        }
        catch {
            // The subscription ends with the signal.
        }
    })();
    const poll = (async () => {
        let delay = POLL_START_MS;
        while (!controller.signal.aborted && pending.size > 0) {
            for (const sessionID of [...pending]) {
                if (controller.signal.aborted)
                    break;
                const result = await check(sessionID);
                if (result)
                    settle(result);
            }
            if (pending.size === 0 || controller.signal.aborted)
                break;
            await sleep(delay, controller.signal);
            delay = Math.min(delay * 2, POLL_MAX_MS);
        }
    })();
    await poll;
    stop();
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", stop);
    await Promise.race([events, new Promise((resolve) => setTimeout(resolve, SUBSCRIPTION_GRACE_MS))]);
    return {
        results: sessionIDs.map((sessionID) => results.get(sessionID) ?? { sessionID, state: "running" }),
        timedOut,
        aborted: options.signal?.aborted ?? false,
    };
}
//# sourceMappingURL=wait.js.map