# blindfold-providers: design spike

Status: T3 spike, in progress. Research plus a throwaway prototype under `spike/`. Not a plugin yet.

Goal: let agents use **1Password and Bitwarden side by side** (e.g. `personal` = 1Password, `work` = Bitwarden) for
passwords and 2FA through blindfold, without values reaching the model, and fill them into the OpenCode in-app browser.

## Sections (filled as measured)
1. Evidence
2. Capability matrix
3. Architecture and provider interface
4. Fill-and-mask helper (prototype + measurements)
5. Security model
6. Requirements on blindfold
7. v1 scope, roadmap
8. USER STEPS, open questions
