/** The formats the viewer opens. Everything else is not a viewer kind. */
export type ViewerKind = "video" | "image" | "audio" | "markdown" | "csv" | "json" | "pdf"

export interface KindInfo {
  readonly kind: ViewerKind
  readonly mime: string
  /** Bytes above which the file is refused; undefined for streamed media. */
  readonly maxBytes?: number
}

const MB = 1024 * 1024

const viewer = new Map<string, KindInfo>([
  ["mp4", { kind: "video", mime: "video/mp4" }],
  ["m4v", { kind: "video", mime: "video/mp4" }],
  ["mov", { kind: "video", mime: "video/quicktime" }],
  ["webm", { kind: "video", mime: "video/webm" }],
  ["png", { kind: "image", mime: "image/png", maxBytes: 64 * MB }],
  ["jpg", { kind: "image", mime: "image/jpeg", maxBytes: 64 * MB }],
  ["jpeg", { kind: "image", mime: "image/jpeg", maxBytes: 64 * MB }],
  ["gif", { kind: "image", mime: "image/gif", maxBytes: 64 * MB }],
  ["webp", { kind: "image", mime: "image/webp", maxBytes: 64 * MB }],
  ["svg", { kind: "image", mime: "image/svg+xml", maxBytes: 8 * MB }],
  ["avif", { kind: "image", mime: "image/avif", maxBytes: 64 * MB }],
  ["mp3", { kind: "audio", mime: "audio/mpeg" }],
  ["m4a", { kind: "audio", mime: "audio/mp4" }],
  ["wav", { kind: "audio", mime: "audio/wav" }],
  ["ogg", { kind: "audio", mime: "audio/ogg" }],
  ["flac", { kind: "audio", mime: "audio/flac" }],
  ["md", { kind: "markdown", mime: "text/markdown", maxBytes: 8 * MB }],
  ["markdown", { kind: "markdown", mime: "text/markdown", maxBytes: 8 * MB }],
  ["mdx", { kind: "markdown", mime: "text/markdown", maxBytes: 8 * MB }],
  ["csv", { kind: "csv", mime: "text/csv", maxBytes: 32 * MB }],
  ["tsv", { kind: "csv", mime: "text/tab-separated-values", maxBytes: 32 * MB }],
  ["json", { kind: "json", mime: "application/json", maxBytes: 32 * MB }],
  ["jsonc", { kind: "json", mime: "application/json", maxBytes: 32 * MB }],
  ["pdf", { kind: "pdf", mime: "application/pdf", maxBytes: 256 * MB }],
])

/** Extensions that make a bare word (no slash) look like a file name. Viewer kinds plus common source and document types. */
const known = new Set([
  ...viewer.keys(),
  ..."txt log rtf html htm xml yaml yml toml ini cfg conf env lock js mjs cjs jsx ts tsx mts cts css scss sass less vue svelte astro py pyi rb rs go java kt kts swift c h cc cpp hpp cs php sh bash zsh fish ps1 bat cmd lua pl r sql graphql gql proto tf tfvars gradle make mk dockerfile diff patch zip tar gz tgz bz2 xz 7z rar dmg pkg iso doc docx xls xlsx ppt pptx key pages numbers odt ods bmp ico tif tiff heic mkv avi wmv flv ogv opus aac wma aif aiff ttf otf woff woff2 sqlite db wasm map ipynb tex bib epub".split(
    " ",
  ),
])

const names = new Set(
  "Dockerfile Containerfile Makefile Rakefile Gemfile Procfile Vagrantfile Justfile README LICENSE CHANGELOG CODEOWNERS CONTRIBUTING".split(
    " ",
  ),
)

const dotfiles = new Set(
  ".gitignore .gitattributes .gitmodules .editorconfig .prettierrc .eslintrc .npmrc .nvmrc .bashrc .zshrc .profile .env .dockerignore .babelrc .eslintignore .prettierignore .tool-versions .mailmap".split(
    " ",
  ),
)

/** Bare names that are products or libraries, not files, when they stand alone in prose. */
const techNames = new Set(
  "next.js node.js vue.js react.js three.js express.js d3.js chart.js nuxt.js nest.js ember.js backbone.js alpine.js solid.js deno.js bun.js socket.io asp.net".split(
    " ",
  ),
)

export function viewerInfo(extension: string): KindInfo | undefined {
  return viewer.get(extension)
}

export function isKnownExtension(extension: string) {
  return known.has(extension)
}

export function isKnownName(name: string) {
  return names.has(name)
}

export function isKnownDotfile(name: string) {
  return dotfiles.has(name)
}

export function isTechName(name: string) {
  return techNames.has(name.toLowerCase())
}

/** Lowercased extension after the last dot of the last path segment; "" for no extension or a leading-dot name. */
export function extensionOf(name: string) {
  const index = name.lastIndexOf(".")
  if (index <= 0 || index === name.length - 1) return ""
  return name.slice(index + 1).toLowerCase()
}

export function kindOfPath(path: string): KindInfo | undefined {
  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1)
  return viewer.get(extensionOf(name))
}
