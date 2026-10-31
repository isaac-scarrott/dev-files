# Testing a plugin in the real UI

Verified on OpenCode 2.2.5, macOS. Unit tests and a built bundle prove nothing about the UI; this recipe loads the built bundle into a real app window you can screenshot and query.

## Which route

| Route | GUI plugins load | Use for |
| --- | --- | --- |
| Isolated second desktop app + CDP | yes | Verifying a plugin. The only route that works. |
| `opencode serve` opened in a browser (platform `web`) | **no** | Built-in UI only. |

The web app never fetches `/api/plugin/gui`. The plugin host (`platform.plugins`) is supplied only by the Electron shell; the web platform object has no such field, so the GUI plugin list is empty. The server still reports the plugins as `active` with `features.gui`, which looks like success. Do not use `serve` to test plugins.

The in-app `tools.browser.*` cannot drive another Electron renderer, and is `[browser.disconnected]` inside sub-agents. Drive the second app over the Chrome DevTools Protocol with `playwright-core` instead.

## Safety

Never restart, quit or reconfigure the user's app or its background service (`opencode-cli serve --service`, port 49374). The second app is isolated by `OPENCODE_DESKTOP_TEST_ROOT`, which points userData and all four `XDG_*` dirs at one throwaway root: its own `service.json`, database and `opencode.json`. Kill only the PIDs you started. Never copy `blindfold` or any secret-bearing plugin or provider credentials into the throwaway config.

Side effects to expect: a second app window opens on the user's screen, and first launch creates an empty `~/Documents/Default Project` (onboarding). `scripts/desktop-harness.sh stop` removes it only if the run created it.

## Recipe

```sh
S=~/git/dev-files/.claude/skills/opencode-gui-plugins/scripts   # or this checkout's path
P=~/git/dev-files/apps/opencode-plugins
$S/desktop-harness.sh start $P/sidebar-repos $P/snooze-archive    # ~6s, prints the CDP url
# ... drive and screenshot ...
$S/desktop-harness.sh stop
```

`start` writes `opencode.json` with only the plugin dirs you pass, sets the isolated service to port 49555 (the user's service owns 49374; the same port makes the second app show "An error occurred while starting the local server"), launches `OpenCode --remote-debugging-port=9333` with the test root, and seeds sessions. Override with `OC_HARNESS_ROOT`, `OC_HARNESS_CDP_PORT`, `OC_HARNESS_SERVICE_PORT`. Plugin directories must already be built (`dist/gui-experimental.cjs`).

Drive it (once: `mkdir pw && cd pw && npm i playwright-core`, public registry):

```js
import { chromium } from "playwright-core"
const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
const page = browser.contexts()[0].pages()[0]          // oc://renderer/index.html
await page.getByText("Seeded long session").first().click()   // from the Home list
await page.screenshot({ path: "/private/tmp/oc-shot.png" })
await browser.close()                                   // disconnects; the app keeps running
```

Confirm the plugin loaded before anything else: `document.querySelectorAll("style[data-plugin]")` lists a `<style data-plugin="<plugin-id>">` per loaded plugin that registers a `Style`. Errors surface in the page console and in `$ROOT/data/opencode/log/opencode.log` and `$ROOT/desktop/logs/*/renderer.log`.

### Seeded sessions

`scripts/seed-session.mjs <baseUrl> <password> <dir> [turns]` imports a parent session and a child with 40 user/assistant turns each through `POST /api/experimental/session/import`, using no model. The service URL and password are in `$ROOT/state/opencode/service.json`. `POST /api/session/{id}/synthetic` only queues inbox items that never render without a model turn, so it cannot seed history. Edit the script for subagent tool parts, long code blocks or other shapes. The imported child currently shows as a separate root session titled like the parent; check `parentID` handling before relying on a subagent tree.

### Opening the plugin UI

- Sidebar rows (`sidebar-repos`, `snooze-archive` sidebar): Settings → Preferences → **Side tabs** (`[data-titlebar-tab][data-orientation="vertical"]`). The default layout is top tabs, so a vertical-tab plugin shows nothing until you switch. After switching, "Back to app" is hidden; click the session tab in the sidebar instead.
- Slots (`session.header` actions) render in the session header with no setup.
- Commands: command palette.

### Hot reload

`touch` or rebuild `dist/gui-experimental.cjs`. The service logs `loading plugin` for each plugin and the window re-renders the plugin without reloading the page (a `window.__marker` set before the touch survived, and the injected nodes were still present). Extensions → Plugins → Reload is the fallback.

### Teardown

`desktop-harness.sh stop`, then check `lsof -nP -iTCP:9333 -iTCP:49555 -sTCP:LISTEN` is empty and the user's `opencode-cli serve --service` PID is unchanged.

## Differences from the user's desktop

The second app is the same Electron build with the same renderer, so `platform` is `desktop` and `main(ctx)`/`ctx.main(Ipc)` run normally. It differs from the user's window in data only: an empty database, your seeded sessions, only the plugins you listed, default settings (top tabs, light theme), a fresh window size (about 2000x1190 here, set the viewport before pixel checks), and no providers, so the composer shows `seed (unavailable)`.

The web app (`opencode serve`) differs more: `platform` is `web`, there is no `window.desktop`, no Electron-only APIs, notifications go through the browser API, and it needs a password login ("Connect to a server" → Use password → server URL and the password printed at start). Routing also differs: the desktop renderer stays at `oc://renderer/index.html` with an in-memory router, so `location.href` never changes per session, while the web app uses real paths like `/server/<base64 url>/session/<id>`. Navigate the desktop by clicking, not by URL.

## Limits in 2.2.5

- Web cannot load GUI plugins (above); revisit if a later release adds `platform.plugins` to the web platform.
- The CDP flag works only as a command-line switch; `OPENCODE_DESKTOP_REMOTE_DEBUGGING_PORT` is ignored in the packaged prod app.
- Only one app per test root (single-instance lock follows userData).
- The first run on a fresh root opens a new session in "Default Project"; the seeded sessions are under Home.
- Settings pages hide "Back to app" in side-tab layout; selectors that work in one layout can time out in the other.
