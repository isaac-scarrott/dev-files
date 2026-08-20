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

# Format: <dest absolute path>|<src path relative to dev-files, or an absolute path
# for a sibling repo — those are skipped when the repo isn't cloned>
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

  "$HOME/.claude/CLAUDE.md|global/AGENTS.md"
  "$HOME/.config/opencode/AGENTS.md|global/AGENTS.md"
  "$HOME/.claude/settings.json|.claude/settings.json"
  "$HOME/.claude/scripts/implement-ticket.sh|.claude/scripts/implement-ticket.sh"
  "$HOME/.claude/scripts/implement-ticket-folder.sh|.claude/scripts/implement-ticket-folder.sh"
  "$HOME/.claude/scripts/implementer-prompt.md|.claude/scripts/implementer-prompt.md"
  "$HOME/.claude/scripts/implementer-prompt-folder.md|.claude/scripts/implementer-prompt-folder.md"

  # The implement-ticket wrappers above exec these; they live in claude-orchestrate.
  "$HOME/.claude/scripts/orchestrate.sh|$HOME/git/claude-orchestrate/orchestrate.sh"
  "$HOME/.claude/scripts/claude_user.sh|$HOME/git/claude-orchestrate/claude_user.sh"
  "$HOME/.claude/scripts/orchestrator-planner-prompt.md|$HOME/git/claude-orchestrate/orchestrator-planner-prompt.md"
  "$HOME/.claude/scripts/orchestrator-worker-prompt.md|$HOME/git/claude-orchestrate/orchestrator-worker-prompt.md"
  "$HOME/.claude/scripts/orchestrator-conflict-resolver-prompt.md|$HOME/git/claude-orchestrate/orchestrator-conflict-resolver-prompt.md"
  "$HOME/.claude/commands/orchestrate.md|$HOME/git/claude-orchestrate/orchestrate.md"

  "$HOME/.claude/skills/github-image-upload|.claude/skills/github-image-upload"
  "$HOME/.claude/skills/grill-me|.claude/skills/grill-me"
  "$HOME/.claude/skills/grill-with-docs|.claude/skills/grill-with-docs"
  "$HOME/.claude/skills/grilling|.claude/skills/grilling"
  "$HOME/.claude/skills/handoff|.claude/skills/handoff"
  "$HOME/.claude/skills/humanizer|.claude/skills/humanizer"
  "$HOME/.claude/skills/improve-codebase-architecture|.claude/skills/improve-codebase-architecture"
  "$HOME/.claude/skills/thermo-nuclear-code-quality-review|.claude/skills/thermo-nuclear-code-quality-review"
  "$HOME/.claude/skills/understand-codebase-architecture|.claude/skills/understand-codebase-architecture"
  "$HOME/.claude/skills/video-to-tickets|.claude/skills/video-to-tickets"
  "$HOME/.claude/skills/wait-what|.claude/skills/wait-what"
  "$HOME/.claude/skills/wizard|.claude/skills/wizard"
  "$HOME/.claude/skills/write-a-skill|.claude/skills/write-a-skill"
  "$HOME/.claude/skills/write-in-my-voice|.claude/skills/write-in-my-voice"
  "$HOME/.claude/skills/x-shot|.claude/skills/x-shot"

  "$HOME/.claude/agents/code-simplifier.md|.claude/agents/code-simplifier.md"

  "$HOME/.claude/commands/simplify.md|.claude/commands/simplify.md"
  "$HOME/.claude/commands/commit.md|.claude/commands/commit.md"
  "$HOME/.claude/commands/commitpr.md|.claude/commands/commitpr.md"
  "$HOME/.claude/commands/ship.md|.claude/commands/ship.md"
  "$HOME/.claude/commands/babysit-ci.md|.claude/commands/babysit-ci.md"
  "$HOME/.claude/commands/babysit-comments.md|.claude/commands/babysit-comments.md"

  "$HOME/.claude/statusline-command.sh|.claude/statusline-command.sh"

  # OpenCode — same canonical source as Claude (config, skills, agent, commands)
  "$HOME/.config/opencode/opencode.json|.config/opencode/opencode.json"
  "$HOME/.config/opencode/skills/github-image-upload|.claude/skills/github-image-upload"
  "$HOME/.config/opencode/skills/grill-me|.claude/skills/grill-me"
  "$HOME/.config/opencode/skills/grill-with-docs|.claude/skills/grill-with-docs"
  "$HOME/.config/opencode/skills/grilling|.claude/skills/grilling"
  "$HOME/.config/opencode/skills/handoff|.claude/skills/handoff"
  "$HOME/.config/opencode/skills/humanizer|.claude/skills/humanizer"
  "$HOME/.config/opencode/skills/improve-codebase-architecture|.claude/skills/improve-codebase-architecture"
  "$HOME/.config/opencode/skills/thermo-nuclear-code-quality-review|.claude/skills/thermo-nuclear-code-quality-review"
  "$HOME/.config/opencode/skills/understand-codebase-architecture|.claude/skills/understand-codebase-architecture"
  "$HOME/.config/opencode/skills/video-to-tickets|.claude/skills/video-to-tickets"
  "$HOME/.config/opencode/skills/wait-what|.claude/skills/wait-what"
  "$HOME/.config/opencode/skills/wizard|.claude/skills/wizard"
  "$HOME/.config/opencode/skills/write-a-skill|.claude/skills/write-a-skill"
  "$HOME/.config/opencode/skills/write-in-my-voice|.claude/skills/write-in-my-voice"
  "$HOME/.config/opencode/skills/x-shot|.claude/skills/x-shot"
  "$HOME/.config/opencode/agent/code-simplifier.md|.claude/agents/code-simplifier.md"
  "$HOME/.config/opencode/command/commit.md|.claude/commands/commit.md"
  "$HOME/.config/opencode/command/commitpr.md|.claude/commands/commitpr.md"
  "$HOME/.config/opencode/command/simplify.md|.claude/commands/simplify.md"
  "$HOME/.config/opencode/command/ship.md|.claude/commands/ship.md"

  # Codex — shares ~/.codex across CLI, IDE extension, and desktop app.
  # Same canonical AGENTS.md and SKILL.md sources as Claude/OpenCode (zero copies).
  # MCP servers are NOT here: they render into ~/.codex/config.toml via scripts/gen-mcp.sh.
  "$HOME/.codex/AGENTS.md|global/AGENTS.md"
  "$HOME/.codex/skills/github-image-upload|.claude/skills/github-image-upload"
  "$HOME/.codex/skills/grill-me|.claude/skills/grill-me"
  "$HOME/.codex/skills/grill-with-docs|.claude/skills/grill-with-docs"
  "$HOME/.codex/skills/grilling|.claude/skills/grilling"
  "$HOME/.codex/skills/handoff|.claude/skills/handoff"
  "$HOME/.codex/skills/humanizer|.claude/skills/humanizer"
  "$HOME/.codex/skills/improve-codebase-architecture|.claude/skills/improve-codebase-architecture"
  "$HOME/.codex/skills/thermo-nuclear-code-quality-review|.claude/skills/thermo-nuclear-code-quality-review"
  "$HOME/.codex/skills/understand-codebase-architecture|.claude/skills/understand-codebase-architecture"
  "$HOME/.codex/skills/video-to-tickets|.claude/skills/video-to-tickets"
  "$HOME/.codex/skills/wait-what|.claude/skills/wait-what"
  "$HOME/.codex/skills/wizard|.claude/skills/wizard"
  "$HOME/.codex/skills/write-a-skill|.claude/skills/write-a-skill"
  "$HOME/.codex/skills/write-in-my-voice|.claude/skills/write-in-my-voice"
  "$HOME/.codex/skills/x-shot|.claude/skills/x-shot"

  "$HOME/.local/bin/claudewho|bin/claudewho"

  "$HOME/Library/Application Support/Code/User/settings.json|ide/vscode/settings.json"
  "$HOME/Library/Application Support/Cursor/User/settings.json|ide/cursor/settings.json"
)

# An absolute src points outside dev-files, at a sibling repo that may not be cloned.
resolve_src() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s\n' "$ROOT/$1" ;;
  esac
}

link_one() {
  local dest="$1" src="$2"
  local abs_src
  abs_src="$(resolve_src "$src")"
  if [ ! -e "$abs_src" ]; then
    echo "  ! source missing: $src"
    # Only a src inside dev-files is guaranteed present; an external one is best-effort.
    case "$src" in
      /*) return 0 ;;
      *)  return 1 ;;
    esac
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
