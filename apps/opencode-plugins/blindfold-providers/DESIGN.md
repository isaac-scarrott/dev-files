# blindfold-providers: design spike

Status: T3 spike (2026-11-03). Research plus a throwaway prototype under `spike/`. Not a plugin yet.

Goal: agents use **1Password and Bitwarden side by side** (e.g. `personal` = 1Password, `work` = Bitwarden, or two
accounts of one kind) for passwords and one-time codes through blindfold, without values reaching the model, and fill
them into the OpenCode in-app browser. **Constraint: no biometrics.** Touch ID on this Mac is broken, so v1 must work
with master-password, service-account or API-key unlock only. App-integration prompts are optional and never
required.

## 1. Evidence

Legend: **M** = measured here, **D** = vendor docs (URL), **F** = local fixture CLI (`spike/fixture-cli/`),
**N** = not measured, needs a user step (§9). No value of any secret was printed, read or stored. Real `op` use stopped
at the user's request after the first measurements (below); everything after that is D or F.

### Host and environment

| # | What | Source | Result |
|---|---|---|---|
| E1 | Which process runs agent shells | M: `ps -o pid,ppid,comm` up the chain | `zsh` ← `opencode-cli` (ppid **1**, launchd: label `application.ai.opencode.desktop.*`). So any CLI a plugin spawns runs in the **service** process context: no TTY, launchd env plus `service.json` `env` |
| E2 | Service env | M: key names of `~/.config/opencode/service.json` `env` | PATH (incl. `/opt/homebrew/bin`), JAVA_HOME, … No `OP_*`, `BW_*`. `SSH_AUTH_SOCK` set in the agent shell |
| E3 | Blindfold fork today | read `dev-files-blind` @ 8276458 `plugin/src/server.ts` | `secrets` option maps NAME → plain value or `op://…`; `op read --no-newline [--account]` by `execFile`, 2 min timeout, retries with `my.1password.com` on "multiple accounts found". The `Redactor` rewrites **text** only (tool results, errors, messages, system, raw HTTP body). **Images are not redacted** |
| E4 | Code Mode boundary | read `server.ts` + peer session A9Y6QGrG | `get` returns the value to the running `execute` script only; the model sees what the script returns, redacted |
| E5 | Plugin sharing | read `native-ui/src/notify-contract.ts`, host-architecture §3 | separate bundles share via `globalThis[Symbol.for("opencode-plugins.<x>.v<major>")]`, looked up on every call; server plugins of one location run in one process; a changed plugin and every later one are torn down and set up again in order |

### 1Password CLI (`op`)

