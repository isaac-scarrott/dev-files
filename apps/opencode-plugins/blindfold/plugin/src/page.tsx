import type { Context } from "@opencode/plugin/gui"
import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import type { Overview } from "./rpc.js"
import { site } from "./card.js"

/** What the page reads and does. Everything goes through the server part; nothing here holds a value. */
export interface PageInput {
  readonly ctx: Pick<Context, "t" | "ui" | "layout">
  readonly load: () => Promise<Overview | undefined>
  readonly revoke: (id: string) => Promise<void>
  readonly lock: (account: string) => Promise<void>
  /** Calls back when rules or accounts change; returns the unsubscribe. */
  readonly changes: (listener: () => void) => () => void
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

/** The host's own settings markup (title, section, list, row), so its CSS styles the page. */
export function BlindfoldPage(props: PageInput) {
  const { ctx } = props
  const [data, setData] = createSignal<Overview>()
  let timer: ReturnType<typeof setTimeout> | undefined
  // An account locks itself when idle and nothing says so: look again just after the earliest lock time.
  const refresh = () =>
    void props.load().then((next) => {
      setData(next)
      clearTimeout(timer)
      const soon = Math.min(...(next?.accounts ?? []).flatMap((account) => (account.expiresAt ? [account.expiresAt] : [])))
      if (Number.isFinite(soon)) timer = setTimeout(refresh, Math.max(1000, soon - Date.now() + 300))
    }, () => undefined)
  onMount(() => {
    refresh()
    onCleanup(props.changes(refresh))
    onCleanup(() => clearTimeout(timer))
  })
  const row = (title: string, description: string, control?: unknown) => (
    <div data-component="settings-row">
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title">{title}</div>
        <Show when={description}>
          <div data-slot="settings-row-description">{description}</div>
        </Show>
      </div>
      <Show when={control}>
        <div data-slot="settings-row-control">{control as never}</div>
      </Show>
    </div>
  )
  const empty = (text: string) => (
    <div data-component="settings-row">
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-description">{text}</div>
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
      <div class="settings-tab-body settings-tab-body--sectioned" data-blindfold-page>
        <section class="settings-section" aria-label={ctx.t("page.accounts")}>
          <h3 class="settings-section-title">{ctx.t("page.accounts")}</h3>
          <div data-component="settings-list">
            <For each={data()?.accounts} fallback={row(ctx.t("page.noAccountsTitle"), ctx.t("page.noAccounts"), <div data-action="blindfold-setup"><ctx.ui.Button variant="contrast" onClick={() => ctx.layout.settings("blindfold-providers")}>{ctx.t("page.setUp")}</ctx.ui.Button></div>)}>
              {(account) =>
                row(
                  account.label,
                  account.state === "unlocked" ? ctx.t("page.unlocked") : account.state === "locked" ? ctx.t("page.locked") : ctx.t("page.unavailable", { reason: account.reason ?? "" }),
                  account.state === "unlocked" ? (
                    <div data-action={`blindfold-lock-${account.id}`}>
                      <ctx.ui.Button onClick={() => void props.lock(account.id)}>{ctx.t("page.lock")}</ctx.ui.Button>
                    </div>
                  ) : undefined,
                )
              }
            </For>
            <Show when={(data()?.accounts.length ?? 0) > 0}>
              {row(ctx.t("page.manageTitle"), ctx.t("page.manage"), <div data-action="blindfold-manage"><ctx.ui.Button onClick={() => ctx.layout.settings("blindfold-providers")}>{ctx.t("page.manageOpen")}</ctx.ui.Button></div>)}
            </Show>
          </div>
        </section>
        <section class="settings-section" aria-label={ctx.t("page.rules")}>
          <h3 class="settings-section-title">{ctx.t("page.rules")}</h3>
          <div data-component="settings-list">
            <For each={data()?.rules} fallback={empty(ctx.t("page.noRules"))}>
              {(rule) =>
                rule.kind === "flow"
                  ? row(
                      ctx.t("page.ruleFlow", { site: site(rule.origin ?? ""), item: rule.itemTitle ?? "" }),
                      ctx.t("page.ruleFlowFrom", { account: data()?.accounts.find((account) => account.id === rule.account)?.label ?? rule.account, parts: (rule.parts ?? []).map((part) => ctx.t(`part.${part}`)).join(", ") }),
                      <div data-action={`blindfold-revoke-${rule.id}`}>
                        <ctx.ui.Button onClick={() => void props.revoke(rule.id)}>{ctx.t("page.revoke")}</ctx.ui.Button>
                      </div>,
                    )
                  : row(
                  rule.origin ? ctx.t("page.ruleOrigin", { field: rule.field.charAt(0).toUpperCase() + rule.field.slice(1), site: site(rule.origin) }) : ctx.t("page.ruleName", { name: rule.name ?? rule.field }),
                  ctx.t(rule.itemTitle ? "page.ruleFromItem" : "page.ruleFrom", { account: data()?.accounts.find((account) => account.id === rule.account)?.label ?? rule.account, item: rule.itemTitle ?? "" }) + (rule.via === "fill" ? ctx.t("page.ruleFillOnly") : ""),
                  <div data-action={`blindfold-revoke-${rule.id}`}>
                    <ctx.ui.Button onClick={() => void props.revoke(rule.id)}>{ctx.t("page.revoke")}</ctx.ui.Button>
                  </div>,
                )
              }
            </For>
          </div>
        </section>
        <section class="settings-section" aria-label={ctx.t("page.recent")}>
          <h3 class="settings-section-title">{ctx.t("page.recent")}</h3>
          <div data-component="settings-list">
            <For each={data()?.audit.slice(0, 10)} fallback={empty(ctx.t("page.noRecent"))}>
              {(entry) =>
                row(
                  ctx.t(`page.outcome.${entry.outcome}`, { name: entry.name, via: entry.via }),
                  [entry.accountLabel, entry.origin ? site(entry.origin) : "", time(entry.time)].filter(Boolean).join(" · "),
                )
              }
            </For>
          </div>
        </section>
      </div>
    </>
  )
}
