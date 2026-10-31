export interface Options {
  readonly maxChildren: number
  readonly maxDepth: number
  readonly maxConcurrent: number
  readonly models?: readonly string[]
  readonly defaultWaitMs: number
  readonly maxWaitMs: number
  readonly maxWaitSessions: number
  readonly maxReadChars: number
  readonly messageLimit: number
  readonly scope: "tree" | "project"
  readonly assertSubagentPermission: boolean
}

export const DEFAULTS: Options = {
  maxChildren: 8,
  maxDepth: 3,
  maxConcurrent: 4,
  defaultWaitMs: 120_000,
  maxWaitMs: 600_000,
  maxWaitSessions: 16,
  maxReadChars: 20_000,
  messageLimit: 5,
  scope: "tree",
  assertSubagentPermission: true,
}

function integer(raw: Readonly<Record<string, unknown>>, key: keyof Options, fallback: number): number {
  const value = raw[key]
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`orchestrator-tools option ${key} must be a positive integer`)
  }
  return value
}

export function parseOptions(raw: Readonly<Record<string, unknown>> = {}): Options {
  const models = raw.models
  if (models !== undefined && (!Array.isArray(models) || models.some((m) => typeof m !== "string"))) {
    throw new Error("orchestrator-tools option models must be a list of provider/model strings")
  }
  const scope = raw.scope ?? DEFAULTS.scope
  if (scope !== "tree" && scope !== "project") throw new Error('orchestrator-tools option scope must be "tree" or "project"')
  const assert = raw.assertSubagentPermission ?? DEFAULTS.assertSubagentPermission
  if (typeof assert !== "boolean") throw new Error("orchestrator-tools option assertSubagentPermission must be a boolean")
  return {
    maxChildren: integer(raw, "maxChildren", DEFAULTS.maxChildren),
    maxDepth: integer(raw, "maxDepth", DEFAULTS.maxDepth),
    maxConcurrent: integer(raw, "maxConcurrent", DEFAULTS.maxConcurrent),
    models: models as readonly string[] | undefined,
    defaultWaitMs: integer(raw, "defaultWaitMs", DEFAULTS.defaultWaitMs),
    maxWaitMs: integer(raw, "maxWaitMs", DEFAULTS.maxWaitMs),
    maxWaitSessions: integer(raw, "maxWaitSessions", DEFAULTS.maxWaitSessions),
    maxReadChars: integer(raw, "maxReadChars", DEFAULTS.maxReadChars),
    messageLimit: integer(raw, "messageLimit", DEFAULTS.messageLimit),
    scope,
    assertSubagentPermission: assert,
  }
}
