# blindfold-providers: design

Status: **v1 built** (2026-11-03). `src/` is the plugin; `spike/` keeps the research prototypes (fill-and-mask page driver,
evidence). Sections 1 to 5 are the spike's evidence and design, unchanged except where marked **Built**. Blindfold
reference: the fork as merged to master (648a19a), changed here as listed in §11.

## Decisions

Settled with the user (2026-11-03), in the order they shaped the build:

1. **Two packages.** `blindfold` keeps the card, the redactor, the rules, the audit trail and the settings page;
   `blindfold-providers` is a server-only plugin that registers accounts. They meet through the versioned
   `Symbol.for("opencode-plugins.blindfold.providers.v1")` registry (`contract.ts`, byte-identical copy in blindfold, a test
   in each package compares them). A third vendor is a new provider registering the same way.
2. **1Password by service account.** Default path: a token (`OP_SERVICE_ACCOUNT_TOKEN`) for a dedicated `Agent` vault, no
   biometrics, no app dialog. Every `op` call sets `OP_BIOMETRIC_UNLOCK_ENABLED=false` and the child's environment has
   every inherited `OP_*`, `BW_*` and `BITWARDENCLI_*` removed. The token is asked once in the card and kept in the login
   keychain (`security -i` on stdin, never argv). Whole-account master-password unlock is an option (`unlock:
   "masterPassword"`), documented as untested against the real CLI, not the default.
3. **Bitwarden cloud, no SSO.** `bw login --apikey` once (the card asks for the client id and secret), then the master
   password by `bw unlock --passwordenv`. `BW_SESSION` lives in memory only; the account locks itself after 10 idle minutes
   (`autoLockMinutes`, per account) with `bw lock`.
4. **Named accounts.** Work is Bitwarden and personal is 1Password in the user's setup, but an account is a configured
   name: any number of either kind. `allowedOrigins` on an account fences it.
