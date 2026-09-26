#!/usr/bin/env bash
# Upload local images or videos to GitHub's user-attachments store and print the
# permanent URL for each, one per line, in argument order.
#
# Usage:  ./upload-asset.sh OWNER/REPO file [file …]
#
# The endpoint is undocumented but takes a plain `gh auth token` bearer token —
# no browser session, no CSRF. It is what `gh --attach` posts to. Uploading
# attaches the asset to nothing; embedding the URL is a separate step, and an
# asset nobody embeds simply goes unreferenced.
#
# Needs write access to the repo: read and triage both get a 404.

set -euo pipefail

REPO="${1:?usage: upload-asset.sh OWNER/REPO file [file …]}"
shift
[ $# -gt 0 ] || { echo "no files given" >&2; exit 1; }

TOKEN="$(gh auth token)"
REPO_ID="$(gh api "repos/$REPO" --jq .id)"

content_type() {
  case "${1##*.}" in
    png) echo image/png ;;
    jpg | jpeg) echo image/jpeg ;;
    gif) echo image/gif ;;
    webp) echo image/webp ;;
    svg) echo image/svg+xml ;;
    mp4) echo video/mp4 ;;
    mov) echo video/quicktime ;;
    webm) echo video/webm ;;
    *) return 1 ;;
  esac
}

for file in "$@"; do
  [ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }
  name="$(basename "$file")"

  if ! mime="$(content_type "$name")"; then
    echo "$name: GitHub accepts png jpg jpeg gif webp svg mp4 mov webm" >&2
    exit 1
  fi

  response="$(curl -fsS -X POST \
    "https://uploads.github.com/user-attachments/assets?name=$name&content_type=$mime&repository_id=$REPO_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" \
    --data-binary "@$file")"

  printf '%s\n' "$response" | jq -r .url
done
