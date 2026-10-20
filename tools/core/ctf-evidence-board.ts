import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { withFileLock } from "../../src/file-lock.ts"
import { saveJsonFile } from "../../src/state-store.ts"
import { resolveInsideWorkspace } from "../lib/workspace-path.ts"
import {
  bootstrapEvidenceDir,
  buildEvidenceSlug,
  getEvidenceDir,
  readCurrentEvidenceSlug,
  slugifyEvidencePart,
  writeCurrentEvidenceSlug,
} from "../../scripts/evidence-helper.ts"
import { appendCaseEvent, updateCase } from "../../src/case-state.ts"
import { findRun, readTeamState } from "../../src/team/team-state.ts"

/**
 * Evidence board for ctf-expert.
 *
 * Canonical machine state: case.json (updated on every board mutation)
 * Solve-board projection: .ctf-evidence-board.json
 * Human-readable projection: Evidence.md
 *
 * Route states (exactly the product model):
 *   untested -> possible, not yet verified
 *   blocked  -> verified but obstructed (WAF/missing primitive); NOT dead
 *   dead     -> repeatedly confirmed impossible
 *   live     -> correct path toward flag
 */

export type RouteState = "untested" | "blocked" | "dead" | "live"

type EvidenceStatus = "confirmed" | "refuted" | "inconclusive" | "blocked" | "in_progress"
type EvidenceType =
  "surface" | "primitive" | "hypothesis" | "technique" | "blocker" | "chain" | "flag" | "lesson" | "clue" | "fact"

type EvidenceEntry = {
  id: string
  agent: string
  wave: number
  timestamp: string
  finding: string
  type: EvidenceType
  category: string
  confidence: "critical" | "high" | "medium" | "low" | "none"
  status: EvidenceStatus
  flagPathDistance: number
  evidence: string
  followUp: string
  refutedBy?: string
}

type Route = {
  id: string
  name: string
  state: RouteState
  whyNow: string
  evidence: string
  verifyMethod: string
  expected: string
  attempts: number
  blockers: string[]
  nextProbe: string
  updatedAt: string
}

type EvidenceBoard = {
  version: 2
  challenge: {
    name: string
    category: string
    flagFormat: string
    target: string
  }
  phase: string
  round: number
  entries: EvidenceEntry[]
  routes: Route[]
  closureQueue: string[]
  blockedPaths: string[]
  strategy: string
  evidenceMdPath: string
  createdAt: string
  updatedAt: string
}

const ROUTE_STATES: RouteState[] = ["untested", "blocked", "dead", "live"]
const MIN_DEAD_ATTEMPTS = 2

// ---------------------------------------------------------------------------
// Runtime schema validation (zod) + board invariants
// ---------------------------------------------------------------------------

const routeStateSchema = z.enum(["untested", "blocked", "dead", "live"])

const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: routeStateSchema,
  whyNow: z.string(),
  evidence: z.string(),
  verifyMethod: z.string(),
  expected: z.string(),
  attempts: z.number().int().min(0),
  blockers: z.array(z.string()),
  nextProbe: z.string(),
  updatedAt: z.string(),
})

const evidenceEntrySchema = z.object({
  id: z.string(),
  agent: z.string(),
  wave: z.number().int(),
  timestamp: z.string(),
  finding: z.string(),
  type: z.string(),
  category: z.string(),
  confidence: z.string(),
  status: z.string(),
  flagPathDistance: z.number().int(),
  evidence: z.string(),
  followUp: z.string(),
  refutedBy: z.string().optional(),
})

