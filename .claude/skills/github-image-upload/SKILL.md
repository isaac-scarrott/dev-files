---
name: github-image-upload
description: Upload local images to GitHub and embed them in pull requests, issues or comments, without drag-and-drop and without committing them to the repo. Use when asked to attach, add or upload screenshots or images to a PR/issue, when a PR needs before/after evidence, or when someone says GitHub has no API for image uploads.
---

# GitHub image upload

GitHub has no REST API for attaching images. Its drag-and-drop is really three HTTP calls, and you can drive them yourself:

1. **Ask GitHub for an upload policy** — authenticated, same-origin, from a github.com page
2. **PUT the bytes to S3** — no GitHub auth, so plain `curl` from the shell
3. **Finalise with GitHub** — authenticated again

Only step 2 carries the file, and it goes to S3 rather than GitHub. That split is what makes this work: the browser never needs the local file, and the shell never needs a session cookie.

Result is a permanent `user-attachments/assets/<uuid>` URL you embed with `gh`.

## Requirements

- A browser automation tool that can run JavaScript on a **logged-in** github.com page (Synth browser MCP, Playwright, Chrome DevTools MCP, `agent-browser` — any of them; only `evaluate` is needed)
- `gh` CLI authenticated
- `curl`

## Quick start

**1. On any github.com page for the target repo**, grab the upload credentials:

```js
(() => {
  const dz = document.querySelector('file-attachment.js-upload-markdown-image');
  return JSON.stringify({
    csrf: document.querySelector('.js-data-upload-policy-url-csrf').value,
    repoId: dz.getAttribute('data-upload-repository-id'),
  });
})()
```

**2. Request policies** for your files — sizes must be exact (`stat -f%z`), the policy is bound to the byte count:

```js
// see scripts/request-policies.js — paste with your [name, size] list
```

**3. Upload the bytes** (no browser):

```bash
scripts/upload-to-s3.sh policies.txt    # pipe-delimited: name|key|policy|signature
```

**4. Finalise** in the browser, which returns the permanent URLs:

```js
// see scripts/finalise.js
```

**5. Embed** — note `gh pr edit` silently fails on some repos (Projects-classic GraphQL error), so patch directly:

```bash
gh api -X PATCH repos/OWNER/REPO/pulls/123 -F body=@body.md
```

Use `<img src="…" width="460">` rather than `![](…)` so you can control size in before/after tables.

Full snippets: [REFERENCE.md](REFERENCE.md)

## Gotchas

- **Anonymous `curl` on the asset URL returns 404.** Expected — assets are `private` and gated on repo access. Verify by checking `naturalWidth > 0` on the rendered page, not by fetching the URL.
- **GitHub rewrites the URL** at render time into a signed `private-user-images.githubusercontent.com` link. Store the `user-attachments` one; it stays valid.
- **Policies expire in about an hour** and are bound to an exact byte size. Re-request if a file changes.
- **Don't try to fetch local files into the page.** GitHub's CSP `connect-src` blocks localhost, `frame-src` blocks a relay iframe, popups are blocked without a gesture, and `navigator.clipboard.read()` hangs waiting for a permission gesture. All four are dead ends — the shell does the byte upload for a reason.
- **Base64-inlining files into JS doesn't scale.** A few MB of images becomes millions of tokens.
- **Videos work.** `content_type: video/mp4` takes the same path — the policy is bound to a byte count, not a file type. Convert to H.264 (`ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p out.mp4`); GitHub renders it as a native `<video>`.

## Past ~20 files

Three habits that are optional when small and mandatory when not — full flow in
[REFERENCE.md](REFERENCE.md#at-scale).

- **Throttle to ~1 policy request every 1.2s.** A tight loop earns a `429` that carries no
  `Retry-After`, ignores the hourly reset, and took ~35 minutes to clear; probing while limited seems
  to extend it. Spaced out, it never fires.
- **Never return the policies themselves.** Have the browser return `name|key|expiration|signature`
  (~130 bytes/file, vs ~700) and rebuild on disk with
  `scripts/rebuild-policies.py compact.txt manifest.tsv sample-policy.txt`.
- **Read results back in chunks of ~30.** One `evaluate` returning everything gets truncated by the
  tool layer, and a truncated policy list fails *silently*. Accumulate into `window.__POL`, then slice.

Skip pulling the finalise URLs back: the asset URL's UUID **is** the UUID in the S3 key, so derive
them from the keys you already hold. Finalise still has to run — the asset is unusable until it does —
but its return value is redundant.

## When not to use this

If images may be regenerated often, or reviewers need them without repo access, commit them to a branch and use `raw.githubusercontent.com` URLs instead.
