import type { Context } from "@opencode/plugin/gui"
import { For } from "solid-js"
import { NOTIFY_KINDS, type NotifyKind } from "../../native-ui/src/notify-contract"
import type { Settings } from "./settings"

/** What the page reads and writes. */
export interface PageInput {
  readonly ctx: Pick<Context, "t" | "ui" | "layout">
  readonly settings: () => Settings
  readonly update: (change: (draft: { toast: Record<NotifyKind, boolean>; onScreen: { done: boolean; info: boolean }; muted: string[] }) => void) => void
  /** The plugin ids that publish: announced publishers and sources seen on the event stream. */
  readonly sources: () => readonly string[]
}

/** The host's own settings markup (title, description, body, section, list, row), so its CSS styles the page. */
export function AlertsPage(props: PageInput) {
  const { ctx } = props
  const row = (action: string, title: string, description: string, checked: () => boolean, onChange: (checked: boolean) => void) => (
    <div data-component="settings-row">
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title">{title}</div>
        <div data-slot="settings-row-description">{description}</div>
      </div>
      <div data-slot="settings-row-control">
        <div data-action={action}>
          <ctx.ui.Switch label={title} hideLabel checked={checked()} onChange={onChange} />
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{ctx.t("page.title")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{ctx.t("page.description")}</span>
          </div>
        </div>
      </div>

      <div class="settings-tab-body settings-tab-body--sectioned">
        <section class="settings-section" aria-label={ctx.t("toasts.title")}>
          <h3 class="settings-section-title">{ctx.t("toasts.title")}</h3>
          <div data-component="settings-list">
            <For each={NOTIFY_KINDS}>
              {(kind) =>
                row(`alerts-toast-${kind}`, ctx.t(`kind.${kind}.title`), ctx.t(`kind.${kind}.description`), () => props.settings().toast[kind], (checked) =>
                  props.update((draft) => void (draft.toast[kind] = checked)),
                )
              }
            </For>
            {row("alerts-onscreen-done", ctx.t("onScreen.done.title"), ctx.t("onScreen.done.description"), () => props.settings().onScreen.done, (checked) =>
              props.update((draft) => void (draft.onScreen.done = checked)),
            )}
            {row("alerts-onscreen-info", ctx.t("onScreen.info.title"), ctx.t("onScreen.info.description"), () => props.settings().onScreen.info, (checked) =>
              props.update((draft) => void (draft.onScreen.info = checked)),
            )}
          </div>
        </section>

        <section class="settings-section" aria-label={ctx.t("system.title")}>
          <h3 class="settings-section-title">{ctx.t("system.title")}</h3>
          <div data-component="settings-list">
            <div data-component="settings-row">
              <div data-slot="settings-row-copy">
                <div data-slot="settings-row-title">{ctx.t("system.row.title")}</div>
                <div data-slot="settings-row-description">{ctx.t("system.row.description")}</div>
              </div>
              <div data-slot="settings-row-control">
                <div data-action="alerts-open-notifications">
                  <ctx.ui.Button onClick={() => ctx.layout.settings("notifications")}>{ctx.t("system.row.open")}</ctx.ui.Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section" aria-label={ctx.t("sources.title")}>
          <h3 class="settings-section-title">{ctx.t("sources.title")}</h3>
          <div data-component="settings-list">
            <For
              each={props.sources()}
              fallback={
                <div data-component="settings-row">
                  <div data-slot="settings-row-copy">
                    <div data-slot="settings-row-description">{ctx.t("sources.empty")}</div>
                  </div>
                </div>
              }
            >
              {(source) =>
                row(
                  `alerts-source-${source}`,
                  source,
                  ctx.t("sources.description", { source }),
                  () => !props.settings().muted.includes(source),
                  (checked) =>
                    props.update((draft) => {
                      const rest = draft.muted.filter((id) => id !== source)
                      draft.muted = checked ? rest : [...rest, source]
                    }),
                )
              }
            </For>
          </div>
        </section>
      </div>
    </>
  )
}
