import { span } from "../../native-ui/src/chip-time"
import type { MonitorItem } from "./control"

/** The words of a monitor's status line, from the plugin's translations. */
export interface MonitorWords {
  events(count: number, max: number | undefined): string
  rearm(span: string): string
  expires(span: string): string
  paused: string
}

/** One muted line under a monitor's name: events so far (of its cap), the next re-arm or "paused", and when it expires. */
export function monitorStatus(item: MonitorItem, now: number, words: MonitorWords): string {
  const parts = [words.events(item.events, item.maxEvents)]
  if (item.state === "paused") parts.push(words.paused)
  else if (item.state === "waiting" && item.nextRearmAt !== undefined) parts.push(words.rearm(span(item.nextRearmAt - now)))
  parts.push(words.expires(span(item.expiresAt - now)))
  return parts.join(" · ")
}

/** Every time the line shows a span of: the popover refreshes when one of these crosses a minute. */
export function monitorDeadlines(items: readonly MonitorItem[]): number[] {
  return items.flatMap((item) => [item.expiresAt, ...(item.state === "waiting" && item.nextRearmAt !== undefined ? [item.nextRearmAt] : [])])
}
