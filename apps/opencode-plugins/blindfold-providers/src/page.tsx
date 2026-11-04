import type { Context } from "@opencode/plugin/gui"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { INSTALL, probeMessage, stepsOf, toolTone, type Tone } from "./checklist.js"
import { OP_DOCS, OP_WIZARD, OP_ACTIVE, BW_DOCS, BW_VAULT } from "./links.js"
import type { AccountView, Overview, Probe, Provider, Reply } from "./rpc.js"
import { Chips, Field, Row, Section, SecretInput, Text } from "./ui.js"

/** What the page asks of the server part. Credentials leave the page only through these calls, once. */
export interface Api {
  load(fresh?: boolean): Promise<Overview | undefined>
  add(provider: Provider, settings: Record<string, unknown>, secrets: Record<string, string>): Promise<Reply>
  update(id: string, settings?: Record<string, unknown>, secrets?: Record<string, string>): Promise<Reply>
  remove(id: string): Promise<Reply>
  confirm(value: boolean): Promise<Reply>
  lock(id: string): Promise<Reply>
  unlock(id: string, password: string): Promise<Reply>
  test(id: string): Promise<Reply>
  verify(id: string, itemId: string): Promise<Reply>
  /** Calls back when accounts or their state change; returns the unsubscribe. */
  changes(listener: () => void): () => void
  /** Whether a server part can be reached (a session is open). */
  reachable(): boolean
}

export interface PageInput {
  readonly ctx: Pick<Context, "t" | "ui" | "layout" | "system">
  readonly api: Api
}

const NAME: Record<Provider, string> = { "1password": "1Password", bitwarden: "Bitwarden" }
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

