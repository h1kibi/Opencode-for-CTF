import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

/**
 * Evidence board for ctf-expert.
 *
 * Human-readable source of truth: Evidence.md
 * Machine index (optional): .ctf-evidence-board.json
 *
 * Route states (exactly the product model):
 *   untested — possible, not yet verified
 *   blocked  — verified but obstructed (WAF/missing primitive); NOT dead
 *   dead     — repeatedly confirmed impossible
 *   live     — correct path toward flag
 */

export type RouteState = "untested" | "blocked" | "dead" | "live"

type EvidenceStatus = "confirmed" | "refuted" | "inconclusive" | "blocked" | "in_progress"
type EvidenceType =
  | "surface"
  | "primitive"
  | "hypothesis"
  | "technique"
  | "blocker"
  | "chain"
  | "flag"
  | "lesson"
  | "clue"
  | "fact"

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

function now(): string {
  return new Date().toISOString()
}

function generateId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

function resolveInside(contextDir: string, input: string): string {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside workspace: ${input}`)
  }
  return target
}

function defaultPaths(contextDir: string, boardArg?: string, mdArg?: string) {
  const boardPath = resolveInside(contextDir, boardArg || ".ctf-evidence-board.json")
  const mdPath = resolveInside(contextDir, mdArg || "Evidence.md")
  return { boardPath, mdPath }
}

async function loadBoard(filePath: string): Promise<EvidenceBoard> {
  const raw = await readFile(filePath, "utf-8")
  const parsed = JSON.parse(raw) as EvidenceBoard
  if (!parsed.routes) parsed.routes = []
  if (!parsed.round) parsed.round = 1
  if (!parsed.version) parsed.version = 2
  if (!parsed.evidenceMdPath) parsed.evidenceMdPath = "Evidence.md"
  return parsed
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
      return "🟡"
    case "blocked":
      return "🔵"
    case "dead":
      return "⚫"
    case "live":
      return "🟢"
  }
}

function renderEvidenceMd(board: EvidenceBoard): string {
  const facts = board.entries.filter((e) => e.type === "fact" || e.status === "confirmed")
  const clues = board.entries.filter((e) => e.type === "clue" || e.type === "hypothesis")
  const active = board.routes.filter((r) => r.state !== "dead")
  const dead = board.routes.filter((r) => r.state === "dead")

  const lines: string[] = [
    `# Evidence.md — ${board.challenge.name}`,
    "",
    `> Auto-maintained by \`ctf-evidence-board\`. Expert owns this file; workers only return evidence.`,
    "",
    "## Challenge",
    "",
    `- **name**: ${board.challenge.name}`,
    `- **category**: ${board.challenge.category}`,
    `- **target**: ${board.challenge.target}`,
    `- **flag_format**: ${board.challenge.flagFormat || "(unknown)"}`,
    `- **phase**: ${board.phase}`,
    `- **round**: ${board.round}`,
    `- **strategy**: ${board.strategy || "(none)"}`,
    `- **updated**: ${board.updatedAt}`,
    "",
    "## Known Facts",
    "",
  ]

  if (!facts.length) lines.push("- (none yet)")
  else {
    for (const f of facts) {
      lines.push(`- [${f.confidence}] ${f.finding}${f.evidence ? ` — ${f.evidence}` : ""}`)
    }
  }

  lines.push("", "## Clues (unverified)", "")
  if (!clues.length) lines.push("- (none yet)")
  else {
    for (const c of clues) {
      lines.push(`- [${c.agent}/w${c.wave}] ${c.finding}`)
    }
  }

  lines.push(
    "",
    "## Routes (active ≤ 3)",
    "",
    "States: 🟡 untested | 🔵 blocked (≠ dead) | ⚫ dead | 🟢 live",
    "",
  )

  const showRoutes = active.length ? active : board.routes
  if (!showRoutes.length) {
    lines.push("_No routes yet. After recon, set exactly 3 routes with `set-routes`._")
  } else {
    for (const r of showRoutes) {
      lines.push(`### ${r.id}: ${r.name} [${stateEmoji(r.state)} ${r.state}]`)
      lines.push(`- **why_now**: ${r.whyNow || "-"}`)
      lines.push(`- **evidence**: ${r.evidence || "-"}`)
      lines.push(`- **verify**: ${r.verifyMethod || "-"}`)
      lines.push(`- **expected**: ${r.expected || "-"}`)
      lines.push(`- **attempts**: ${r.attempts}`)
      lines.push(`- **blockers**: ${r.blockers.length ? r.blockers.join("; ") : "-"}`)
      lines.push(`- **next_probe**: ${r.nextProbe || "-"}`)
      lines.push("")
    }
  }

  lines.push("## Dead Ends (confirmed)", "")
  if (!dead.length && !board.blockedPaths.length) lines.push("- (none)")
  else {
    for (const r of dead) {
      lines.push(`- **${r.id} ${r.name}**: attempts=${r.attempts}; ${r.blockers.join("; ") || "confirmed dead"}`)
    }
    for (const bp of board.blockedPaths) lines.push(`- ${bp}`)
  }

  lines.push("", "## Decision Log", "")
  const lessons = board.entries.filter((e) => e.type === "lesson" || e.type === "blocker")
  if (!lessons.length) lines.push("- (none)")
  else {
    for (const e of lessons.slice(-20)) {
      lines.push(`- ${e.timestamp.slice(0, 19)} [${e.agent}] ${e.finding}`)
    }
  }

  lines.push(
    "",
    "## Rules (do not violate)",
    "",
    "1. Keep **exactly 3** active routes when in analysis/verify (replace a dead route with a new one).",
    "2. **blocked ≠ dead** — WAF/errors/missing leaks may mean the route is correct but obstructed.",
    `3. Mark **dead** only after ≥${MIN_DEAD_ATTEMPTS} same-family attempts with differential proof of wrong direction.`,
    "4. On **live** or flag — cancel other workers and **return the flag directly** (do not require flag files).",
    "5. Workers return evidence only; expert updates this board.",
    "",
  )

  return lines.join("\n")
}

