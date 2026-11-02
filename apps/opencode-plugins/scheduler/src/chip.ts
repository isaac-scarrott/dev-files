import { span } from "../../native-ui/src/chip-time"
import type { ScheduleItem } from "./control"

/** The words of a task's status line, from the plugin's translations. */
export interface ScheduleWords {
  once: string
  next(span: string): string
  runs(count: number, max: number | undefined): string
  paused: string
}

/** One muted line under a task's name: the schedule as written, when it next runs (or paused), and the runs so far. */
export function scheduleStatus(item: ScheduleItem, now: number, words: ScheduleWords): string {
  const parts = [item.kind === "once" ? words.once : item.spec]
  parts.push(item.paused ? words.paused : words.next(span(item.nextRun - now)))
  if (item.kind !== "once" && (item.runs > 0 || item.maxRuns !== undefined)) parts.push(words.runs(item.runs, item.maxRuns))
  return parts.join(" · ")
}

/** Every time the line shows a span of: the popover refreshes when one of these crosses a minute. */
export function scheduleDeadlines(items: readonly ScheduleItem[]): number[] {
  return items.filter((item) => !item.paused).map((item) => item.nextRun)
}