/** The host's own settings markup (title, section, list, row), so its CSS styles the page. */
export function PasswordManagersPage(props: PageInput) {
  const { ctx, api } = props
  const t = ctx.t
  const [data, setData] = createSignal<Overview>()
  const [adding, setAdding] = createSignal<Provider>()
  const [help, setHelp] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  // A session locks itself when idle and nothing says so: look again just after the earliest lock time.
  const refresh = (fresh = false) =>
    void api.load(fresh).then(
      (next) => {
        setData(next)
        clearTimeout(timer)
        const soon = Math.min(...(next?.accounts ?? []).flatMap((account) => (account.lock.expiresAt ? [account.lock.expiresAt] : [])))
        if (Number.isFinite(soon)) timer = setTimeout(() => refresh(), Math.max(1000, soon - Date.now() + 300))
      },
      () => undefined,
    )
  onMount(() => {
    refresh()
    onCleanup(api.changes(() => refresh()))
    onCleanup(() => clearTimeout(timer))
  })

  const ids = createMemo(() => (data()?.accounts ?? []).map((account) => account.id), [], { equals: (a, b) => a.join() === b.join() })
  const none = () => data() !== undefined && data()!.accounts.length === 0
  const link = (url: string) => () => ctx.system.openExternal(url)

  const providerSection = (provider: Provider) => {
    const tool = () => data()?.tools[provider]
    const [checking, setChecking] = createSignal(false)
    return (
      <Section title={t(`before.${provider}`)} description={t(`before.${provider}.note`)} action={`before-${provider}`}>
        <Row
          ui={ctx.ui}
          action={`cli-${provider}`}
          tone={toolTone(tool())}
          title={t(`cli.${provider}`)}
          description={
            tool()?.installed ? (
              <>{t("cli.found", { version: tool()?.version ?? "", path: tool()?.path ?? "" })}</>
            ) : (
              <>
                {t("cli.missing")} <code data-bfp-code>{INSTALL[provider]}</code>
              </>
            )
          }
          control={
            <div class="flex items-center gap-2">
              <Show when={tool() && !tool()!.installed}>
                <div data-action={`copy-install-${provider}`}>
                  <ctx.ui.Button icon="copy" onClick={() => void ctx.system.copy(INSTALL[provider])}>
                    {t("copy")}
                  </ctx.ui.Button>
                </div>
              </Show>
              <div data-action={`recheck-${provider}`}>
                <ctx.ui.Button
                  busy={checking()}
                  onClick={() => {
                    setChecking(true)
                    void api.load(true).then((next) => (setData(next), setChecking(false)), () => setChecking(false))
                  }}
                >
                  {t("checkAgain")}
                </ctx.ui.Button>
              </div>
            </div>
          }
        />
        <Show when={provider === "1password"}>
          <Row
            ui={ctx.ui}
            action="app-integration"
            tone={data()?.confirmed.opAppIntegrationOff ? "ok" : "todo"}
            title={t("appOff.title")}
            description={t("appOff.description")}
            control={
              <div data-action="app-integration-switch">
                <ctx.ui.Switch label={t("appOff.title")} hideLabel checked={data()?.confirmed.opAppIntegrationOff === true} onChange={(checked) => void api.confirm(checked).then(() => refresh())} />
              </div>
            }
          />
        </Show>
      </Section>
    )
  }

  const addButtons = () => (
    <Section title={t("add.title")} action="add">
      <For each={["1password", "bitwarden"] as const}>
        {(provider) => (
          <Row
            ui={ctx.ui}
            action={`add-${provider}`}
            title={t(`add.${provider}`)}
            description={t(`add.${provider}.description`)}
            control={
              <div data-action={`add-${provider}-open`}>
                <ctx.ui.Button variant={none() && provider === "1password" ? "contrast" : "neutral"} icon="plus" onClick={() => setAdding(provider)}>
                  {t("add.button")}
                </ctx.ui.Button>
              </div>
            }
          />
        )}
      </For>
    </Section>
  )

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{t("page.title")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{t("page.description")}</span>
          </div>
        </div>
      </div>
      <div class="settings-tab-body settings-tab-body--sectioned" data-bfp-page>
        <Show when={!data()}>
          <Section title={t("page.title")}>
            <Row ui={ctx.ui} title={api.reachable() ? t("loading") : t("unreachable.title")} description={api.reachable() ? undefined : t("unreachable.description")} />
          </Section>
        </Show>
        <Show when={data()}>
          <Show when={none() && !adding()}>
            <Section title={t("cta.title")} description={t("cta.description")} action="cta">
              <For each={["1password", "bitwarden"] as const}>
                {(provider) => (
                  <Row
                    ui={ctx.ui}
                    action={`cta-${provider}`}
                    title={NAME[provider]}
                    description={t(`cta.${provider}`)}
                    control={
                      <div data-action={`cta-${provider}-open`}>
                        <ctx.ui.Button variant={provider === "1password" ? "contrast" : "neutral"} onClick={() => setAdding(provider)}>
                          {t("cta.setUp")}
                        </ctx.ui.Button>
                      </div>
                    }
                  />
                )}
              </For>
            </Section>
          </Show>

          <Show when={adding()}>{(provider) => <AddForm {...props} provider={provider()} onDone={(id) => (setAdding(undefined), refresh(), id && void api.test(id).then(() => refresh()))} onCancel={() => setAdding(undefined)} />}</Show>

          <For each={ids()}>{(id) => <AccountSection {...props} id={id} data={() => data()!} lookup={() => data()!.accounts.find((account) => account.id === id)} refresh={() => refresh()} />}</For>

          <Show when={!none() && !adding()}>{addButtons()}</Show>

          {providerSection("1password")}
          {providerSection("bitwarden")}

          <Section title={t("help.title")} description={t("help.why")} action="help">
            <Row
              ui={ctx.ui}
              action="help-toggle"
              title={t("help.heading")}
              description={t("help.summary")}
              control={
                <div data-action="help-toggle-button">
                  <ctx.ui.Button onClick={() => setHelp(!help())}>{help() ? t("help.hide") : t("help.show")}</ctx.ui.Button>
                </div>
              }
            />
            <Show when={help()}>
              <div data-component="settings-row" data-bfp-row="help-steps">
                <div data-slot="settings-row-copy">
                  <ol data-bfp-steps>
                    <For each={[1, 2, 3, 4, 5, 6] as const}>{(n) => <li>{t(`help.step${n}`)}</li>}</For>
                  </ol>
                  <div data-slot="settings-row-description">{t("help.copyBack")}</div>
                  <div class="flex items-center gap-2" data-bfp-links>
                    <div data-action="help-open-wizard">
                      <ctx.ui.Button icon="link" onClick={link(OP_WIZARD)}>
                        {t("help.openWizard")}
                      </ctx.ui.Button>
                    </div>
                    <div data-action="help-open-active">
                      <ctx.ui.Button onClick={link(OP_ACTIVE)}>{t("help.openActive")}</ctx.ui.Button>
                    </div>
                    <div data-action="help-open-docs">
                      <ctx.ui.Button onClick={link(OP_DOCS)}>{t("help.openDocs")}</ctx.ui.Button>
                    </div>
                    <div data-action="help-open-bitwarden">
                      <ctx.ui.Button onClick={link(BW_DOCS)}>{t("help.openBitwarden")}</ctx.ui.Button>
                    </div>
                    <div data-action="help-open-bitwarden-vault">
                      <ctx.ui.Button onClick={link(BW_VAULT)}>{t("help.openBitwardenVault")}</ctx.ui.Button>
                    </div>
                  </div>
                </div>
              </div>
            </Show>
          </Section>

          <Section title={t("rules.title")} action="rules">
            <Row
              ui={ctx.ui}
              title={t("rules.row")}
              description={t("rules.description")}
              control={
                <div data-action="open-blindfold">
                  <ctx.ui.Button onClick={() => ctx.layout.settings("blindfold")}>{t("rules.open")}</ctx.ui.Button>
                </div>
              }
            />
          </Section>
        </Show>
      </div>
    </>
  )
}

