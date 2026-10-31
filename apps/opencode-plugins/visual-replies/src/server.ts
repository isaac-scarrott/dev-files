import { Plugin } from "@opencode/plugin"
import { Error as ToolError } from "@opencode/plugin/promise/tool"
import { toolDescription, toolName, system } from "./instructions"
import { createPageStore, embedImages, PublishError, validate, type PageStore } from "./pages"
import { VisualReplies } from "./rpc"

export function createTool(store: PageStore, directory: string, announce: (sessionID: string, callID: string) => Promise<void>) {
  return {
    name: toolName,
    description: toolDescription,
    input: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title shown above the page." },
        html: { type: "string", description: "The self-contained HTML page." },
        images: {
          type: "array",
          items: { type: "string" },
          description: "Local image file paths used in the HTML. Each is embedded where the same string appears.",
        },
      },
      required: ["title", "html"],
      additionalProperties: false,
    },
    execute: async (raw: unknown, context: { sessionID: string; id: string }) => {
      try {
        const input = validate(raw)
        const embedded = await embedImages(input.html, input.images, directory)
        const page = await store.put({
          sessionID: context.sessionID,
          callID: context.id,
          title: input.title,
          html: embedded.html,
        })
        await announce(page.sessionID, page.callID).catch(() => {})
        const note = embedded.unreferenced.length
          ? ` These images were not used in the HTML: ${embedded.unreferenced.join(", ")}.`
          : ""
        return {
          content: `Published "${page.title}" inline in the chat. Add at most a short text reply.${note}`,
          metadata: { title: page.title },
        }
      } catch (cause) {
        if (cause instanceof PublishError) throw new ToolError({ message: cause.message })
        throw cause
      }
    },
  }
}

export default Plugin.define({
  id: "visual-replies",
  async setup(ctx) {
    const store = createPageStore(ctx.storage as never)
    let emit: (sessionID: string, callID: string) => Promise<void> = async () => {}

    const tool = createTool(store, ctx.location.directory, (sessionID, callID) => emit(sessionID, callID))
    const tools = await ctx.tool.transform((editor) => editor.add(tool as never))

    const rpc = await ctx.rpc.register(VisualReplies, {
      get: async (input, call) => {
        const { callID } = input as { callID: string }
        const page = await store.get(callID)
        return page ?? call.error("not_found", "No visual reply for this call", { callID })
      },
      list: async (input) => ({ pages: await store.list((input as { sessionID: string }).sessionID) }),
    })
    emit = (sessionID, callID) => rpc.events.emit("published", { sessionID, callID })

    const context = await ctx.session.hook("context", (event) => {
      event.system.push({ type: "text", text: system })
    })

    const abort = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ types: ["session.deleted"], signal: abort.signal })) {
        await store.removeSession(event.data.sessionID).catch(() => {})
      }
    })().catch(() => {})

    return async () => {
      abort.abort()
      await context.dispose()
      await rpc.dispose()
      await tools.dispose()
    }
  },
})