async function persist(board: EvidenceBoard, boardPath: string, mdPath: string) {
  board.updatedAt = now()
  board.evidenceMdPath = path.relative(path.dirname(boardPath), mdPath) || "Evidence.md"
  await mkdir(path.dirname(boardPath), { recursive: true })
  await mkdir(path.dirname(mdPath), { recursive: true })
  await writeFile(boardPath, JSON.stringify(board, null, 2), "utf-8")
  await writeFile(mdPath, renderEvidenceMd(board), "utf-8")
}

function entrySummary(entry: EvidenceEntry): string {
  return `#${entry.id.slice(-6)} [${entry.agent}] w${entry.wave} ${entry.type}/${entry.status} — ${entry.finding}`
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
        "init | add-fact | add-clue | add | set-routes | set-route-state | summary | query | sync-md | close-path | next-round | update",
      ),
    challengeName: tool.schema.string().optional(),
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
  },
  async execute(args) {
    const cwd = process.cwd()
    let boardPath: string
    let mdPath: string
    try {
      ;({ boardPath, mdPath } = defaultPaths(cwd, args.board, args.evidenceMd))
    } catch (err) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`
    }

    try {
      switch (args.command) {
        case "init": {
          if (!args.challengeName || !args.category || !args.target) {
            return "ERROR: init requires challengeName, category, and target"
          }
          const board = createBoard(
            args.challengeName,
            args.category,
            args.target,
            args.strategy || "",
            args.flagFormat || "",
            path.basename(mdPath),
          )
          if (args.phase) board.phase = args.phase
          await persist(board, boardPath, mdPath)
          return [
            `✅ Evidence initialized`,
            `   json: ${boardPath}`,
            `   md:   ${mdPath}`,
            `   challenge: ${args.challengeName} (${args.category})`,
            `Next: recon with concurrent workers → set-routes (exactly 3) → verify.`,
          ].join("\n")
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
          await persist(board, boardPath, mdPath)
          return `✅ ${entrySummary(entry)}\n   Evidence.md updated`
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
          await persist(board, boardPath, mdPath)
          return `✅ updated ${entrySummary(entry)}`
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
          await persist(board, boardPath, mdPath)
          return [
            `✅ 3 routes recorded (round ${board.round})`,
            ...board.routes.map((r) => `   ${r.id} ${stateEmoji(r.state)} ${r.name}`),
            `   Evidence.md → ${mdPath}`,
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
          if (!route) return `ERROR: route not found: ${args.routeId}. Known: ${board.routes.map((r) => r.id).join(", ")}`

          if (typeof args.attempts === "number") route.attempts = args.attempts
          else if (state === "blocked" || state === "dead" || state === "live") route.attempts += 1

          if (state === "dead" && route.attempts < MIN_DEAD_ATTEMPTS && !args.blockReason?.includes("force")) {
            return [
              `ERROR: refuse dead on ${route.id} — attempts=${route.attempts} < ${MIN_DEAD_ATTEMPTS}.`,
              `blocked ≠ dead. If WAF/obstacle, use routeState=blocked.`,
              `Pass blockReason containing "force" only when differential proof already exists.`,
            ].join(" ")
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
            board.phase = "verify"
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

          await persist(board, boardPath, mdPath)
          return [
            `✅ ${route.id} → ${stateEmoji(state)} ${state} (attempts=${route.attempts})`,
            state === "blocked" ? "   Reminder: blocked ≠ dead; keep route unless differential proof says otherwise." : "",
            state === "live"
              ? `   LIVE: IMMEDIATELY call ctf-team-cancel-route keepRouteId=${route.id}; finish this path; return flag directly when found.`
              : "",
            state === "dead" ? "   Replace this route with a new R* via set-routes if still under 3 actives." : "",
            `   Evidence.md updated`,
          ]
            .filter(Boolean)
            .join("\n")
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
          await persist(board, boardPath, mdPath)
          return `✅ round=${board.round} phase=${board.phase}. Call set-routes with 3 new/updated routes.`
        }

        case "summary": {
          if (!existsSync(boardPath)) return `ERROR: board not found at ${boardPath}`
          const board = await loadBoard(boardPath)
          const lines = [
            `📋 ${board.challenge.name} [${board.challenge.category}]`,
            `   phase=${board.phase} round=${board.round} target=${board.challenge.target}`,
            `   strategy: ${board.strategy || "-"}`,
            `   entries=${board.entries.length} routes=${board.routes.length}`,
            `   md=${mdPath}`,
            "",
            "Routes:",
          ]
          for (const r of board.routes) {
            lines.push(
              `   ${r.id} ${stateEmoji(r.state)} ${r.state} attempts=${r.attempts} — ${r.name}` +
                (r.blockers.length ? ` (blockers: ${r.blockers.slice(-1)[0]})` : ""),
            )
          }
          const confirmed = board.entries.filter((e) => e.status === "confirmed").slice(-5)
          if (confirmed.length) {
            lines.push("", "Recent confirmed:")
            for (const e of confirmed) lines.push(`   ${entrySummary(e)}`)
          }
          const live = board.routes.find((r) => r.state === "live")
          if (live) lines.push("", `🟢 LIVE focus: ${live.id} ${live.name} — push to flag, return directly.`)
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
          await persist(board, boardPath, mdPath)
          return `✅ Evidence.md rewritten at ${mdPath}`
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
            await persist(board, boardPath, mdPath)
            return `🚫 ${route.id} marked dead`
          }
          const board = await loadBoard(boardPath)
          const entry = board.entries.find((e) => e.id === args.entryId)
          if (!entry) return `ERROR: no entry ${args.entryId}`
          entry.status = "blocked"
          entry.refutedBy = args.blockReason || "path exhausted"
          board.blockedPaths.push(`${entry.finding} — ${args.blockReason || "no reason"}`)
          await persist(board, boardPath, mdPath)
          return `🚫 path closed: ${entrySummary(entry)}`
        }

        default:
          return `ERROR: unknown command "${args.command}". Valid: init, add-fact, add-clue, add, set-routes, set-route-state, summary, query, sync-md, close-path, next-round, update`
      }
    } catch (err) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`
    }
  },
})
