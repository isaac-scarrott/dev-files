/**
 * Where a file may be opened from. Pure string logic: no Node imports, so it runs in the renderer.
 *
 * A path is allowed when it sits under one of the roots (the project directory and the home directory) and is not on the
 * denylist. Both checks run on the lexical path before any file system access and again on the real path after
 * symlinks are resolved.
 */

export type Platform = "darwin" | "linux" | "win32"

export interface PolicyEnv {
  readonly home: string
  readonly roots: readonly string[]
  readonly caseInsensitive: boolean
  readonly platform: Platform
}

export const caseInsensitiveByDefault = (platform: Platform) => platform === "darwin" || platform === "win32"

/** NFC, then lowercase when the file system ignores case. macOS also ignores Unicode normalization form. */
export function fold(path: string, caseInsensitive: boolean) {
  const normal = path.normalize("NFC")
  return caseInsensitive ? normal.toLowerCase() : normal
}

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

/** Whether `path` is `root` or inside it. Segment-wise: `/a/bc` is not inside `/a/b`. */
export function isWithin(root: string, path: string, caseInsensitive: boolean) {
  const base = fold(normalizeAbsolute(root), caseInsensitive).replace(/\/$/, "")
  const target = fold(normalizeAbsolute(path), caseInsensitive)

  return target === base || target.startsWith(`${base}/`)
}

/** A root of `/` or a bare drive would allow every file. */
export const isUsableRoot = (root: string) => isAbsolute(root) && !/^(?:\/|[A-Za-z]:\/?)$/.test(normalizeAbsolute(root))

export function rootOf(path: string, roots: readonly string[], caseInsensitive: boolean) {
  return roots.filter(isUsableRoot).find((root) => isWithin(root, path, caseInsensitive))
}

// Directories (relative to the home directory) that hold credentials, tokens or private data.
const homeDirectories = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".kube",
  ".docker",
  ".azure",
  ".password-store",
  ".terraform.d",
  ".config/gcloud",
  ".config/gh",
  ".config/op",
  ".config/opencode",
  ".config/git",
  ".local/share/opencode",
  ".local/state/opencode",
  ".claude/.credentials",
  ".cache/opencode",
  "Library/Keychains",
  "Library/Cookies",
  "Library/Mail",
  "Library/Messages",
  "Library/Safari",
  "Library/Containers",
  "Library/Group Containers",
  "Library/Application Support",
  "AppData",
]

// Directory names that are secret wherever they appear.
const anywhereDirectories = new Set([".ssh", ".aws", ".gnupg", ".git"])

const fileNames = new Set([
  ".npmrc",
  ".yarnrc.yml",
  ".netrc",
  "_netrc",
  ".pgpass",
  ".git-credentials",
  ".pypirc",
  ".dockercfg",
  "credentials",
  "credentials.json",
  "secrets.json",
  "secrets.yml",
  "secrets.yaml",
  "auth.json",
  "token.json",
  "tokens.json",
  "service-account.json",
  "known_hosts",
  "authorized_keys",
])

const fileSuffixes = [".pem", ".key", ".p12", ".pfx", ".keystore", ".jks", ".kdbx", ".ovpn", ".tfstate", ".tfvars", ".gpg", ".asc"]

const envExamples = new Set([".env.example", ".env.sample", ".env.template", ".env.dist", ".env.defaults"])

/** The reason a path is on the denylist, or undefined. */
export function deniedBy(path: string, env: Pick<PolicyEnv, "home" | "caseInsensitive">): string | undefined {
  const absolute = normalizeAbsolute(path)
  const ci = env.caseInsensitive
  const folded = fold(absolute, ci)
  const segments = folded.split("/").filter(Boolean)
  const name = segments.at(-1) ?? ""

  for (const directory of segments.slice(0, -1)) if (anywhereDirectories.has(directory)) return `directory:${directory}`

  const home = fold(normalizeAbsolute(env.home), ci).replace(/\/$/, "")

  if (home && (folded === home || folded.startsWith(`${home}/`))) {
    const relative = folded.slice(home.length + 1)

    for (const directory of homeDirectories) {
      const prefix = fold(directory, ci)

      if (relative === prefix || relative.startsWith(`${prefix}/`)) return `home:${directory}`
    }
  }

  if (name === ".env" || (name.startsWith(".env.") && !envExamples.has(name))) return "file:.env"

  if (/^id_(?:rsa|dsa|ecdsa|ed25519)/.test(name)) return "file:ssh-key"

  if (/^client_secret.*\.json$/.test(name) || /^service[-_]account.*\.json$/.test(name)) return "file:credentials"

  if (fileNames.has(name)) return `file:${name}`

  const suffix = fileSuffixes.find((item) => name.endsWith(item))

  if (suffix) return `file:*${suffix}`
}
