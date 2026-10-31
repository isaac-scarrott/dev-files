import { Plugin } from "@opencode/plugin";
import { removeIfUnused, scratchBase, scratchId, sweep } from "./sweep.js";
const EVERY = 6 * 60 * 60 * 1000;
/** Deletes per-session scratch folders (see DESIGN.md "Cleanup"). The GUI half creates them. */
export default Plugin.define({
    id: "no-project",
    async setup(ctx) {
        const base = scratchBase();
        if (!base) {
            console.warn("no-project: no home or XDG_DATA_HOME, scratch folders will not be cleaned up");
            return;
        }
        const log = (line) => console.info(line);
        // Learned from each sweep, for deletions whose event carries no location.
        const known = new Map();
        const client = {
            session: {
                list: async (input) => {
                    const page = await ctx.session.list(input);
                    for (const item of page.data)
                        known.set(item.id, item.location.directory);
                    return page;
                },
            },
        };
        const run = () => sweep({ base, client, log }).catch((error) => console.warn("no-project: sweep skipped:", error));
        void run();
        const timer = setInterval(() => void run(), EVERY);
        timer.unref();
        const abort = new AbortController();
        void (async () => {
            for await (const event of ctx.event.subscribe({ types: ["session.deleted"], signal: abort.signal })) {
                const directory = event.location?.directory ?? known.get(event.data.sessionID);
                known.delete(event.data.sessionID);
                if (!directory || !scratchId(base, directory))
                    continue;
                await removeIfUnused({ base, client, directory, log }).catch((error) => console.warn("no-project: cleanup skipped:", error));
            }
        })().catch(() => { });
        return () => {
            clearInterval(timer);
            abort.abort();
        };
    },
});
