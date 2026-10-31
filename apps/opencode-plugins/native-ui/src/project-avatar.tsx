import { Show } from "solid-js"

// Host source: ui/src/data-display/project-avatar/project-avatar.tsx. Markup and the variant/name helpers are copied;
// the host's generated (canvas) avatar style is not: it needs the host's generator and motion-tuning stores.

export const PROJECT_AVATAR_VARIANTS = ["orange", "yellow", "cyan", "green", "red", "pink", "blue", "purple", "gray"] as const
export type ProjectAvatarVariant = (typeof PROJECT_AVATAR_VARIANTS)[number]
/** "outline" is the muted style of recently closed projects, outside the colour rotation. */
export type ProjectAvatarStyle = ProjectAvatarVariant | "outline"

export function getProjectAvatarVariant(key?: string): ProjectAvatarVariant {
  if (key === "mint") return "cyan"
  if (key === "lime") return "green"
  if ((PROJECT_AVATAR_VARIANTS as readonly string[]).includes(key ?? "")) return key as ProjectAvatarVariant
  return "gray"
}

export const displayName = (project: { name?: string; worktree: string }) => {
  const trimmed = project.worktree.replace(/[/\\]+$/, "")
  const filename = trimmed.slice(Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1)
  return project.name || filename || project.worktree
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined

/** The first grapheme, as the host letters an avatar. */
export function first(value: string) {
  if (!value) return ""
  if (!segmenter) return Array.from(value)[0] ?? ""
  return segmenter.segment(value)[Symbol.iterator]().next().value?.segment ?? Array.from(value)[0] ?? ""
}

export interface ProjectAvatarProps {
  /** Text lettered when there is no image; only its first grapheme shows. */
  fallback: string
  src?: string
  variant?: ProjectAvatarStyle
  unread?: boolean
}

export function ProjectAvatar(props: ProjectAvatarProps) {
  return (
    <div data-component="project-avatar-v2" data-unread={props.unread ? "" : undefined}>
      <div data-slot="project-avatar-surface" data-variant={props.variant ?? "gray"} data-has-image={props.src ? "" : undefined}>
        <Show when={props.src} fallback={first(props.fallback)}>
          {(src) => <img src={src()} draggable={false} data-slot="project-avatar-image" />}
        </Show>
      </div>
      <Show when={props.unread}>
        <span data-slot="project-avatar-unread-dot" aria-hidden="true" />
      </Show>
    </div>
  )
}
