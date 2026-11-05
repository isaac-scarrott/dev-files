import { Command, createKeyed, Plugin, Store, Style } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { onCleanup } from "solid-js"
import { addSpace, defaultEmoji, initialState, newSpaceId, selectSpaceId, settle, type State } from "./model"
import { accentColor, css } from "./style"
import { createStrip } from "./strip"

const SpaceSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  emoji: Schema.String,
  accent: Schema.optional(Schema.String),
  lastSession: Schema.optional(Schema.Struct({ server: Schema.String, id: Schema.String })),
})
const AssignmentSchema = Schema.Struct({ server: Schema.String, id: Schema.String, space: Schema.String, at: Schema.Number })
const DraftSchema = Schema.Struct({ tab: Schema.String, space: Schema.String })
const StateSchema = Schema.Struct({
  version: Schema.Number,
  active: Schema.Number,
  spaces: Schema.Array(SpaceSchema),
  assigned: Schema.Array(AssignmentSchema),
  drafts: Schema.Array(DraftSchema),
})

const definition = Plugin.define({
  stores: { spaces: Store.global(StateSchema, initialState()) },
})

export default Plugin.define({
  ...definition,
  setup(ctx) {
    ctx.add(Style, css)

    const state = (): State => settle(ctx.stores.spaces.value as State)
    const update = (change: (current: State) => State) => {
      ctx.stores.spaces.update((draft) => {
        const next = change(settle(draft as State))
        draft.version = next.version
        draft.active = next.active
        draft.spaces = next.spaces as never
        draft.assigned = next.assigned as never
        draft.drafts = next.drafts as never
      })
    }

    const strip = createStrip(
      document,
      {
        select(index) {
          update((current) => ({
            ...current,
            active: Math.max(0, Math.min(index, current.spaces.length - 1)),
          }))
        },
        create() {
          createSpace()
        },
      },
      (space) => accentColor(space.accent),
    )

    const createSpace = () => {
      const current = state()
      const id = newSpaceId(current.spaces)
      const emoji = defaultEmoji(current.spaces)
      update((now) => addSpace(now, { id, name: `Space ${now.spaces.length + 1}`, emoji }))
    }

    // The strip lives inside the sidebar, which the host mounts late and may replace on a layout change. Try now, then keep
    // trying until it lands; afterwards re-place only when the host detaches our row.
    let timer: ReturnType<typeof setInterval> | undefined
    let observer: MutationObserver | undefined
    const landed = () => {
      if (timer !== undefined) {
        clearInterval(timer)
        timer = undefined
      }
      const parent = strip.place() ? document.querySelector('[data-slot="vertical-tabs-mount"]') : undefined
      observer?.disconnect()
      observer = undefined
      if (!parent) return
      observer = new MutationObserver(() => {
        if (!document.querySelector(`[data-spaces-strip]`)) ensure()
      })
      observer.observe(parent, { childList: true })
      strip.place()
    }
    const ensure = () => {
      if (strip.place()) landed()
      else if (timer === undefined) timer = setInterval(() => { if (strip.place()) landed() }, 400)
    }
    ensure()
    onCleanup(() => {
      if (timer !== undefined) clearInterval(timer)
      observer?.disconnect()
      strip.dispose()
    })

    createKeyed(
      () => ctx.stores.spaces.value,
      () => {
        const current = state()
        strip.update(
          current.spaces.map((space) => ({ id: space.id, name: space.name, emoji: space.emoji, ...(space.accent ? { accent: space.accent } : {}) })),
          current.active,
        )
      },
    )
    strip.update(
      state().spaces.map((space) => ({ id: space.id, name: space.name, emoji: space.emoji, ...(space.accent ? { accent: space.accent } : {}) })),
      state().active,
    )

    ctx.add(Command, () => ({
      id: "spaces.new",
      title: "New space…",
      section: "general" as const,
      keywords: "spaces group sessions arc",
      async run() {
        const current = state()
        const name = await ctx.dialogs.prompt({ title: "Name this space", placeholder: `Space ${current.spaces.length + 1}` })
        if (name === undefined) return
        const id = newSpaceId(current.spaces)
        update((now) => addSpace(now, { id, name: name.trim() === "" ? `Space ${now.spaces.length + 1}` : name.trim(), emoji: defaultEmoji(now.spaces) }))
      },
    }))

    ctx.add(Command, () => {
      const current = state()
      if (current.spaces.length < 2) return undefined
      return {
        id: "spaces.switch",
        title: "Switch space…",
        section: "general" as const,
        keywords: "spaces",
        async run() {
          const now = state()
          const picked = await ctx.dialogs.select({
            title: "Switch space",
            options: now.spaces.map((space) => ({ title: `${space.emoji}  ${space.name}`, value: space.id })),
          })
          if (picked === undefined) return
          update((current) => selectSpaceId(current, picked))
        },
      }
    })
  },
})
