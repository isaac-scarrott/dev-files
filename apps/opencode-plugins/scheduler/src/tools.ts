import type { Plugin } from "@opencode/plugin"
import { Error as ToolError } from "@opencode/plugin/promise/tool"
import type { Host } from "./host.js"
import type { Hub } from "./hub.js"
import type { Options } from "./options.js"
import { isoLocal, type AddInput, type Ended, type Job } from "./scheduler.js"
import { formatSpan } from "./when.js"

export const NAMESPACE = "scheduler"

type Editor = Parameters<Parameters<Plugin.Context["tool"]["transform"]>[0]>[0]

const fail = (message: string) => new ToolError({ message })

export const SCHEDULE_DESCRIPTION = [
  "Schedule a prompt to run later, once or on a repeat. When it is due, the prompt is sent into the session as a new message, whether that session is idle or busy. Exactly one of `at`, `every` or `cron` is required.",
  "- at: one-off. An ISO time (2026-11-02T09:00, local time unless it has a zone) or relative (+30m, +2h, +1d).",
  "- every: repeat every N minutes, hours or days (30m, 2h, 1d). The first run is one interval from now; each next run is one interval after the last.",
  "- cron: 5 fields (minute hour day-of-month month day-of-week) in the user's local time zone, e.g. `0 9 * * 1-5` for 9am on weekdays.",
  "By default the prompt wakes this session. `session` targets another one by ref, unique title or `title [ref]` (see orchestrate_list_peers). Write the prompt so it makes sense on its own later: it is all the session will see.",
  "The user sees each run as a row titled by `name`, so make it a short human label (\"Check the deploy\"), and have the prompt ask for a short plain-language update (a sentence or two, no raw ids or timestamps unless asked).",
  "A task that was missed because the app was closed or the machine was asleep runs once when it is back, not once per missed slot. Do not create recurring tasks unless the user asked for one.",
].join("\n")

export const LIST_DESCRIPTION = "List scheduled tasks with their id, name, kind, next run, last run and target session, plus recently ended ones and why they ended."

export const CANCEL_DESCRIPTION = "Cancel a scheduled task by id (from schedule_task or list_schedules). It will not run again."

function describe(job: Job) {
  return {
    id: job.id,
    name: job.name,
    kind: job.kind,
    schedule: job.spec,
    status: job.status,
    pausedReason: job.pausedReason,
    next: job.status === "active" ? isoLocal(job.nextRun) : undefined,
    last: job.lastRun === undefined ? undefined : isoLocal(job.lastRun),
    runs: job.runs,
    maxRuns: job.maxRuns,
    target: job.target,
    sessionID: job.sessionID,
  }
}

const describeEnded = (e: Ended) => ({ id: e.id, name: e.name, target: e.target, reason: e.reason, at: isoLocal(e.at), runs: e.runs })

export function registerTools(editor: Editor, host: Host, hub: Hub, options: Options): void {
  editor.namespace({ name: NAMESPACE, description: "Schedule prompts to run later in this or another session: one-off, repeating, or cron." })

  // Results are JSON objects; a declared output schema is what lets Code Mode hand them back as values.
  const output = { type: "object", additionalProperties: true } as const

  const add = <Input>(name: string, description: string, input: Record<string, unknown>, run: (input: Input, sessionID: string) => Promise<unknown>) => {
    editor.add({
      name,
      description,
      input,
      output,
      options: { namespace: NAMESPACE, codemode: true },
      async execute(raw, context) {
        let value: unknown
        try {
          value = await run((raw ?? {}) as Input, context.sessionID)
        } catch (error) {
          throw fail(error instanceof Error ? error.message : String(error))
        }
        // Output must be plain JSON: a round trip drops undefined fields.
        const content = JSON.stringify(value)
        return { output: JSON.parse(content), content }
      },
    })
  }

  add(
    "schedule_task",
    SCHEDULE_DESCRIPTION,
    {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, description: "What the session should do when the task runs. It sees only this text. Ask for a short plain-language update." },
        at: { type: "string", description: "Run once at this ISO time, or relative to now: +30m, +2h, +1d" },
        every: { type: "string", description: `Repeat at this interval: 30m, 2h, 1d. At least ${formatSpan(options.minIntervalSeconds * 1000)}.` },
        cron: { type: "string", description: "5-field cron expression in local time, e.g. 0 9 * * 1-5" },
        name: { type: "string", description: "Human label shown on the run's row and in list_schedules, e.g. \"Check the deploy\"; defaults to the start of the prompt" },
        session: { type: "string", description: "Session to wake: its ref, unique title or `title [ref]`. Defaults to this session." },
        maxRuns: { type: "integer", minimum: 1, description: "Stop a recurring task after this many runs" },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    async (input: AddInput, sessionID) => {
      const caller = await host.session.get({ sessionID }).catch(() => {
        throw new Error(`The calling session ${sessionID} could not be read`)
      })
      const { job } = await hub.add(host, caller, input)
      return { ...describe(job), now: isoLocal(Date.now()), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
    },
  )

  add(
    "list_schedules",
    LIST_DESCRIPTION,
    { type: "object", properties: {}, additionalProperties: false },
    async () => {
      const { jobs, ended } = hub.list()
      return { now: isoLocal(Date.now()), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, schedules: jobs.map(describe), recentlyEnded: ended.map(describeEnded) }
    },
  )

  add(
    "cancel_schedule",
    CANCEL_DESCRIPTION,
    { type: "object", properties: { id: { type: "string", minLength: 1, description: "Schedule id, e.g. sch_1a2b3c4d" } }, required: ["id"], additionalProperties: false },
    async (input: { id: string }) => {
      const { cancelled } = await hub.cancel(String(input.id))
      if (!cancelled) throw new Error(`No schedule with id ${input.id}. list_schedules shows the ids.`)
      return { cancelled: describe(cancelled) }
    },
  )
}
