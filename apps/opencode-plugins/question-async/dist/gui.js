import { createKeyed, Plugin } from "@opencode/plugin/gui";
import { onCleanup } from "solid-js";
import { QuestionBackground } from "./rpc.js";
const CUSTOM = "__question_background_custom__";
export default Plugin.define({
    setup(ctx) {
        createKeyed(() => ctx.client, (client) => {
            const rpc = client.rpc(QuestionBackground);
            onCleanup(rpc.events.on("asked", (event) => {
                const asked = event.data;
                const options = { location: event.location };
                void (async () => {
                    // Diagnostic: proves this GUI half received the event at all, before touching dialogs.
                    await rpc.ack({ requestID: asked.requestID }, options).catch(() => undefined);
                    const answers = [];
                    for (const question of asked.questions) {
                        const picked = await ctx.dialogs.select({
                            title: question.question,
                            options: [
                                ...question.options.map((option) => ({ title: option.label, description: option.description, value: option.label })),
                                { title: "Type your own answer", value: CUSTOM },
                            ],
                        });
                        if (picked === undefined) {
                            await rpc.dismiss({ requestID: asked.requestID }, options);
                            return;
                        }
                        if (picked === CUSTOM) {
                            const text = await ctx.dialogs.prompt({ title: question.question });
                            if (text === undefined) {
                                await rpc.dismiss({ requestID: asked.requestID }, options);
                                return;
                            }
                            answers.push([text]);
                        }
                        else {
                            answers.push([picked]);
                        }
                    }
                    await rpc.answer({ requestID: asked.requestID, answers }, options);
                })();
            }));
        });
    },
});
