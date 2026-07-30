#!/usr/bin/env python3
"""Rebuild full S3 POST policies from compact per-file data.

A policy is base64 JSON whose only per-file parts are the key, the expiration and
the byte size. Everything else — bucket, credential, algorithm, date, cache headers —
is constant across a batch. So the browser only has to hand back
`name|key|expiration|signature` (~130 bytes/file) instead of the whole blob (~700),
and this script reconstructs the rest byte-identically.

That matters because every byte the browser returns crosses into the agent's context.

Usage:
  rebuild-policies.py compact.txt manifest.tsv sample-policy.txt > policies.txt

  compact.txt       one line per file: name|key|expiration|signature
  manifest.tsv      one line per file: name<TAB>relative-path<TAB>size<TAB>content-type
  sample-policy.txt ONE full base64 policy from the same batch, used as the template
                    so a credential/date rotation cannot silently break the batch

Output is the `name|key|policy|signature` format upload-to-s3.sh expects, with
`name` set to the relative path so the uploader can find the file on disk.

Verify before trusting a large batch: rebuild the sample's own line and confirm it
matches the original exactly. This script does that automatically and exits 1 if not.
"""
import base64
import json
import sys


def b64d(s):
    return base64.b64decode(s + "=" * (-len(s) % 4))


def build(template, key, expiration, size, content_type):
    """Clone the template policy, swapping only the per-file fields."""
    doc = json.loads(b64d(template))
    doc["expiration"] = expiration
    for cond in doc["conditions"]:
        if isinstance(cond, list) and cond and cond[0] == "content-length-range":
            cond[1] = cond[2] = size
        elif isinstance(cond, dict):
            if "key" in cond:
                cond["key"] = key
            elif "Content-Type" in cond:
                cond["Content-Type"] = content_type
    return base64.b64encode(json.dumps(doc, separators=(",", ":")).encode()).decode()


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    compact_path, manifest_path, sample_path = sys.argv[1:4]

    manifest = {}
    for line in open(manifest_path):
        line = line.rstrip("\n")
        if not line:
            continue
        name, path, size, content_type = line.split("\t")
        manifest[name] = (path, int(size), content_type)

    template = open(sample_path).read().strip()
    sample = json.loads(b64d(template))
    sample_key = next(c["key"] for c in sample["conditions"] if isinstance(c, dict) and "key" in c)
    sample_size = next(
        c[1] for c in sample["conditions"] if isinstance(c, list) and c[0] == "content-length-range"
    )
    sample_ct = next(
        c["Content-Type"] for c in sample["conditions"] if isinstance(c, dict) and "Content-Type" in c
    )
    if build(template, sample_key, sample["expiration"], sample_size, sample_ct) != template:
        sys.exit("template does not round-trip — GitHub changed the policy shape; rebuild by hand")

    out, missing = [], []
    for line in open(compact_path):
        line = line.rstrip("\n")
        if not line:
            continue
        name, key, expiration, signature = line.split("|")
        if key.startswith("FAIL"):
            missing.append(f"{name}: policy request failed ({key})")
            continue
        if name not in manifest:
            missing.append(f"{name}: not in manifest")
            continue
        path, size, content_type = manifest[name]
        out.append(f"{path}|{key}|{build(template, key, expiration, size, content_type)}|{signature}")

    print("\n".join(out))
    if missing:
        print(f"\n{len(missing)} skipped:", file=sys.stderr)
        for m in missing:
            print(f"  {m}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