const evidenceBoardSchema = z.object({
  version: z.number().int(),
  challenge: z.object({
    name: z.string(),
    category: z.string(),
    flagFormat: z.string(),
    target: z.string(),
  }),
  phase: z.string(),
  round: z.number().int(),
  entries: z.array(evidenceEntrySchema),
  routes: z.array(routeSchema),
  closureQueue: z.array(z.string()),
  blockedPaths: z.array(z.string()),
  strategy: z.string(),
  evidenceMdPath: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Board invariants. Reducers enforce these before mutation; persist() also
 * re-checks so a legacy/corrupt board surfaces warnings instead of silently
 * drifting. We do NOT throw here — an inconsistent legacy board must stay
 * repairable through the tool instead of bricking every command.
 */
function validateBoard(board: EvidenceBoard): string[] {
  const violations: string[] = []
  if (board.routes.length > 3) violations.push(`routes=${board.routes.length} exceeds 3`)
  const live = board.routes.filter((r) => r.state === "live")
  if (live.length > 1) violations.push(`multiple live routes: ${live.map((r) => r.id).join(",")}`)
  for (const route of board.routes) {
    if (!ROUTE_STATES.includes(route.state)) violations.push(`route ${route.id} has invalid state ${route.state}`)
  }
  return violations
}

/**
 * Deep-validate a loaded board; salvage known legacy shapes when possible.
 * Throws with a diagnostic when the JSON is unrecoverable.
 */
function parseBoard(raw: unknown, filePath: string): EvidenceBoard {
  const result = evidenceBoardSchema.safeParse(raw)
  if (result.success) return result.data as EvidenceBoard

  // Legacy repair: fill missing optional collections and re-validate once.
  const record = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  const legacy: Record<string, unknown> = {
    ...record,
    version: record.version ?? 2,
    round: record.round ?? 1,
  }
  if (!Array.isArray(legacy.routes)) legacy.routes = []
  if (!Array.isArray(legacy.entries)) legacy.entries = []
  if (!Array.isArray(legacy.closureQueue)) legacy.closureQueue = []
  if (!Array.isArray(legacy.blockedPaths)) legacy.blockedPaths = []
  if (typeof legacy.strategy !== "string") legacy.strategy = ""
  if (typeof legacy.evidenceMdPath !== "string") legacy.evidenceMdPath = "Evidence.md"
  if (typeof legacy.phase !== "string") legacy.phase = "recon"
  const repaired = evidenceBoardSchema.safeParse(legacy)
  if (repaired.success) {
    console.warn(`[ctf-evidence-board] ${filePath}: board repaired from legacy/incomplete shape`)
    return repaired.data as EvidenceBoard
  }
  const issues = repaired.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ")
  throw new Error(`board schema invalid at ${filePath}: ${issues}`)
}

function now(): string {
  return new Date().toISOString()
}

function generateId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_[\]#<>|]/g, "\\$&").replace(/[\r\n]+/g, " ")
}

function defaultPaths(
  contextDir: string,
  boardArg?: string,
  mdArg?: string,
  category?: string,
  challengeName?: string,
  useCurrent = true,
) {
  const explicitBoard = boardArg ? resolveInsideWorkspace(contextDir, boardArg) : undefined
  const explicitMd = mdArg ? resolveInsideWorkspace(contextDir, mdArg) : undefined
  const root = path.resolve(contextDir, "work", "ctf-evidence")
  const caseParent = (candidate: string | undefined): string | undefined => {
    if (!candidate) return undefined
    const normalized = path.resolve(candidate)
    if (normalized === root || !normalized.startsWith(`${root}${path.sep}`)) {
      throw new Error("explicit evidence paths must be direct files inside work/ctf-evidence/<canonical-case>")
    }
    const relative = path.relative(root, normalized)
    const parts = relative.split(path.sep)
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error("explicit evidence paths must be direct files inside work/ctf-evidence/<canonical-case>")
    }
    const parent = parts[0]
    const canonical = slugifyEvidencePart(parent)
    if (!canonical || parent !== canonical) {
      throw new Error(`evidence case directory must use canonical slug: ${canonical || "invalid"}`)
    }
    return parent
  }
  const boardParent = caseParent(explicitBoard)
  const mdParent = caseParent(explicitMd)
  if ((explicitBoard && !boardParent) !== (explicitMd && !mdParent))
    throw new Error("custom board and evidenceMd paths must be paired")
  if (boardParent && mdParent && boardParent !== mdParent)
    throw new Error("board and evidenceMd must belong to the same evidence case directory")
  const explicitCase = boardParent || mdParent
  const currentSlug = useCurrent && !explicitCase ? readCurrentEvidenceSlug(contextDir) : null
  const slug = explicitCase || currentSlug || buildEvidenceSlug(category || "misc", challengeName)
  const evidenceDir = getEvidenceDir(contextDir, slug)
  const boardPath = explicitBoard || path.join(evidenceDir, ".ctf-evidence-board.json")
  const mdPath = explicitMd || path.join(evidenceDir, "Evidence.md")
  return { boardPath, mdPath, slug, evidenceDir }
}

