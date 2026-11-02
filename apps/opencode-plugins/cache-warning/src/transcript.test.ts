import assert from "node:assert/strict"
import { mkdir, mkdtemp, symlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { nativeSessionID } from "./native"
import { encodeCwd, findTranscript, newestWrite, TAIL_BYTES, Transcripts } from "./transcript"

const ID = "7fefc90b-1a0f-4533-9f78-d11c45ee7954"

/** One transcript line as Claude Code writes it, with only the numbers the reader looks at. */
const line = (timestamp: string, five: number, hour: number, extra: object = {}) =>
  JSON.stringify({
    type: "assistant",
    timestamp,
    message: {
      content: [{ type: "text", text: "SECRET REPLY" }],
      usage: {
        cache_creation_input_tokens: five + hour,
        cache_read_input_tokens: 121526,
        cache_creation: { ephemeral_1h_input_tokens: hour, ephemeral_5m_input_tokens: five },
        ...extra,
      },
    },
  })

const T1 = "2026-11-01T10:00:00.000Z"
const T2 = "2026-11-01T10:05:00.000Z"
const T3 = "2026-11-01T10:09:00.000Z"

test("the newest request that wrote the 5 minute tier reads as 5m, with its time", () => {
  assert.deepEqual(newestWrite(line(T1, 898, 0), false), { ttl: "5m", at: Date.parse(T1) })
})

test("any write to the 1 hour tier reads as 1h", () => {
  assert.deepEqual(newestWrite(line(T1, 0, 2000), false), { ttl: "1h", at: Date.parse(T1) })
  assert.deepEqual(newestWrite(line(T1, 300, 2000), false), { ttl: "1h", at: Date.parse(T1) })
})

test("mixed history: the newest write wins, so a newer tier replaces an older one", () => {
  assert.equal(newestWrite([line(T1, 0, 2000), line(T2, 500, 0)].join("\n"), false)?.ttl, "5m")
  assert.equal(newestWrite([line(T1, 500, 0), line(T2, 0, 2000)].join("\n"), false)?.ttl, "1h")
})

test("a request served wholly from cache writes nothing: the last known tier carries forward", () => {
  const text = [line(T1, 0, 2000), line(T2, 0, 0), line(T3, 0, 0)].join("\n")
  assert.deepEqual(newestWrite(text, false), { ttl: "1h", at: Date.parse(T1) })
})

test("no write, no usage, junk lines and a line without a timestamp are unknown", () => {
  assert.equal(newestWrite(line(T1, 0, 0), false), undefined)
  assert.equal(newestWrite('{"type":"user"}\nnot json ephemeral_\n', false), undefined)
  assert.equal(newestWrite(line("nope", 10, 0), false), undefined)
  assert.equal(newestWrite("", false), undefined)
})

test("a tail that starts mid-line drops the cut-off first line", () => {
  const cut = line(T1, 0, 2000).slice(20)
  assert.equal(newestWrite(cut, true), undefined)
  assert.equal(newestWrite(`${cut}\n${line(T2, 10, 0)}`, true)?.ttl, "5m")
})

const root = async () => {
  const dir = await mkdtemp(join(tmpdir(), "cache-ttl-"))
  const projects = join(dir, "projects")
  await mkdir(projects)
  return { dir, projects }
}

test("the cwd encodes with / and . as -", () => {
  assert.equal(encodeCwd("/Users/isaac/git/dev-files"), "-Users-isaac-git-dev-files")
  assert.equal(encodeCwd("/a/b.c/.d"), "-a-b-c--d")
})

test("finds the transcript under the encoded cwd, else by searching every project folder", async () => {
  const { projects } = await root()
  await mkdir(join(projects, "-work-app"))
  await mkdir(join(projects, "-elsewhere"))
  await writeFile(join(projects, "-work-app", `${ID}.jsonl`), line(T1, 10, 0))

  const direct = await findTranscript(projects, ID, "/work/app")
  const searched = await findTranscript(projects, ID, "/other/place")
  assert.ok(direct?.endsWith(join("-work-app", `${ID}.jsonl`)))
  assert.equal(searched, direct)
  assert.equal(await findTranscript(projects, "11111111-1111-1111-1111-111111111111", "/work/app"), undefined)
})

test("a session id that could leave the projects folder is refused", async () => {
  const { dir, projects } = await root()
  await writeFile(join(dir, "secret.jsonl"), line(T1, 10, 0))
  for (const bad of ["../secret", "..", "../../etc/passwd", "a/b", "a\\b", "", "x".repeat(200), `${ID}\0`, "."]) {
    assert.equal(await findTranscript(projects, bad, "/work"), undefined, bad)
    assert.equal(await new Transcripts(projects).learn(bad, "/work"), undefined, bad)
  }
})

test("a symlink that points out of the projects folder is not followed", async () => {
  const { dir, projects } = await root()
  await writeFile(join(dir, "outside.jsonl"), line(T1, 10, 0))
  await mkdir(join(projects, "-p"))
  await symlink(join(dir, "outside.jsonl"), join(projects, "-p", `${ID}.jsonl`))
  assert.equal(await findTranscript(projects, ID, "/p"), undefined)
})

test("learns from a file, answers again from memory while it is unchanged, and re-reads when it grows", async () => {
  const { projects } = await root()
  await mkdir(join(projects, "-w"))
  const path = join(projects, "-w", `${ID}.jsonl`)
  await writeFile(path, line(T1, 10, 0) + "\n")
  const transcripts = new Transcripts(projects)

  assert.deepEqual(await transcripts.learn(ID, "/w"), { ttl: "5m", at: Date.parse(T1) })

  // Same size and mtime with different content: the remembered answer is still returned.
  const stat = (await import("node:fs/promises")).stat
  const before = await stat(path)
  await writeFile(path, line(T1, 0, 99) + "\n".repeat(0))
  await utimes(path, before.atime, before.mtime)
  if ((await stat(path)).size === before.size) assert.equal((await transcripts.learn(ID, "/w"))?.ttl, "5m")

  await writeFile(path, line(T1, 10, 0) + "\n" + line(T2, 0, 5000) + "\n")
  assert.deepEqual(await transcripts.learn(ID, "/w"), { ttl: "1h", at: Date.parse(T2) })
})

test("a huge file is read from its end only: the answer is the last write, and a write beyond the tail is not seen", async () => {
  const { projects } = await root()
  await mkdir(join(projects, "-w"))
  const path = join(projects, "-w", `${ID}.jsonl`)
  const filler = line(T2, 0, 0, { pad: "x".repeat(900) })
  const fill = (bytes: number) => Array.from({ length: Math.ceil(bytes / filler.length) }, () => filler).join("\n")

  // A 1h write at the very start, then 3 MB of requests that wrote nothing, then a 5m write.
  await writeFile(path, [line(T1, 0, 9000), fill(3_000_000), line(T3, 40, 0)].join("\n") + "\n")
  assert.deepEqual(await new Transcripts(projects).learn(ID, "/w"), { ttl: "5m", at: Date.parse(T3) })

  // Only filler after the 1h write: out of reach, so unknown rather than a read of 3 MB.
  await writeFile(path, [line(T1, 0, 9000), fill(3_000_000)].join("\n") + "\n")
  assert.equal(await new Transcripts(projects).learn(ID, "/w"), undefined)
  assert.ok(TAIL_BYTES < 3_000_000)
})

test("a missing file, a missing folder and an unreadable id fail soft", async () => {
  const { projects } = await root()
  assert.equal(await new Transcripts(projects).learn(ID, "/w"), undefined)
  assert.equal(await new Transcripts(join(projects, "nope")).learn(ID, "/w"), undefined)
})

test("only numbers come back, never the transcript's content", async () => {
  const { projects } = await root()
  await mkdir(join(projects, "-w"))
  await writeFile(join(projects, "-w", `${ID}.jsonl`), line(T1, 10, 0) + "\n")
  const learned = await new Transcripts(projects).learn(ID, "/w")
  assert.deepEqual(Object.keys(learned ?? {}).sort(), ["at", "ttl"])
  assert.ok(!JSON.stringify(learned).includes("SECRET"))
})

test("native session id: the newest part that has one", () => {
  const message = (id: string) => ({ type: "assistant", content: [{ type: "text" }, { type: "tool", native: { sessionID: id, messageID: "m" } }] })
  assert.equal(nativeSessionID([message("old"), { type: "user" }, message("new")]), "new")
  assert.equal(nativeSessionID([{ type: "user" }, { type: "assistant", content: [] }]), undefined)
})
