import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { detectPaths, parseSpan } from "./detect"
import { fakeIO } from "./fake-io"
import { nodeFileIO } from "./node-io"
import { deniedBy, isWithin, normalizeAbsolute, rootOf } from "./policy"
import { resolve, type Env, type FileIO, type Refusal } from "./resolve"
import type { Origin } from "./types"

const env: Env = { cwd: "/Users/isaac/git/proj", home: "/Users/isaac", platform: "darwin" }

const MB = 1024 * 1024

const tree = {
  "/Users/isaac": null,
  "/Users/isaac/git/proj": null,
  "/Users/isaac/Movies": null,
  "/Users/isaac/Movies/holibob-creator-onboarding-v11.mp4": 120 * MB,
  "/Users/isaac/Movies/My Video.mp4": 5 * MB,
  "/Users/isaac/Movies/Clip.MP4": 5 * MB,
  "/Users/isaac/Movies/folder.mp4": null,
  "/Users/isaac/Movies/locked.mp4": { type: "denied" as const },
  "/Users/isaac/Movies/fifo.mp4": { type: "other" as const },
  "/Users/isaac/Movies/huge.png": 100 * MB,
  "/Users/isaac/Movies/notes.txt": 10,
  "/Users/isaac/Pictures/café.png": 10,
  "/Users/isaac/git/proj/docs/a.md": 100,
  "/Users/isaac/git/proj/docs/sub dir/b c.md": 100,
  "/Users/isaac/git/proj/img/a.png": 100,
  "/Users/isaac/git/proj/data.json": 50,
  "/Users/isaac/git/proj/report.pdf": 5 * MB,
  "/Users/isaac/git/proj/table.csv": 5 * MB,
  "/Users/isaac/git/proj/song.mp3": 5 * MB,
  "/Users/isaac/git/proj/.env.json": 5,
  "/Users/isaac/git/proj/.git/config.json": 5,
  "/Users/isaac/.ssh/id_rsa.png": 5,
  "/Users/isaac/.ssh/config.md": 5,
  "/Users/isaac/.aws/cli/cache/token.json": 5,
  "/Users/isaac/.config/opencode/opencode.json": 5,
  "/Users/isaac/Library/Application Support/x/y.json": 5,
  "/Users/isaac/git/proj/server.pem.json": 5,
  "/Users/isaac/git/proj/credentials.json": 5,
  "/Users/isaac/git/proj/.env.example": 5,
  "/etc/passwd.png": 5,
  "/etc/hosts.png": 5,
  "/tmp/a.png": 5,
  "/Users/isaac2/a.png": 5,
  "/Users/isaac/git/proj/escape.png": { type: "link" as const, target: "/etc/hosts.png" },
  "/Users/isaac/git/proj/mismatch.png": { type: "link" as const, target: "/Users/isaac/git/proj/data.json" },
  "/Users/isaac/git/proj/ok-link.md": { type: "link" as const, target: "/Users/isaac/git/proj/docs/a.md" },
  "/Users/isaac/git/proj/to-secret.json": { type: "link" as const, target: "/Users/isaac/.aws/cli/cache/token.json" },
  "/Users/isaac/git/proj/to-home.png": { type: "link" as const, target: "/Users/isaac/Movies/huge.png" },
  "/Users/isaac/git/proj/loop.png": { type: "link" as const, target: "/Users/isaac/git/proj/loop.png" },
}

async function run(text: string, options: { origin?: Origin; env?: Env; io?: FileIO } = {}) {
  const parsed = parseSpan(text, { origin: options.origin })
  assert.ok(parsed.ok, `not a path: ${text} (${!parsed.ok && parsed.reason})`)
  return resolve(parsed.candidate, options.env ?? env, options.io ?? fakeIO(tree, { caseInsensitive: true, unicode: "insensitive" }))
}

const expectOk = async (text: string, options?: Parameters<typeof run>[1]) => {
  const result = await run(text, options)
  assert.equal(result.ok, true, `${text}: ${JSON.stringify(result)}`)
  return result.ok ? result : (undefined as never)
}

const expectRefused = async (text: string, reason: Refusal, options?: Parameters<typeof run>[1]) => {
  const result = await run(text, options)
  assert.equal(result.ok, false, `${text}: ${JSON.stringify(result)}`)
  assert.equal(!result.ok && result.reason, reason, text)
}

