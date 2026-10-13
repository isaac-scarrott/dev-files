#!/usr/bin/env bash
# Reclaim disk space taken by build tooling that never cleans up after itself.
#
# The recurring offender is TMPDIR: `cdk synth` and friends mkdtemp a `cdk.out*`
# per invocation and only remove it on a clean exit, so every crash, Ctrl-C or
# killed agent run leaks ~26MB. 3148 of them had accumulated to 80GB before this
# script existed. Stale node_modules under throwaway worktrees are the same story.
#
# Usage:
#   scripts/disk-reclaim.sh scan                     what is reclaimable, change nothing
#   scripts/disk-reclaim.sh clean [--age DAYS]       reclaim it (default: older than 1 day)
#   scripts/disk-reclaim.sh start | stop | status    run `clean` daily as a LaunchAgent
#
# Worktree roots scanned for node_modules are listed in WORKTREE_ROOTS below; a
# repo with uncommitted changes is always skipped.

set -euo pipefail

PLIST="$HOME/Library/LaunchAgents/com.isaac.disk-reclaim.plist"
LABEL="com.isaac.disk-reclaim"
LOG_DIR="$HOME/.disk-reclaim"
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

AGE_DAYS=1

TMP_DIR="${TMPDIR:-/tmp}"
TMP_DIR="${TMP_DIR%/}"

# Prefixes that tooling mkdtemps into TMPDIR and abandons.
TMP_LEAK_GLOBS=(
  'cdk.out*'
  'cdk-dynamic-esbuild@*'
  'jest_*'
  'tmp.*'
  'cdk.out'
)

# Throwaway checkouts: node_modules here is always reinstallable.
WORKTREE_ROOTS=(
  "$HOME/Library/Application Support/Synth/worktrees"
  "$HOME/.claude/orchestrator-state"
  "$HOME/git/holibob-worktree"
)

CACHE_PATHS=(
  "$HOME/Library/Caches/ms-playwright"
  "$HOME/Library/Caches/go-build"
  "$HOME/Library/Caches/typescript"
  "$HOME/Library/Caches/ffmpeg-static-nodejs"
)

die() { printf 'disk-reclaim: %s\n' "$1" >&2; exit 1; }

human() { # bytes -> human
  awk -v b="$1" 'BEGIN{
    split("B KB MB GB TB",u," "); i=1
    while (b>=1024 && i<5) { b/=1024; i++ }
    printf (i==1 ? "%d%s\n" : "%.1f%s\n"), b, u[i]
  }'
}

size_of() { # path -> bytes (0 when absent)
  [ -e "$1" ] || { echo 0; return; }
  du -sk "$1" 2>/dev/null | awk '{print $1*1024}'
}

free_bytes() {
  df -k /System/Volumes/Data | awk 'NR==2 {print $4*1024}'
}

# Emit NUL-separated paths of leaked TMPDIR dirs older than AGE_DAYS.
find_tmp_leaks() {
  local glob
  for glob in "${TMP_LEAK_GLOBS[@]}"; do
    find "$TMP_DIR" -maxdepth 1 -name "$glob" -mtime "+$AGE_DAYS" -print0 2>/dev/null
  done
}

# Emit NUL-separated node_modules paths under throwaway worktrees, skipping
# any repo that has uncommitted work.
find_stale_node_modules() {
  local root nm repo
  for root in "${WORKTREE_ROOTS[@]}"; do
    [ -d "$root" ] || continue
    while IFS= read -r -d '' nm; do
      repo="$(dirname "$nm")"
      if git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 \
         && [ -n "$(git -C "$repo" status --porcelain 2>/dev/null)" ]; then
        continue
      fi
      printf '%s\0' "$nm"
    done < <(find "$root" -name node_modules -type d -prune -print0 2>/dev/null)
  done
}

report() { # label, NUL-stream producer
  local label="$1" producer="$2" count=0 bytes=0 path sz
  while IFS= read -r -d '' path; do
    sz="$(size_of "$path")"
    count=$((count + 1))
    bytes=$((bytes + sz))
  done < <("$producer")
  printf '  %-26s %5d items  %8s\n' "$label" "$count" "$(human "$bytes")"
  echo "$bytes"
}

cmd_scan() {
  echo "TMPDIR: $TMP_DIR"
  echo "Reclaimable (older than ${AGE_DAYS}d):"
  local total=0 b
  b="$(report 'tmpdir build leaks' find_tmp_leaks | tail -1)"; total=$((total + b))
  b="$(report 'worktree node_modules' find_stale_node_modules | tail -1)"; total=$((total + b))

  local cache_bytes=0 p
  for p in "${CACHE_PATHS[@]}"; do cache_bytes=$((cache_bytes + $(size_of "$p"))); done
  printf '  %-26s %5s items  %8s\n' 'regenerable caches' "${#CACHE_PATHS[@]}" "$(human "$cache_bytes")"
  total=$((total + cache_bytes))

  printf '\n  %-26s %20s\n' 'total reclaimable' "$(human "$total")"
  printf '  %-26s %20s\n' 'free now' "$(human "$(free_bytes)")"
}

purge() { # NUL-stream producer -> delete, echo count
  local producer="$1" count=0 path
  while IFS= read -r -d '' path; do
    rm -rf -- "$path" 2>/dev/null || true
    count=$((count + 1))
  done < <("$producer")
  echo "$count"
}

cmd_clean() {
  local before after n p
  before="$(free_bytes)"

  n="$(purge find_tmp_leaks)"
  printf 'removed %s leaked tmpdir dirs\n' "$n"

  n="$(purge find_stale_node_modules)"
  printf 'removed %s worktree node_modules\n' "$n"

  for p in "${CACHE_PATHS[@]}"; do
    [ -d "$p" ] && rm -rf -- "${p:?}"/* 2>/dev/null || true
  done
  echo 'cleared regenerable caches'

  command -v pnpm >/dev/null 2>&1 && pnpm store prune >/dev/null 2>&1 && echo 'pruned pnpm store'

  after="$(free_bytes)"
  printf 'freed %s  (free: %s)\n' "$(human $((after - before)))" "$(human "$after")"
}

cmd_start() {
  mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SELF</string>
    <string>clean</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$LOG_DIR/clean.out</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/clean.err</string>
</dict>
</plist>
PLIST_EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "loaded $LABEL (daily 04:30), logs in $LOG_DIR"
}

cmd_stop() {
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "unloaded $LABEL"
}

cmd_status() {
  if launchctl list | grep -q "$LABEL"; then
    echo "$LABEL: loaded"
    [ -f "$LOG_DIR/clean.out" ] && tail -5 "$LOG_DIR/clean.out"
  else
    echo "$LABEL: not loaded"
  fi
}

main() {
  local cmd="${1:-scan}"
  shift || true
  while [ $# -gt 0 ]; do
    case "$1" in
      --age) AGE_DAYS="${2:?--age needs a value}"; shift 2 ;;
      *) die "unknown option: $1" ;;
    esac
  done
  case "$cmd" in
    scan)   cmd_scan ;;
    clean)  cmd_clean ;;
    start)  cmd_start ;;
    stop)   cmd_stop ;;
    status) cmd_status ;;
    *) die "unknown command: $cmd (scan|clean|start|stop|status)" ;;
  esac
}

main "$@"
