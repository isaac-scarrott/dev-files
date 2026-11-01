import assert from "node:assert/strict"
import test from "node:test"
import { maskCodeBlocks, scanMarkdown } from "./markdown"

const paths = (markdown: string, prose = false) => scanMarkdown(markdown, { prose }).map((item) => item.path)
const sources = (markdown: string) => scanMarkdown(markdown).map((item) => item.source)

type Case = readonly [name: string, markdown: string, expected: readonly string[]]

const cases: readonly Case[] = [
  ["inline code", "The video is `~/Movies/holibob-creator-onboarding-v11.mp4` (2:05)", ["~/Movies/holibob-creator-onboarding-v11.mp4"]],
  ["the real sentence", "The full video is now in option A: `~/Movies/holibob-creator-onboarding-v11.mp4` (2:05)", ["~/Movies/holibob-creator-onboarding-v11.mp4"]],
  ["two code spans", "`a.png` and `docs/b.md:12`", ["a.png", "docs/b.md"]],
  ["double backtick span", "``~/a b.png``", ["~/a b.png"]],
  ["span with padding spaces", "`` ~/a.png ``", ["~/a.png"]],
  ["a backtick in a name is refused", "`` a`b.png ``", []],
  ["unclosed backtick is literal", "a ` b.png", []],
  ["mismatched runs are literal", "`` a.png `", []],
  ["escaped backtick", "\\`a.png\\`", []],
  ["code with spaces and name", "`Final Report.pdf`", ["Final Report.pdf"]],
  ["code with a command", "`ffplay ~/a.mp4`", []],
  ["not a path", "`npm install` and `foo.bar()` and `1.2.3`", []],
  ["link", "[the guide](docs/guide.md)", ["docs/guide.md"]],
  ["link with title", '[g](docs/guide.md "Title here")', ["docs/guide.md"]],
  ["link with line", "[x](src/app.ts#L10-L20)", ["src/app.ts"]],
  ["link percent encoded", "[x](docs/my%20file.md)", ["docs/my file.md"]],
  ["link with parens", "[x](docs/a_(1).md)", ["docs/a_(1).md"]],
  ["link angle destination with spaces", "[x](<docs/my file.md>)", ["docs/my file.md"]],
  ["link file url", "[x](file:///tmp/a%20b.mp4)", ["/tmp/a b.mp4"]],
  ["link http is not local", "[x](https://example.com/a.png)", []],
  ["link anchor only", "[x](#section)", []],
  ["link mailto", "[x](mailto:a@b.com)", []],
  ["link tilde", "[video](~/Movies/a.mp4)", ["~/Movies/a.mp4"]],
  ["link windows", "[x](C:\\Users\\a.png)", ["C:/Users/a.png"]],
  ["link with text that looks like a path", "[docs/a.md](docs/b.md)", ["docs/b.md"]],
  ["nested brackets", "[a [b] c](docs/x.md)", ["docs/x.md"]],
  ["image", "![alt text](assets/shot.png)", ["assets/shot.png"]],
  ["image with title", '![alt](assets/shot.png "t")', ["assets/shot.png"]],
  ["not a link without bracket", "text](docs/a.md)", []],
  ["reference definition", "[ref]: docs/a.md", ["docs/a.md"]],
  ["reference definition angle", "[ref]: <my docs/a.md> 'T'", ["my docs/a.md"]],
  ["autolink file", "<file:///tmp/a.png>", ["/tmp/a.png"]],
  ["autolink http", "<https://example.com/a.png>", []],
  ["html img", '<img src="assets/a.png" alt="x">', ["assets/a.png"]],
  ["html video", "<video src='~/m.mp4' controls></video>", ["~/m.mp4"]],
  ["html anchor", '<a href="docs/a.md">a</a>', ["docs/a.md"]],
  ["html unknown tag", '<div data-x="a.png"></div>', []],
  ["prose is not scanned by default", "Open docs/a.md and ~/b.png now", []],
  ["fenced block is not scanned", "```\n~/a.png\n`b.png`\n[x](c.png)\n```", []],
  ["fenced block with language", "```sh\nopen ~/a.mp4\n```\nAfter `d.png`", ["d.png"]],
  ["tilde fence", "~~~\n`a.png`\n~~~\n`b.png`", ["b.png"]],
  ["longer fence closes only on the same length", "````\n```\n`a.png`\n```\n````\n`b.png`", ["b.png"]],
  ["unclosed fence runs to the end", "`a.png`\n```\n`b.png`", ["a.png"]],
  ["fence with backtick info is not a fence", "``` `a.png` ```", ["a.png"]],
  ["indented code block", "para\n\n    `a.png`\n\n`b.png`", ["b.png"]],
  ["indented in list is a paragraph", "- item\n\n    `a.png`\n", ["a.png"]],
  ["indented continuation without blank", "para\n    `a.png`", ["a.png"]],
  ["list items", "- `a.png`\n- [b](b.md)\n1. `~/c.mp4`", ["a.png", "b.md", "~/c.mp4"]],
  ["table cells", "| file |\n| --- |\n| `a.png` |\n| [b](docs/b.md) |", ["a.png", "docs/b.md"]],
  ["blockquote", "> see `docs/a.md`", ["docs/a.md"]],
  ["heading", "## `docs/a.md`", ["docs/a.md"]],
  ["bold", "**`~/a.png`**", ["~/a.png"]],
  ["mixed in one line", "`a.png` [b](b.md) ![c](c.png) <file:///d.png> [r]: not at line start", ["a.png", "b.md", "c.png", "/d.png"]],
  ["duplicates are kept", "`a.png` `a.png`", ["a.png", "a.png"]],
  ["empty", "", []],
  ["only fences", "```\n```", []],
  ["crlf line endings", "`a.png`\r\n```\r\n`b.png`\r\n```\r\n`c.png`", ["a.png", "c.png"]],
  ["unicode", "`~/Vidéos/été 🎬.mp4`", ["~/Vidéos/été 🎬.mp4"]],
  ["traversal in link", "[x](../../etc/passwd.png)", ["../../etc/passwd.png"]],
  ["encoded traversal in link decodes to a parent path", "[x](%2e%2e/a.png)", ["../a.png"]],
]

