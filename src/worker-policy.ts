import { isTerminalJob, readTeamState } from "./team/team-state.ts"
import { isCtfSubagent } from "./tool-packs.ts"
import type { TeamJobStatus } from "./team/team-types.ts"

export type WorkerContext = {
  runId: string
  jobId: string
  parentSessionID: string
  routeId: string
  agent: string
  status: TeamJobStatus
  retryPending: boolean
}

export type WorkerPolicyDecision = {
  allowed: boolean
  reason?: string
}

type WorkerContextLookup = {
  context?: WorkerContext
  stateReadable: boolean
}

/**
 * Coordinator-only tools. Keep the exact list for non-team control-plane
 * tools, but treat every current/future `ctf-team-*` name as coordinator-only
 * so adding a new Team command cannot silently reopen a worker escape hatch.
 */
export const WORKER_DENIED_TOOLS = new Set([
  "edit",
  "write",
  "apply_patch",
  "task",
  "delegate",
  "ctf-team-dispatch",
  "ctf-team-status",
  "ctf-team-collect",
  "ctf-team-cancel",
  "ctf-team-cancel-route",
  "ctf-team-close",
  "ctf-team-recover",
  "ctf-team-adopt",
  "ctf-team-repair",
  "ctf-evidence-board",
  "ctf-decision-state",
  "ctf-file-write-matrix",
  "ctf-mcp-control",
  "ctf-handoff",
  "ctf-team-mode",
  "ctf-continuation-control",
  "ctf-skill-mcp-lifecycle",
  "ctf-whitebox-handoff",
  "ctf-pattern-feedback",
  "ctf-lesson-index-audit",
  "ctf-lesson-modifier-plan",
])

export function isWorkerDeniedTool(toolName: string): boolean {
  return WORKER_DENIED_TOOLS.has(toolName) || toolName.startsWith("ctf-team-")
}

