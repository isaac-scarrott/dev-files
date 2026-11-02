#!/usr/bin/env bash
# Prints the cliproxy API key from the macOS Keychain. Used as Claude Code's `apiKeyHelper` so the key never lives in a tracked file.
# Set or rotate it with: security add-generic-password -a "$USER" -s cliproxy-api-key -w '<key>' -U
exec security find-generic-password -a "$USER" -s cliproxy-api-key -w
