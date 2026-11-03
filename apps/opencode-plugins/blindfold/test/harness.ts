import { sleep } from "./expect"
import type { Plugin } from "@opencode/plugin"
import type { Info, ToolContext, ToolEditor } from "@opencode/plugin/promise/tool"
import blindfold from "../plugin/src/server"

export const SECRET = "sk-test-1234567890"
export const context = {
  sessionID: "ses_test", agent: "build", messageID: "msg_test", id: "call_test",
  progress: async () => {},
} as unknown as ToolContext

export type Handler = (input: unknown) => Promise<unknown>
export type Hook = (event: any) => unknown

export async function harness(options: Record<string, unknown> = {}, storage?: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }) {
  const tools = new Map<string, Info>()
  const hooks = new Map<string, Hook>()
  const emitted: Array<[string, Record<string, unknown>]> = []
  let handlers!: Record<string, Handler>
  let unreachable = false
  const cleanup = await blindfold.setup({
    options,
    ...(storage ? { storage } : {}),
    rpc: {
      register: async (_: unknown, value: Record<string, Handler>) => {
        handlers = value
        return { dispose: async () => {}, events: { emit: async (name: string, data: Record<string, unknown>) => {
          if (unreachable && name === "requested") throw new Error("no subscribers")
          emitted.push([name, data])
        } } }
      },
    },
    tool: {
      transform: async (transform: (editor: Pick<ToolEditor, "add" | "namespace">) => void) =>
        transform({ namespace: () => {}, add: (tool: Info) => { tools.set(tool.name, tool) } }),
      hook: async (name: string, hook: Hook) => { hooks.set(`tool.${name}`, hook) },
    },
    session: { hook: async (name: string, hook: Hook) => { hooks.set(`session.${name}`, hook) } },
    shell: { hook: async (name: string, hook: Hook) => { hooks.set(`shell.${name}`, hook) } },
    permission: { hook: async (name: string, hook: Hook) => { hooks.set(`permission.${name}`, hook) } },
  } as unknown as Plugin.Context)

  async function store(value = SECRET, name = "API_TOKEN") {
    const result = tools.get("get")!.execute({ name, reason: "Call the API" }, context)
    await sleep()
    const [, data] = emitted.filter(([event]) => event === "requested").at(-1)!
    await handlers.submit({ requestID: data.requestID, values: { [name]: value } })
    return result
  }

  return { tools, hooks, emitted, handlers: () => handlers, store, cleanup, unreachable: () => { unreachable = true } }
}