const PROTECTED_PATH_PATTERN =
  /(?:^|[\\/\s"'`])(?:Evidence\.md|notes\.md|\.ctf-state\.json|\.ctf-team\.json|agent_flag\.txt|\.ctf-evidence-board\.json)(?:$|[\\/\s"'`])/i
const PROTECTED_ROOT_PATTERN = /(?:^|[\\/\s"'`])(?:work[\\/]ctf-evidence|runtime[\\/]state)(?:$|[\\/\s"'`])/i
const WRITE_COMMAND_PATTERN =
  /(?:^|[;&|\s])(?:>>?|tee(?:\.exe)?|set-content|add-content|out-file|sed\s+-i|perl\s+-i|rm(?:\.exe)?|del(?:\.exe)?|remove-item|mv(?:\.exe)?|move-item|cp(?:\.exe)?|copy-item)\b/i
const WORKER_EXECUTION_TOOLS = new Set(["ctf-python-inline", "ctf-python-parallel", "ctf-background-job"])
const PATH_ARGUMENT_KEY = /(?:path|file|dir|directory|output|out|state|board|target)/i
const MUTATING_PATH_ARGUMENT_KEY = /(?:script|output|out|state|board|destination|dest|write)/i
const SCRIPT_WRITE_PATTERN =
  /(?:write_text|write_bytes|\.write\s*\(|\.append\s*\(|unlink|remove|rename|replace|mkdir|rmdir|shutil\.(?:copy|move|rmtree)|open\s*\([^)]{0,160},\s*[r\"']?[wax+])/i
const SCRIPT_ARGUMENT_KEY = /(?:^|[.:[\]]|::)(?:code|script|command|input|shell)(?:$|[.:[\]]|::)/i
const MAX_ARGUMENT_SCAN_DEPTH = 8
const MAX_ARGUMENT_SCAN_VALUES = 512

export type WorkerArgumentString = {
  keyPath: string
  value: string
}

/**
 * Flatten tool arguments, including nested objects/arrays and JSON-encoded
 * argument values. Tool adapters are not uniform: some pass `{command}`
 * directly, while others wrap the same payload in `input` or serialize it as
 * a JSON string. A shallow check therefore creates a real policy bypass.
 */
export function scanWorkerArguments(args: unknown): WorkerArgumentString[] {
  const result: WorkerArgumentString[] = []
  const visited = new Set<object>()

  function visit(value: unknown, keyPath: string, depth: number): void {
    if (result.length >= MAX_ARGUMENT_SCAN_VALUES || depth > MAX_ARGUMENT_SCAN_DEPTH) return

    if (typeof value === "string") {
      result.push({ keyPath, value })
      const trimmed = value.trim()
      if (trimmed.length < 2 || trimmed.length > 256_000) return
      if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return
      try {
        const decoded: unknown = JSON.parse(trimmed)
        if (decoded && typeof decoded === "object") visit(decoded, `${keyPath}::json`, depth + 1)
      } catch {
        // Ordinary source code and shell commands are strings, not JSON.
      }
      return
    }

    if (!value || typeof value !== "object") return
    if (visited.has(value)) return
    visited.add(value)

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${keyPath}[${index}]`, depth + 1))
      return
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      visit(child, keyPath ? `${keyPath}.${key}` : key, depth + 1)
    }
  }

  visit(args, "", 0)
  return result
}

function workerMutationDecision(
  toolName: string,
  args: Record<string, unknown>,
  routeLabel: string,
): WorkerPolicyDecision {
  const scanned = scanWorkerArguments(args)
  const protectedPath = scanned.find(({ keyPath, value }) => {
    if (!PATH_ARGUMENT_KEY.test(keyPath)) return false
    const pathIsMutating =
      WORKER_EXECUTION_TOOLS.has(toolName) || toolName === "ctf-ensure-dir" || MUTATING_PATH_ARGUMENT_KEY.test(keyPath)
    return pathIsMutating && (PROTECTED_PATH_PATTERN.test(value) || PROTECTED_ROOT_PATTERN.test(value))
  })
  if (protectedPath) {
    return {
      allowed: false,
      reason:
        `WorkerPolicyError: tool arguments target protected shared state (${routeLabel}). ` +
        `Workers may create temporary challenge artifacts, but cannot write Evidence.md, .ctf-team.json, ` +
        `.ctf-state.json, agent_flag.txt, work/ctf-evidence, or runtime/state.`,
    }
  }

  if (WORKER_EXECUTION_TOOLS.has(toolName)) {
    const code = scanned
      .filter(({ keyPath }) => SCRIPT_ARGUMENT_KEY.test(keyPath))
      .map(({ value }) => value)
      .join("\n")
    if ((PROTECTED_PATH_PATTERN.test(code) || PROTECTED_ROOT_PATTERN.test(code)) && SCRIPT_WRITE_PATTERN.test(code)) {
      return {
        allowed: false,
        reason:
          `WorkerPolicyError: executable tool attempts to write protected shared state (${routeLabel}). ` +
          `Report findings and artifact paths to the ctf-expert parent instead.`,
      }
    }
  }

  return { allowed: true }
}

function shellProtectedStateDecision(
  toolName: string,
  args: Record<string, unknown>,
  routeLabel: string,
): WorkerPolicyDecision {
  if (toolName !== "bash" && toolName !== "shell" && toolName !== "powershell" && toolName !== "cmd") {
    return { allowed: true }
  }

  const scanned = scanWorkerArguments(args)
  const command = scanned
    .filter(({ keyPath }) => /(?:^|[.:[\]]|::)(?:command|cmd|script|shell|input)(?:$|[.:[\]]|::)/i.test(keyPath))
    .map(({ value }) => value)
    .join("\n")
  const inspected = scanned.map(({ value }) => value).join("\n")
  if (PROTECTED_PATH_PATTERN.test(inspected) || PROTECTED_ROOT_PATTERN.test(inspected)) {
    return {
      allowed: false,
      reason:
        `WorkerPolicyError: shell command targets protected shared state (${routeLabel}). ` +
        `Do not write Evidence.md, .ctf-team.json, .ctf-state.json, agent_flag.txt, ` +
        `work/ctf-evidence, or runtime/state from a worker.`,
    }
  }
  if (
    WRITE_COMMAND_PATTERN.test(command || inspected) &&
    /(?:evidence|team|ctf-state|agent_flag|runtime[\\/]state)/i.test(inspected)
  ) {
    return {
      allowed: false,
      reason:
        `WorkerPolicyError: shell write targets shared CTF state. Use temporary challenge artifacts and ` +
        `report the artifact path in the structured worker result.`,
    }
  }

  return { allowed: true }
}

/**
 * Conservative fallback for a CTF subagent when the canonical Team state is
 * unreadable. Ordinary analysis remains available, but operations that could
 * mutate shared state or escalate privileges fail closed until the state is
 * repaired.
 */
function evaluateUnverifiedWorkerPolicy(
  toolName: string,
  args: Record<string, unknown>,
  reason: string,
): WorkerPolicyDecision {
  if (isWorkerDeniedTool(toolName)) {
    return {
      allowed: false,
      reason: `WorkerPolicyError: ${reason} Refusing high-privilege tool "${toolName}" until Team identity is verified.`,
    }
  }

  const mutation = workerMutationDecision(toolName, args, "unverified-worker")
  if (!mutation.allowed) return mutation
  return shellProtectedStateDecision(toolName, args, "unverified-worker")
}

export function evaluateUnreadableWorkerStatePolicy(
  toolName: string,
  args: Record<string, unknown> = {},
): WorkerPolicyDecision {
  return evaluateUnverifiedWorkerPolicy(
    toolName,
    args,
    "Team state is unreadable; cannot verify Team worker identity because .ctf-team.json is unreadable.",
  )
}

export function evaluateUnboundWorkerPolicy(
  toolName: string,
  args: Record<string, unknown> = {},
): WorkerPolicyDecision {
  return evaluateUnverifiedWorkerPolicy(
    toolName,
    args,
    "This CTF subagent session is not bound to a persisted Team job.",
  )
}

async function lookupWorkerContext(directory: string, sessionID?: string): Promise<WorkerContextLookup> {
  if (!sessionID) return { stateReadable: true }
  try {
    const state = await readTeamState(directory)
    for (const run of state.runs) {
      const job = run.jobs.find((candidate) => candidate.sessionID === sessionID)
      if (!job) continue
      return {
        stateReadable: true,
        context: {
          runId: run.id,
          jobId: job.id,
          parentSessionID: run.parentSessionID,
          routeId: job.routeId,
          agent: job.agent,
          status: job.status,
          retryPending: Boolean(job.retryPending),
        },
      }
    }
    return { stateReadable: true }
  } catch {
    return { stateReadable: false }
  }
}

/** Locate a worker from the canonical Team state, so the guard survives hook restarts. */
export async function findWorkerContext(directory: string, sessionID?: string): Promise<WorkerContext | undefined> {
  return (await lookupWorkerContext(directory, sessionID)).context
}

export function evaluateWorkerToolPolicy(
  context: WorkerContext,
  toolName: string,
  args: Record<string, unknown> = {},
): WorkerPolicyDecision {
  if (!toolName.trim()) {
    return {
      allowed: false,
      reason: `WorkerPolicyError: tool identity is missing for worker ${context.jobId}; refusing an unverified execution request.`,
    }
  }

  if (context.retryPending || isTerminalJob(context.status)) {
    return {
      allowed: false,
      reason:
        `WorkerPolicyError: worker ${context.jobId} is no longer active (status=${context.status}` +
        `${context.retryPending ? ", retry pending" : ""}); stale worker execution is fenced.`,
    }
  }

  if (isWorkerDeniedTool(toolName)) {
    return {
      allowed: false,
      reason:
        `WorkerPolicyError: worker ${context.jobId} on ${context.routeId} cannot call "${toolName}". ` +
        `Return structured findings to the ctf-expert parent instead of modifying shared state.`,
    }
  }

  const mutation = workerMutationDecision(toolName, args, context.routeId)
  if (!mutation.allowed) return mutation
  return shellProtectedStateDecision(toolName, args, context.routeId)
}

export async function enforceWorkerToolPolicy(args: {
  directory: string
  sessionID?: string
  agentName?: string
  toolName: string
  toolArgs?: Record<string, unknown>
}) {
  const toolName = typeof args.toolName === "string" ? args.toolName.trim() : ""
  if (isCtfSubagent(args.agentName) && !toolName) {
    throw new Error(
      `WorkerPolicyError: tool identity is missing for CTF worker agent ${args.agentName}; refusing an unverified execution request.`,
    )
  }
  const lookup = await lookupWorkerContext(args.directory, args.sessionID)
  const toolArgs = args.toolArgs ?? {}
  if (!lookup.context) {
    if (isCtfSubagent(args.agentName)) {
      const decision = lookup.stateReadable
        ? evaluateUnboundWorkerPolicy(toolName, toolArgs)
        : evaluateUnreadableWorkerStatePolicy(toolName, toolArgs)
      if (!decision.allowed) {
        console.warn(
          `[plugin] worker-policy deny unverified session=${String(args.sessionID ?? "").slice(0, 12)} ` +
            `agent=${args.agentName} tool=${args.toolName}`,
        )
        throw new Error(decision.reason ?? `WorkerPolicyError: Team worker identity is not verified.`)
      }
    }
    return
  }

  if (args.agentName && args.agentName !== lookup.context.agent) {
    const reason =
      `WorkerPolicyError: session ${String(args.sessionID ?? "").slice(0, 12)} is bound to ` +
      `${lookup.context.agent}/${lookup.context.jobId}, but the execution identified agent=${args.agentName}. ` +
      `Agent identity mismatch is fail-closed.`
    console.warn(`[plugin] worker-policy deny ${reason}`)
    throw new Error(reason)
  }

  const decision = evaluateWorkerToolPolicy(lookup.context, toolName, toolArgs)
  if (!decision.allowed) {
    console.warn(
      `[plugin] worker-policy deny session=${String(args.sessionID ?? "").slice(0, 12)} ` +
        `job=${lookup.context.jobId} route=${lookup.context.routeId} tool=${toolName}`,
    )
    throw new Error(decision.reason ?? `WorkerPolicyError: tool "${args.toolName}" is not allowed for workers.`)
  }
}