| # | What | Source | Result |
|---|---|---|---|
| O1 | Installed | M: `which op; op --version` | `/opt/homebrew/bin/op`, **2.30.3** |
| O2 | Accounts known to the CLI | M: `op account list` | one: `my.1password.com` (email/uuid redacted). Started a background `op daemon` (killed later) |
| O3 | App integration on | M: key names in 1Password `settings.json` | `developers.cliSharedLockState.enabled = true`, `security.authenticatedUnlock.appleTouchId = true` (hardware broken), `security.autolock.minutes = 60`; XPC relay socket present |
| O4 | `op whoami` with app integration | M | `account is not signed in` (exit 1), before and after successful app-authorised calls. Not a lock-state probe |
| O5 | App-integration call from the service, no TTY | M: `op vault list` ×2, separate shells | the 1Password **"Access Requested: Allow opencode-cli to get CLI access"** dialog appeared each time (owned by the 1Password app, names the *parent* process `opencode-cli`). #1 rc 0 after 34 s, #2 rc 0 after 12.9 s: **a second prompt for a second process** (no TTY → no reusable session). 3 vaults: Private, Shared, todoeng (names only) |
| O6 | Same, under a pseudo-TTY (`script -q /dev/null`) | M | prompt not answered: rc 1 after **60.07 s** (op's own wait; `perl alarm 25` did not stop it earlier). TTY session reuse **not measured** |
| O7 | App-integration auth model | D [app-integration-security](https://www.1password.dev/cli/app-integration-security.md) | per account; session keyed by **TTY + start time** on macOS; 10 min idle, 12 h hard; app lock revokes all; without biometrics the OS prompt asks for the **device password**; calling while the app is locked unlocks the app through the same prompt |
| O8 | SDK desktop auth | D [sdks/desktop-app-integrations](https://www.1password.dev/sdks/desktop-app-integrations.md) | per **process** + account, 10 min idle, prompt by the app (biometrics *or the 1Password account password*). A long-lived helper process would need one approval per 10 idle minutes. N: whether the JS SDK runs inside the service's Bun |
| O9 | Manual sign-in (no app) | D [sign-in-manually](https://www.1password.dev/cli/sign-in-manually.md), `op account add --help` (M) | `op account add` (address, email, Secret Key, password) then `op signin --raw` → session token; **30 min idle**; token = wrapper key in env + encrypted session on disk. Requires the app integration **off** for that invocation: `OP_BIOMETRIC_UNLOCK_ENABLED=false` (D [environment-variables](https://www.1password.dev/cli/environment-variables.md)). Docs warn other same-user processes may reach the session |
| O10 | Service accounts | D [get-started](https://www.1password.dev/service-accounts/get-started.md), [security](https://www.1password.dev/service-accounts/security.md), [rate-limits](https://www.1password.dev/service-accounts/rate-limits.md) | `OP_SERVICE_ACCOUNT_TOKEN` (`ops_…`), no prompt, no app. Vault-scoped, **immutable** permissions; **cannot** access Personal/Private/Employee or the default Shared vault → needs a dedicated vault (e.g. `Agent`). Individual/Families: **1,000 reads/h per token, 1,000 requests/day per account**; Business 10k/h, 50k/day. 429 on excess. `op service-account ratelimit` reports usage |
| O11 | Connect | D [environment-variables](https://www.1password.dev/cli/environment-variables.md) (`OP_CONNECT_HOST/TOKEN`) | needs a self-hosted Connect server: overkill for one desktop |
| O12 | Reads | M `--help` | `op read op://v/i/f` (+ `?attribute=otp` for TOTP, `?ssh-format=openssh`); `op item get --fields label=…,type=concealed`, `--otp`; `op item list` filters by vault/tag/category only: **no URL filter**, so origin matching means `op item list --format json` (item `urls`) and matching locally |
| O13 | Passkeys | D (SDK field types list `Totp`, no passkey type; no CLI passkey flag in `--help`) | **No** passkey use through CLI or SDK. 1Password passkeys need its browser extension (Chromium MV3) or the OS passkey provider |

### Bitwarden CLI (`bw`) and Secrets Manager (`bws`)

| # | What | Source | Result |
|---|---|---|---|
| B1 | Installed | M: `which bw bws` | **not installed**; no Bitwarden app. Everything below is D or F |
| B2 | Login | D [help/cli](https://bitwarden.com/help/cli/) | `bw login` (email + master password + 2FA: authenticator, email, YubiKey OTP; **not FIDO2/Duo**), `bw login --apikey` (`BW_CLIENTID`, `BW_CLIENTSECRET`), `--sso`. API key is **not** a substitute for the master password: data needs `bw unlock` |
| B3 | Unlock | D same | `bw unlock --raw --passwordenv VAR` or `--passwordfile`, stdin prompt otherwise → `BW_SESSION`. **No idle expiry**: valid until `bw lock`/`bw logout`; the layer must enforce its own auto-lock |
| B4 | Several accounts | D same | one `BITWARDENCLI_APPDATA_DIR` per account (each its own `data.json`); a work org account and a personal account run side by side |
| B5 | Biometric unlock in CLI | D [help/biometrics](https://bitwarden.com/help/biometrics/) | biometrics are for desktop app / extension / mobile only; **CLI has none**. Irrelevant here anyway |
| B6 | Reads | D same | `bw get password|username|totp|uri|item <id|search>` (one result or error), `bw list items --url <url> --search --organizationid --collectionid`; `--nointeraction`; `bw sync` pulls |
| B7 | `bw serve` | D same, [vault-management-api](https://bitwarden.com/help/vault-management-api/) | local Express server (default `localhost:8087`), blocks requests that carry an `Origin` header; `/unlock` `/lock` `/status` `/sync` plus object routes. Holds the unlocked state **in one process**: no `BW_SESSION` in env. No auth on the socket: any same-user process can call it while unlocked |
| B8 | Bot challenge | D [cli-auth-challenges](https://bitwarden.com/help/cli-auth-challenges.md) | password login may ask for the API key `client_secret` ("appears to be coming from a bot") |
| B9 | Organisations | D [help/cli](https://bitwarden.com/help/cli/) | items carry `organizationId` / `collectionIds`; filtering by org or collection gives the work scope inside one account |
| B10 | Passkeys | D (item JSON `login.fido2Credentials`, no CLI command to sign) | **No** passkey use through the CLI |
| B11 | `bws` (Secrets Manager) | D [secrets-manager-cli](https://bitwarden.com/help/secrets-manager-cli.md) | machine secrets by `BWS_ACCESS_TOKEN`, project-scoped, rate limits per IP for many sessions. No logins/TOTP: an API-key backend, not a password manager |

### What triggered the user's 1Password dialogs

O2, O4 and O5 (above) ran `op account list`, `op whoami` ×3, `op vault list` ×3 (one under `script`) from the
service context. The three `vault list` calls each raised "Allow opencode-cli to get CLI access"; the third was not
answered and timed out at 60 s. After the user's STOP no command that talks to the app or an account was run; the
`op daemon` the CLI had started (pid 78442) was killed.
