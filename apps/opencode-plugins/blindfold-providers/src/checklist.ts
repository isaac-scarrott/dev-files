import type { AccountView, Overview, Probe, Tool } from "./rpc.js"

/** `ok` done, `todo` waiting on you, `bad` failed, `idle` not tried yet or optional. */
export type Tone = "ok" | "todo" | "bad" | "idle"
export type Step = { id: string; tone: Tone }

export const INSTALL = { "1password": "brew install --cask 1password-cli", bitwarden: "brew install bitwarden-cli" } as const

/** The tool row of a provider: found or not. */
export const toolTone = (tool: Tool | undefined): Tone => (tool === undefined ? "idle" : tool.installed ? "ok" : "bad")

const probeTone = (probe: Probe | undefined): Tone => (probe === undefined ? "idle" : probe.ok ? "ok" : "bad")

/** The steps of one account, in the order the page lists them, each with its state now. */
export function stepsOf(account: AccountView, overview: Pick<Overview, "tools" | "confirmed">): Step[] {
  const cli = { id: "cli", tone: toolTone(overview.tools[account.provider]) }
  if (account.provider === "1password") {
    return [
      cli,
      { id: "appOff", tone: overview.confirmed.opAppIntegrationOff ? "ok" : "todo" },
      { id: "token", tone: account.credential ? "ok" : "bad" },
      { id: "vault", tone: probeTone(account.test?.probe) },
      { id: "login", tone: probeTone(account.verified?.probe) },
    ]
  }
  return [
    cli,
    { id: "key", tone: account.credential ? "ok" : "bad" },
    { id: "unlock", tone: account.lock.state === "unlocked" ? "ok" : "todo" },
    { id: "collection", tone: probeTone(account.test?.probe) },
  ]
}

/** The line that explains a test result: an i18n key and its parameters. Never a value; `detail` is the CLI's scrubbed first line. */
export function probeMessage(provider: AccountView["provider"], probe: Probe, vault?: string): { key: string; params: Record<string, string> } {
  const cli = provider === "1password" ? "op" : "bw"
  const params = { cli, detail: probe.detail ?? "", vault: probe.detail ?? vault ?? "", count: String(probe.count ?? 0) }
  if (probe.ok) return { key: provider === "1password" ? "probe.ok.vault" : "probe.ok.collection", params }
  return { key: `probe.${probe.code}`, params }
}
