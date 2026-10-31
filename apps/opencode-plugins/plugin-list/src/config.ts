// A plugin's server part is turned off by a `-<name>` entry in the global config's `plugins`.
const off = (name: string) => `-${name}`

export function disabledNames(plugins: readonly unknown[]): string[] {
  return plugins.flatMap((entry) => (typeof entry === "string" && entry.startsWith("-") ? [entry.slice(1)] : []))
}

export function setEnabled(plugins: readonly unknown[], name: string, enabled: boolean): unknown[] {
  const rest = plugins.filter((entry) => entry !== off(name))
  return enabled ? rest : [...rest, off(name)]
}