test("resolve: the motivating file", async () => {
  const result = await expectOk("~/Movies/holibob-creator-onboarding-v11.mp4")
  assert.equal(result.absolute, "/Users/isaac/Movies/holibob-creator-onboarding-v11.mp4")
  assert.equal(result.kind, "video")
  assert.equal(result.mime, "video/mp4")
  assert.equal(result.size, 120 * MB)
  assert.equal(result.root, "/Users/isaac")
})

test("resolve: forms", async () => {
  assert.equal((await expectOk("/Users/isaac/Movies/My Video.mp4")).kind, "video")
  assert.equal((await expectOk("docs/a.md")).absolute, "/Users/isaac/git/proj/docs/a.md")
  assert.equal((await expectOk("./docs/a.md")).kind, "markdown")
  assert.equal((await expectOk("../../Movies/My Video.mp4")).absolute, "/Users/isaac/Movies/My Video.mp4")
  assert.equal((await expectOk("img/a.png")).kind, "image")
  assert.equal((await expectOk("data.json")).kind, "json")
  assert.equal((await expectOk("report.pdf")).kind, "pdf")
  assert.equal((await expectOk("table.csv")).kind, "csv")
  assert.equal((await expectOk("song.mp3")).kind, "audio")
  assert.equal((await expectOk("$HOME/Movies/My Video.mp4")).absolute, "/Users/isaac/Movies/My Video.mp4")
  assert.equal((await expectOk("${HOME}/Movies/My Video.mp4")).absolute, "/Users/isaac/Movies/My Video.mp4")
  assert.equal((await expectOk("$PWD/docs/a.md")).absolute, "/Users/isaac/git/proj/docs/a.md")
  assert.equal((await expectOk("file:///Users/isaac/Movies/My%20Video.mp4")).absolute, "/Users/isaac/Movies/My Video.mp4")
  assert.equal((await expectOk("file://localhost/tmp/../Users/isaac/Movies/My%20Video.mp4")).absolute, "/Users/isaac/Movies/My Video.mp4")
  assert.equal((await expectOk("docs/sub dir/b c.md")).absolute, "/Users/isaac/git/proj/docs/sub dir/b c.md")
  assert.equal((await expectOk("docs//a.md")).absolute, "/Users/isaac/git/proj/docs/a.md")
  assert.equal((await expectOk("docs/./a.md")).absolute, "/Users/isaac/git/proj/docs/a.md")
  assert.equal((await expectOk("docs/sub dir/../a.md")).absolute, "/Users/isaac/git/proj/docs/a.md")
})

test("resolve: suffixes pass through", async () => {
  const text = await expectOk("docs/a.md:12:3")
  assert.equal(text.line, 12)
  assert.equal(text.column, 3)
  const video = await expectOk("~/Movies/My Video.mp4#t=1:12")
  assert.equal(video.time, 72)
  const page = await expectOk("report.pdf#page=4")
  assert.equal(page.page, 4)
  const anchor = await expectOk("docs/a.md#usage")
  assert.equal(anchor.anchor, "usage")
})

test("resolve: case and Unicode normalization on macOS", async () => {
  assert.equal((await expectOk("~/Movies/clip.mp4")).real, "/Users/isaac/Movies/Clip.MP4")
  assert.equal((await expectOk("~/Movies/CLIP.MP4")).real, "/Users/isaac/Movies/Clip.MP4")
  assert.equal((await expectOk("~/Pictures/café.png")).kind, "image")
  assert.equal((await expectOk("~/Pictures/cafe\u0301.png")).kind, "image")
  assert.equal((await expectOk("~/PICTURES/CAFÉ.PNG")).kind, "image")

  const sensitive = fakeIO(tree, { caseInsensitive: false, unicode: "sensitive" })
  assert.equal((await expectOk("~/Pictures/cafe\u0301.png", { io: sensitive })).absolute, "/Users/isaac/Pictures/café.png")
  await expectRefused("~/Movies/clip.mp4", "not-found", { io: sensitive, env: { ...env, platform: "linux" } })
  assert.equal((await expectOk("~/Movies/Clip.MP4", { io: sensitive, env: { ...env, platform: "linux" } })).kind, "video")
})

