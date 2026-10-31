import { For, splitProps, type ComponentProps } from "solid-js"
import { syncSpinPhase } from "./spin-phase"
import { radarDots, radarKeyframes, radarLoop } from "./spinner-radar"

// The host's Spinner (ui/src/components/spinner.tsx, Soft Radar) as SessionProgressIndicatorV2 renders it. ctx.ui
// exposes only Loader, which the host reserves for non-AI loading, so the dot grid and keyframes are copied verbatim.

const keyframes = "spinner-radar"

const dots = radarDots()

let added = false

export function SessionProgressIndicator(props: ComponentProps<"svg">) {
  const [local, rest] = splitProps(props, ["class"])

  if (!added) {
    added = true
    const style = document.createElement("style")
    style.textContent = radarKeyframes(keyframes)
    document.head.append(style)
  }

  return (
    <svg
      {...rest}
      ref={syncSpinPhase}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      data-component="session-progress-indicator-v2"
      data-slot="spinner-dots"
      class={local.class}
      fill="currentColor"
    >
      <For each={dots}>
        {(dot) => (
          <rect
            x={dot.x}
            y={dot.y}
            width={dot.size}
            height={dot.size}
            rx={dot.size * 0.24}
            style={{
              "--still": dot.still,
              animation: dot.steady
                ? undefined
                : `${keyframes}-${dot.shape} calc(${radarLoop}s * var(--spinner-time, 1)) linear calc(${-radarLoop * (1 - dot.at)}s * var(--spinner-time, 1)) infinite`,
            }}
          />
        )}
      </For>
    </svg>
  )
}
