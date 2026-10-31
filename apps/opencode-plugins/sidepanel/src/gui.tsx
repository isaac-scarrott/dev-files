import { Panel, Plugin } from "@opencode/plugin/gui"
import { createSignal } from "solid-js"

export default Plugin.define({
  i18n: { en: { title: "Experiment", hello: "Hello from side panel" } },
  setup(ctx) {
    const [count, setCount] = createSignal(0)

    const tab = {
      id: "main",
      get title() {
        return ctx.t("title")
      },
      pinned: true,
      closable: "compact" as const,
      fallback: true,
    }

    ctx.add(Panel, {
      id: "main",
      region: "side",
      list: () => [tab],
      render: () => (
        <div style={{ padding: "12px", display: "flex", "flex-direction": "column", gap: "8px" }}>
          <h3 style={{ margin: 0 }}>{ctx.t("title")}</h3>
          <p style={{ margin: 0 }}>{ctx.t("hello")}</p>
          <button onClick={() => setCount((n) => n + 1)}>clicked {count()}</button>
        </div>
      ),
    })
  },
})