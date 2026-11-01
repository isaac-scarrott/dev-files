import assert from "node:assert/strict"
import test from "node:test"
import { detectPaths } from "./detect"

const prose = (text: string, minConfidence?: "low" | "medium" | "high") => detectPaths(text, { origin: "prose", minConfidence })

type Case = readonly [name: string, text: string, expected: readonly string[]]

const cases: readonly Case[] = [
  ["tilde with sentence period", "Saved to ~/Movies/holibob-creator-onboarding-v11.mp4.", ["~/Movies/holibob-creator-onboarding-v11.mp4"]],
  ["the motivating sentence", "The full video is now in option A: ~/Movies/holibob-creator-onboarding-v11.mp4 (2:05)", ["~/Movies/holibob-creator-onboarding-v11.mp4"]],
  ["absolute path", "Open /Users/isaac/Movies/clip.mov now", ["/Users/isaac/Movies/clip.mov"]],
  ["relative with dot", "See ./docs/a.md for details", ["./docs/a.md"]],
  ["parent relative", "Edit ../shared/b.csv please", ["../shared/b.csv"]],
  ["bare relative", "Read docs/guide.md first", ["docs/guide.md"]],
  ["bare file", "Then run report.pdf through the printer", ["report.pdf"]],
  ["in parentheses", "(see ./b/c.png)", ["./b/c.png"]],
  ["trailing comma", "Files: docs/a.md, docs/b.md, and docs/c.md.", ["docs/a.md", "docs/b.md", "docs/c.md"]],
  ["trailing colon", "Result in out/a.png: looks good", ["out/a.png"]],
  ["trailing semicolon", "cp a.png b.png; done", ["a.png", "b.png"]],
  ["exclamation and question", "Is it /tmp/a.png? Yes /tmp/b.png!", ["/tmp/a.png", "/tmp/b.png"]],
  ["line suffix", "Error at src/app.ts:42:7 in the handler", ["src/app.ts"]],
  ["time suffix", "Jump to ~/Movies/demo.mp4@1:12 to see it", ["~/Movies/demo.mp4"]],
  ["hash time", "Jump to demo.mp4#t=72 to see it", ["demo.mp4"]],
  ["quoted with spaces", 'Open "~/My Docs/Final Report.pdf" next', ["~/My Docs/Final Report.pdf"]],
  ["single quoted bare", "Open 'my file.png' next", ["my file.png"]],
  ["backticks", "Run `ffplay ~/a.mp4` or look at `docs/a.md`", ["~/a.mp4", "docs/a.md"]],
  ["angle brackets", "Open <my file.png> now", ["my file.png"]],
  ["markdown link", "Read [the guide](docs/guide.md) now", ["docs/guide.md"]],
  ["markdown link with title", 'Read [the guide](docs/guide.md "Guide") now', ["docs/guide.md"]],
  ["markdown link with spaces", "Read [it](<my docs/a file.md>) now", ["my docs/a file.md"]],
  ["image", "![shot](assets/shot.png)", ["assets/shot.png"]],
  ["escaped spaces", "Open ~/My\\ Docs/a\\ b.png now", ["~/My Docs/a b.png"]],
  ["spaces without quotes after ~", "Saved to ~/Movies/My Video v2.mp4. Then more.", ["~/Movies/My Video v2.mp4"]],
  ["macos screenshot", "See Screenshot 2026-11-01 at 10.12.34 AM.png please", ["Screenshot 2026-11-01 at 10.12.34 AM.png"]],
  ["macos screenshot narrow nbsp", "See Screenshot 2026-11-01 at 10.12.34\u202fAM.png please", ["Screenshot 2026-11-01 at 10.12.34\u202fAM.png"]],
  ["screen recording", "~/Desktop/Screen Recording 2026-11-01 at 10.12.34.mov", ["~/Desktop/Screen Recording 2026-11-01 at 10.12.34.mov"]],
  ["two spaced files stay apart", "~/a b.png and ~/c d.png", ["~/a b.png", "~/c d.png"]],
  ["spaced does not swallow later file", "Open ~/Movies/My Video.mp4 and notes.md", ["~/Movies/My Video.mp4", "notes.md"]],
  ["file url", "Open file:///tmp/a%20b.png now", ["/tmp/a b.png"]],
  ["windows", "Open C:\\Users\\isaac\\a.png now", ["C:/Users/isaac/a.png"]],
  ["windows with spaces after drive", "Open C:\\Users\\isaac\\My Pics\\a.png now", ["C:/Users/isaac/My Pics/a.png"]],
  ["unc", "Open \\\\server\\share\\a.png now", ["//server/share/a.png"]],
  ["env var", "Open $HOME/Movies/a.mp4 or ${HOME}/b.png", ["$HOME/Movies/a.mp4", "${HOME}/b.png"]],
  ["comma list without spaces", "Files a.png,b.png,c.png ready", ["a.png", "b.png", "c.png"]],
  ["comma inside a name stays", "Open report,final.pdf now", ["report,final.pdf"]],
  ["dotfile", "Edit .gitignore and ~/.zshrc", [".gitignore", "~/.zshrc"]],
  ["no extension named", "Edit Dockerfile and Makefile", ["Dockerfile", "Makefile"]],
  ["unicode", "Ouvre ~/Vidéos/été.mp4 et 日本語/動画.mp4", ["~/Vidéos/été.mp4", "日本語/動画.mp4"]],
  ["emoji", "Play ~/Movies/🎬.mp4 now", ["~/Movies/🎬.mp4"]],
  ["repeated path", "a.png then a.png and a.png", ["a.png", "a.png", "a.png"]],
  ["list", "- docs/a.md\n- ~/b.png\n1. ./c.csv\n2. d.json", ["docs/a.md", "~/b.png", "./c.csv", "d.json"]],
  ["table", "| file | note |\n| a.png | x |\n| docs/b.md | y |", ["a.png", "docs/b.md"]],
  ["flag with equals", "tool --out=./o.mp4 --in=/tmp/i.mov", ["./o.mp4", "/tmp/i.mov"]],
  ["env assignment", "OUT=build/a.png make", ["build/a.png"]],
  ["ffmpeg command", "ffmpeg -i in.mov -vf scale=1280:-1 out.mp4", ["in.mov", "out.mp4"]],
  ["redirect", "cat a.txt > b.txt", ["a.txt", "b.txt"]],
  ["pipe", "cat a.json | jq . > b.json", ["a.json", "b.json"]],
  ["cd and open", "cd ~/proj && open docs/a.pdf", ["docs/a.pdf"]],
  ["dev null redirect", "run 2>/dev/null", []],
  ["diff header", "diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts", ["src/x.ts", "src/x.ts", "src/x.ts", "src/x.ts"]],
  ["a/ b/ outside diff are plain relative", "Open a/foo.md and b/bar.md", ["a/foo.md", "b/bar.md"]],
  ["url ignored", "See https://example.com/a.png and http://x.io/b.mp4", []],
  ["url with query ignored", "See https://example.com/a.png?x=1&y=2.", []],
  ["scheme-less domain ignored", "Visit example.com/a.png or www.site.org/b.md", []],
  ["scp ignored", "git clone git@github.com:owner/repo.git", []],
  ["email ignored", "Mail me at user@example.com", []],
  ["version ignored", "Upgrade 1.2.3 to v2.0.1 by 12:30", []],
  ["fractions and dates ignored", "Use and/or 1/2 on 2026/11/01 at 24/7 TODO/FIXME", []],
  ["identifiers ignored", "Call Foo.Bar.baz and console.error(e) then e.g. this", []],
  ["product names ignored", "Built with Next.js, Node.js and Vue.js", []],
  ["package names ignored", "Install @scope/pkg and @types/node", []],
  ["glob ignored", "Matches *.png and src/**/*.ts and ~/Movies/*.mp4", []],
  ["shell substitution ignored", "Open $(pwd)/a.png or ${X}${Y}/b.png", []],
  ["numbers", "Costs 3.50 and 1,000.00 for 5/6 items", []],
  ["empty", "", []],
  ["only spaces", "   \n  ", []],
  ["apostrophe", "Don't open Bob's a.png please", ["a.png"]],
  ["sentence quotes", 'He said "open a.png" and left', ["a.png"]],
  ["html attributes", '<img src="assets/a.png"> and <a href="docs/b.md">b</a>', ["assets/a.png", "docs/b.md"]],
  ["newline separates", "a.png\nb.png", ["a.png", "b.png"]],
  ["path with newline never joins", "docs/a\nb.png", ["b.png"]],
  ["tab separated", "a.png\tb.png", ["a.png", "b.png"]],
  ["null byte", "open /tmp/a\u0000.png now", []],
  ["traversal text", "Try ../../etc/passwd.png now", ["../../etc/passwd.png"]],
  ["encoded traversal ignored", "Try %2e%2e/%2e%2e/x.png now", []],
  ["bidi ignored", "Open docs/\u202egpj.png now", []],
]

