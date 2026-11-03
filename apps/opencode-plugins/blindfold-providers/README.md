# Blindfold providers

1Password and Bitwarden side by side behind blindfold's card: an agent asks for a login, you approve it once, always or never, and the value goes to the page or the running code, never to the chat.

> **Credit:** a server-only companion to our [blindfold](../blindfold) fork of [vimtor](https://github.com/vimtor)'s [opencode-blindfold](https://github.com/vimtor/opencode-plugins/tree/main/packages/opencode-blindfold) (MIT). The redaction idea is vimtor's. The CLI behaviours are from the vendors' docs: [1Password CLI](https://www.1password.dev/cli/) and [service accounts](https://www.1password.dev/service-accounts/get-started.md), [Bitwarden CLI](https://bitwarden.com/help/cli/). Nothing here has been run against a real `op` or `bw` yet: see First run.

## What it does
- **Accounts you name.** `personal` can be 1Password and `work` Bitwarden, or two of one kind. Each registers with blindfold, which shows them on its card with the label you gave ("Work (Bitwarden)").
- **No biometrics, no app dialog.** 1Password goes through a service account on one vault you choose; every `op` call turns the desktop-app integration off, so the "Allow opencode-cli" dialog never appears. Bitwarden uses its API key once, then your master password.
- **Locks itself.** Sessions live in memory only and lock after 10 idle minutes (per account). A locked account shows its unlock inside the card; a master password or token you type is sent once and forgotten.
- **Fenced.** An account with `allowedOrigins` serves only those sites, so a work login never fills a personal page.
- **Never a value in the open.** Secrets reach a CLI only on stdin or in its environment, never in a command line. Errors carry the CLI's first line with your input scrubbed out.

## Context
OpenCode has no password-manager hook. Blindfold already keeps secrets out of the model's context; this plugin gives it vaults to read from. It has no UI of its own: the card, the rules page and the audit trail are blindfold's. A third vendor is another plugin registering through the same contract.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`, together with blindfold (order does not matter):
```json
{ "package": "/Users/isaac/git/dev-files/apps/opencode-plugins/blindfold-providers", "options": {
  "accounts": {
    "personal": { "provider": "1password", "label": "Personal (1Password)", "unlock": "serviceAccount", "vaults": ["Agent"] },
    "work": { "provider": "bitwarden", "label": "Work (Bitwarden)", "appDataDir": "~/.config/blindfold/bw-work", "organizationId": "<organisation id>", "allowedOrigins": ["*.holibob.tech", "*.holibob.com"], "autoLockMinutes": 10 }
  } } },
{ "package": "/Users/isaac/git/dev-files/apps/opencode-plugins/blindfold", "options": { "rules": [ { "origin": "*.holibob.tech", "account": "work" }, { "origin": "*.holibob.com", "account": "work" } ] } }
```
Kind: server. Restart the background service (`opencode service restart`) for the first load and after an option change; the service needs `op` and, for an npm-installed `bw`, `node` on its PATH (`/opt/homebrew/bin` is on it today).

## Options
Per account, under `accounts.<id>` (id: lowercase letters, digits, `-` or `_`):

| Option | Default | What it does |
|---|---|---|
| `provider` | required | `1password` or `bitwarden` |
| `label` | `<id> (1Password)` / `<id> (Bitwarden)` | what the card shows |
| `autoLockMinutes` | `10` | idle minutes before the in-memory session is dropped (Bitwarden also runs `bw lock`) |
| `allowedOrigins` | any site the item is saved for | host patterns this account may fill: `accounts.google.com`, `*.example.com` (that domain and subdomains), or `http://localhost:3000`; https only unless written out |
| `bin` | `op` / `bw` | the CLI to run |
| `unlock` (1Password) | `serviceAccount` | `serviceAccount`, or `masterPassword` (whole account; see U3, not verified against the real CLI) |
| `vaults` (1Password) | all the token can see | vault names to list |
| `tokenStore` (1Password) | `keychain` | where the service token rests: the macOS login keychain, `memory`, or the path of a `security` binary |
| `tokenEnv` (1Password) | none | an environment variable of the service that holds the token (the keychain is looked at first) |
| `address`, `shorthand` (1Password) | `my.1password.com`, the id | for `masterPassword` |
| `appDataDir` (Bitwarden) | `~/.config/blindfold/bw-<id>` | one data directory per account (`BITWARDENCLI_APPDATA_DIR`) |
| `organizationId` (Bitwarden) | any | only items of this organisation |
| `syncOnUnlock` (Bitwarden) | `true` | `bw sync` after unlocking |

Which account serves which site is set in blindfold's `rules` option (see its README).

## First run
Nothing below was done by the build, which ran against stand-in CLIs. Do it once; none of it takes a secret to the chat.

1. **1Password.** In 1Password create a vault `Agent` and put in it only the logins agents may use (start with a throwaway item with a username, password and one-time code). On 1password.com go to Developer, Service accounts, create `opencode-agent` with read access to `Agent` only, and keep the `ops_…` token. Individual plans allow 1,000 requests a day per account; blindfold lists the vault once per session and reads one value per use.
2. **Stop the app dialog for good.** 1Password, Settings, Developer: turn off "Integrate with 1Password CLI". Blindfold does not depend on it (it sets `OP_BIOMETRIC_UNLOCK_ENABLED=false` itself), but with it off no other tool can raise the dialog either.
3. **Bitwarden.** `npm install -g @bitwarden/cli`. On the web vault open Account settings, Security, Keys, View API key. `bw list organizations` (after a first `bw login --apikey` in a terminal with the account's data directory) gives the organisation id for `organizationId`.
4. **Check each account with the real CLI**, in a terminal (the credential is asked there, masked; nothing secret is printed, only lengths):
   ```sh
   cd apps/opencode-plugins/blindfold-providers
   node check.mjs --account personal --origin https://github.com --item "GitHub" --field password
   node check.mjs --account work --origin https://admin.holibob.tech --field otp
   node check.mjs --account personal --keychain      # writes and deletes a dummy keychain item
   ```
   Name an item you created for this. It reads the config from `~/.config/opencode/opencode.json` (`--config` for another file), lists the logins for the origin by title and the fields they have, reads the one field, and locks the account again. A failure prints the CLI's own reason.
5. Register the plugins (Install above), restart the service, and ask an agent to use the login. The first card asks for the token or the Bitwarden credentials; after that, Always allow makes the same use silent, and Settings, Blindfold lists and revokes what you allowed.

## Credits
- [vimtor/opencode-plugins](https://github.com/vimtor/opencode-plugins) (MIT): the blindfold idea and redaction this builds on, through our fork.
- 1Password and Bitwarden documentation: the CLI flags, the service-account limits and the `bw unlock --passwordenv` path (cited in [DESIGN.md](DESIGN.md) §1).

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked), `pnpm smoke`. The fixture `op`, `bw` and `security` are in `fixture-cli/`; the browser side is exercised by `../blindfold/harness/run-providers.sh`. Design notes and evidence: [DESIGN.md](DESIGN.md).
