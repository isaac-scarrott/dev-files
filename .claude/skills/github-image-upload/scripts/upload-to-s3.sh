#!/usr/bin/env bash
# Upload image bytes to GitHub's asset bucket using policies obtained from a
# logged-in github.com page. See ../REFERENCE.md step 2 for how to get them.
#
# Usage:  ./upload-to-s3.sh policies.txt [image-dir]
#
# policies.txt is pipe-delimited, one line per file:
#   name.png|<key>|<policy>|<signature>
#
# Files are read from image-dir (default: cwd) by the `name` field.
# Prints "<http-status> <name>" per file. 204 is success.
#
# The bucket, algorithm, credential and date are constant within a batch and are
# echoed back in the policy itself. If GitHub ever rotates them, decode any policy
# to read the current values:
#   awk -F'|' 'NR==1{print $3}' policies.txt | base64 -d | python3 -m json.tool

set -uo pipefail

POLICIES="${1:?usage: upload-to-s3.sh policies.txt [image-dir]}"
DIR="${2:-.}"

[[ -f "$POLICIES" ]] || { echo "no such file: $POLICIES" >&2; exit 1; }

BUCKET="https://github-production-user-asset-6210df.s3.amazonaws.com"

# Read the credential and date out of the first policy so a rotation doesn't
# silently break every upload with an opaque 403.
first_policy=$(awk -F'|' 'NR==1{print $3}' "$POLICIES")
decoded=$(printf '%s' "$first_policy" | base64 -d 2>/dev/null || printf '%s' "$first_policy" | base64 -D 2>/dev/null)
CRED=$(printf '%s' "$decoded" | sed -n 's/.*"x-amz-credential":"\([^"]*\)".*/\1/p')
DATE=$(printf '%s' "$decoded" | sed -n 's/.*"x-amz-date":"\([^"]*\)".*/\1/p')
[[ -n "$CRED" && -n "$DATE" ]] || { echo "could not read credential/date from policy" >&2; exit 1; }

fail=0
while IFS='|' read -r name key policy sig; do
  [[ -z "${name:-}" ]] && continue
  if [[ "$key" == FAIL* ]]; then
    echo "SKIP $name (policy request failed: $key)"
    fail=1
    continue
  fi
  path="$DIR/$name"
  if [[ ! -f "$path" ]]; then
    echo "SKIP $name (not found at $path)"
    fail=1
    continue
  fi

  # Content type from extension; GitHub validates it against the policy.
  case "${name##*.}" in
    png) ct=image/png ;;
    jpg|jpeg) ct=image/jpeg ;;
    gif) ct=image/gif ;;
    webp) ct=image/webp ;;
    svg) ct=image/svg+xml ;;
    mp4) ct=video/mp4 ;;
    mov) ct=video/quicktime ;;
    *) ct=application/octet-stream ;;
  esac

  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BUCKET" \
    -F "key=$key" \
    -F "acl=private" \
    -F "policy=$policy" \
    -F "X-Amz-Algorithm=AWS4-HMAC-SHA256" \
    -F "X-Amz-Credential=$CRED" \
    -F "X-Amz-Date=$DATE" \
    -F "X-Amz-Signature=$sig" \
    -F "Content-Type=$ct" \
    -F "Cache-Control=max-age=2592000" \
    -F "x-amz-meta-Surrogate-Control=max-age=31557600" \
    -F "file=@$path")

  echo "$status $name"
  [[ "$status" == "204" ]] || fail=1
done < "$POLICIES"

if [[ "$fail" -ne 0 ]]; then
  echo >&2
  echo "One or more uploads failed. Common causes:" >&2
  echo "  403 — policy expired (~1h) or the credential rotated; re-request policies" >&2
  echo "  400 — byte size in the policy doesn't match the file exactly" >&2
  exit 1
fi