test("resolve: refusals before the file system is touched", async () => {
  const io = fakeIO(tree, { caseInsensitive: true })
  await expectRefused("/etc/passwd.png", "outside-roots", { io })
  await expectRefused("../../../../etc/passwd.png", "outside-roots", { io })
  await expectRefused("~/../../etc/passwd.png", "outside-roots", { io })
  await expectRefused("/tmp/a.png", "outside-roots", { io })
  await expectRefused("/Users/isaac2/a.png", "outside-roots", { io })
  await expectRefused("/Users/isaacx/a.png", "outside-roots", { io })
  await expectRefused("file:///etc/hosts.png", "outside-roots", { io })
  await expectRefused("~/.ssh/id_rsa.png", "denied-location", { io })
  await expectRefused("~/.ssh/config.md", "denied-location", { io })
  await expectRefused("~/.SSH/config.md", "denied-location", { io })
  await expectRefused("~/.aws/cli/cache/token.json", "denied-location", { io })
  await expectRefused("~/.config/opencode/opencode.json", "denied-location", { io })
  await expectRefused("~/Library/Application Support/x/y.json", "denied-location", { io })
  await expectRefused(".env.json", "denied-location", { io })
  await expectRefused(".git/config.json", "denied-location", { io })
  await expectRefused("credentials.json", "denied-location", { io })
  await expectRefused("notes.txt", "unsupported-type", { io })
  assert.deepEqual(io.calls.filter((call) => !call.startsWith("/Users/isaac") || call.includes(".ssh") || call.includes(".aws")), [])
})

test("resolve: platform and special forms", async () => {
  await expectRefused("C:\\Users\\isaac\\a.png", "windows-path-on-posix")
  await expectRefused("\\\\server\\share\\a.png", "unc-refused")
  await expectRefused("file://server/share/a.png", "unc-refused")
  await expectRefused("~root/a.png", "other-user-home")
  await expectRefused("$SECRET/a.png", "unresolved-variable")
  await expectRefused("${OTHER}/a.png", "unresolved-variable")
  await expectRefused("$TMPDIR/a.png", "unresolved-variable")
})

test("resolve: windows paths on windows", async () => {
  const win: Env = { cwd: "C:/Users/isaac/proj", home: "C:/Users/isaac", platform: "win32" }
  const io = fakeIO({ "C:/Users/isaac": null, "C:/Users/isaac/proj": null, "C:/Users/isaac/proj/a.png": 1, "C:/Users/isaac/Pictures/b.png": 1 }, { caseInsensitive: true })
  assert.equal((await expectOk("C:\\Users\\isaac\\proj\\a.png", { env: win, io })).kind, "image")
  assert.equal((await expectOk("c:/users/isaac/pictures/B.PNG", { env: win, io })).kind, "image")
  assert.equal((await expectOk("a.png", { env: win, io })).absolute, "C:/Users/isaac/proj/a.png")
  await expectRefused("D:\\other\\a.png", "outside-roots", { env: win, io })
})

test("resolve: file system states", async () => {
  await expectRefused("~/Movies/missing.mp4", "not-found")
  await expectRefused("~/Movies/folder.mp4", "is-directory")
  await expectRefused("~/Movies/locked.mp4", "permission-denied")
  await expectRefused("~/Movies/fifo.mp4", "not-a-file")
  await expectRefused("~/Movies/huge.png", "too-large")
  await expectRefused("~/Movies/notes.txt", "unsupported-type")
})

test("resolve: symlinks", async () => {
  assert.equal((await expectOk("ok-link.md")).real, "/Users/isaac/git/proj/docs/a.md")
  const escape = await run("escape.png")
  assert.equal(!escape.ok && escape.reason, "symlink-escape")
  await expectRefused("mismatch.png", "symlink-type-mismatch")
  await expectRefused("to-secret.json", "denied-location")
  await expectRefused("to-home.png", "too-large")
  await expectRefused("loop.png", "not-found")
})

test("resolve: roots", async () => {
  const other: Env = { cwd: "/Volumes/ext/proj", home: "/Users/isaac", platform: "darwin" }
  const io = fakeIO({ "/Volumes/ext/proj": null, "/Volumes/ext/proj/a.png": 1, "/Users/isaac": null, "/Volumes/ext/elsewhere/b.png": 1 }, { caseInsensitive: true })
  assert.equal((await expectOk("a.png", { env: other, io })).root, "/Volumes/ext/proj")
  await expectRefused("/Volumes/ext/elsewhere/b.png", "outside-roots", { env: other, io })

  const custom: Env = { ...env, roots: ["/Users/isaac/git/proj"] }
  assert.equal((await expectOk("docs/a.md", { env: custom })).kind, "markdown")
  await expectRefused("~/Movies/My Video.mp4", "outside-roots", { env: custom })

  const wide: Env = { ...env, roots: ["/"] }
  await expectRefused("docs/a.md", "no-usable-root", { env: wide })
})