async function loadBoard(filePath: string): Promise<EvidenceBoard> {
  const raw = await readFile(filePath, "utf-8")
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`board JSON corrupt at ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parseBoard(parsed, filePath)
}

function createBoard(
  name: string,
  category: string,
  target: string,
  strategy: string,
  flagFormat: string,
  evidenceMdPath: string,
): EvidenceBoard {
  const ts = now()
  return {
    version: 2,
    challenge: { name, category, flagFormat, target },
    phase: "recon",
    round: 1,
    entries: [],
    routes: [],
    closureQueue: [],
    blockedPaths: [],
    strategy,
    evidenceMdPath,
    createdAt: ts,
    updatedAt: ts,
  }
}

function stateEmoji(state: RouteState): string {
  switch (state) {
    case "untested":
      return "untested"
    case "blocked":
      return "blocked"
    case "dead":
      return "dead"
    case "live":
      return "live"
  }
}

function renderEvidenceMd(board: EvidenceBoard): string {
  const facts = board.entries.filter((entry) => entry.status === "confirmed")
  const clues = board.entries.filter(
    (entry) => entry.type === "clue" || entry.type === "hypothesis" || entry.type === "fact",
  )
  const active = board.routes.filter((r) => r.state !== "dead")
  const dead = board.routes.filter((r) => r.state === "dead")

  const lines: string[] = [
    `# Evidence.md - ${escapeMarkdown(board.challenge.name)}`,
    "",
    `> Auto-maintained by \`ctf-evidence-board\`. Expert owns this file; workers only return evidence.`,
    "",
    "## Challenge",
    "",
    `- **name**: ${escapeMarkdown(board.challenge.name)}`,
    `- **category**: ${escapeMarkdown(board.challenge.category)}`,
    `- **target**: ${escapeMarkdown(board.challenge.target)}`,
    `- **flag_format**: ${escapeMarkdown(board.challenge.flagFormat || "(unknown)")}`,
    `- **phase**: ${escapeMarkdown(board.phase)}`,
    `- **round**: ${board.round}`,
    `- **strategy**: ${escapeMarkdown(board.strategy || "(none)")}`,
    `- **updated**: ${escapeMarkdown(board.updatedAt)}`,
    "",
    "## Known Facts",
    "",
  ]

  if (!facts.length) lines.push("- (none yet)")
  else {
    for (const fact of facts) {
      lines.push(
        `- [${escapeMarkdown(fact.confidence)}] ${escapeMarkdown(fact.finding)}${fact.evidence ? ` - ${escapeMarkdown(fact.evidence)}` : ""}`,
      )
    }
  }

  lines.push("", "## Clues (unverified)", "")
  if (!clues.length) lines.push("- (none yet)")
  else {
    for (const clue of clues)
      lines.push(`- [${escapeMarkdown(clue.agent)}/w${clue.wave}] ${escapeMarkdown(clue.finding)}`)
  }

  lines.push("", "## Routes (active <= 3)", "", "States: untested | blocked (not dead) | dead | live", "")

  const showRoutes = active.length ? active : board.routes
  if (!showRoutes.length) {
    lines.push("_No routes yet. After recon, set exactly 3 routes with `set-routes`._")
  } else {
    for (const route of showRoutes) {
      lines.push(
        `### ${escapeMarkdown(route.id)}: ${escapeMarkdown(route.name)} [${stateEmoji(route.state)} ${route.state}]`,
      )
      lines.push(`- **why_now**: ${escapeMarkdown(route.whyNow || "-")}`)
      lines.push(`- **evidence**: ${escapeMarkdown(route.evidence || "-")}`)
      lines.push(`- **verify**: ${escapeMarkdown(route.verifyMethod || "-")}`)
      lines.push(`- **expected**: ${escapeMarkdown(route.expected || "-")}`)
      lines.push(`- **attempts**: ${route.attempts}`)
      lines.push(`- **blockers**: ${route.blockers.length ? route.blockers.map(escapeMarkdown).join("; ") : "-"}`)
      lines.push(`- **next_probe**: ${escapeMarkdown(route.nextProbe || "-")}`)
      lines.push("")
    }
  }

  lines.push("## Dead Ends (confirmed)", "")
  if (!dead.length && !board.blockedPaths.length) lines.push("- (none)")
  else {
    for (const route of dead)
      lines.push(
        `- **${escapeMarkdown(route.id)} ${escapeMarkdown(route.name)}**: attempts=${route.attempts}; ${route.blockers.map(escapeMarkdown).join("; ") || "confirmed dead"}`,
      )
    for (const blockedPath of board.blockedPaths) lines.push(`- ${escapeMarkdown(blockedPath)}`)
  }

  lines.push("", "## Decision Log", "")
  const lessons = board.entries.filter((e) => e.type === "lesson" || e.type === "blocker")
  if (!lessons.length) lines.push("- (none)")
  else {
    for (const entry of lessons.slice(-20)) {
      lines.push(
        `- ${escapeMarkdown(entry.timestamp.slice(0, 19))} [${escapeMarkdown(entry.agent)}] ${escapeMarkdown(entry.finding)}`,
      )
    }
  }

  lines.push(
    "",
    "## Rules (do not violate)",
    "",
    "1. Keep **exactly 3** active routes when in analysis/verify (replace a dead route with a new one).",
    "2. **blocked != dead** -> WAF/errors/missing leaks may mean the route is correct but obstructed.",
    `3. Mark **dead** only after >= ${MIN_DEAD_ATTEMPTS} same-family attempts with differential proof of wrong direction.`,
    "4. On **live** or flag -> cancel other workers and return the flag directly (do not require flag files).",
    "5. Workers return evidence only; expert updates this board.",
    "",
  )

  return lines.join("\n")
}

async function atomicWriteText(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temporary, content, "utf8")
    try {
      await rename(temporary, file)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "EEXIST" || code === "EPERM") {
        await rm(file, { force: true })
        await rename(temporary, file)
      } else {
        throw error
      }
    }
  } finally {
    await rm(temporary, { force: true })
  }
}

/**
 * Project the Team run's Fact/Intent ledger into Evidence.md.
 *
 * The ledger is canonical in `.ctf-team.json`; this is a read-only projection,
 * so the Expert can see the Challenge -> Fact -> Intent -> Job chain without
 * opening the raw state file, and the two files cannot drift into competing
 * ledgers. A missing/unreadable Team state renders nothing rather than failing
 * the evidence board.
 */
