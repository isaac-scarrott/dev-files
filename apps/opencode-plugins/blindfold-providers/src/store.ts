import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type Provider = "1password" | "bitwarden"

/** What the settings page saves for an account. Settings only: no token, key, password or session. */
export type Stored = {
  provider: Provider
  label: string
  enabled: boolean
  allowedOrigins?: string[]
  autoLockMinutes?: number
  /** 1Password: the vault names to list. */
  vaults?: string[]
  /** Bitwarden: only items of this organisation. */
  organizationId?: string
  confirmEveryUse?: boolean
  alwaysAllowOtp?: boolean
}

/** Steps only the user can do and that cannot be detected without touching the vendor's app. */
export type Confirmed = { opAppIntegrationOff?: boolean }

export type StoreData = { version: 1; accounts: Record<string, Stored>; confirmed: Confirmed }

/** Per user, not per project: one file for every location the service serves (the plugin storage's scope is per location). */
export const defaultStoreFile = () => join(homedir(), ".config", "blindfold", "accounts.json")

const empty = (): StoreData => ({ version: 1, accounts: {}, confirmed: {} })

/** The accounts file: private to the user (0600 in a 0700 directory), replaced whole through a rename. */
export function accountStore(file: string) {
  return {
    file,
    read(): StoreData {
      try {
        const data = JSON.parse(readFileSync(file, "utf8")) as Partial<StoreData>
        if (typeof data !== "object" || data === null || typeof data.accounts !== "object" || data.accounts === null) return empty()
        return { version: 1, accounts: data.accounts as Record<string, Stored>, confirmed: typeof data.confirmed === "object" && data.confirmed !== null ? data.confirmed : {} }
      } catch {
        return empty()
      }
    },
    write(data: StoreData) {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
      const temp = `${file}.${process.pid}.tmp`
      writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 })
      chmodSync(temp, 0o600)
      renameSync(temp, file)
    },
  }
}

export type AccountStore = ReturnType<typeof accountStore>