for (const [name, markdown, expected] of cases) {
  test(`markdown: ${name}`, () => {
    assert.deepEqual(paths(markdown), expected)
  })
}

test("markdown: sources are labelled", () => {
  assert.deepEqual(sources("`a.png` [b](b.md) ![c](c.png) <file:///d.png>\n\n[r]: e.md\n\n<img src=\"f.png\">"), [
    "code",
    "link",
    "image",
    "autolink",
    "definition",
    "html",
  ])
})

test("markdown: ranges index the original source", () => {
  const markdown = "Intro `~/Movies/a.mp4#t=72` and [b](<my docs/b.md:3>) end"

  for (const item of scanMarkdown(markdown)) {
    assert.equal(markdown.slice(item.start, item.end), item.raw)
  }

  assert.deepEqual(
    scanMarkdown(markdown).map((item) => item.raw),
    ["~/Movies/a.mp4#t=72", "my docs/b.md:3"],
  )
})

test("markdown: prose option scans the rest but not code blocks, spans or link destinations twice", () => {
  const markdown = "Open docs/a.md and `b.png` then [c](c.md).\n```\nd.png\n```\nAlso ~/e.mp4."
  const found = scanMarkdown(markdown, { prose: true })

  assert.deepEqual(
    found.map((item) => [item.path, item.source]),
    [
      ["docs/a.md", "prose"],
      ["b.png", "code"],
      ["c.md", "link"],
      ["~/e.mp4", "prose"],
    ],
  )
})

test("markdown: maskCodeBlocks keeps offsets and newlines", () => {
  const markdown = "a\n```\nb\n```\nc\n    d\ne"
  const masked = maskCodeBlocks(markdown)

  assert.equal(masked.length, markdown.length)
  assert.equal(masked.split("\n").length, markdown.split("\n").length)
  assert.equal(masked.split("\n")[0], "a")
  assert.equal(masked.split("\n")[2]!.trim(), "")
  assert.equal(masked.split("\n")[4], "c")
})

test("markdown: performance on hostile input is linear", () => {
  const inputs = [
    "`".repeat(200_000),
    "` ".repeat(100_000),
    "[".repeat(100_000),
    "[a](".repeat(50_000),
    "[a](<".repeat(50_000),
    "<img src=".repeat(30_000),
    "`a` `` ``` ```` ".repeat(20_000),
    "```\n".repeat(50_000),
    "    x\n\n".repeat(50_000),
    "[r]: ".repeat(40_000),
  ]

  for (const input of inputs) {
    const begin = performance.now()
    scanMarkdown(input)
    const took = performance.now() - begin
    assert.ok(took < 3_000, `${input.slice(0, 12)}...: ${took}ms`)
  }
})