async function loadTeamProjection(
  worktree: string,
  directory: string,
  caseId: string,
  runId?: string,
): Promise<string[]> {
  try {
    const state = await readTeamState(directory)
    const matching = state.runs.filter((candidate) => candidate.caseId === caseId)
    const run = runId ? findRun(state, runId) : matching[matching.length - 1]
    if (!run || run.caseId !== caseId) return []
    const lines = ["", `## Team Ledger (${escapeMarkdown(run.status)})`, ""]
    const facts = run.facts ?? []
    if (!facts.length) lines.push("- (no facts yet)")
    for (const fact of facts.slice(-40)) {
      const statement = escapeMarkdown(fact.statement.slice(0, 2_000))
      lines.push(
        `- [${escapeMarkdown(fact.id)}] ${escapeMarkdown(fact.status)}/${escapeMarkdown(fact.confidence)} route=${escapeMarkdown(fact.routeId)} source=${escapeMarkdown(fact.sourceJobId)}` +
          `${fact.reviewedBy ? ` acceptedBy=${escapeMarkdown(fact.reviewedBy)}` : ""}`,
      )
      lines.push(`  - ${statement}`)
      const derived = (run.intents ?? []).filter((intent) => intent.basedOnFactIds?.includes(fact.id))
      if (derived.length)
        lines.push(`  - derived intents: ${derived.map((intent) => escapeMarkdown(intent.id)).join(", ")}`)
    }
    const intents = run.intents ?? []
    if (intents.length) {
      lines.push("", "### Intents", "")
      for (const intent of intents) {
        lines.push(
          `- [${escapeMarkdown(intent.id)}] ${escapeMarkdown(intent.status)} route=${escapeMarkdown(intent.routeId)}${intent.claimedBy ? ` worker=${escapeMarkdown(intent.claimedBy)}` : ""}`,
        )
        lines.push(`  - objective: ${escapeMarkdown(intent.objective.slice(0, 8_000))}`)
        if (intent.basedOnFactIds?.length)
          lines.push(`  - based on: ${intent.basedOnFactIds.map(escapeMarkdown).join(", ")}`)
        if (intent.stopCondition) lines.push(`  - stop: ${escapeMarkdown(intent.stopCondition.slice(0, 2_000))}`)
      }
    }
    return lines
  } catch {
    return []
  }
}

async function persist(
  board: EvidenceBoard,
  boardPath: string,
  mdPath: string,
  worktree: string,
  directory: string,
  caseId: string,
  runId?: string,
) {
  await withFileLock(boardPath, async (lease) => {
    const teamProjection = await loadTeamProjection(worktree, directory, caseId, runId)
    board.updatedAt = now()
    board.evidenceMdPath = path.relative(path.dirname(boardPath), mdPath) || "Evidence.md"
    const violations = validateBoard(board)
    for (const violation of violations) console.warn(`[ctf-evidence-board] invariant: ${violation}`)
    await mkdir(path.dirname(boardPath), { recursive: true })
    await mkdir(path.dirname(mdPath), { recursive: true })
    await lease.assertOwned()
    await saveJsonFile(boardPath, board)
    await lease.assertOwned()
    await atomicWriteText(mdPath, [renderEvidenceMd(board), ...teamProjection].join("\n"))
    await lease.assertOwned()
    await updateCase(worktree, caseId, (state) => {
      state.family = board.challenge.category
      state.challengeName = board.challenge.name
      state.target = board.challenge.target
      state.flagFormat = board.challenge.flagFormat || undefined
      state.routes = board.routes.map((route) => ({
        id: route.id,
        name: route.name,
        state: route.state,
        attempts: route.attempts,
        nextProbe: route.nextProbe || undefined,
        updatedAt: route.updatedAt,
      }))
      state.facts = board.entries
        .filter((entry) => entry.status === "confirmed" || (entry.type === "fact" && entry.status !== "in_progress"))
        .map((entry) => ({
          id: entry.id,
          kind: entry.status === "confirmed" ? "verified_fact" : "candidate",
          claim: entry.finding,
          artifact: entry.evidence || undefined,
          producedBy: entry.agent,
          createdAt: entry.timestamp,
        }))
      state.blockedPaths = [...new Set(board.blockedPaths)]
      return state
    })
    await lease.assertOwned()
    await appendCaseEvent(worktree, caseId, "evidence-board.synced", {
      phase: board.phase,
      round: board.round,
      routes: board.routes.length,
      entries: board.entries.length,
    })
  })
}

function entrySummary(entry: EvidenceEntry): string {
  return `#${entry.id.slice(-6)} [${entry.agent}] w${entry.wave} ${entry.type}/${entry.status} - ${entry.finding}`
}

function parseRoutesJson(raw: string): Array<Partial<Route> & { name: string }> {
  const data = JSON.parse(raw) as unknown
  if (!Array.isArray(data)) throw new Error("routesJson must be a JSON array of 3 routes")
  return data.map((item, i) => {
    if (!item || typeof item !== "object") throw new Error(`routesJson[${i}] invalid`)
    const rec = item as Record<string, unknown>
    const name = String(rec.name ?? rec.title ?? "")
    if (!name) throw new Error(`routesJson[${i}] missing name`)
    return {
      name,
      whyNow: String(rec.whyNow ?? rec.why_now ?? ""),
      evidence: String(rec.evidence ?? ""),
      verifyMethod: String(rec.verifyMethod ?? rec.verify ?? ""),
      expected: String(rec.expected ?? ""),
      nextProbe: String(rec.nextProbe ?? rec.next_probe ?? ""),
      state: (rec.state as RouteState) || "untested",
    }
  })
}

