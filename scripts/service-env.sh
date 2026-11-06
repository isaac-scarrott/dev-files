#!/usr/bin/env bash
# Copies the login shell's tool environment into the OpenCode background service's own settings.
# SHELL is set to bash rather than copied: agents write bash idioms, and the login shell is zsh.
#
# Why: the desktop app starts the service at login with launchd's minimal environment
# (PATH=/usr/bin:/bin:/usr/sbin:/sbin), so agents' shells could not find gh, node, pnpm, java and the rest after a reboot.
# The service keeps an `env` map in ~/.config/opencode/service.json (what `opencode service set env NAME VALUE` writes) and
# applies it whenever it starts.
#
# Why not call `service set env` once per variable: every call restarts the service, which ends every running session.
# This script merges all the variables into service.json in one write, then (with --restart) restarts the service once.
#
# Usage: scripts/service-env.sh                dry run, shows what would change
#        scripts/service-env.sh --apply        write service.json only; the service picks it up at its next start
#        scripts/service-env.sh --apply --restart   also restart the service now (ends all sessions)
# Only the allow-listed names below are copied, never anything that looks like a credential.
set -euo pipefail

CLI=${OPENCODE_CLI:-"$HOME/Library/Application Support/ai.opencode.desktop/cli/2.2.5-arm64/opencode-cli"}
CONFIG=${OPENCODE_SERVICE_CONFIG:-"$HOME/.config/opencode/service.json"}
ALLOW="PATH JAVA_HOME ANDROID_HOME ANDROID_SDK_ROOT BUN_INSTALL PNPM_HOME NVM_DIR HOMEBREW_PREFIX HOMEBREW_CELLAR HOMEBREW_REPOSITORY EDITOR"
SHELL_BIN=/bin/bash
apply=0
restart=0
for arg in "$@"; do
  case $arg in
    --apply) apply=1 ;;
    --restart) restart=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

[ -f "$CONFIG" ] || { echo "service config not found: $CONFIG" >&2; exit 1; }

# One login shell prints the allow-listed variables as NUL-separated NAME=VALUE pairs.
login_env=$(zsh -lic 'for n in '"$ALLOW"'; do eval "v=\${$n-}"; [ -n "$v" ] && printf "%s=%s\0" "$n" "$v"; done' 2>/dev/null | tr '\0' '\n')
login_env+=$'\n'"SHELL=$SHELL_BIN"

APPLY=$apply CONFIG=$CONFIG LOGIN_ENV=$login_env node -e '
const fs = require("fs")
const config = JSON.parse(fs.readFileSync(process.env.CONFIG, "utf8"))
const env = { ...(config.env ?? {}) }
const changes = []

for (const line of process.env.LOGIN_ENV.split("\n")) {
  const at = line.indexOf("=")
  if (at < 1) continue
  const name = line.slice(0, at)
  let value = line.slice(at + 1)
  // The login shell repeats PATH entries; keep the first of each.
  if (name === "PATH") value = [...new Set(value.split(":"))].join(":")
  if (env[name] !== value) changes.push(name + (name in env ? " (changed)" : " (new)"))
  env[name] = value
}

console.log(changes.length ? (process.env.APPLY === "1" ? "set: " : "would set: ") + changes.join(", ") : "service env already up to date")

if (process.env.APPLY === "1" && changes.length) {
  const next = JSON.stringify({ ...config, env }, null, 2) + "\n"
  const tmp = process.env.CONFIG + ".tmp"
  fs.writeFileSync(tmp, next, { mode: 0o600 })
  fs.renameSync(tmp, process.env.CONFIG)
}
'

if [ "$apply" = 0 ]; then
  echo "Dry run. Re-run with --apply."
elif [ "$restart" = 1 ]; then
  echo "Restarting the service (ends all sessions)…"
  "$CLI" service restart
else
  echo "Written. The service uses it at its next start; --restart applies it now (ends all sessions)."
fi
