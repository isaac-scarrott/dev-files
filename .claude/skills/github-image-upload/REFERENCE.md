# Reference

## Step 1 — credentials

Run on any github.com page for the target repo (a PR page is fine). The dropzone element carries both values:

```js
(() => {
  const dz = document.querySelector('file-attachment.js-upload-markdown-image');
  if (!dz) return JSON.stringify({ error: 'no dropzone — is a comment box present?' });
  return JSON.stringify({
    csrf: document.querySelector('.js-data-upload-policy-url-csrf').value,
    repoId: dz.getAttribute('data-upload-repository-id'),
    policyUrl: dz.getAttribute('data-upload-policy-url'), // /upload/policies/assets
  });
})()
```

## Step 2 — request policies

Generate the file list from the shell first, so sizes are exact:

```bash
cd <image dir>
for f in *.png; do printf '["%s",%s],' "$f" "$(stat -f%z "$f")"; done | sed 's/,$//'
```

Paste that into `F` below. It returns one pipe-delimited line per file, and stashes the finalise
data on `window.__FIN` for step 4.

```js
(async () => {
  const F = [/* ["name.png", 12345], … */];
  const csrf = document.querySelector('.js-data-upload-policy-url-csrf').value;
  const repoId = document.querySelector('file-attachment.js-upload-markdown-image')
    .getAttribute('data-upload-repository-id');
  window.__FIN = [];
  const out = [];
  for (const [name, size] of F) {
    const fd = new FormData();
    fd.append('authenticity_token', csrf);
    fd.append('content_type', 'image/png');
    fd.append('name', name);
    fd.append('size', String(size));
    fd.append('repository_id', repoId);
    const r = await fetch('/upload/policies/assets', {
      method: 'POST', body: fd, headers: { Accept: 'application/json' },
    });
    if (r.status !== 201) { out.push(`${name}|FAIL${r.status}`); continue; }
    const j = await r.json();
    window.__FIN.push({ name, fin: j.asset_upload_url, tok: j.asset_upload_authenticity_token, href: j.asset.href });
    out.push([name, j.form.key, j.form.policy, j.form['X-Amz-Signature']].join('|'));
  }
  return out.join('\n');
})()
```

Only `key`, `policy` and `X-Amz-Signature` vary per file. The bucket URL, algorithm, credential and
date are identical across a batch — the upload script reads them back out of the first policy, so a
rotation surfaces as an error rather than 87 opaque 403s.

Set `content_type` to match the file (`image/jpeg`, `image/gif`, `video/mp4`…). GitHub accepts the
extensions listed on the file input's `accept` attribute. `video/mp4` needs nothing special: the
policy binds a byte count, not a type. Encode H.264/`yuv420p` and GitHub renders a native `<video>`.