export default tool({
  description:
    "CTF evidence board for ctf-expert. Maintains Evidence.md (source of truth) + JSON index. Commands: init, add-fact, add-clue, add, set-routes, set-route-state, summary, query, sync-md, close-path, next-round.",
  args: {
    board: tool.schema.string().optional().describe("JSON board path (default .ctf-evidence-board.json)"),
    evidenceMd: tool.schema.string().optional().describe("Markdown path (default Evidence.md)"),
    command: tool.schema
      .string()
      .describe(
        "init | add-fact | add-team-fact | add-clue | add | add-probe-result | set-routes | set-route-state | summary | query | sync-md | close-path | next-round | flag-verify | update",
      ),
    challengeName: tool.schema.string().optional(),
    evidenceSlug: tool.schema
      .string()
      .optional()
      .describe(
        "Evidence case folder name under work/ctf-evidence (default category-challengeName or category-MMDDHHmmss)",
      ),
    category: tool.schema.string().optional(),
    target: tool.schema.string().optional(),
    flagFormat: tool.schema.string().optional(),
    strategy: tool.schema.string().optional(),
    phase: tool.schema.string().optional().describe("recon | analysis | verify | success | iterate"),
    agent: tool.schema.string().optional(),
    wave: tool.schema.number().optional(),
    finding: tool.schema.string().optional(),
    type: tool.schema.string().optional(),
    confidence: tool.schema.string().optional(),
    status: tool.schema.string().optional(),
    flagPathDistance: tool.schema.number().optional(),
    evidence: tool.schema.string().optional(),
    followUp: tool.schema.string().optional(),
    factId: tool.schema.string().optional().describe("Originating worker Fact ID."),
    entryId: tool.schema.string().optional(),
    queryFilter: tool.schema.string().optional(),
    blockReason: tool.schema.string().optional(),
    routesJson: tool.schema
      .string()
      .optional()
      .describe('JSON array of exactly 3 routes: [{"name","whyNow","evidence","verifyMethod","expected","nextProbe"}]'),
    routeId: tool.schema.string().optional().describe("R1 | R2 | R3 or full route id"),
    routeState: tool.schema.string().optional().describe("untested | blocked | dead | live"),
    attempts: tool.schema.number().optional(),
    nextProbe: tool.schema.string().optional(),
    flagValue: tool.schema.string().optional().describe("Exact flag value to record as verified (flag-verify)."),
    verifiedBy: tool.schema
      .string()
      .optional()
      .describe("flag-verify verification method: oracle | exact | service-check | challenge-platform"),
    oracleVerified: tool.schema
      .string()
      .optional()
      .describe('Set to "true" to approve route -> live when an independent oracle already accepted the flag.'),
    probeResultJson: tool.schema
      .string()
      .optional()
      .describe("JSON result emitted by a CTF web probe; records budgets, hashes, observations, and route state."),
  },
  async execute(args, context) {
    const cwd = context?.worktree ?? context?.directory ?? process.cwd()
    const boardDirectory = context?.directory ?? cwd
    let boardPath: string
    let mdPath: string
    let evidenceDir: string
    let slug: string
    try {
      ;({ boardPath, mdPath, slug, evidenceDir } = defaultPaths(
        cwd,
        args.board,
        args.evidenceMd,
        args.category,
        args.evidenceSlug || args.challengeName,
        args.command !== "init" && !args.evidenceSlug,
      ))
    } catch (err) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`
    }

    try {
      switch (args.command) {
        case "init": {
          if (!args.category || !args.target) {
            return "ERROR: init requires category and target (challengeName optional; fallback case id is category-MMDDHHmmss)"
          }
          const challengeName = args.challengeName || slug
          const category = args.category
          bootstrapEvidenceDir(cwd, slug)
          writeCurrentEvidenceSlug(cwd, slug)
          const board = createBoard(
            challengeName,
            category,
            args.target,
            args.strategy || "",
            args.flagFormat || "",
            path.basename(mdPath),
          )
          if (args.phase) board.phase = args.phase
          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return [
            `Evidence initialized`,
            `   case: ${slug}`,
            `   dir:  ${evidenceDir}`,
            `   json: ${boardPath}`,
            `   md:   ${mdPath}`,
            `   challenge: ${challengeName} (${category})`,
            `Next: recon with concurrent workers -> set-routes (exactly 3) -> verify.`,
          ].join("\n")
        }

        case "add-team-fact": {
          if (!args.finding || !args.evidence) return "ERROR: add-team-fact requires finding and evidence"
          if (!existsSync(boardPath)) return `ERROR: board not found; run init first (${boardPath})`
          const teamFact: EvidenceEntry = {
            id: args.factId || generateId("fact"),
            agent: args.agent || "ctf-worker",
            wave: args.wave ?? 0,
            timestamp: now(),
            finding: args.finding,
            type: "fact",
            category: args.category || "ctf",
            confidence: (args.confidence as EvidenceEntry["confidence"]) || "medium",
            status: "in_progress",
            flagPathDistance: args.flagPathDistance ?? 5,
            evidence: args.evidence,
            followUp: args.followUp || "Expert review required",
          }
          const teamBoard = await loadBoard(boardPath)
          if (teamBoard.entries.some((entry) => entry.id === teamFact.id))
            return `Fact already recorded: ${teamFact.id}`
          teamBoard.entries.push(teamFact)
          await persist(teamBoard, boardPath, mdPath, cwd, boardDirectory, slug)
          return `${entrySummary(teamFact)}\n   Pending Expert confirmation`
        }
        case "add-fact":
        case "add-clue":
        case "add": {
          if (!args.finding) return "ERROR: finding is required"
          if (!existsSync(boardPath)) return `ERROR: board not found; run init first (${boardPath})`
          const board = await loadBoard(boardPath)
          const isFact = args.command === "add-fact"
          const isClue = args.command === "add-clue"
          const entry: EvidenceEntry = {
            id: generateId("ev"),
            agent: args.agent || "ctf-expert",
            wave: args.wave ?? board.round,
            timestamp: now(),
            finding: args.finding,
            type: (args.type as EvidenceType) || (isFact ? "fact" : isClue ? "clue" : "hypothesis"),
            category: args.category || board.challenge.category,
            confidence: (args.confidence as EvidenceEntry["confidence"]) || (isFact ? "high" : "medium"),
            status: (args.status as EvidenceStatus) || (isFact ? "confirmed" : "in_progress"),
            flagPathDistance: args.flagPathDistance ?? 5,
            evidence: args.evidence || "",
            followUp: args.followUp || "",
          }
          board.entries.push(entry)
          if (args.phase) board.phase = args.phase
          if (args.strategy) board.strategy = args.strategy
          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return `${entrySummary(entry)}\n   Evidence.md updated`
        }

        case "add-probe-result": {
          if (!args.probeResultJson) return "ERROR: add-probe-result requires probeResultJson"
          let probe: Record<string, unknown>
          try {
            const parsed = JSON.parse(args.probeResultJson)
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
              return "ERROR: probeResultJson must be a JSON object"
            probe = parsed as Record<string, unknown>
          } catch {
            return "ERROR: invalid probeResultJson"
          }
          const board = await loadBoard(boardPath)
          const toolName = String(probe.tool || "ctf-probe")
          const route = args.routeId
            ? board.routes.find((item) => item.id === args.routeId || item.name === args.routeId)
            : undefined
          const routeState = String(probe.route_state || probe.routeState || "")
          const observations = Array.isArray(probe.observations) ? probe.observations : []
          const finding = args.finding || `${toolName} probe${route ? ` on ${route.id}` : ""}`
          const evidence = JSON.stringify({
            evidence_ref: probe.evidence_ref || probe.evidenceRef,
            requests: probe.requests,
            state_changing_requests: probe.state_changing_requests,
            route_state: routeState,
            response_hashes: observations
              .map((item) =>
                item && typeof item === "object" ? (item as Record<string, unknown>).responseHash : undefined,
              )
              .filter(Boolean),
            stop_reason: probe.stop_reason,
            confirmed_primitives: probe.confirmed_primitives,
          })
          board.entries.push({
            id: generateId("probe"),
            agent: args.agent || "ctf-expert",
            wave: args.wave ?? board.round,
            timestamp: now(),
            finding,
            type: (args.type as EvidenceType) || "fact",
            category: args.category || board.challenge.category,
            confidence:
              (args.confidence as EvidenceEntry["confidence"]) || (probe.confirmed_primitives ? "high" : "medium"),
            status: (args.status as EvidenceStatus) || "confirmed",
            flagPathDistance: args.flagPathDistance ?? 3,
            evidence,
            followUp:
              args.followUp || String(probe.next_probe || "review probe evidence and choose one bounded next probe"),
          })
          if (route && ["blocked", "live", "dead"].includes(routeState)) {
            route.state = routeState as RouteState
            route.updatedAt = now()
            route.attempts += 1
            if (routeState === "blocked") route.blockers.push(String(probe.stop_reason || "probe reported blocked"))
            if (probe.next_probe) route.nextProbe = String(probe.next_probe)
          }
          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return `probe recorded: ${finding}\n   requests=${String(probe.requests ?? "?")} state_changing=${String(probe.state_changing_requests ?? "?")} route_state=${routeState || "unchanged"}\n   Evidence.md updated`
        }

        case "update": {
          if (!args.entryId) return "ERROR: update requires entryId"
          const board = await loadBoard(boardPath)
          const entry = board.entries.find((e) => e.id === args.entryId)
          if (!entry) return `ERROR: no entry ${args.entryId}`
          if (args.status) entry.status = args.status as EvidenceStatus
          if (args.confidence) entry.confidence = args.confidence as EvidenceEntry["confidence"]
          if (args.evidence) entry.evidence = args.evidence
          if (args.followUp) entry.followUp = args.followUp
          if (args.blockReason) entry.refutedBy = args.blockReason
          entry.timestamp = now()
          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return `updated ${entrySummary(entry)}`
        }

        case "set-routes": {
          if (!args.routesJson) return "ERROR: set-routes requires routesJson (array of exactly 3 routes)"
          const parsed = parseRoutesJson(args.routesJson)
          if (parsed.length !== 3) {
            return `ERROR: exactly 3 routes required, got ${parsed.length}`
          }
          const board = await loadBoard(boardPath)
          const ts = now()
          board.routes = parsed.map((r, i) => ({
            id: `R${i + 1}`,
            name: r.name,
            state: ROUTE_STATES.includes(r.state as RouteState) ? (r.state as RouteState) : "untested",
            whyNow: r.whyNow || "",
            evidence: r.evidence || "",
            verifyMethod: r.verifyMethod || "",
            expected: r.expected || "",
            attempts: 0,
            blockers: [],
            nextProbe: r.nextProbe || "",
            updatedAt: ts,
          }))
          board.phase = args.phase || "analysis"
          if (args.strategy) board.strategy = args.strategy
          board.entries.push({
            id: generateId("ev"),
            agent: args.agent || "ctf-expert",
            wave: board.round,
            timestamp: ts,
            finding: `Routes set: ${board.routes.map((r) => r.name).join(" | ")}`,
            type: "lesson",
            category: board.challenge.category,
            confidence: "high",
            status: "confirmed",
            flagPathDistance: 3,
            evidence: args.routesJson.slice(0, 500),
            followUp: "Verify independent routes concurrently; shared-state chains serially",
          })
          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return [
            `3 routes recorded (round ${board.round})`,
            ...board.routes.map((r) => `   ${r.id} ${stateEmoji(r.state)} ${r.name}`),
            `   Evidence.md -> ${mdPath}`,
          ].join("\n")
        }

        case "set-route-state": {
          if (!args.routeId || !args.routeState) {
            return "ERROR: set-route-state requires routeId and routeState (untested|blocked|dead|live)"
          }
          const state = args.routeState as RouteState
          if (!ROUTE_STATES.includes(state)) {
            return `ERROR: invalid routeState "${args.routeState}". Use: untested | blocked | dead | live`
          }
          const board = await loadBoard(boardPath)
          const route = board.routes.find(
            (r) => r.id === args.routeId || r.id === args.routeId?.toUpperCase() || r.name === args.routeId,
          )
          if (!route)
            return `ERROR: route not found: ${args.routeId}. Known: ${board.routes.map((r) => r.id).join(", ")}`

          if (typeof args.attempts === "number") route.attempts = args.attempts
          else if (state === "blocked" || state === "dead" || state === "live") route.attempts += 1

          if (state === "dead" && route.attempts < MIN_DEAD_ATTEMPTS && !args.blockReason?.includes("force")) {
            return [
              `ERROR: refuse dead on ${route.id} - attempts=${route.attempts} < ${MIN_DEAD_ATTEMPTS}.`,
              `blocked != dead. If WAF/obstacle, use routeState=blocked.`,
              `Pass blockReason containing "force" only when differential proof already exists.`,
            ].join(" ")
          }

          // Live gate: only one live route, and only after an oracle-verified flag.
          if (state === "live") {
            const otherLive = board.routes.find((r) => r.id !== route.id && r.state === "live")
            if (otherLive) {
              return `ERROR: route ${otherLive.id} is already live; only one live route is allowed. Set it to blocked/dead first.`
            }
            const verifiedEntry = board.entries.some((e) => e.type === "flag" && e.status === "confirmed")
            const oracleApproved = args.oracleVerified === "true"
            if (!verifiedEntry && !oracleApproved) {
              return [
                "ERROR: route -> live requires a verified flag.",
                "Run `flag-verify` with flagValue + verifiedBy (oracle | exact | service-check | challenge-platform),",
                'or pass oracleVerified="true" only when an independent oracle already accepted the flag.',
                "Flag-like strings in output are candidates, not verification.",
              ].join(" ")
            }
          }

          route.state = state
          route.updatedAt = now()
          if (args.blockReason) route.blockers.push(args.blockReason)
          if (args.nextProbe) route.nextProbe = args.nextProbe
          if (args.evidence) route.evidence = args.evidence
          if (args.followUp) route.nextProbe = args.followUp
          if (args.phase) board.phase = args.phase

          if (state === "dead") {
            board.blockedPaths.push(`${route.id} ${route.name}: ${args.blockReason || "confirmed dead"}`)
          }
          if (state === "live") {
            if (board.phase !== "success") board.phase = "verify"
            board.entries.push({
              id: generateId("ev"),
              agent: args.agent || "ctf-expert",
              wave: board.round,
              timestamp: now(),
              finding: `LIVE route ${route.id}: ${route.name}`,
              type: "chain",
              category: board.challenge.category,
              confidence: "critical",
              status: "confirmed",
              flagPathDistance: 1,
              evidence: args.evidence || "",
              followUp: `ctf-team-cancel-route keepRouteId=${route.id}; push to flag; return flag directly`,
            })
          }

          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return [
            `${route.id} -> ${stateEmoji(state)} ${state} (attempts=${route.attempts})`,
            state === "blocked"
              ? "   Reminder: blocked != dead; keep route unless differential proof says otherwise."
              : "",
            state === "live"
              ? `   LIVE: IMMEDIATELY call ctf-team-cancel-route keepRouteId=${route.id}; finish this path; return flag directly when found.`
              : "",
            state === "dead" ? "   Replace this route with a new R* via set-routes if still under 3 actives." : "",
            `   Evidence.md updated`,
          ]
            .filter(Boolean)
            .join("\n")
        }

        case "flag-verify": {
          if (!args.flagValue) return "ERROR: flag-verify requires flagValue (the exact verified flag)"
          if (!args.verifiedBy) {
            return "ERROR: flag-verify requires verifiedBy (oracle | exact | service-check | challenge-platform)"
          }
          const board = await loadBoard(boardPath)
          board.entries.push({
            id: generateId("ev"),
            agent: args.agent || "ctf-expert",
            wave: board.round,
            timestamp: now(),
            finding: `VERIFIED FLAG: ${args.flagValue}`,
            type: "flag",
            category: board.challenge.category,
            confidence: "critical",
            status: "confirmed",
            flagPathDistance: 0,
            evidence: `verifiedBy=${args.verifiedBy}${args.evidence ? `; ${args.evidence}` : ""}`,
            followUp: "return the flag directly; stop solving",
          })
          board.phase = "success"
          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return [
            `Flag verified (${args.verifiedBy}): ${args.flagValue}`,
            "   phase -> success. Return the flag directly; do not keep solving.",
            "   Routes may now be marked live (single route only).",
          ].join("\n")
        }

        case "next-round": {
          const board = await loadBoard(boardPath)
          board.round += 1
          board.phase = args.phase || "analysis"
          // Keep dead routes in history but active slots will be reset by next set-routes
          const keep = board.routes.filter((r) => r.state === "live" || r.state === "blocked")
          board.routes = keep
          if (args.strategy) board.strategy = args.strategy
          board.entries.push({
            id: generateId("ev"),
            agent: args.agent || "ctf-expert",
            wave: board.round,
            timestamp: now(),
            finding: `Advance to analysis round ${board.round}`,
            type: "lesson",
            category: board.challenge.category,
            confidence: "medium",
            status: "confirmed",
            flagPathDistance: 4,
            evidence: args.evidence || "prior routes exhausted or need replan",
            followUp: "Formulate 3 new routes from accumulated facts",
          })
          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return `round=${board.round} phase=${board.phase}. Call set-routes with 3 new/updated routes.`
        }

        case "summary": {
          if (!existsSync(boardPath)) return `ERROR: board not found at ${boardPath}`
          const board = await loadBoard(boardPath)
          const lines = [
            `${board.challenge.name} [${board.challenge.category}]`,
            `   phase=${board.phase} round=${board.round} target=${board.challenge.target}`,
            `   strategy: ${board.strategy || "-"}`,
            `   entries=${board.entries.length} routes=${board.routes.length}`,
            `   md=${mdPath}`,
            "",
            "Routes:",
          ]
          for (const r of board.routes) {
            lines.push(
              `   ${r.id} ${stateEmoji(r.state)} ${r.state} attempts=${r.attempts} - ${r.name}` +
                (r.blockers.length ? ` (blockers: ${r.blockers.slice(-1)[0]})` : ""),
            )
          }
          const confirmed = board.entries.filter((e) => e.status === "confirmed").slice(-5)
          if (confirmed.length) {
            lines.push("", "Recent confirmed:")
            for (const e of confirmed) lines.push(`   ${entrySummary(e)}`)
          }
          const live = board.routes.find((r) => r.state === "live")
          if (live) lines.push("", `LIVE focus: ${live.id} ${live.name} -> push to flag, return directly.`)
          return lines.join("\n")
        }

        case "query": {
          const board = await loadBoard(boardPath)
          if (!args.queryFilter) return JSON.stringify({ routes: board.routes, entries: board.entries }, null, 2)
          let filter: Record<string, unknown>
          try {
            filter = JSON.parse(args.queryFilter)
          } catch {
            return `ERROR: invalid queryFilter JSON`
          }
          if (filter.routes === true) return JSON.stringify(board.routes, null, 2)
          const results = board.entries.filter((e) => {
            for (const [key, value] of Object.entries(filter)) {
              if (key === "routes") continue
              if ((e as Record<string, unknown>)[key] !== value) return false
            }
            return true
          })
          return JSON.stringify(results, null, 2)
        }

        case "sync-md": {
          const board = await loadBoard(boardPath)
          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return `Evidence.md -> ${mdPath}`
        }

        case "close-path": {
          // compatibility with older skill text
          if (!args.entryId && !args.routeId) return "ERROR: close-path requires routeId or entryId"
          if (args.routeId) {
            const board = await loadBoard(boardPath)
            const route = board.routes.find((r) => r.id === args.routeId || r.name === args.routeId)
            if (!route) return `ERROR: route not found ${args.routeId}`
            route.state = "dead"
            route.attempts = Math.max(route.attempts, MIN_DEAD_ATTEMPTS)
            if (args.blockReason) route.blockers.push(args.blockReason)
            board.blockedPaths.push(`${route.id}: ${args.blockReason || "closed"}`)
            await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
            return `${route.id} marked dead`
          }
          const board = await loadBoard(boardPath)
          const entry = board.entries.find((e) => e.id === args.entryId)
          if (!entry) return `ERROR: no entry ${args.entryId}`
          entry.status = "blocked"
          entry.refutedBy = args.blockReason || "path exhausted"
          board.blockedPaths.push(`${entry.finding} - ${args.blockReason || "no reason"}`)
          await persist(board, boardPath, mdPath, cwd, boardDirectory, slug)
          return `path closed: ${entrySummary(entry)}`
        }

        default:
          return `ERROR: unknown command "${args.command}". Valid: init, add-fact, add-clue, add, set-routes, set-route-state, summary, query, sync-md, close-path, next-round, update`
      }
    } catch (err) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`
    }
  },
})