/** The guided form for a new account. Secrets live in this component's signals until Add, and are emptied when it is sent. */
function AddForm(props: PageInput & { provider: Provider; onDone: (id?: string) => void; onCancel: () => void }) {
  const { ctx, api, provider } = props
  const t = ctx.t
  const [label, setLabel] = createSignal(provider === "1password" ? "Agent vault" : "Work")
  const [token, setToken] = createSignal("")
  const [clientId, setClientId] = createSignal("")
  const [clientSecret, setClientSecret] = createSignal("")
  const [vaults, setVaults] = createSignal("Agent")
  const [org, setOrg] = createSignal("")
  const [sites, setSites] = createSignal<string[]>([])
  const [minutes, setMinutes] = createSignal("10")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal("")

  const complete = () => label().trim() !== "" && (provider === "1password" ? token().trim() !== "" : clientId().trim() !== "" && clientSecret().trim() !== "")
  const submit = async () => {
    if (!complete() || busy()) return
    const auto = Number(minutes())
    if (!Number.isFinite(auto) || auto < 1 || auto > 1440) return setError(t("error.minutes"))
    setBusy(true)
    setError("")
    const secrets: Record<string, string> = provider === "1password" ? { token: token().trim() } : { clientId: clientId().trim(), clientSecret: clientSecret().trim() }
    // What was typed is gone before the answer comes back, whatever it is.
    setToken("")
    setClientSecret("")
    const settings: Record<string, unknown> = {
      label: label().trim(),
      allowedOrigins: sites(),
      autoLockMinutes: auto,
      ...(provider === "1password" ? { vaults: vaults().split(",").map((item) => item.trim()).filter(Boolean) } : { organizationId: org().trim() }),
    }
    const reply = await api.add(provider, settings, secrets).catch((): Reply => ({ ok: false, error: t("error.unreachable") }))
    setBusy(false)
    if (!reply.ok) return setError(reply.error ?? t("error.failed"))
    props.onDone(reply.id)
  }

  return (
    <Section title={t(`add.${provider}.heading`)} description={t(`add.${provider}.intro`)} action={`form-${provider}`}>
      <div data-component="settings-row" data-bfp-row="form">
        <div data-bfp-form data-slot="settings-row-copy">
          <Field field="label" label={t("field.label")} help={t("field.label.help")}>
            <Text ui={ctx.ui} field="label" label={t("field.label")} value={label()} onInput={setLabel} />
          </Field>
          <Show when={provider === "1password"}>
            <Field field="token" label={t("field.token")} help={<>{t("field.token.help")}</>}>
              <SecretInput ui={ctx.ui} t={t} field="token" label={t("field.token")} value={token()} onInput={setToken} onSubmit={() => void submit()} disabled={busy()} />
            </Field>
            <Field field="vaults" label={t("field.vaults")} help={t("field.vaults.help")}>
              <Text ui={ctx.ui} field="vaults" label={t("field.vaults")} value={vaults()} onInput={setVaults} placeholder="Agent" />
            </Field>
          </Show>
          <Show when={provider === "bitwarden"}>
            <Field field="clientId" label={t("field.clientId")} help={t("field.clientId.help")}>
              <Text ui={ctx.ui} field="clientId" label={t("field.clientId")} value={clientId()} onInput={setClientId} placeholder="user.…" />
            </Field>
            <Field field="clientSecret" label={t("field.clientSecret")} help={t("field.clientSecret.help")}>
              <SecretInput ui={ctx.ui} t={t} field="clientSecret" label={t("field.clientSecret")} value={clientSecret()} onInput={setClientSecret} onSubmit={() => void submit()} disabled={busy()} />
            </Field>
            <Field field="org" label={t("field.org")} help={t("field.org.help")}>
              <Text ui={ctx.ui} field="org" label={t("field.org")} value={org()} onInput={setOrg} />
            </Field>
          </Show>
          <Field field="sites" label={t("field.sites")} help={t("field.sites.help")}>
            <Chips ui={ctx.ui} t={t} field="sites" label={t("field.sites")} value={sites()} onChange={setSites} placeholder="*.example.com" />
          </Field>
          <Field field="minutes" label={t("field.minutes")} help={t("field.minutes.help")}>
            <Text ui={ctx.ui} field="minutes" label={t("field.minutes")} value={minutes()} onInput={setMinutes} />
          </Field>
          <Show when={error()}>
            <div data-bfp-error role="alert">
              {error()}
            </div>
          </Show>
          <div class="flex items-center gap-2" data-bfp-actions>
            <div data-action="form-add">
              <ctx.ui.Button variant="contrast" disabled={!complete()} busy={busy()} onClick={() => void submit()}>
                {t("add.submit")}
              </ctx.ui.Button>
            </div>
            <div data-action="form-cancel">
              <ctx.ui.Button disabled={busy()} onClick={() => props.onCancel()}>
                {t("cancel")}
              </ctx.ui.Button>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

/** One account: its checklist with a button for each step, then its settings. */
function AccountSection(props: PageInput & { id: string; data: () => Overview; lookup: () => AccountView | undefined; refresh: () => void }) {
  const { ctx, api } = props
  const t = ctx.t
  const account = () => props.lookup()
  const [busy, setBusy] = createSignal<string>()
  const [password, setPassword] = createSignal("")
  const [problem, setProblem] = createSignal("")
  const [picked, setPicked] = createSignal<string>()
  const [confirming, setConfirming] = createSignal(false)
  const [replacing, setReplacing] = createSignal(false)
  const [token, setToken] = createSignal("")
  const [clientId, setClientId] = createSignal("")
  const [clientSecret, setClientSecret] = createSignal("")
  const [name, setName] = createSignal(account()?.label ?? "")
  const [minutes, setMinutes] = createSignal(String(account()?.autoLockMinutes ?? 10))
  const [vaults, setVaults] = createSignal((account()?.vaults ?? []).join(", "))
  const [org, setOrg] = createSignal(account()?.organizationId ?? "")
  const readOnly = () => account()?.source === "config"
  const steps = createMemo(() => (account() ? stepsOf(account()!, props.data()) : []), [], { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) })
  const tone = (id: string): Tone => steps().find((step) => step.id === id)?.tone ?? "idle"

  const within = async (key: string, work: () => Promise<Reply | undefined>) => {
    setBusy(key)
    setProblem("")
    const reply = await work().catch((): Reply => ({ ok: false, error: t("error.unreachable") }))
    setBusy(undefined)
    if (reply && !reply.ok) setProblem(reply.error ?? t("error.failed"))
    props.refresh()
    return reply
  }
  const save = (settings: Record<string, unknown>) => within("save", () => api.update(props.id, settings))

  const probeText = (probe: Probe) => {
    const a = account()!
    const message = probeMessage(a.provider, probe, a.vaults[0])
    return t(message.key, message.params)
  }
  const lockText = () => {
    const lock = account()?.lock
    if (!lock) return ""
    if (lock.state === "unlocked") return t("lock.unlocked", { time: lock.expiresAt ? time(lock.expiresAt) : "" })
    if (lock.state === "disabled") return t("lock.disabled")
    if (lock.state === "unavailable") return t("lock.unavailable", { reason: lock.reason ?? "" })
    return t("lock.locked")
  }

  const testRow = (stepId: string, titleKey: string) => (
    <Row
      ui={ctx.ui}
      action={`step-${stepId}`}
      tone={tone(stepId)}
      title={t(titleKey)}
      description={
        account()?.test ? (
          <span data-bfp-result={account()!.test!.probe.ok ? "ok" : "bad"}>
            {probeText(account()!.test!.probe)} <span data-bfp-time>{time(account()!.test!.at)}</span>
          </span>
        ) : (
          t(`${stepId}.idle`)
        )
      }
      control={
        <div data-action={`test-${props.id}`}>
          <ctx.ui.Button busy={busy() === "test"} disabled={!account()?.enabled} onClick={() => void within("test", () => api.test(props.id))}>
            {t("test")}
          </ctx.ui.Button>
        </div>
      }
    />
  )

  const replaceRow = (credentialKey: "token" | "key") => (
    <Show when={!readOnly()}>
      <Row
        ui={ctx.ui}
        action={`replace-${credentialKey}`}
        title={t(`replace.${credentialKey}`)}
        description={replacing() ? undefined : t(`replace.${credentialKey}.description`)}
        control={
          <Show when={!replacing()} fallback={undefined}>
            <div data-action={`replace-${credentialKey}-open`}>
              <ctx.ui.Button onClick={() => setReplacing(true)}>{t("replace.button")}</ctx.ui.Button>
            </div>
          </Show>
        }
      />
      <Show when={replacing()}>
        <div data-component="settings-row" data-bfp-row="replace-form">
          <div data-bfp-form data-slot="settings-row-copy">
            <Show
              when={account()?.provider === "1password"}
              fallback={
                <>
                  <Field field="replace-clientId" label={t("field.clientId")}>
                    <Text ui={ctx.ui} field="replace-clientId" label={t("field.clientId")} value={clientId()} onInput={setClientId} />
                  </Field>
                  <Field field="replace-clientSecret" label={t("field.clientSecret")}>
                    <SecretInput ui={ctx.ui} t={t} field="replace-clientSecret" label={t("field.clientSecret")} value={clientSecret()} onInput={setClientSecret} />
                  </Field>
                </>
              }
            >
              <Field field="replace-token" label={t("field.token")}>
                <SecretInput ui={ctx.ui} t={t} field="replace-token" label={t("field.token")} value={token()} onInput={setToken} />
              </Field>
            </Show>
            <div class="flex items-center gap-2">
              <div data-action="replace-save">
                <ctx.ui.Button
                  variant="contrast"
                  busy={busy() === "replace"}
                  disabled={account()?.provider === "1password" ? token().trim() === "" : clientId().trim() === "" || clientSecret().trim() === ""}
                  onClick={() => {
                    const secrets: Record<string, string> = account()?.provider === "1password" ? { token: token().trim() } : { clientId: clientId().trim(), clientSecret: clientSecret().trim() }
                    setToken("")
                    setClientSecret("")
                    setClientId("")
                    void within("replace", async () => {
                      const reply = await api.update(props.id, undefined, secrets)
                      if (reply.ok) {
                        setReplacing(false)
                        await api.test(props.id)
                      }
                      return reply
                    })
                  }}
                >
                  {t("replace.save")}
                </ctx.ui.Button>
              </div>
              <div data-action="replace-cancel">
                <ctx.ui.Button
                  onClick={() => {
                    setToken("")
                    setClientSecret("")
                    setClientId("")
                    setReplacing(false)
                  }}
                >
                  {t("cancel")}
                </ctx.ui.Button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </Show>
  )

  const commitMinutes = () => {
    const value = Number(minutes())
    if (!Number.isFinite(value) || value < 1 || value > 1440) return setMinutes(String(account()?.autoLockMinutes ?? 10))
    if (value !== account()?.autoLockMinutes) void save({ autoLockMinutes: value })
  }

  return (
    <Show when={account()}>
      <Section title={account()!.label} description={`${NAME[account()!.provider]} · ${readOnly() ? t("fromConfig") : t("fromSettings")} · ${lockText()}`} action={`account-${props.id}`}>
        {/* Checklist */}
        <Row ui={ctx.ui} action="step-cli" tone={tone("cli")} title={t(`cli.${account()!.provider}`)} description={props.data().tools[account()!.provider].installed ? t("cli.found", { version: props.data().tools[account()!.provider].version ?? "", path: props.data().tools[account()!.provider].path ?? "" }) : t("cli.missing.short")} />
        <Show when={account()!.provider === "1password"}>
          <Row ui={ctx.ui} action="step-appOff" tone={tone("appOff")} title={t("appOff.title")} description={props.data().confirmed.opAppIntegrationOff ? t("appOff.short") : t("appOff.todo")} />
          <Row ui={ctx.ui} action="step-token" tone={tone("token")} title={t("token.title")} description={account()!.credential ? t("token.saved") : t("token.missing")} />
          {replaceRow("token")}
          {testRow("vault", "vault.title")}
          <Row
            ui={ctx.ui}
            action="step-login"
            tone={tone("login")}
            title={t("login.title")}
            description={
              account()!.verified ? (
                <span data-bfp-result={account()!.verified!.probe.ok ? "ok" : "bad"}>{account()!.verified!.probe.ok ? t("login.ok") : probeText(account()!.verified!.probe)}</span>
              ) : (
                t("login.idle")
              )
            }
            control={
              <div class="flex items-center gap-2">
                <div data-action={`pick-${props.id}`}>
                  <ctx.ui.Menu
                    trigger="button"
                    label={picked() ? (account()!.test?.probe.items?.find((item) => item.id === picked())?.title ?? t("login.choose")) : t("login.choose")}
                    placement="bottom-end"
                    disabled={!account()!.test?.probe.items?.length}
                    items={(account()!.test?.probe.items ?? []).slice(0, 50).map((item) => ({ label: item.title, onSelect: () => setPicked(item.id) }))}
                  />
                </div>
                <div data-action={`verify-${props.id}`}>
                  <ctx.ui.Button busy={busy() === "verify"} disabled={!picked()} onClick={() => void within("verify", () => api.verify(props.id, picked()!))}>
                    {t("verify")}
                  </ctx.ui.Button>
                </div>
              </div>
            }
          />
        </Show>
        <Show when={account()!.provider === "bitwarden"}>
          <Row ui={ctx.ui} action="step-key" tone={tone("key")} title={t("key.title")} description={account()!.credential ? t("key.saved") : t("key.missing")} />
          {replaceRow("key")}
          <Row
            ui={ctx.ui}
            action="step-unlock"
            tone={tone("unlock")}
            title={t("unlock.title")}
            description={account()!.lock.state === "unlocked" ? t("lock.unlocked", { time: account()!.lock.expiresAt ? time(account()!.lock.expiresAt!) : "" }) : t("unlock.description", { minutes: String(account()!.autoLockMinutes) })}
            control={
              <Show
                when={account()!.lock.state === "unlocked"}
                fallback={
                  <div class="flex items-center gap-2" data-bfp-unlock>
                    <SecretInput
                      ui={ctx.ui}
                      t={t}
                      field="unlock"
                      label={t("unlock.password")}
                      value={password()}
                      onInput={setPassword}
                      onSubmit={() => password() !== "" && void unlockNow()}
                    />
                    <div data-action={`unlock-${props.id}`}>
                      <ctx.ui.Button variant="contrast" busy={busy() === "unlock"} disabled={password() === ""} onClick={() => void unlockNow()}>
                        {t("unlock.button")}
                      </ctx.ui.Button>
                    </div>
                  </div>
                }
              >
                <div data-action={`lock-${props.id}`}>
                  <ctx.ui.Button busy={busy() === "lock"} onClick={() => void within("lock", () => api.lock(props.id))}>
                    {t("lock.button")}
                  </ctx.ui.Button>
                </div>
              </Show>
            }
          />
          {testRow("collection", "collection.title")}
        </Show>
        <Show when={account()!.provider === "1password" && account()!.lock.state === "unlocked"}>
          <Row
            ui={ctx.ui}
            action="lock-row"
            title={t("lock.title")}
            description={t("lock.description", { minutes: String(account()!.autoLockMinutes) })}
            control={
              <div data-action={`lock-${props.id}`}>
                <ctx.ui.Button busy={busy() === "lock"} onClick={() => void within("lock", () => api.lock(props.id))}>
                  {t("lock.button")}
                </ctx.ui.Button>
              </div>
            }
          />
        </Show>
        <Show when={problem()}>
          <div data-component="settings-row">
            <div data-slot="settings-row-copy">
              <div data-bfp-error role="alert">
                {problem()}
              </div>
            </div>
          </div>
        </Show>

        {/* Settings */}
        <Show
          when={!readOnly()}
          fallback={<Row ui={ctx.ui} title={t("config.title")} description={t("config.description", { origins: account()!.allowedOrigins.join(", ") || t("config.anySite") })} />}
        >
          <Row
            ui={ctx.ui}
            action="setting-label"
            title={t("field.label")}
            control={<Text ui={ctx.ui} field={`label-${props.id}`} label={t("field.label")} value={name()} onInput={setName} onCommit={() => name().trim() !== "" && name().trim() !== account()!.label && void save({ label: name().trim() })} />}
          />
          <Row
            ui={ctx.ui}
            action="setting-sites"
            title={t("field.sites")}
            description={t("field.sites.help")}
            control={<Chips ui={ctx.ui} t={t} field={`sites-${props.id}`} label={t("field.sites")} value={account()!.allowedOrigins} onChange={(value) => void save({ allowedOrigins: value })} placeholder="*.example.com" />}
          />
          <Row
            ui={ctx.ui}
            action="setting-minutes"
            title={t("field.minutes")}
            description={t("field.minutes.help")}
            control={<Text ui={ctx.ui} field={`minutes-${props.id}`} label={t("field.minutes")} value={minutes()} onInput={setMinutes} onCommit={commitMinutes} />}
          />
          <Show when={account()!.provider === "1password"}>
            <Row
              ui={ctx.ui}
              action="setting-vaults"
              title={t("field.vaults")}
              description={t("field.vaults.help")}
              control={<Text ui={ctx.ui} field={`vaults-${props.id}`} label={t("field.vaults")} value={vaults()} onInput={setVaults} onCommit={() => void save({ vaults: vaults().split(",").map((item) => item.trim()).filter(Boolean) })} />}
            />
          </Show>
          <Show when={account()!.provider === "bitwarden"}>
            <Row
              ui={ctx.ui}
              action="setting-org"
              title={t("field.org")}
              description={t("field.org.help")}
              control={<Text ui={ctx.ui} field={`org-${props.id}`} label={t("field.org")} value={org()} onInput={setOrg} onCommit={() => org().trim() !== (account()!.organizationId ?? "") && void save({ organizationId: org().trim() })} />}
            />
          </Show>
          <Row
            ui={ctx.ui}
            action="setting-confirm"
            title={t("confirm.title")}
            description={t("confirm.description")}
            control={
              <div data-action={`confirm-${props.id}`}>
                <ctx.ui.Switch label={t("confirm.title")} hideLabel checked={account()!.confirmEveryUse} onChange={(checked) => void save({ confirmEveryUse: checked })} />
              </div>
            }
          />
          <Row
            ui={ctx.ui}
            action="setting-otp"
            title={t("otp.title")}
            description={t("otp.description")}
            control={
              <div data-action={`otp-${props.id}`}>
                <ctx.ui.Switch label={t("otp.title")} hideLabel checked={account()!.alwaysAllowOtp} onChange={(checked) => void save({ alwaysAllowOtp: checked })} />
              </div>
            }
          />
          <Row
            ui={ctx.ui}
            action="setting-enabled"
            title={t("enabled.title")}
            description={t("enabled.description")}
            control={
              <div data-action={`enabled-${props.id}`}>
                <ctx.ui.Switch label={t("enabled.title")} hideLabel checked={account()!.enabled} onChange={(checked) => void save({ enabled: checked })} />
              </div>
            }
          />
          <Row
            ui={ctx.ui}
            action="setting-remove"
            title={t("remove.title")}
            description={confirming() ? t("remove.confirm", { provider: NAME[account()!.provider] }) : t("remove.description")}
            control={
              <Show
                when={confirming()}
                fallback={
                  <div data-action={`remove-${props.id}`}>
                    <ctx.ui.Button variant="danger" onClick={() => setConfirming(true)}>
                      {t("remove.button")}
                    </ctx.ui.Button>
                  </div>
                }
              >
                <div class="flex items-center gap-2">
                  <div data-action={`remove-confirm-${props.id}`}>
                    <ctx.ui.Button variant="danger" busy={busy() === "remove"} onClick={() => void within("remove", () => api.remove(props.id))}>
                      {t("remove.confirmButton")}
                    </ctx.ui.Button>
                  </div>
                  <div data-action={`remove-cancel-${props.id}`}>
                    <ctx.ui.Button onClick={() => setConfirming(false)}>{t("cancel")}</ctx.ui.Button>
                  </div>
                </div>
              </Show>
            }
          />
        </Show>
      </Section>
    </Show>
  )

  async function unlockNow() {
    const typed = password()
    setPassword("")
    await within("unlock", () => api.unlock(props.id, typed))
  }
}
