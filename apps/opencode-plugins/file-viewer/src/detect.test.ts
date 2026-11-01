import assert from "node:assert/strict"
import test from "node:test"
import { detectPaths, parseSpan, parseTime, splitSuffix } from "./detect"
import type { Candidate, Origin, RejectReason } from "./types"

type Expect = string | Partial<Candidate> | `!${RejectReason}`

/** `[input, expectation]`: a path string, a subset of the candidate, or `!reason` for a rejection. */
type Case = readonly [input: string, expect: Expect, origin?: Origin]

function check(cases: readonly Case[]) {
  for (const [input, expected, origin] of cases) {
    test(`${origin ?? "code"}: ${JSON.stringify(input)}`, () => {
      const parsed = parseSpan(input, { origin })

      if (typeof expected === "string" && expected.startsWith("!")) {
        assert.equal(parsed.ok, false, `expected a rejection but got ${JSON.stringify(parsed.ok && parsed.candidate)}`)
        assert.equal(!parsed.ok && parsed.reason, expected.slice(1))
        return
      }

      assert.equal(parsed.ok, true, `expected a path but got ${JSON.stringify(parsed)}`)

      if (!parsed.ok) return

      const subset = typeof expected === "string" ? { path: expected } : expected

      for (const [key, value] of Object.entries(subset)) {
        assert.deepEqual((parsed.candidate as unknown as Record<string, unknown>)[key], value, `${key} of ${JSON.stringify(input)}`)
      }
    })
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------------------------------

check([
  // The motivating case.
  ["~/Movies/holibob-creator-onboarding-v11.mp4", { path: "~/Movies/holibob-creator-onboarding-v11.mp4", form: "tilde", viewerKind: "video", ext: "mp4" }],
  ["~/Movies/clip.mov", { form: "tilde", viewerKind: "video" }],
  ["~/a.png", { form: "tilde", viewerKind: "image" }],
  ["~root/a.png", { form: "tilde-user", path: "~root/a.png" }],
  ["~alice.b-c/notes.md", { form: "tilde-user" }],
  ["~+/a.png", "!tilde-special"],
  ["~-/a.png", "!tilde-special"],
  ["~1/a.png", "!tilde-special"],
  ["~", "!not-a-path"],
  ["/Users/isaac/Movies/x.mp4", { form: "absolute", confidence: "high" }],
  ["/tmp/x.json", { form: "absolute", viewerKind: "json" }],
  ["/", "!root-only"],
  ["/api/users", { form: "absolute", confidence: "low" }],
  ["/Users/isaac/projects", { form: "absolute", confidence: "medium" }],
  ["./docs/a.md", { form: "relative-dot", path: "./docs/a.md" }],
  ["../shared/b.csv", { form: "relative-dot", viewerKind: "csv" }],
  ["../../etc/passwd", { form: "relative-dot", confidence: "medium" }],
  ["docs/a.md", { form: "relative", viewerKind: "markdown" }],
  ["a.png", { form: "bare", viewerKind: "image" }],
  ["report.final.pdf", { form: "bare", ext: "pdf", viewerKind: "pdf" }],
  ["a.tar.gz", { form: "bare", ext: "gz" }],
  ["v1.2.mp4", { form: "bare", ext: "mp4" }],
  ["archive.2026.11.01.csv", { ext: "csv" }],
  [".", "!not-a-path"],
  ["..", "!not-a-path"],
  ["./", "!directory"],
  ["src/", "!directory"],
  ["~/Movies/", "!directory"],
  // Windows
  ["C:\\Users\\isaac\\a.png", { form: "windows", path: "C:/Users/isaac/a.png" }],
  ["c:/tmp/a.png", { form: "windows", path: "c:/tmp/a.png" }],
  ["D:\\mixed/slashes\\a.mp4", { form: "windows", path: "D:/mixed/slashes/a.mp4" }],
  ["C:foo.png", "!drive-relative"],
  ["\\\\server\\share\\a.png", { form: "unc", path: "//server/share/a.png" }],
  ["//server/share/a.png", "!protocol-relative"],
  ["//cdn.example.com/a.png", "!protocol-relative"],
  ["docs\\sub\\a.md", { form: "relative", path: "docs/sub/a.md" }],
  [".\\a.md", { form: "relative-dot", path: "./a.md" }],
  // file URLs
  ["file:///tmp/a.png", { form: "file-url", path: "/tmp/a.png" }],
  ["file:///tmp/a%20b.png", { path: "/tmp/a b.png" }],
  ["file://localhost/tmp/a.png", { path: "/tmp/a.png" }],
  ["FILE:///tmp/a.png", { path: "/tmp/a.png" }],
  ["file:///C:/Users/x/a.png", { form: "windows", path: "C:/Users/x/a.png" }],
  ["file:///C:/a%20b/c.png", { path: "C:/a b/c.png" }],
  ["file://server/share/a.png", { form: "unc", path: "//server/share/a.png" }],
  ["file:///tmp/a.png?raw=1", { path: "/tmp/a.png" }],
  ["file:///tmp/a.mp4#t=30", { path: "/tmp/a.mp4", time: 30 }],
  ["file:///tmp/a.ts#L10-L20", { path: "/tmp/a.ts", line: 10, endLine: 20 }],
  ["file:///tmp/%E2%9C%93.png", { path: "/tmp/✓.png" }],
  ["file:///tmp/a%2fb.png", "!encoded-separator"],
  ["file:///tmp/a%5Cb.png", "!encoded-separator"],
  ["file:///tmp/a%00.png", "!encoded-separator"],
  ["file:///tmp/a%ZZ.png", "!bad-escape"],
  // Environment variables
  ["$HOME/a.png", { form: "env", envVar: "HOME", path: "$HOME/a.png" }],
  ["${HOME}/Movies/a.mp4", { form: "env", envVar: "HOME" }],
  ["$PWD/out/a.png", { form: "env", envVar: "PWD" }],
  ["%USERPROFILE%/a.png", { form: "env", envVar: "USERPROFILE" }],
  ["/tmp/$USER/a.png", "!shell-substitution"],
  ["$(pwd)/a.png", "!shell-substitution"],
  ["/tmp/`whoami`/a.png", "!shell-substitution"],
  ["~/a$b.png", "!shell-substitution"],
])

// ---------------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------------

check([
  [".env", { path: ".env", confidence: "medium" }],
  [".gitignore", { path: ".gitignore" }],
  ["~/.zshrc", { path: "~/.zshrc" }],
  ["~/.config/opencode/opencode.json", { viewerKind: "json" }],
  ["Dockerfile", { path: "Dockerfile" }],
  ["Makefile:12", { path: "Makefile", line: 12 }],
  ["README", { path: "README" }],
  ["docs/README", { confidence: "high" }],
  ["~/bin/run", { form: "tilde", confidence: "low" }],
  ["./bin/run", { form: "relative-dot", confidence: "medium" }],
  ["/usr/local/bin/node", { confidence: "medium" }],
  ["src/utils", { form: "relative", confidence: "low" }],
  ["café.png", "café.png"],
  ["café.png".normalize("NFD"), { ext: "png" }],
  ["日本語/動画.mp4", { path: "日本語/動画.mp4", viewerKind: "video" }],
  ["~/Movies/🎬 final cut.mp4", { path: "~/Movies/🎬 final cut.mp4", viewerKind: "video" }],
  ["👨‍👩‍👧/a.png", { path: "👨‍👩‍👧/a.png" }],
  ["משהו/קובץ.pdf", { viewerKind: "pdf" }],
  ["app/(auth)/[id]/page.tsx", { path: "app/(auth)/[id]/page.tsx" }],
  ["@scope/pkg/dist/a.png", { form: "relative", path: "@scope/pkg/dist/a.png" }],
  ["node_modules/@scope/pkg/README.md", { viewerKind: "markdown" }],
  ["a b.png", "a b.png", "href"],
  ["Final Report.pdf", { path: "Final Report.pdf", viewerKind: "pdf" }, "decoded-href"],
  ["Photo (1).png", { path: "Photo (1).png" }],
  ["docs/My Notes.md", { path: "docs/My Notes.md" }],
  ["~/My Docs/a.png", { path: "~/My Docs/a.png" }],
  ["a.PNG", { ext: "png", viewerKind: "image" }],
  ["CLIP.MOV", { ext: "mov", viewerKind: "video" }],
  ["a.jpeg", { viewerKind: "image" }],
  ["a.svg", { viewerKind: "image", ext: "svg" }],
  ["a.avif", { viewerKind: "image" }],
  ["song.flac", { viewerKind: "audio" }],
  ["notes.mdx", { viewerKind: "markdown" }],
  ["data.tsv", { viewerKind: "csv" }],
  ["tsconfig.jsonc", { viewerKind: "json" }],
  ["x.webm", { viewerKind: "video" }],
  ["x.m4v", { viewerKind: "video" }],
  ["x.m4a", { viewerKind: "audio" }],
  ["x.ogg", { viewerKind: "audio" }],
  ["x.wav", { viewerKind: "audio" }],
  ["x.mp3", { viewerKind: "audio" }],
  ["x.gif", { viewerKind: "image" }],
  ["x.webp", { viewerKind: "image" }],
  ["x.jpg", { viewerKind: "image" }],
])

// ---------------------------------------------------------------------------------------------------------------------
// Wrapping and trailing punctuation
// ---------------------------------------------------------------------------------------------------------------------

check([
  ["`a.png`", { path: "a.png", quoted: true }],
  ['"a.png"', { path: "a.png", quoted: true }],
  ["'a.png'", { path: "a.png", quoted: true }],
  ["<a.png>", { path: "a.png" }],
  ["(a.png)", { path: "a.png" }],
  ["(file.png).", { path: "file.png" }],
  ["[a.png]", { path: "a.png" }],
  ["a.png,", "a.png"],
  ["a.png.", "a.png"],
  ["a.png;", "a.png"],
  ["a.png:", "a.png"],
  ["a.png!", "a.png"],
  ["a.png?", "a.png"],
  ["a.png)", "a.png"],
  ["a.png]", "a.png"],
  ["a.png…", "a.png"],
  ["a.png),", "a.png"],
  ['("a.png").', "a.png"],
  ["'a.png'.", "a.png"],
  ["a.ts:12:", { path: "a.ts", line: 12 }],
  ["a.ts:12.", { path: "a.ts", line: 12 }],
  ["(a.ts:12)", { path: "a.ts", line: 12 }],
  ["Photo (1).png", "Photo (1).png"],
  ["Photo (1).png.", "Photo (1).png"],
  ["(Photo (1).png)", "Photo (1).png"],
  ["app/(auth)/page.tsx,", "app/(auth)/page.tsx"],
  ["app/[id]/page.tsx.", "app/[id]/page.tsx"],
  ["(a)(b).png", "(a)(b).png"],
  ["\"unterminated.png", "unterminated.png"],
  ["a.png\u00a0", "a.png"],
  ["  a.png  ", { path: "a.png", start: 2, end: 7 }],
])

// ---------------------------------------------------------------------------------------------------------------------
// Suffixes
// ---------------------------------------------------------------------------------------------------------------------

check([
  ["file.ts:12", { path: "file.ts", line: 12 }],
  ["file.ts:12:3", { path: "file.ts", line: 12, column: 3 }],
  ["file.ts:12-20", { path: "file.ts", line: 12, endLine: 20 }],
  ["file.ts:12:3-20:8", { line: 12, column: 3, endLine: 20, endColumn: 8 }],
  ["file.ts:20-12", { line: 12, endLine: 20 }],
  ["file.ts#L10", { line: 10 }],
  ["file.ts#L10-L20", { line: 10, endLine: 20 }],
  ["file.ts#L10-20", { line: 10, endLine: 20 }],
  ["file.ts#L10C5", { line: 10, column: 5 }],
  ["file.ts#L10C5-L12C3", { line: 10, column: 5, endLine: 12, endColumn: 3 }],
  ["file.ts#l7", { line: 7 }],
  ["file.ts(12,3)", { path: "file.ts", line: 12, column: 3 }],
  ["file.ts(12)", { path: "file.ts", line: 12 }],
  ["file.ts:0", { path: "file.ts" }],
  ["file.ts:99999999999", { path: "file.ts" }],
  ["docs/Makefile#L3", { path: "docs/Makefile", line: 3 }],
  ["video.mp4#t=72", { path: "video.mp4", time: 72 }],
  ["video.mp4#t=72s", { time: 72 }],
  ["video.mp4#t=1:12", { time: 72 }],
  ["video.mp4#t=1:02:03", { time: 3723 }],
  ["video.mp4#t=1m12s", { time: 72 }],
  ["video.mp4#t=1h2m3s", { time: 3723 }],
  ["video.mp4#t=72,90", { time: 72 }],
  ["video.mp4#t=72.5", { time: 72.5 }],
  ["video.mp4#t=", { path: "video.mp4", anchor: "t=" }],
  ["video.mp4@1:12", { path: "video.mp4", time: 72 }],
  ["video.mp4@72", { time: 72 }],
  ["video.mp4@1m12s", { time: 72 }],
  ["video.mp4 @1:12", { path: "video.mp4", time: 72 }],
  ["video.mp4:1:12", { path: "video.mp4", time: 72 }],
  ["video.mp4:72", { path: "video.mp4", time: 72 }],
  ["~/Movies/v11.mp4@2:05", { time: 125 }],
  ["song.mp3@0:30", { time: 30 }],
  ["a.png@1:12", "!unknown-extension"],
  ["doc.pdf#page=3", { path: "doc.pdf", page: 3 }],
  ["doc.pdf#page=3&zoom=100", { page: 3 }],
  ["docs/a.md#usage", { path: "docs/a.md", anchor: "usage" }],
  ["docs/a.md#usage-and-more", { anchor: "usage-and-more" }],
  ["C#/a.cs", { path: "C#/a.cs" }],
  ["a#b.png", { path: "a#b.png" }],
  ["#section", "!fragment-only"],
  ["?query", "!fragment-only"],
  ["C:\\a\\b.ts:12", { form: "windows", line: 12, path: "C:/a/b.ts" }],
  ["file.ts:12", { line: 12 }, "decoded-href"],
])

// ---------------------------------------------------------------------------------------------------------------------
// Not paths: URLs, versions, numbers, words, globs, commands
// ---------------------------------------------------------------------------------------------------------------------

check([
  ["http://example.com/a.png", "!url"],
  ["https://example.com/a.png", "!url"],
  ["https://example.com/a.png#t=3", "!url"],
  ["HTTPS://EXAMPLE.COM/A.PNG", "!url"],
  ["ftp://host/a.png", "!url"],
  ["ssh://git@host/a.png", "!url"],
  ["s3://bucket/a.png", "!url"],
  ["data:image/png;base64,AAAA", "!scheme"],
  ["mailto:a@b.com", "!scheme"],
  ["javascript:alert(1)", "!scheme"],
  ["tel:5551234", "!scheme"],
  ["git@github.com:owner/repo.git", "!scp-url"],
  ["user@host:/tmp/a.png", "!scp-url"],
  ["example.com/a.png", "!domain"],
  ["www.example.com/a.png", "!domain"],
  ["sub.example.org/dir/a.pdf", "!domain"],
  ["example.com", "!unknown-extension"],
  ["user@example.com", "!unknown-extension"],
  ["localhost:3000/a.png", "!host-port"],
  ["127.0.0.1:8080/a.png", "!host-port"],
  ["127.0.0.1:8080", "!version"],
  ["1.2.3", "!version"],
  ["v1.2.3", "!version"],
  ["10.0.0.1", "!version"],
  ["12:30", "!numeric"],
  ["3.14", "!version"],
  ["1/2", "!numeric"],
  ["24/7", "!numeric"],
  ["2026/11/01", "!numeric"],
  ["2026-11-01", "!numeric"],
  ["and/or", { confidence: "low" }],
  ["TODO/FIXME", { confidence: "low" }],
  ["TODO", "!no-extension"],
  ["FIXME", "!no-extension"],
  ["Foo.Bar.baz", "!unknown-extension"],
  ["console.error", "!unknown-extension"],
  ["e.g", "!unknown-extension"],
  ["i.e.", "!unknown-extension"],
  ["foo", "!no-extension"],
  ["foo.", "!no-extension"],
  ["*.png", "!glob"],
  ["src/**/*.ts", "!glob"],
  ["a?.png", "!glob"],
  ["{a,b}.png", "!glob"],
  ["~/Movies/*.mp4", "!glob"],
  ["a|b.png", "!invalid-char"],
  ["a<b>.png", "!invalid-char"],
  ["a.png", "a.png"],
  ["-o", "!no-extension"],
  ["--out", "!no-extension"],
  ["@scope/pkg", { confidence: "low" }],
  ["", "!empty"],
  ["   ", "!empty"],
  ["ffplay ~/a.mp4", "!not-a-path"],
  ["open a.mp4", "!not-a-path"],
  ["cat docs/a.md", "!not-a-path"],
  ["~/bin/run -o out.mp4", "!not-a-path"],
  ["ffmpeg -i in.mov out.mp4", "!not-a-path"],
  ["ls > out.txt", "!invalid-char"],
  ["see a.png", "!not-a-path"],
  ["draft a.png", { path: "draft a.png" }],
])

// ---------------------------------------------------------------------------------------------------------------------
// Hostile input
// ---------------------------------------------------------------------------------------------------------------------

check([
  ["/tmp/a\u0000.png", "!null-byte"],
  ["/tmp/a%00.png", "!null-byte"],
  ["%2e%2e/etc/passwd.png", "!encoded-traversal"],
  ["%2E%2E/a.png", "!encoded-traversal"],
  ["../%2e%2e/a.png", "!encoded-traversal"],
  [".%2e/a.png", "!encoded-traversal"],
  ["%2e/a.png", "!encoded-traversal"],
  ["a%2fb.png", "!encoded-separator"],
  ["a%5cb.png", "!encoded-separator"],
  ["a%2Fb.png", "!encoded-separator"],
  ["docs/a\nb.png", "!newline"],
  ["docs/a\rb.png", "!newline"],
  ["docs/a\tb.png", "!control-char"],
  ["docs/a\u0007b.png", "!control-char"],
  ["docs/a\u200bb.png", "!bidi-control"],
  ["docs/\u202egpj.png", "!bidi-control"],
  ["docs/a\u2066b.png", "!bidi-control"],
  ["docs/\ufeffa.png", "!bidi-control"],
  [`${"a/".repeat(2100)}x.png`, "!too-long"],
  [`${"x".repeat(300)}.png`, "!segment-too-long"],
  ["..%2f..%2fetc%2fpasswd.png", "!encoded-separator"],
  // A markdown link destination is decoded once, as the host does; `%2e%2e` then is a real parent segment.
  ["%2e%2e/a.png", { form: "relative-dot", path: "../a.png" }, "href"],
  ["a%20b.png", { path: "a b.png" }, "href"],
  ["a%2520b.png", { path: "a%20b.png" }, "href"],
  ["a%ZZ.png", "!bad-escape", "href"],
  ["a%00.png", "!control-char", "href"],
  // A host-decoded href that still contains escapes was double encoded.
  ["%2e%2e/a.png", "!encoded-traversal", "decoded-href"],
  ["a%20b.png", { path: "a%20b.png" }, "decoded-href"],
])

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

test("parseTime", () => {
  assert.equal(parseTime("72"), 72)
  assert.equal(parseTime("1:12"), 72)
  assert.equal(parseTime("0:05"), 5)
  assert.equal(parseTime("1:02:03"), 3723)
  assert.equal(parseTime("2m"), 120)
  assert.equal(parseTime("1h"), 3600)
  assert.equal(parseTime("abc"), undefined)
  assert.equal(parseTime(""), undefined)
  assert.equal(parseTime("1:2:3:4"), undefined)
})

test("splitSuffix leaves a path without a suffix alone", () => {
  assert.deepEqual(splitSuffix("a/b.png"), { body: "a/b.png" })
})

test("a candidate reports its range inside the input", () => {
  const parsed = parseSpan('  "docs/a.md:3"  ')
  assert.equal(parsed.ok && parsed.candidate.start, 3)
  assert.equal(parsed.ok && parsed.candidate.end, 14)
  assert.equal(parsed.ok && parsed.candidate.raw, "docs/a.md:3")
})

test("detectPaths on a span returns one candidate or none", () => {
  assert.equal(detectPaths("~/a.png").length, 1)
  assert.equal(detectPaths("hello world").length, 0)
  assert.equal(detectPaths("see a.png").length, 0)
})

test("spans below minConfidence are dropped", () => {
  assert.equal(detectPaths("and/or", { minConfidence: "medium" }).length, 0)
  assert.equal(detectPaths("and/or").length, 1)
})
