/** The handlers behind the desktop row's Cancel button and the composer chip. A task belongs to the session it wakes, and only that session's row may cancel it. */
export function scheduleControl(hub) {
    return {
        active: async (input) => {
            const wanted = new Set(input.ids);
            return { ids: hub.list().jobs.filter((job) => wanted.has(job.id) && job.status === "active").map((job) => job.id) };
        },
        pending: async (input) => ({
            items: hub
                .list()
                .jobs.filter((job) => job.sessionID === input.sessionID)
                .map((job) => ({
                id: job.id,
                name: job.name,
                kind: job.kind,
                spec: job.spec,
                paused: job.status === "paused",
                nextRun: job.nextRun,
                runs: job.runs,
                ...(job.maxRuns === undefined ? {} : { maxRuns: job.maxRuns }),
            })),
        }),
        cancel: async (input) => {
            const job = hub.list().jobs.find((item) => item.id === input.id);
            if (!job || job.sessionID !== input.sessionID)
                return { cancelled: false };
            return { cancelled: (await hub.cancel(input.id)).cancelled !== undefined };
        },
    };
}
//# sourceMappingURL=control.js.map