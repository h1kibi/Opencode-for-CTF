/** Read-only solve-state summaries for explicit fast-lane handoffs. */

import { readFile } from "node:fs/promises"
import path from "node:path"
import { getEvidenceDir, readCurrentEvidenceSlug } from "../../scripts/evidence-helper.ts"

export type SerializerBudgets = {
  inventory: number
  routes: number
  blockedPaths: number
}

export const DEFAULT_WORKER_BUDGETS: SerializerBudgets = {
  inventory: 600,
  routes: 1_000,
  blockedPaths: 1_000,
}

type BoardRoute = {
  id?: string
  name?: string
  state?: string
  whyNow?: string
  evidence?: string
  attempts?: number
  blockers?: string[]
  nextProbe?: string
}

type BoardLite = {
  challenge?: { name?: string; category?: string; flagFormat?: string; target?: string }
  routes?: BoardRoute[]
  blockedPaths?: string[]
}

export type SolveStateSections = {
  inventory: string
  routes: string
  blockedPaths: string
}

/** Read the current evidence board projection. */
export async function readEvidenceBoardLite(directory: string): Promise<BoardLite | undefined> {
  const slug = readCurrentEvidenceSlug(directory)
  if (!slug) return undefined
  const boardPath = path.join(getEvidenceDir(directory, slug), ".ctf-evidence-board.json")
  return JSON.parse(await readFile(boardPath, "utf8")) as BoardLite
}

function clipLines(lines: string[], budget: number): string {
  const out: string[] = []
  let used = 0
  let index = 0
  for (; index < lines.length; index++) {
    const line = lines[index]
    if (used + line.length > budget && out.length > 0) break
    out.push(line)
    used += line.length
  }
  if (index < lines.length) out.push(`...(${lines.length - index} more truncated)`)
  return out.join("\n")
}

/** Extract scalar invariants verbatim (deduped, capped). */
export function extractScalars(texts: string[], cap = 20): string[] {
  const patterns = [
    /\b0x[0-9a-fA-F]{2,16}\b/g,
    /\bg?libc[\s.-]?\d+(\.\d+){1,2}\b/gi,
    /\bsha-?256[:\s]*[0-9a-f]{8,64}\b/gi,
    /\bmd5[:\s]*[0-9a-f]{8,32}\b/gi,
    /\b\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}\b/g,
    /\b(?:nc|netcat)\s+\S+\s+\d{2,5}\b/gi,
  ]
  const found = new Set<string>()
  for (const text of texts) {
    for (const pattern of patterns) {
      const active = new RegExp(pattern.source, pattern.flags)
      let match: RegExpExecArray | null
      while ((match = active.exec(text)) !== null) {
        found.add(match[0].replace(/\s+/g, " ").trim())
        if (found.size >= cap) return [...found]
      }
    }
  }
  return [...found]
}

function routeOf(id: string | undefined): string | undefined {
  return id === "recon" || id === "R1" || id === "R2" || id === "R3" || id === "general" ? id : undefined
}

/** Serialize the current board without inventing an Agent-facing Team ledger. */
export async function serializeSolveState(
  directory: string,
  options: { routeId?: string; budgets?: SerializerBudgets } = {},
): Promise<SolveStateSections> {
  const budgets = options.budgets ?? DEFAULT_WORKER_BUDGETS
  const routeId = routeOf(options.routeId)
  const board = await readEvidenceBoardLite(directory)
  const challenge = board?.challenge
  const inventory = [
    challenge?.category ? `- category: ${challenge.category}` : "",
    challenge?.target ? `- target: ${String(challenge.target).slice(0, 120)}` : "",
    challenge?.flagFormat ? `- flag format: ${String(challenge.flagFormat).slice(0, 120)}` : "",
  ].filter(Boolean)
  const routes = (board?.routes ?? [])
    .filter((route) => !routeId || route.id === routeId || route.id === "general")
    .map((route) =>
      [
        `- ${route.id ?? "route"}: ${route.state ?? "untested"}`,
        route.name ? `name=${route.name.slice(0, 120)}` : "",
        route.nextProbe ? `next=${route.nextProbe.slice(0, 160)}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    )
  const blockedPaths = (board?.blockedPaths ?? [])
    .filter(
      (entry) =>
        !routeId ||
        entry.startsWith(routeId) ||
        entry.startsWith("general") ||
        !/^(R1|R2|R3|recon|general)\b/.test(entry),
    )
    .map((entry) => `- ${String(entry).slice(0, 160)}`)
  return {
    inventory: clipLines(inventory, budgets.inventory),
    routes: clipLines(routes, budgets.routes),
    blockedPaths: clipLines(blockedPaths, budgets.blockedPaths),
  }
}
