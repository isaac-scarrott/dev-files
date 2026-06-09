# Vendored: dagre.min.js

`dagre.min.js` is the layout engine the map runtime uses to place boxes and route
edges. It is checked in directly (a **pinned** third-party lib), not tracked in the
repo's `vendor.manifest` — that mechanism auto-follows upstream branches, which is
the wrong behaviour for a pinned dependency.

- **Package:** `@dagrejs/dagre`
- **Version:** `3.0.0` (pinned)
- **License:** MIT (© Chris Pettitt and dagre contributors)
- **Source / verify:** https://cdn.jsdelivr.net/npm/@dagrejs/dagre@3.0.0/dist/dagre.min.js
- **SHA-256:** `1c0a293258078a8e7d34493e3500d7a1018434e30e5a30d81318d98328bde655`

## Update

```sh
curl -fsSL "https://cdn.jsdelivr.net/npm/@dagrejs/dagre@<version>/dist/dagre.min.js" \
  -o "$(dirname "$0")/dagre.min.js"
```

Bump `<version>` deliberately, then re-test the map (the runtime calls
`dagre.graphlib.Graph` + `dagre.layout`). It's inlined into each built map by
`scripts/build-map.mjs`, behind a `structuredClone` polyfill.