for (const [name, text, expected] of cases) {
  test(`prose: ${name}`, () => {
    assert.deepEqual(
      prose(text).map((candidate) => candidate.path),
      expected,
    )
  })
}

test("prose: ranges point at the matched text", () => {
  const text = 'Open ~/a.png, "b c.png" and (docs/d.md:7). Then C:\\x\\e.pdf.'

  for (const candidate of prose(text)) {
    assert.equal(text.slice(candidate.start, candidate.end), candidate.raw)
  }

  assert.deepEqual(
    prose(text).map((candidate) => candidate.raw),
    ["~/a.png", "b c.png", "docs/d.md:7", "C:\\x\\e.pdf"],
  )
})

test("prose: ranges stay inside the text for every case", () => {
  for (const [, text] of cases) {
    for (const candidate of prose(text)) {
      assert.ok(candidate.start >= 0 && candidate.end <= text.length && candidate.start < candidate.end, text)
    }
  }
})

test("prose: ranges never overlap and ascend", () => {
  for (const [, text] of cases) {
    const found = prose(text)

    for (let index = 1; index < found.length; index++) {
      assert.ok(found[index - 1]!.end <= found[index]!.start, text)
    }
  }
})

test("prose: diff prefix is stripped and kept as an alternative", () => {
  const [first] = prose("--- a/src/x.ts")
  assert.equal(first?.path, "src/x.ts")
  assert.deepEqual(first?.alternatives, ["a/src/x.ts"])
})

