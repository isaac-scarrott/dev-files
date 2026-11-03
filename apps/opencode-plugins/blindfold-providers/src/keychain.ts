import { run } from "./run.js"

/** Where a service-account token rests between sessions. */
export interface TokenStore {
  get(id: string): Promise<string | undefined>
  /** False when it could not be saved (the token then lives in memory only). */
  set(id: string, token: string): Promise<boolean>
  delete(id: string): Promise<void>
}

export const memoryTokens = (): TokenStore => {
  const tokens = new Map<string, string>()
  return {
    get: async (id) => tokens.get(id),
    set: async (id, token) => !!tokens.set(id, token),
    delete: async (id) => void tokens.delete(id),
  }
}

// A token is base64url-like. Anything else would need quoting inside `security -i`, so it is not written.
const SAFE = /^[A-Za-z0-9._\-=+/]+$/

/**
 * The macOS login keychain through `security`. The token never appears in argv: the command line goes to `security -i` on
 * stdin; reading prints the token on stdout, straight to this process.
 */
export function keychainTokens(bin = "security"): TokenStore {
  const service = (id: string) => `blindfold-op-${id}`
  return {
    async get(id) {
      const result = await run(bin, ["find-generic-password", "-s", service(id), "-a", "opencode", "-w"], {})
      const token = result.stdout.replace(/\n$/, "")
      return result.code === 0 && token !== "" ? token : undefined
    },
    async set(id, token) {
      if (!SAFE.test(token)) return false
      const result = await run(bin, ["-i"], {}, `add-generic-password -U -s ${service(id)} -a opencode -w "${token}"\n`)
      return result.code === 0
    },
    async delete(id) {
      await run(bin, ["delete-generic-password", "-s", service(id), "-a", "opencode"], {})
    },
  }
}