test("resolve: a root behind a symlink still allows its files", async () => {
  const io = fakeIO(
    {
      "/var/proj": { type: "link", target: "/private/var/proj" },
      "/private/var/proj": null,
      "/private/var/proj/a.png": 1,
      "/Users/isaac": null,
    },
    { caseInsensitive: true },
  )
  const linked: Env = { cwd: "/var/proj", home: "/Users/isaac", platform: "darwin" }
  assert.equal((await expectOk("a.png", { env: linked, io })).root, "/private/var/proj")
})

test("resolve: alternatives are tried when the first reading is missing", async () => {
  const text = "Open ~/Movies/My Video.mp4 and notes.md"
  const [candidate] = detectPaths(text, { origin: "prose" })
  assert.equal(candidate?.path, "~/Movies/My Video.mp4")
  const result = await resolve(candidate!, env, fakeIO(tree, { caseInsensitive: true }))
  assert.equal(result.ok, true)

  const unspaced = detectPaths("see ~/Movies/Clip.MP4 and more", { origin: "prose" })
  assert.equal(unspaced[0]?.path, "~/Movies/Clip.MP4")
})

test("resolve: diff prefix alternatives", async () => {
  const [candidate] = detectPaths("--- a/docs/a.md", { origin: "prose" })
  assert.equal(candidate?.path, "docs/a.md")
  assert.equal((await resolve(candidate!, env, fakeIO(tree, { caseInsensitive: true }))).ok, true)
})

test("resolve: stat count stays bounded", async () => {
  const io = fakeIO(tree, { caseInsensitive: true })
  const [candidate] = detectPaths("a/b c d e f g.png", { origin: "code" })
  await resolve({ ...candidate!, alternatives: Array.from({ length: 50 }, (_, index) => `x${index}/y.png`) }, env, io)
  assert.ok(io.calls.length <= 14, `${io.calls.length} calls`)
})

test("resolve: the same environment checks its roots once", async () => {
  const io = fakeIO(tree, { caseInsensitive: true })
  const scoped: Env = { ...env }
  await run("docs/a.md", { env: scoped, io })
  await run("img/a.png", { env: scoped, io })
  assert.equal(io.calls.filter((call) => call === "/Users/isaac").length, 1)
})

// ---------------------------------------------------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------------------------------------------------

test("policy: normalizeAbsolute", () => {
  assert.equal(normalizeAbsolute("/a/b/../c/./d//e"), "/a/c/d/e")
  assert.equal(normalizeAbsolute("/../../x"), "/x")
  assert.equal(normalizeAbsolute("/"), "/")
  assert.equal(normalizeAbsolute("c:\\a\\..\\b"), "C:/b")
  assert.equal(normalizeAbsolute("C:/"), "C:/")
})

test("policy: isWithin is segment-wise", () => {
  assert.equal(isWithin("/a/b", "/a/b", false), true)
  assert.equal(isWithin("/a/b", "/a/b/c", false), true)
  assert.equal(isWithin("/a/b", "/a/bc", false), false)
  assert.equal(isWithin("/a/b/", "/a/b/c", false), true)
  assert.equal(isWithin("/a/b", "/a/B/c", true), true)
  assert.equal(isWithin("/a/b", "/a/B/c", false), false)
  assert.equal(isWithin("/a/é", "/a/e\u0301/c", true), true)
  assert.equal(isWithin("/a/b", "/a/b/../x", false), false)
})

test("policy: rootOf ignores a root that would allow everything", () => {
  assert.equal(rootOf("/x/y", ["/"], false), undefined)
  assert.equal(rootOf("C:/x", ["C:/"], true), undefined)
  assert.equal(rootOf("/x/y", ["/", "/x"], false), "/x")
})

