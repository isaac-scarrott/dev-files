/** Lexical path helpers. Pure string logic with no Node imports, so it runs in the renderer. */

/** Collapses `.`, `..` and repeated slashes. `..` above the root stays at the root. Windows drive letters are kept. */
export function normalizeAbsolute(path: string): string {
  const unified = path.replaceAll("\\", "/")
  const drive = /^([A-Za-z]:)(?=\/|$)/.exec(unified)
  const prefix = drive ? `${drive[1]!.toUpperCase()}/` : "/"
  const rest = drive ? unified.slice(drive[1]!.length) : unified
  const out: string[] = []

  for (const segment of rest.split("/")) {
    if (segment === "" || segment === ".") continue

    if (segment === "..") out.pop()
    else out.push(segment)
  }

  return prefix + out.join("/")
}

export const isAbsolute = (path: string) => path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)

export function join(base: string, relative: string) {
  return normalizeAbsolute(`${base.replaceAll("\\", "/")}/${relative}`)
}
