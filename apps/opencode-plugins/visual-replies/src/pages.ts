import { readFile, stat } from "node:fs/promises"
import { extname, isAbsolute, resolve } from "node:path"

export const limits = {
  title: 120,
  html: 1_000_000,
  images: 12,
  imageBytes: 3_000_000,
  totalBytes: 4_000_000,
  pagesPerSession: 100,
} as const

export interface Page {
  callID: string
  sessionID: string
  title: string
  html: string
  created: number
}

export interface PageSummary {
  callID: string
  title: string
  created: number
}

export interface KeyValueStore {
  get(key: string): Promise<unknown>
  set(key: string, value: never): Promise<void>
  remove(key: string): Promise<void>
  scan(options: { prefix: string; after?: string; limit?: number }): Promise<{
    entries: readonly { key: string; value: unknown }[]
    next?: string
  }>
}

export class PublishError extends Error {}

const imageTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
}

export interface PublishInput {
  title: string
  html: string
  images?: string[]
}

export function validate(input: unknown): Required<PublishInput> {
  if (!input || typeof input !== "object") throw new PublishError("Input must be an object with title and html.")
  const { title, html, images } = input as Record<string, unknown>
  if (typeof title !== "string" || !title.trim()) throw new PublishError("title must be a non-empty string.")
  if (title.trim().length > limits.title) throw new PublishError(`title is over ${limits.title} characters.`)
  if (typeof html !== "string" || !html.trim()) throw new PublishError("html must be a non-empty string.")
  if (html.length > limits.html) throw new PublishError(`html is over ${limits.html} characters; make the page smaller.`)
  if (images !== undefined && (!Array.isArray(images) || images.some((item) => typeof item !== "string" || !item)))
    throw new PublishError("images must be an array of file paths.")
  if ((images?.length ?? 0) > limits.images) throw new PublishError(`images is over ${limits.images} files.`)
  return { title: title.trim(), html, images: [...new Set((images as string[] | undefined) ?? [])] }
}

/** Replaces each path as written in the HTML with a data URI of that image file. */
export async function embedImages(html: string, paths: readonly string[], base: string) {
  const missing: string[] = []
  for (const path of paths) {
    const type = imageTypes[extname(path).toLowerCase()]
    if (!type) throw new PublishError(`${path}: only ${Object.keys(imageTypes).join(", ")} images can be embedded.`)
    const file = isAbsolute(path) ? path : resolve(base, path)
    const info = await stat(file).catch(() => undefined)
    if (!info?.isFile()) throw new PublishError(`${path}: no such image file.`)
    if (info.size > limits.imageBytes) throw new PublishError(`${path}: image is over ${limits.imageBytes} bytes.`)
    if (!html.includes(path)) {
      missing.push(path)
      continue
    }
    const uri = `data:${type};base64,${(await readFile(file)).toString("base64")}`
    html = html.split(path).join(uri)
  }
  return { html, unreferenced: missing }
}

const pageKey = (callID: string) => `page/${callID}`
const indexPrefix = (sessionID: string) => `session/${sessionID}/`

export function createPageStore(kv: KeyValueStore, now: () => number = Date.now) {
  async function list(sessionID: string): Promise<PageSummary[]> {
    const out: PageSummary[] = []
    let after: string | undefined
    do {
      const page = await kv.scan({ prefix: indexPrefix(sessionID), after, limit: 200 })
      for (const entry of page.entries) {
        const value = entry.value as { title: string; created: number }
        out.push({ callID: entry.key.slice(indexPrefix(sessionID).length), title: value.title, created: value.created })
      }
      after = page.next
    } while (after)
    return out.sort((a, b) => a.created - b.created)
  }

  return {
    list,
    async get(callID: string): Promise<Page | undefined> {
      return ((await kv.get(pageKey(callID))) as Page | undefined) ?? undefined
    },
    async put(input: { sessionID: string; callID: string; title: string; html: string }): Promise<Page> {
      if (input.html.length > limits.totalBytes)
        throw new PublishError(`page is over ${limits.totalBytes} bytes after embedding images.`)
      const existing = await list(input.sessionID)
      if (existing.length >= limits.pagesPerSession && !existing.some((page) => page.callID === input.callID))
        throw new PublishError(`this session already has ${limits.pagesPerSession} visual replies.`)
      const page: Page = { ...input, created: now() }
      await kv.set(pageKey(input.callID), page as never)
      await kv.set(`${indexPrefix(input.sessionID)}${input.callID}`, { title: page.title, created: page.created } as never)
      return page
    },
    async removeSession(sessionID: string) {
      for (const page of await list(sessionID)) {
        await kv.remove(pageKey(page.callID))
        await kv.remove(`${indexPrefix(sessionID)}${page.callID}`)
      }
    },
  }
}

export type PageStore = ReturnType<typeof createPageStore>
