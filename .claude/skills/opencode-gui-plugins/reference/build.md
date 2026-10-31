# Build, load and diagnose

Use the sibling packages in `~/git/dev-files/apps/opencode-plugins/` as working scaffolds. Each has its own lockfile and commands. Run commands from that package directory, prefixed with `npm_config_registry=https://registry.npmjs.org`.

## Install

Public packages accidentally resolved through the user's private CodeArtifact registry even with the environment prefix. Each plugin now has `.npmrc` containing only:

```ini
registry=https://registry.npmjs.org/
```

Preserve scoped registries for packages that actually need them. Inspect config keys rather than printing `.npmrc` or all environment variables: those may contain tokens.

The pnpm shim selected different versions depending on the working directory. Check `pnpm --version` inside the package. In pnpm 12, `onlyBuiltDependencies` did not approve esbuild's script; `pnpm approve-builds esbuild` wrote `allowBuilds: { esbuild: true }` to `pnpm-workspace.yaml`. Approve only the dependency reviewed, then repeat install and check its real exit status. Older pnpm versions use different approval settings.

SDK packages from the installed release may need targeted `minimumReleaseAgeExclude` entries; the existing workspace files show those for 2.2.5. Keep release-age exclusions narrow.

## Verification

1. `pnpm install` (frozen lockfile for reproducibility when already checked in).
2. `pnpm typecheck`, `pnpm test`, `pnpm build` from each package that declares those scripts.
3. Confirm `exports['./gui-experimental']` points to the emitted CommonJS file.
4. Check Extensions → Plugins for the active GUI and test the actual UI. Build/test success is not visual verification. Check switching sessions, rename, resize, light/dark, reduced motion, unload/reload, and duplicate injected nodes.

The Vite `gui()` preset externalizes the host's shared modules and inlines dynamic imports into one chunk. Use `effect`'s shared entry, not unsupported subpaths such as `effect/Schema`. Bundling another Solid/Effect instance breaks shared state; the preset rejects those imports.

Happy DOM and TypeScript's browser declarations have different element types. At the fixture boundary, cast `new Window().document as unknown as Document`; production functions continue accepting standard `Document`/`HTMLElement`. Tests should cover idempotency, missing nodes, status transitions and preserving app-owned title text.

Setup-level Solid tests need the browser export condition (`tsx --conditions=browser --test`), otherwise effects use the server implementation and hydration tests do not exercise reactive updates. In 2.2.5 the runtime permission list can be `undefined` before sync despite its non-optional declaration. Test that cold state and keep native attention visible until a replacement kind is known.

## Missing GUI

- Read https://opencode.ai/v2/docs/build/plugins/gui for the current contract; use installed `@opencode/plugin/dist/gui/*.d.ts` for release-specific signatures.
- Verify the global config lists the new directory and the bundle exists. A source save without a rebuild changes no bundle.
- Verify id ownership: GUI-only packages take their package name, falling back to directory name; server-backed packages take the server definition's id. The `opencode` namespace and collisions/nesting with built-in ids are reserved.
- A failing server entry prevents its GUI loading. A GUI-only package needs no dummy server export.
- Keep DOM and host-window access inside `setup`: the same file evaluates in the main process, where window modules are inert placeholders. Keep Node/Electron operations inside `main` for the inverse reason.
- Local bundle rebuilds reload the GUI automatically. If stale, use the Plugins Reload action rather than restarting the background service to apply config.

## Inspect installed source (read-only)

App internals were recovered from `/Applications/OpenCode.app/Contents/Resources/app.asar` JavaScript source maps. Use an ASAR reader, or parse its four little-endian header integers: JSON directory length is the fourth; file-data base offset is `8 + second`. Walk `files.out.files.renderer.files.assets.files`, read each `.js.map` at `base + offset`, then match `sources` to `sourcesContent`. Narrow by source path before extracting.

Write extracts to the approved session temporary directory and record original source paths. Treat them as implementation evidence for that app version, not an API promise. Leave the installed app unchanged.
