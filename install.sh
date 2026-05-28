#!/usr/bin/env bash
# Bootstrap dev-files on a macOS machine.
# - Sets git hooksPath
# - Initializes submodules
# - Runs vendor.sh to fetch upstream files
# - Symlinks dev-files content into ~/, ~/.config/, ~/.claude/, Library/Application Support/
# Idempotent: safe to re-run; existing files get backed up with timestamped .bak before linking.
#
# Source it (e.g. `source install.sh`) to access LINKS and link_one without running main.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Format: <dest absolute path>|<src path relative to dev-files>
LINKS=(
  "$HOME/.tmux.conf|.tmux.conf"
  "$HOME/tmux-profile.json|tmux-profile.json"
  "$HOME/.zshrc|.zshrc"

  "$HOME/.config/aerospace|.config/aerospace"
  "$HOME/.config/ghostty/config|.config/ghostty/config"
  "$HOME/.config/nvim|.config/nvim"
  "$HOME/.config/zed/settings.json|.config/zed/settings.json"
  "$HOME/.config/zed/keymap.json|.config/zed/keymap.json"
  "$HOME/.config/zed/tasks.json|.config/zed/tasks.json"

  "$HOME/.claude/CLAUDE.md|.claude/CLAUDE.md"
  "$HOME/.claude/settings.json|.claude/settings.json"
  "$HOME/.claude/scripts/implement-ticket.sh|.claude/scripts/implement-ticket.sh"
  "$HOME/.claude/scripts/implement-ticket-folder.sh|.claude/scripts/implement-ticket-folder.sh"
  "$HOME/.claude/scripts/implementer-prompt.md|.claude/scripts/implementer-prompt.md"
  "$HOME/.claude/scripts/implementer-prompt-folder.md|.claude/scripts/implementer-prompt-folder.md"
  "$HOME/.claude/skills/grill-me|.claude/skills/grill-me"
  "$HOME/.claude/skills/grill-with-docs|.claude/skills/grill-with-docs"
  "$HOME/.claude/skills/humanizer|.claude/skills/humanizer"
  "$HOME/.claude/skills/improve-codebase-architecture|.claude/skills/improve-codebase-architecture"
  "$HOME/.claude/skills/jedi-council|.claude/skills/jedi-council"
  "$HOME/.claude/skills/the-focus-group|.claude/skills/the-focus-group"
  "$HOME/.claude/skills/thermo-nuclear-code-quality-review|.claude/skills/thermo-nuclear-code-quality-review"
  "$HOME/.claude/skills/write-a-skill|.claude/skills/write-a-skill"

  "$HOME/.claude/agents/code-simplifier.md|.claude/agents/code-simplifier.md"

  "$HOME/.claude/commands/simplify.md|.claude/commands/simplify.md"

  "$HOME/.local/bin/claudewho|bin/claudewho"

  "$HOME/Library/Application Support/Code/User/settings.json|ide/vscode/settings.json"
  "$HOME/Library/Application Support/Cursor/User/settings.json|ide/cursor/settings.json"
)

link_one() {
  local dest="$1" src="$2"
  local abs_src="$ROOT/$src"
  if [ ! -e "$abs_src" ]; then
    echo "  ! source missing: $src"
    return 1
  fi
  mkdir -p "$(dirname "$dest")"
  if [ -L "$dest" ]; then
    local current
    current="$(readlink "$dest")"
    if [ "$current" = "$abs_src" ]; then
      echo "  ok:     $dest"
      return 0
    fi
    echo "  relink: $dest (was → $current)"
    rm "$dest"
  elif [ -e "$dest" ]; then
    local bak="$dest.bak.$(date +%s)"
    echo "  backup: $dest → $bak"
    mv "$dest" "$bak"
  fi
  ln -s "$abs_src" "$dest"
  echo "  link:   $dest → $abs_src"
}

link_all() {
  for entry in "${LINKS[@]}"; do
    link_one "${entry%%|*}" "${entry##*|}"
  done
}

main() {
  cd "$ROOT"

  echo "=== git config ==="
  git config core.hooksPath .githooks
  echo "  hooksPath = .githooks"

  echo
  echo "=== submodules ==="
  git submodule update --init --recursive

  echo
  echo "=== vendored files ==="
  scripts/vendor.sh

  echo
  echo "=== symlinks ==="
  link_all

  echo
  echo "done"
}

# Only run main when invoked directly, not when sourced.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main
fi