test("policy: denylist", () => {
  const home = { home: "/Users/isaac", caseInsensitive: true }
  const denied = [
    "/Users/isaac/.ssh/known_hosts",
    "/Users/isaac/.aws/credentials",
    "/Users/isaac/.gnupg/pubring.json",
    "/Users/isaac/.kube/config.json",
    "/Users/isaac/.docker/config.json",
    "/Users/isaac/.config/gh/hosts.json",
    "/Users/isaac/.config/gcloud/credentials.json",
    "/Users/isaac/.local/share/opencode/auth.json",
    "/Users/isaac/Library/Keychains/x.json",
    "/Users/isaac/Library/Application Support/Google/Chrome/Default/x.json",
    "/work/proj/.env",
    "/work/proj/.env.local",
    "/work/proj/.env.production.json",
    "/work/proj/.git/config",
    "/work/proj/sub/.git/HEAD",
    "/work/proj/id_rsa",
    "/work/proj/id_ed25519.pub",
    "/work/proj/key.pem",
    "/work/proj/cert.p12",
    "/work/proj/terraform.tfstate",
    "/work/proj/prod.tfvars",
    "/work/proj/.npmrc",
    "/work/proj/.netrc",
    "/work/proj/client_secret_123.json",
    "/work/proj/service-account-prod.json",
    "/work/proj/secrets.json",
    "/work/proj/sub/credentials.json",
    "/work/x/.ssh/anything.md",
    "/Users/ISAAC/.SSH/KEY.md",
  ]

  for (const path of denied) assert.ok(deniedBy(path, home), path)

  const allowed = [
    "/Users/isaac/Movies/a.mp4",
    "/Users/isaac/git/proj/docs/a.md",
    "/Users/isaac/git/proj/.env.example",
    "/Users/isaac/git/proj/.env.sample",
    "/Users/isaac/.claude/projects/notes.md",
    "/Users/isaac/Library/Mobile Documents/com~apple~CloudDocs/a.pdf",
    "/Users/isaac/Documents/keys.md",
    "/Users/isaac/.github/workflows/readme.md",
    "/Users/isaac/git/proj/environment.json",
    "/Users/isaac/git/proj/gitignore.md",
  ]

  for (const path of allowed) assert.equal(deniedBy(path, home), undefined, path)
})

// ---------------------------------------------------------------------------------------------------------------------
// Real file system
// ---------------------------------------------------------------------------------------------------------------------

test("resolve: real files, real symlinks", async () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "fv-real-")))

  try {
    const home = join(base, "home")
    const project = join(home, "proj")
    const outside = join(base, "outside")

    mkdirSync(join(project, "docs"), { recursive: true })
    mkdirSync(join(home, ".ssh"), { recursive: true })
    mkdirSync(join(home, "Movies"), { recursive: true })
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(project, "docs", "a.md"), "# hi")
    writeFileSync(join(home, "Movies", "clip.mp4"), "x")
    writeFileSync(join(home, "Movies", "My Clip.mp4"), "x")
    writeFileSync(join(home, ".ssh", "id.png"), "x")
    writeFileSync(join(outside, "secret.png"), "x")
    writeFileSync(join(outside, "secret.md"), "x")
    mkdirSync(join(project, "folder.png"))
    symlinkSync(outside, join(project, "outdir"))
    symlinkSync(join(outside, "secret.png"), join(project, "link.png"))
    symlinkSync(join(home, ".ssh", "id.png"), join(project, "ssh.png"))
    symlinkSync(join(project, "docs", "a.md"), join(project, "inside.md"))
    symlinkSync(join(project, "docs"), join(project, "docs-link"))

    const real: Env = { cwd: project, home, platform: "linux" }
    const ok = async (text: string) => {
      const parsed = parseSpan(text)
      assert.ok(parsed.ok, text)
      return resolve(parsed.candidate, real, nodeFileIO)
    }

    const good = await ok("docs/a.md")
    assert.equal(good.ok && good.real, join(project, "docs", "a.md"))
    assert.equal((await ok("inside.md")).ok, true)
    assert.equal((await ok("docs-link/a.md")).ok, true)
    assert.equal((await ok(`${home}/Movies/clip.mp4`)).ok, true)
    assert.equal((await ok(`${home}/Movies/My Clip.mp4`)).ok, true)

    for (const [text, reason] of [
      ["link.png", "symlink-escape"],
      ["outdir/secret.md", "symlink-escape"],
      ["ssh.png", "denied-location"],
      ["folder.png", "is-directory"],
      ["missing.png", "not-found"],
      [`${outside}/secret.png`, "outside-roots"],
      ["../../outside/secret.png", "outside-roots"],
      [`${home}/.ssh/id.png`, "denied-location"],
      ["docs/../../../outside/secret.png", "outside-roots"],
    ] as const) {
      const result = await ok(text)
      assert.equal(result.ok, false, text)
      assert.equal(!result.ok && result.reason, reason, text)
    }
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