test("prose: spaced readings keep the longer reading as a fallback", () => {
  const [first] = prose("~/Movies/My Video.mp4 and notes.md")
  assert.equal(first?.path, "~/Movies/My Video.mp4")
  assert.ok(first?.alternatives.includes("~/Movies/My Video.mp4 and notes.md"))
})

test("prose: low confidence tokens are opt-in", () => {
  assert.equal(prose("see src/utils now").length, 0)
  assert.equal(prose("see src/utils now", "low").length, 1)
})

test("prose: maxCandidates caps the work", () => {
  const found = detectPaths("a.png ".repeat(10_000), { origin: "prose", maxCandidates: 25 })
  assert.equal(found.length, 25)
})

test("prose: fields carry through", () => {
  const [candidate] = prose("play ~/Movies/demo.mp4#t=1:12 now")
  assert.equal(candidate?.time, 72)
  assert.equal(candidate?.viewerKind, "video")
  assert.equal(candidate?.form, "tilde")
})

// ---------------------------------------------------------------------------------------------------------------------
// Performance: linear time, no catastrophic backtracking
// ---------------------------------------------------------------------------------------------------------------------

const hostile: ReadonlyArray<readonly [string, (n: number) => string]> = [
  ["slashes", (n) => "a/".repeat(n)],
  ["dots", (n) => ".".repeat(n)],
  ["dot segments", (n) => "../".repeat(n)],
  ["tildes", (n) => "~".repeat(n)],
  ["quotes", (n) => '"'.repeat(n)],
  ["alternating quotes", (n) => `"a `.repeat(n)],
  ["apostrophes", (n) => "x'y ".repeat(n)],
  ["backticks", (n) => "`".repeat(n)],
  ["escaped spaces", (n) => "\\ ".repeat(n)],
  ["escaped paren", (n) => "\\(".repeat(n)],
  ["colon digits", (n) => ":1".repeat(n)],
  ["digit run then colon", (n) => `a.ts:${"1".repeat(n)}x`],
  ["hash digits", (n) => `a.ts#L${"1".repeat(n)}x`],
  ["parens", (n) => "(".repeat(n)],
  ["closing parens", (n) => `a.png${")".repeat(n)}`],
  ["brackets", (n) => "[".repeat(n)],
  ["braces with commas", (n) => `{${"a,".repeat(n)}`],
  ["at signs", (n) => "@1:".repeat(n)],
  ["words", (n) => "word ".repeat(n)],
  ["paths", (n) => "~/a/b/c.png ".repeat(n)],
  ["spaced path starts", (n) => "~/a b c d e f g h ".repeat(n)],
  ["screenshot starts", (n) => "Screenshot a b c d e f g ".repeat(n)],
  ["commas", (n) => "a,".repeat(n)],
  ["comma png", (n) => "a.png,".repeat(n)],
  ["percent", (n) => "%2e".repeat(n)],
  ["dollar", (n) => "$".repeat(n)],
  ["dollar braces", (n) => "${".repeat(n)],
  ["angle", (n) => "<".repeat(n)],
  ["unicode", (n) => "é日🎬".repeat(n)],
  ["newlines", (n) => "\n".repeat(n)],
  ["diff lines", (n) => "--- a/x.ts\n".repeat(n)],
  ["no boundary", (n) => "a".repeat(n)],
  ["domain-like", (n) => "a.com/".repeat(n)],
  ["version-like", (n) => "1.".repeat(n)],
  ["scheme-like", (n) => "a:".repeat(n)],
  ["time-like", (n) => "x.mp4@1:".repeat(n)],
]

function time(run: () => void) {
  const begin = performance.now()
  run()
  return performance.now() - begin
}

for (const [name, make] of hostile) {
  test(`performance: ${name} is linear`, () => {
    const small = make(20_000)
    const large = make(80_000)
    // Warm up so JIT does not distort the ratio.
    prose(make(2_000))
    const first = Math.max(time(() => prose(small)), 1)
    const second = time(() => prose(large))
    assert.ok(second < 4_000, `${name}: ${second}ms for ${large.length} chars`)
    // 4x the input should cost about 4x; allow 12x for noise but fail for quadratic (16x).
    assert.ok(second / first < 12, `${name}: ${first}ms -> ${second}ms`)
  })
}

test("performance: a very long span is rejected without scanning it", () => {
  const begin = performance.now()
  assert.equal(detectPaths("a/".repeat(5_000_000)).length, 0)
  assert.ok(performance.now() - begin < 200)
})