5. **Three choices.** The inline card offers **Always allow** (a saved rule for site or name, account, item and field:
   stored in the plugin's storage, listed and revocable on the Blindfold settings page, never a value), **Allow** (once)
   and **Deny** (a denial to the agent, never a value). Two matching accounts: the card lets the user choose, and the
   choice with Always allow becomes the rule. A locked account shows "Work (Bitwarden) is locked" with masked inputs.
6. **Defaults.** Confirm every use unless a saved rule covers it. A fenced account serves only its origins, and a rule that
   names an origin keeps every other account out of it. Rules and mapping are options: `rules: [{ origin | name,
   account, ref? }]`. Tag rules are not supported (Bitwarden has no tags; see §8).
7. **Fill ships in v1** (Q1 passed, F13 below): `blindfold.fill` returns a placeholder script and the `execute.before`
   hook of `browser.evaluate` swaps it for the script that carries the value, after the call was recorded.
8. **Own actions are silent.** Approve, Always allow, Deny and unlock show their result in the card (it becomes one line)
   and never toast.

### Onboarding from Settings (2026-11-04)

Asked for: set up and manage accounts entirely from a Settings page, guided, with live status, no JSON, no restart after the first load.

1. **Own page, not a section of blindfold's.** blindfold-providers gains a GUI half: SettingsPage `blindfold-providers` ("Password managers"), a command "Password managers: set up", and an RPC (`rpc.ts`) to its own server half. Reason: the data and the CLI knowledge live here, and blindfold must stay vendor-neutral (a third vendor plugin would otherwise need blindfold to host its UI). One place for the user is kept by links: blindfold's page shows a "Set up" call to action when no account exists and "Manage accounts" otherwise; this page links back to blindfold for rules and recent use.
2. **Accounts live in `~/.config/blindfold/accounts.json`** (0600 in a 0700 directory, written through a rename), not in the plugin `storage`. Reason: the storage's scope (global or per location) could not be shown from the SDK declarations (`StorageDomain` only), the page's accounts must be one set for every project, and `ctx.storage` is also the place rules already depend on being per location (a known open question below). Settings only; no secret is ever in it. `options.accounts` still works: merged with the stored ones, **options win** on an id clash, and show on the page read-only as "from opencode.json".
3. **Live, no restart.** One manager per process (`manager.ts`, held on `globalThis` like the registry) owns the live accounts; `accounts()` is read on every use by the registry providers, which are registered once per vendor. An add, edit, disable or removal rebuilds only the account it touched (its key is its whole configuration), so another account's unlocked session survives. A reload with new options is honoured even when the new setup runs before the old cleanup (the latest attach wins).
4. **Secrets.** The service token and the Bitwarden API key (id and secret as two items) go over the RPC once into the login keychain through the existing `security -i` stdin path (`blindfold-op-<id>`, `blindfold-bw-id-<id>`, `blindfold-bw-secret-<id>`). Replies, events, the overview and the settings file carry only `credential: boolean`. The master password is typed, sent once to `bw unlock --passwordenv` and never stored. The page empties its signals before the call returns and renders masked inputs with the card's eye toggle and password-manager opt-outs. Replacing a credential drops the session opened with the old one (a bug the harness showed: the test passed with the old token).
5. **Checklist per account** (`checklist.ts`): CLI found (`which` and `--version` only), app integration off (a persisted checkbox: not detectable without calling `op`), credential saved, **Test connection** (`probe()`: non-interactive, `OP_BIOMETRIC_UNLOCK_ENABLED=false`, 15 s limit, titles and a count only), optional **Verify** (reads one password, reports ok or not). Bitwarden: CLI, API key saved, unlock, collection test. Failures are named: no token, token rejected, vault not found, rate limited, CLI missing, app prompt, timeout (read as the app's dialog), locked, not logged in; anything else shows the CLI's own first line with secrets scrubbed. These patterns are from the vendors' documented wording and the fixtures, not from a real CLI.
6. **Per account**: name, sites (chips), idle lock minutes, vaults or organisation, **confirm every use** (new: `AccountInfo.confirmEveryUse`; blindfold hides Always allow, never saves a rule for that account and ignores an older one), enable and disable, replace credential, remove with a confirm (deletes the keychain items).
7. **Help panel** with the numbered steps for the dedicated vault, why it is needed (1Password does not let a service account see Personal, Private, Employee or the default Shared vault: [service accounts, get started](https://www.1password.dev/service-accounts/get-started.md), read 2026-11-04), and buttons to the wizard `https://start.1password.com/developer-tools/infrastructure-secrets/serviceaccount/?source=dev-portal`, the Developer page `https://start.1password.com/developer-tools/active`, and Bitwarden's [personal API key page](https://bitwarden.com/help/personal-api-key) (Settings, Security, Keys, View API key; no documented deep link into the vault, so a button opens it).
8. **Not done**: the card does not show a "Connect a password manager" link when nothing is configured. The card only shows provider rows when an account could serve the field, and an unconfigured install has nothing to attach the line to without a new request field; the call to action on blindfold's page and the command cover discovery. Raise it if you want it.

Verified in the private harness (CDP 9481, service 49681, stub 49887, workspace Z): the page with no accounts, add 1Password and Bitwarden with the fixture credentials, every checklist transition, Test connection ok and each error (rate limit, app prompt, 15 s timeout, unknown vault), Verify, unlock wrong and right, lock, edits, confirm every use against a real `blindfold.get` card (Always allow hidden), disable and re-enable and removal each visible to the next `blindfold.get` without a restart, light and dark, hot reload (marker kept, no duplicate page or style). Not measured: anything against a real `op`, `bw` or the real keychain.

## Evidence added by the build

| # | What | Result |
|---|---|---|
| F13 | **Q1**, private harness (OpenCode 2.2.5), a probe plugin on `execute.before` / `execute.after`, run from a Code Mode script that calls `probe.echo` and `browser.evaluate` with a placeholder inside | (a) `execute.before` **fires for nested calls**: tool ids `probe_echo`, `browser_tabs_open`, `browser_evaluate`, with the outer `execute`'s call id. (b) It **can rewrite `input`**, and the tool runs with the rewritten input (a `browser.evaluate` of `'{{...}}'.length` returned the length of the substituted text). (c) The stored call keeps the **original**: `session_message.data` `content[0].state.metadata.toolCalls[i].input` holds the placeholder; a value built at run time and substituted by the hook was found **nowhere** under the harness root (database, WAL, log, caches). (d) `execute.after` receives the rewritten input (read only). (e) A hook that also rewrote the outer `execute` input changed what the nested calls saw but not the stored `input.code`: rewrite nested calls only |
| F14 | End to end in the real in-app browser, harness driver `harness/drive-providers.mjs` | `fill` from a 1Password fixture item filled the React test page; both fields held the value and carried the mask (computed `-webkit-text-security: disc`), the echo line was masked, OCR of a screenshot found neither value; with the page on another origin the page script refused both fields (`origin`) and the password field stayed empty; no value in the model's request, the stored messages, the service log or the audit file |

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

### Browser and fill (prototype, `spike/`)

The in-app browser was **not attached** to this subagent session (`[browser.disconnected]`), so the fill was measured in
headless **Chromium** (Chrome for Testing build 1243) over raw CDP (`spike/cdp-run.mjs`). The in-app browser is
Chromium too, and `browser.evaluate` / `browser.screenshot` map to `Runtime.evaluate` / `Page.captureScreenshot`.
Page: `spike/page/` (React 18.3.1 controlled inputs, a Google-style `input[type=email][role=combobox]`, a password
input with a Show-password toggle, a plain text input, a one-time-code input, an echo line `Signing in as <email>`,
`console.log` of the email on submit, form-urlencoded POST). Fake values only. Results: `spike/evidence/fill-results.json`.

| # | What | Result |
|---|---|---|
| F1 | Control: native-setter fill, no mask, Show password on, OCR (tesseract 5.5.1) of the screenshot | all four values read back **in full** (`s0-unmasked.png`) |
| F2 | `fillScript` (native value setter + `input`/`change`, `-webkit-text-security: disc` on a `data-blindfold-masked` attribute) on all four fields | React state equals DOM value on all four (`synced: true`), 6 to 8 ms for four fields, Google-style combobox included |
| F3 | After F2, toggle Show password (type becomes `text`), React re-renders | mask kept: password `type=text`, computed `-webkit-text-security: disc`; echo line masked by the MutationObserver |
| F4 | OCR of the masked page, two different value sets | no value found (the one "partial" hit is the 6-letter run `orkspa` in the label "Workspace", not the value) |
| F5 | Pixel test: crops of each field and of the echo line, value set A vs value set B (same lengths), PNG bytes compared | **identical** for all five crops: the image carries nothing about the value but its length |
| F6 | Origin binding: spec allows `https://accounts.google.com`, page is `http://127.0.0.1:47321` | refused (`reason: origin`), nothing filled |
| F7 | Console after submit through blindfold's own `Redactor` (master `dist/redact.js`) | redacted |
| F8 | POST body (`application/x-www-form-urlencoded`) through the same `Redactor` | email, workspace, code redacted; **password not**: form encoding (`+` for space, `%21` `%28` `%29`) differs from `encodeURIComponent`, which the Redactor knows. Add the form encoding to `encodings()` |
| F9 | `browser.fill` on Google's identifier field | peer session A9Y6QGrG: rejected (not editable per the tool); `evaluate` with the native setter worked. F2 reproduces the workaround |
| F10 | Is the input of a nested Code Mode call persisted? Probe: a marker built at run time (never in the code or the result) passed as `browser.evaluate({ script })` | **yes**: found in `opencode.db` `session_message.data` at `content[1].state.metadata.toolCalls[0].input.script` (plus WAL). A value embedded in an evaluate script lands on disk in that row unless something rewrites it |
| F11 | OCR cost as a screenshot backstop | 0.17 to 0.28 s per 900×1100 PNG (tesseract 5.5.1, 3 runs) |
| F12 | Vendor extensions in the in-app browser | **N** (reasoned, not measured). The pane is an Electron `WebContentsView` (`gui/main.d.ts` embeds). Electron loads only unpacked extensions with a subset of Chrome APIs ([electronjs.org/docs/latest/api/extensions](https://www.electronjs.org/docs/latest/api/extensions)), the vendor extensions talk to their desktop apps over native messaging, and the plugin API has no extension hook. Treat as not available |

### Fixture providers (`spike/providers.ts`, `spike/fixture-cli/`)

`node --experimental-strip-types --test spike/providers.test.ts`: **10/10 pass** (1.5 s). Covered: every account starts
locked and names its unlock methods; a wrong master password fails with the CLI's reason and no value; unlock with
no biometrics (1Password master password with `OP_BIOMETRIC_UNLOCK_ENABLED=false`, 1Password service account,
Bitwarden API key + master password via `--passwordenv`); the service account sees only its vault; origin search returns
references only even though `bw list` prints values; lookalike host and http-vs-https do not match; `op://`
references with `?attribute=otp`; routing (one holder fills, two ask with labels, remembered choice, rules exclude);
local auto-lock; vendor-side expiry clears local state; **no secret in any CLI argv** across the whole run.

## 2. Capability matrix

What each backend can do, and where the layer must paper over a difference. Not a ranking: v1 runs both together.

| | 1Password (`op` 2.30.3) | Bitwarden (`bw`) | What the layer does |
|---|---|---|---|
| Installed here | yes (M) | **no** (M) | `status()` → `unavailable: "bw not installed"` and the card falls back to typing |
| Unlock without biometrics | service-account token; manual sign-in with master password + Secret Key (`op account add` once, then `op signin`); app integration answered with the device password (D, O7) | `bw login --apikey` (or interactive `bw login` once) then master password `bw unlock` (D) | `unlock: 'serviceAccount' \| 'masterPassword' \| 'apiKey' \| 'app'`; the card asks for exactly what `status().methods` names |
| Prompt owner | app integration: the **1Password app** dialog "Allow opencode-cli…", one per process without a TTY (M, O5) | none (CLI only) | never use the app path by default: set `OP_BIOMETRIC_UNLOCK_ENABLED=false` or a service token on every `op` call |
| Session lifetime | manual: 30 min idle (D); service account: token validity; app: 10 min idle, 12 h | **no idle expiry** until `bw lock` (D, B3) | own auto-lock timer per account (default 10 min), explicit `lock()`/`signout` on expiry and dispose |
| Session carrier | `OP_SESSION_<shorthand>` env (+ encrypted file on disk, D) or `OP_SERVICE_ACCOUNT_TOKEN` | `BW_SESSION` env, or the `bw serve` process | in memory in the server plugin; given to children via env only; never argv, never disk by us |
| Several accounts side by side | `--account` per call, sessions per account | one `BITWARDENCLI_APPDATA_DIR` per account | one `Account` object per configured id |
| Work vs personal scope | vaults; service account limited to chosen vaults, never Private/Personal/Employee/default Shared (D) | organisations and collections (`--organizationid`, `--collectionid`) | account config carries the scope (vault list, organisation id) |
| Search by origin | no URL filter: list Logins (overview, **no values**), match `urls` locally | `bw list items --url` (returns **full items with values**) | `findByOrigin` returns `ItemRef` only; Bitwarden output parsed in process and dropped |
| Read | `op read op://…`, `op item get --fields label=… --reveal` | `bw get password\|username <id>` | `read(item, field)` |
| TOTP | `--otp`, `?attribute=otp` | `bw get totp <id>` | `field: "otp"` |
| Passkeys | **no** (D, O13) | **no** (D, B10) | `capabilities.passkey = false`; the agent is told to ask the user |
| SSH keys | `op read …?ssh-format=openssh`, 1Password SSH agent | SSH key item type 5 (D), desktop SSH agent | out of scope v1 |
| Write | `op item create/edit` | `bw create/edit` | `write: false` in v1 |
| Local API | none (Connect = separate server) | `bw serve` on localhost, unauthenticated socket while unlocked | not used in v1 (any same-user process could read the vault) |
| Rate limits | service accounts: 1,000 reads/h per token and **1,000 requests/day per account** on individual/Families (D) | bot challenge on password login; Secrets Manager per-IP (D) | cache `findByOrigin` per origin for the session; read values only on use |
| Audit | 1Password Activity/usage reports per service account (D) | org event logs (D) | our own audit line per use, names only |
| Self-hosted | no | yes (`bw config server`, Vaultwarden) | account config `server` |

## 3. Architecture

```text
  model ──execute──▶ Code Mode script
                       │ tools.blindfold.get({ fields, origin? })      tools.blindfold.fill({ tabID, fields })
                       ▼                                                        │
  ┌───────────────── blindfold (server half) ─────────────────────────────────┴──────────┐
  │ rules: name / origin / tag → account(s)        policy per account   audit (names only) │
  │ route() ─▶ accounts() from the registry  ─▶ status(): unlocked? locked? unavailable?   │
  │ card request (RPC event) with per-field source: "from Personal (1Password) · Google"   │
  │ Redactor: every value read or typed                                                    │
  └──────────────▲──────────────────────────────────────────┬───────────────────────────────┘
                 │ globalThis[Symbol.for("opencode-plugins.blindfold.providers.v1")]
  ┌──────────────┴──────────── blindfold-providers (server half only) ───────┐   card (blindfold GUI):
  │ OnePassword accounts (op, no app integration)   Bitwarden accounts (bw)  │   approve, choose account,
  │ sessions in module memory, auto-lock timers, env-only secrets to children│   unlock (masked master
  └──────────────────────────────────────────────────────────────────────────┘   password), or type
```

- **Two packages.** `blindfold` stays the only thing the model talks to: one card, one redactor, one audit trail.
  `blindfold-providers` is **server-only** in v1 and holds both backends (`src/onepassword.ts`, `src/bitwarden.ts`);
  the registry also accepts a separate plugin per vendor later. No GUI half is needed: the card renders provider state
  from data blindfold sends, so there is no GUI-side registry to keep in sync.
- **Registry** (`spike/contract.ts`): `registerProvider()` / `accounts()` on `globalThis` under a versioned
  `Symbol.for` key, no imports, looked up on every call, like `notify-contract.ts`. Server plugins of one location share
  a process (E5), so this works across the two packages; load order does not matter.
- **Per-location instances, one unlock.** Server plugins run per location (E5), but accounts and their sessions live in
  the provider module's scope, so unlocking Work once serves every project. Each location's registration is keyed by
  account id; blindfold de-duplicates by id.
- **Interface** (`spike/contract.ts`): `Account { id, label, kind, capabilities { otp, searchByOrigin, write, passkey,
  unlock[] }, status(), unlock(input), lock(), findByOrigin(origin), resolve(ref), read(item, field) }`,
  `LockedError`, `Rule`, `AccountPolicy`. Implemented for both vendors in `spike/providers.ts`.

### Config (blindfold options, read by blindfold)

```jsonc
"blindfold": {
  "accounts": {
    "personal": { "provider": "1password", "label": "Personal", "unlock": "masterPassword", "address": "my.1password.com", "autoLockMinutes": 10 },
    "agent":    { "provider": "1password", "label": "Agent vault", "unlock": "serviceAccount", "tokenKeychain": "blindfold-op-agent" },
    "work":     { "provider": "bitwarden", "label": "Work", "unlock": "apiKey", "appDataDir": "~/.config/blindfold/bw-work", "organizationId": "<id>", "allowedOrigins": ["*.holibob.tech", "*.holibob.com"] }
  },
  "rules": [
    { "name": "GITHUB_TOKEN", "account": "agent", "ref": "op://Agent/GitHub/token" },
    { "origin": "*.holibob.tech", "account": "work" },
    { "origin": "accounts.google.com", "account": ["personal", "work"] }
  ]
}
```

- **Specificity:** exact secret name > origin pattern > tag > none. A rule names the accounts **allowed**; an account's
  `allowedOrigins` is a second fence. Both must agree, so a work secret never fills a personal page unless both the rule
  and the work account allow that origin.
- **Several accounts hold a login for the origin** (`route()` → `ask`): the card lists them by label ("Personal
  (1Password) · Google (personal)", "Work (Bitwarden) · Google (work)"); the choice is remembered per origin for the
  service lifetime (optionally persisted as a rule the user confirms; never silently).
- **No match:** the field falls back to typing in the same card.
- The existing `secrets: { NAME: "op://…" }` option keeps working: it becomes a name rule on a default 1Password account.

### The card with providers (composition with the multi-field card)

One card per request, as today. Each field row shows its source:

| Field state | Row |
|---|---|
| Provider match, unlocked | "Password · from Personal (1Password) · Google (personal)", no input; Submit becomes **Approve** |
| Several matches | a choice of labelled accounts (radio), remembered per origin |
| Account locked | "Work (Bitwarden) is locked" + a masked **Master password** input (or service token / API key, per `methods`) and **Unlock**; on success the row turns into the provider row |
| Account unavailable / no match | the normal typed input, with a muted hint ("Bitwarden is not installed", "No Work login for this site") |
| Typed fallback chosen | the normal input ("Type it instead" link on any provider row) |

Unlock secrets travel in their own RPC method (`unlock { requestID, account, input }`) like `submit` does: never in an
event, a log, an error or a toast, and they are dropped after the CLI call. One master password unlocks every pending
field of that account.

## 4. Fill-and-mask

What the prototype proves (F2 to F6): a single in-page script fills React and Google-style controlled inputs, binds to
the page origin, and masks the field and every echo of the value **before** the next paint, so a screenshot taken later
shows discs that are pixel-identical whatever the value was. TOTP codes fill the same way.

`spike/fill.js` `fillScript(spec, value)`:

1. **Origin**: `location.origin` and `top.location.origin` must be in `spec.origins` (the item's saved origins ∩ the
   account's `allowedOrigins`). Cross-origin top or mismatch → `{ ok: false, reason: "origin" }`.
2. **Field**: by selector, or by label (aria-label, `<label>`, placeholder, name, autocomplete, id; exact then
   contains). Refuses hidden, disabled, read-only or zero-size fields.
3. **Mask first**: a stylesheet rule `[data-blindfold-masked] { -webkit-text-security: disc !important }` and the
   attribute on the field. Survives React re-renders and a Show-password toggle (F3).
4. **Fill**: focus, the prototype's `value` setter (bypasses React's value tracker), `InputEvent("input")`, `change`.
5. **Echoes**: a TreeWalker marks any element whose text contains the value, and any other input holding it; a
   `MutationObserver` repeats this for the document's lifetime (the echo line rendered after React's update was caught).
6. **Report**: `{ ok, name, origin, field: { tag, type, id, role }, filledLength, echoesMaskedNow }`, never the value.

### Where the value travels: the open problem

The value must reach the page without passing through the model **or** being written to disk. Measured (F10): any
string passed to a nested Code Mode tool call is stored in `session_message.data …metadata.toolCalls[].input`. So:

| Route | Value in agent code | Value on disk | Works today | Needs |
|---|---|---|---|---|
| **R1** agent code: `v = get()` then `browser.evaluate({ script: fillScript(spec, v) })` | yes (a prompt-injected script can `fetch` it out) | **yes** (F10), unless blindfold's `execute.after` redaction also rewrites the stored `metadata.toolCalls` (not measured) | yes | nothing, but unsafe |
| **R2** handle substitution: `blindfold.fill` returns a script with an opaque single-use handle; blindfold's `tool.hook("execute.before")` on `browser.evaluate` swaps the handle for the value-bearing script | no | depends on whether the stored input is the pre-hook form (not measured) | **N** | harness check: does `execute.before` fire for nested calls and can it rewrite `input`? (blindfold already lists `blindfold.get` as a hook tool id, which suggests nested ids reach hooks) |
| **R3** GUI/Electron: blindfold's GUI `main` runs `webContents.executeJavaScript` in the tab's contents | no | no | **N** | a way to map `tabID` to a `WebContents` (no public API: `Browser` contract offers only `attached/canOpen/open/openFile`) |
| **R4** host feature: `browser.fill({ secret: "NAME" })` resolved by the host from blindfold | no | no | no | an OpenCode change |

**Built:** R2. The handle is `"{{blindfold:fill/<32 hex>}}"`, single use, two minutes, bound to the session and the tab id
(`fill.ts`). The hook claims it only when it is the **whole** script, as one string literal: embedded in other code (an agent
that would send the swapped text somewhere) it stays inert. Typed fallback values fill the same way. R1 is not offered.

### Redaction of what the browser returns

| Channel | Today | Change |
|---|---|---|
| `evaluate` result, `snapshot`, `console`, `network.get` text | Redactor rewrites text (F7) | add form-urlencoded encoding (F8) |
| `screenshot` image | **not covered** (peer leak) | primary: the mask (F5). Backstop: `execute.after` on `browser.screenshot` OCRs the file (0.2 s, F11) and withholds the image if a registered value of length ≥ 6 appears. OCR is lossy, so it is a backstop, not the defence |
| Next page echoes the value (e.g. "Hi <email>") | not masked: the observer dies with the document | re-run the echo mask after navigation (R2/R3 can inject on `did-navigate`); until then screenshot only after a fresh mask |

## 5. Security model

- **Threats.** (1) A web page or tool output tells the agent to exfiltrate a secret (prompt injection). (2) The agent,
  confused, fills a work secret into a personal page, a lookalike or a phishing origin. (3) A value lands in a log,
  the session DB, a screenshot, argv or a crash report. (4) Another same-user process reads a session.
- **Values never in model context.** Provider values go to the page (R2/R3) or to the Code Mode script (`get`, as
  today), and every value read is registered with the Redactor. With R2/R3 a provider value never enters agent code, so
  injection cannot `fetch` it out (closes the R1 hole).
- **Origin binding.** A fill needs the page origin to match the item's saved URL (same scheme, host or subdomain of it,
  same port; lookalikes and http fail: tested) **and** the rule and the account's `allowedOrigins`. Checked twice: by
  blindfold before reading the value and by the page script before writing it (F6).
- **Confirmation.** Default `confirmEveryUse: true`: the card says "Fill PASSWORD for accounts.google.com from Personal
  (1Password) · Google (personal)?" and needs a click. Per-account option to trust an exact (name or origin) rule for
  the session. A typed instruction in chat never replaces the click.
- **Cross-account fence.** A work account fills only its `allowedOrigins`; a personal account never fills them unless a
  rule names it. A conflict always asks.
- **Secrets to CLIs.** stdin or the child's env, never argv (tested on the whole run); `OP_BIOMETRIC_UNLOCK_ENABLED=false`
  or a service token on every `op` call so the app dialog never appears; errors carry the CLI's first stderr line only.
- **Sessions.** In memory in the server process, auto-lock (default 10 min idle), `bw lock` / `op signout` on lock and
  on plugin dispose; nothing persisted by us. 1Password manual sign-in itself writes an encrypted session file (D, O9):
  prefer the service account for routine use.
- **Service account token storage.** Asked once in the card (masked), stored in the macOS login keychain without
  touching argv: the command goes to `security -i` on **stdin** (`add-generic-password -U -s blindfold-op-agent -a
  opencode -w <token>`), read back with `security find-generic-password -s blindfold-op-agent -w` (stdout to the
  provider only). N: not run (no keychain writes in this spike); check that `security -i` does not echo the line.
- **Audit.** One line per use: time, session, account id, item title, field name, origin, outcome. No values, no
  tokens. Kept in the service log (and optionally a JSONL under `~/.local/share/opencode/blindfold/audit.jsonl`).
- **Wrong value.** The card's provider row has "Use another" / "Forget for this site"; a typed value can be replaced
  (`replace: true`, as today). A login that fails is the agent's signal to call `get` with `replace`.
- **`get` versus `fill`.** For `fill` the page script checks the page's own origin, so a wrong claim fills nothing. For `get`
  the origin is the agent's claim and the value goes to its code: you approve a card that names the site and the account, and
  that is the whole check. An Always allow saved on a `fill` covers fills only; one saved on a `get` covers both. Prefer `fill` for pages.
- **Residual risks.** A malicious page can read a filled field's `value` (true of any autofill). `bw serve` is not used
  (unauthenticated localhost). R1 remains exfiltratable for typed values.

## 6. Requirements on blindfold

What the merged fork must expose so providers plug in (for relay):

1. **Provider lookup**: import `contract.ts` (or a copy) and call `accounts()` on each request; no import of the
   provider package.
2. **Rules and account options** (`accounts`, `rules` above) in blindfold's options; `secrets: { NAME: "op://…" }`
   becomes a name rule on a 1Password account. **Today's `op read` path must stop using the app integration** (it
   raises the dialog the user cannot answer): set `OP_BIOMETRIC_UNLOCK_ENABLED=false` or delegate to the provider.
3. **`get` with an origin**: `get({ fields, origin?, reason })`; fields resolved by rule or origin come from a provider
   after approval; the rest are typed.
4. **Protocol additions** (`rpc.ts`): `requested.fields[i].source?: { account, label, item?, state: "ready" | "locked"
   | "choose" | "unavailable", methods?, candidates? }`; new method `unlock { requestID, account, input }` (values only
   here and in `submit`); `submit` accepts `{ approve: [names], choose: { name: account } }` beside `values`.
5. **Card states** for the rows in §3 (approve, choose, unlock with a masked input, unavailable hint, "type it
   instead"). Answered row: "Secrets provided  EMAIL from Personal (1Password), PASSWORD typed".
6. **Redactor**: add form-urlencoded encodings (F8); register every provider value read.
7. **`blindfold.fill`** (R2): a Code Mode tool that returns a script carrying a single-use handle, plus an
   `execute.before` hook on `browser.evaluate` that swaps it in, then `execute.after` redaction as today. Needs the
   harness check in §8 Q1.
8. **Screenshot backstop** (optional): `execute.after` on `browser.screenshot` OCR check.
9. **Audit** event per use (names only).
10. **TOTP** fields: `kind: "otp"` so the card labels it "One-time code" and the value is never cached (read on use).

## 7. Agent tools, v1 scope, roadmap

**Built in v1** (§11 lists the checks): both vendors, accounts, rules and saved rules, the three-choice card with choice and
unlock, the settings page and its command, audit, form-urlencoded redaction, `op read` without the app, `get({ origin })`,
`kind: "otp"`, and `fill`. Not built: screenshot OCR backstop, echo re-mask after navigation, tag rules, "Type it instead"
on a provider row (v1.1 below).


- **Expose `otp` and `login(origin)` as tools?** Not as separate tools in v1. `get({ fields: [{ name: "OTP", kind:
  "otp" }], origin })` and `fill` cover both, keep one approval surface, and avoid a second path that could skip the
  card. A `login(origin)` convenience (username + password + OTP in one card, then fill) is roadmap once R2 is proven.
- **v1 (no biometrics, both vendors from day one):**
  - `blindfold-providers` server plugin: `OnePassword` (service account, master password; app path off) and
    `Bitwarden` (API key + master password, master password), several accounts of each, auto-lock, env/stdin only.
  - blindfold: rules, account policy, `get` with `origin`, card rows (approve, choose, unlock, fallback), audit,
    form-urlencoded redaction, `op read` without the app integration.
  - Fill: R2 (Q1 passed).
- **v1.1:** echo re-mask after navigation (the observer dies with the document); screenshot OCR backstop; "Type it instead"
  on a provider row; tag rules if a uniform tag exists; per-origin remembered choice without a rule.
- **Later:** `login(origin)`; `write` (save a generated password); SSH keys; Bitwarden self-hosted; JS SDK desktop auth
  for 1Password (one approval per process, if it runs in Bun and the user wants the app path once Touch ID is fixed);
  passkeys only if a vendor exposes signing (none does today).

## 8. Open questions

Answered by the user's decisions (see Decisions): Q1 passed (fill ships); Q3 service account on an `Agent` vault by default,
master password documented; Q4 Bitwarden cloud, no SSO, API key; Q5 the remembered choice is a saved rule the user created with
Always allow, never silent; Q6 10 idle minutes, per account, confirm every use unless a rule covers it. Still open: Q2 (R3
or an upstream `browser.fill({ secret })`; R2 made it unnecessary for now) and the original text below for the record.

1. **R2 feasibility** (blocks fill): in the private harness, does `ctx.tool.hook("execute.before")` fire for a nested
   Code Mode `browser.evaluate`, can it rewrite `input.script`, and which form lands in `metadata.toolCalls`? And does
   blindfold's existing `execute.after` redaction rewrite the stored `metadata.toolCalls` input (R1 disk exposure)?
2. Is a GUI-side `tabID → WebContents` mapping acceptable (R3), or should we ask upstream for a `browser.fill({ secret })`
   hook (R4)?
3. 1Password personal vault: service account into a new `Agent` vault (recommended: least privilege, no prompts), or
   master-password sign-in to the whole account, or both (Agent by default, Personal on demand)?
4. Bitwarden work: is it a Bitwarden organisation the user can create an API key for, self-hosted, and does the org
   policy require SSO (then `--apikey` login, D)? Is the work vault Bitwarden at all, or is "work" a second 1Password
   account?
5. Remembered account choice per origin: service lifetime only, or persisted (as a confirmed rule)?
6. Auto-lock default (10 min) and `confirmEveryUse` default (true): acceptable?

## 9. USER STEPS (superseded by the Settings page: see "Onboarding from Settings"; kept for the CLI details)

None of these were done by the build; it ran against the fixture CLIs only. Each unlocks the measurements listed. The README of
`blindfold-providers` has the same steps as a "First run" guide, and `node check.mjs` (in that package) tests each account with
the real CLI once they are done, without changing anything in it.

| # | Step (one time) | Unlocks |
|---|---|---|
| U1 | 1Password: create a vault **Agent**; put only the logins agents may use into it (e.g. a throwaway item `blindfold-check` with username, password and a TOTP). 1Password.com → Developer → Service accounts: create `opencode-agent` with **read** on `Agent` only; keep the `ops_…` token. It is typed once, into the card (or `node check.mjs`), and kept in the login keychain. Individual/Families limits: 1,000 reads/h, 1,000 requests/day | real `serviceAccount` unlock, `op item list` URL matching, `op read`/`--otp` timing, rate-limit headroom |
| U2 | Stop the app dialog for good: 1Password → Settings → Developer → turn **off** "Integrate with 1Password CLI". Blindfold already sets `OP_BIOMETRIC_UNLOCK_ENABLED=false` on every call, so this only makes it certain for every other tool; with it off, an `op` that has no token fails fast | no more "Allow opencode-cli" prompts |
| U3 | Optional, whole account by master password: in a Terminal `OP_BIOMETRIC_UNLOCK_ENABLED=false op account add --address my.1password.com --shorthand personal`, then set `unlock: "masterPassword"` on the account | whether `op signin --raw` takes the password on **stdin** without a TTY (assumed by the code and the fixture), the 30 min idle |
| U4 | Bitwarden: `npm install -g @bitwarden/cli` (it needs `node` on the service's PATH); a data directory per account, e.g. `~/.config/blindfold/bw-work` (for a self-hosted server `BITWARDENCLI_APPDATA_DIR=… bw config server <url>`); create a personal API key (web vault → Account settings → Security → Keys → View API key). The first card asks for the client id, the secret and the master password | real `apiKey` + `masterPassword` unlock, `bw list items --url` shape, `bw get totp`, bot challenge behaviour, `bw lock` on idle |
| U5 | Bitwarden work: `bw list organizations` for the organisation id (`organizationId`), and decide which collection holds the logins agents may use | org scoping |
| U6 | `node check.mjs --keychain` once: writes and deletes a dummy keychain item and checks that `security -i` does not echo its input | the keychain path (the one thing here that writes outside the plugin's own storage) |

## 10. How to re-run

```sh
cd apps/opencode-plugins/blindfold-providers
npm test                      # providers against the fixture CLIs, the plugin, check.mjs, the contract copy
cd ../blindfold
npm test                      # the card model, rules, redaction, the provider flow end to end, fill and the page script
./harness/run-providers.sh    # the private desktop harness: card, unlock, rules, fill in the in-app browser (see README)
# the spike's fill-and-mask prototype (needs a React 18 UMD dir and Chromium; fake values only)
cd ../blindfold-providers/spike
REACT_UMD_DIR=<path>/node_modules/react-dom node page/server.mjs 47321 &
BLINDFOLD_DIST=../../blindfold/dist node cdp-run.mjs "<Chrome for Testing binary>" http://127.0.0.1:47321/login /tmp/bf-spike-out
```

## 11. What was built, and how it was checked

- **blindfold-providers** (`src/`): `contract.ts` (registry, origin and pattern helpers, `isLocked`), `run.ts` (children get no inherited vendor
  variables; secrets only on stdin or in `env`; errors are the CLI's first line with the secrets scrubbed), `keychain.ts`,
  `account.ts` (session, idle timer, 5 minute item cache), `onepassword.ts`, `bitwarden.ts`, `config.ts`, `server.ts` (accounts
  live once per process, shared by every location; a changed configuration starts locked). `check.mjs` is the self-check.
- **blindfold**: `providers-contract.ts`, `rules.ts`, `broker.ts` (who can serve a field, nothing read), `fill.ts` and
  `fill-script.ts`, `audit.ts`, `legacy-op.ts`; `server.ts` (origin and `field` on `get`, the `fill` tool and its hook, `unlock`,
  `overview`, `revoke` and `lock` methods, `updated` and `changed` events), `redact.ts` (form encodings, `track`), `fields.ts`
  (`otp`), `model.ts`, `card.tsx`, `page.tsx` and `gui.tsx` (card rows, settings page, command), `tui.ts`.
- **Locked accounts are listed as a choice only when nothing unlocked can serve the field, or a rule names them**; once one
  unlocked account searched and found nothing, the hint says which locked accounts were not searched.
- **Tests**: providers 25 (fixture `op`, `bw`, `security`: unlock paths, scoping, no secret in any argv, auto-lock, the app
  integration off on every call and zero app prompts, keychain, the plugin and its pool, `check.mjs`); blindfold 83 (the upstream 20
  ported, card model, rules, redaction, 13 end-to-end flows through the provider layer, the page script in happy-dom).
- **Harness** (`harness/run-providers.sh`, 41 checks, fake CLIs and values): the card inline with three buttons and the account
  named in the title; choosing between accounts; the locked card for both vendors (token, three Bitwarden inputs) with a wrong
  credential shown without echo and the inputs emptied; Always allow then the same use with no card; Deny; the settings page
  (accounts, rules, recent use, Revoke, Lock) with no value; Work locking itself after its idle time; fill in the in-app browser (F14);
  the hot reload of a bundle with a card open; light and dark; no value in the DOM, the model's request, the stored messages, the
  service log or the audit file.
- **Performance** (`perf.mjs`, blindfold alone vs bare, 3 runs, the machine at load 60): 7 of 8 scenarios inside the bars; hover
  read +13 ms against a bar of 10 and +2 on the 7-run repeat, the same pattern the fork's first measurement had.
- **Not verified**: anything against a real `op`, `bw` or the real keychain (U1 to U6); the TUI flow (no TUI harness); a locked
  account's unlock when the vault is a Business tenant with rate limits; Bitwarden's bot challenge; behaviour with two OpenCode
  locations that hold separate rule storage (the plugin's `storage` may be per location: rules saved in one project would not
  show in another; check once with two projects).