Beyond ~20 files this snippet is the wrong shape — see [At scale](#at-scale).

## Step 3 — upload

Save step 2's output to `policies.txt`, then:

```bash
scripts/upload-to-s3.sh policies.txt
```

Every line should report `204`. Anything else means the policy expired, the size didn't match the
file exactly, or the credential block needs refreshing (see the script header).

## Step 4 — finalise

```js
(async () => {
  const out = [];
  for (const e of window.__FIN) {
    const fd = new FormData();
    fd.append('authenticity_token', e.tok);
    const r = await fetch(e.fin, { method: 'PUT', body: fd, headers: { Accept: 'application/json' } });
    out.push(`${e.name}=${r.status === 200 ? e.href : 'FAIL' + r.status}`);
  }
  return out.join('\n');
})()
```

Each `href` is `https://github.com/user-attachments/assets/<uuid>` — permanent, and what you embed.

## Step 5 — embed

Appending to a PR body without clobbering it:

```bash
cur=$(gh api repos/OWNER/REPO/pulls/123 --jq .body)
printf '%s\n\n---\n\n%s\n' "$cur" "$NEW_SECTION" > /tmp/body.md
gh api -X PATCH repos/OWNER/REPO/pulls/123 -F body=@/tmp/body.md
```

`-F body=@file` avoids shell-quoting problems with markdown. For issues and comments use
`repos/OWNER/REPO/issues/123` and `repos/OWNER/REPO/issues/comments/<id>`.

Before/after table that reads well in review:

```markdown
### Desktop
| Before | After |
|---|---|
| <img src="https://github.com/user-attachments/assets/UUID-A" width="460"> | <img src="…UUID-B" width="460"> |

### Mobile (390px)
| Before | After |
|---|---|
| <img src="…UUID-C" width="260"> | <img src="…UUID-D" width="260"> |
```

## Step 6 — verify

The asset URL 404s for anonymous `curl`, so check the rendered page instead:

```js
(() => {
  const el = document.querySelector('#issuecomment-<id>') || document.querySelector('.markdown-body');
  return JSON.stringify([...el.querySelectorAll('img')].map(i => ({ w: i.naturalWidth, h: i.naturalHeight })));
})()
```

`naturalWidth > 0` means it genuinely loaded. Reload the page first — GitHub rewrites the src to a
signed `private-user-images.githubusercontent.com` URL at render time.

Count `<video>` elements the same way for mp4s; GitHub renders them as native players, not links.

## At scale

Step 2's snippet returns every policy in one call. Past ~20 files that fails three ways at once, so
restructure it.

**Throttle, and accumulate in the page rather than returning.** Push each result onto a global and
return only a count, so a slow batch can't be truncated mid-flight:

```js
window.__POL = window.__POL || [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [name, size, type] of window.__MAN.slice(START, END)) {
  // …fetch the policy exactly as in step 2…
  window.__POL.push([name, j.form.key, JSON.parse(atob(j.form.policy)).expiration,
                     j.form['X-Amz-Signature']].join('|'));
  await sleep(1200);                      // under this, expect 429
}
return 'ok:' + window.__POL.length;
```

A `429` here has no `Retry-After` and does not respect the hourly reset — budget ~35 minutes, and
stop probing while you wait, which appears to prolong it.

**Read it back in slices** — `window.__POL.slice(0, 30).join('\n')` — because one big return gets
truncated by the tool layer, and a half-written policy list fails silently rather than loudly.

**Rebuild the policies locally.** Fetch one full policy as a template, then:

```bash
scripts/rebuild-policies.py compact.txt manifest.tsv sample-policy.txt > policies.txt
```

`manifest.tsv` is `name<TAB>path<TAB>size<TAB>content-type`. The script swaps only key, expiration,
size and content-type, and aborts if the template doesn't round-trip — which is the signal that
GitHub changed the policy shape.

**Derive the final URLs from the keys.** The asset UUID is the key's UUID:

```bash
sed -E 's#^[^|]*\|[0-9]+/[0-9]+-([0-9a-f-]{36})\..*#https://github.com/user-attachments/assets/\1#' policies.txt
```

Step 4 still has to run — the asset is unusable until finalised — but you can throw away its output.

## Why the obvious shortcuts fail

Worth knowing so they aren't re-attempted:

| Approach | Outcome |
|---|---|
| `fetch('http://localhost:…/img.png')` from the page | Blocked by CSP `connect-src`. HTTPS fetches from the same page succeed, so it isn't mixed content. |
| Relay page via `window.open` + `postMessage` | Popup blocked without a user gesture. |
| Relay via `<iframe>` + `postMessage` | Blocked by CSP `frame-src`. |
| `navigator.clipboard.read()` after `osascript` puts a PNG on the clipboard | Hangs — needs document focus and a permission gesture that never arrives in automation. |
| Base64 the file into the JS expression | Works for tiny files only; a few MB becomes millions of tokens. |
| `gh api -X POST https://github.com/upload/policies/assets` | Returns an HTML error page. Web endpoints reject token auth; they need session cookies plus CSRF. |
