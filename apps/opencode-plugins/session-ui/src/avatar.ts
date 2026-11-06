export interface Avatar { letter: string; src?: string; variant: string }

const VARIANTS = new Set(["orange", "yellow", "cyan", "green", "red", "pink", "blue", "purple", "gray"])
const ALIASES: Record<string, string> = { mint: "cyan", lime: "green" }

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined
const first = (value: string) => (segmenter ? segmenter.segment(value)[Symbol.iterator]().next().value?.segment : undefined) ?? Array.from(value)[0] ?? ""

// The inputs of the app's ProjectAvatar, derived from the project icon the same way the session tab does
// (chosen image > chosen colour > letter on gray). The generated canvas style is not reproduced.
export function avatarFor(project: { icon?: { color?: string; url?: string; override?: string } } | undefined, directory: string): Avatar {
  const icon = project?.icon
  const name = directory.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || directory
  const color = icon?.color && (ALIASES[icon.color] ?? icon.color)
  return {
    letter: first(name),
    src: icon?.override || (icon?.color ? undefined : icon?.url),
    variant: color && VARIANTS.has(color) ? color : "gray",
  }
}
