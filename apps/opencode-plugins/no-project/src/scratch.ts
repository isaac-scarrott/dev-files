export const NAME = "No project"

const README = `# No project

Sessions started with "New session without a project" run in this folder, so no repository, AGENTS.md or
project config is picked up. Every such session shares it.
`

export const readme = () => new TextEncoder().encode(README)

const join = (...parts: string[]) => parts.map((part, index) => index ? part.replace(/^\/+/, "") : part).join("/").replace(/\/{2,}/g, "/")

// The server's default location is its home; the folder sits beside "Default Project" unless the user pins one.
export function scratchDirectory(home: string, option: unknown) {
  if (typeof option === "string" && option.startsWith("/")) return option.replace(/\/+$/, "")
  return join(home.replace(/\/+$/, ""), "Documents", NAME)
}
