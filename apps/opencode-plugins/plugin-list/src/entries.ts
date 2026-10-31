export type Part = "desktop" | "server" | "tui" | "rpc"

export interface PluginInfo {
  readonly id?: string
  readonly source: { readonly type: string; readonly target?: string; readonly path?: string }
  readonly features: { readonly server?: true; readonly tui?: true; readonly rpc?: true; readonly gui?: true }
  readonly state: { readonly status: string; readonly error?: string }
}

export interface Entry {
  readonly name: string
  readonly parts: readonly Part[]
  readonly enabled: boolean
  readonly error?: string
}

export const LABELS: Record<Part, string> = { desktop: "Desktop", server: "Server", tui: "TUI", rpc: "RPC" }

const ORDER: readonly Part[] = ["desktop", "server", "tui", "rpc"]

// Matches the label the host's own row shows for the same plugin.
function name(plugin: PluginInfo) {
  if (plugin.id) return plugin.id
  if (plugin.source.type === "package" && plugin.source.target) return plugin.source.target
  if (plugin.source.type === "local" && plugin.source.path) return plugin.source.path
  return plugin.source.type
}

// Built-ins always run and the host hides them, so they stay out of the list. A plugin turned off in the config is
// absent from the server's list, so it is added back from the names the config disables.
export function entries(plugins: readonly PluginInfo[], disabled: readonly string[] = []): Entry[] {
  const off = new Set(disabled)
  const listed = plugins.flatMap((plugin): Entry[] => {
    if (plugin.source.type === "builtin") return []
    const label = name(plugin)
    const parts = ORDER.filter((part) => plugin.features[part === "desktop" ? "gui" : part])
    const error = plugin.state.status === "failed" ? plugin.state.error?.split("\n", 1)[0] ?? "Failed" : undefined
    return [{ name: label, parts, enabled: !off.has(label), ...(error === undefined ? {} : { error }) }]
  })
  const known = new Set(listed.map((entry) => entry.name))
  return [...listed, ...disabled.filter((label) => !known.has(label)).map((label) => ({ name: label, parts: [], enabled: false }))]
}
