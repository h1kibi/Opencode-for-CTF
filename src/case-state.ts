import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { atomicUpdateJsonFile, loadJsonFile, nowIso } from "./state-store.ts"

export const CASE_SCHEMA_VERSION = 1

export type CaseRouteState = "untested" | "blocked" | "dead" | "live"

export type CaseRoute = {
  id: string
  state: CaseRouteState
  name?: string
  attempts: number
  nextProbe?: string
  updatedAt: string
}

export type CaseFact = {
  id: string
  kind: "lead" | "candidate" | "verified_fact"
  claim: string
  artifact?: string
  sha256?: string
  line?: number
  producedBy?: string
  createdAt: string
}

export type CaseState = {
  schemaVersion: 1
  caseId: string
  family?: string
  lane?: "fast" | "expert"
  challengeName?: string
  target?: string
  flagFormat?: string
  routes: CaseRoute[]
  facts: CaseFact[]
  openQuestions: string[]
  blockedPaths: string[]
  createdAt: string
  updatedAt: string
}

export type CaseEvent = {
  eventId: string
  type: string
  at: string
  caseId: string
  data: Record<string, unknown>
}

export function caseDirectory(worktree: string, caseId: string): string {
  const safe = caseId.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "case"
  return path.resolve(worktree, "work", "ctf-evidence", safe)
}

export function caseStateFile(worktree: string, caseId: string): string {
  return path.join(caseDirectory(worktree, caseId), "case.json")
}

export function caseEventsFile(worktree: string, caseId: string): string {
  return path.join(caseDirectory(worktree, caseId), "events.jsonl")
}

function emptyCase(caseId: string): CaseState {
  const at = nowIso()
  return {
    schemaVersion: CASE_SCHEMA_VERSION,
    caseId,
    routes: [],
    facts: [],
    openQuestions: [],
    blockedPaths: [],
    createdAt: at,
    updatedAt: at,
  }
}

function validateCase(value: CaseState): CaseState {
  if (!value || value.schemaVersion !== CASE_SCHEMA_VERSION || typeof value.caseId !== "string") {
    throw new Error("Invalid canonical CTF case state")
  }
  if (!Array.isArray(value.routes) || !Array.isArray(value.facts)) {
    throw new Error("Invalid canonical CTF case collections")
  }
  return value
}

export async function readCase(worktree: string, caseId: string): Promise<CaseState> {
  return validateCase(await loadJsonFile(caseStateFile(worktree, caseId), emptyCase(caseId)))
}

export async function updateCase(
  worktree: string,
  caseId: string,
  update: (state: CaseState) => CaseState | Promise<CaseState>,
): Promise<CaseState> {
  const file = caseStateFile(worktree, caseId)
  return atomicUpdateJsonFile(file, emptyCase(caseId), async (current) => {
    const next = validateCase(await update(validateCase(current)))
    next.updatedAt = nowIso()
    return next
  })
}

export async function appendCaseEvent(
  worktree: string,
  caseId: string,
  type: string,
  data: Record<string, unknown> = {},
): Promise<CaseEvent> {
  const directory = caseDirectory(worktree, caseId)
  await mkdir(directory, { recursive: true })
  const event: CaseEvent = { eventId: `evt-${randomUUID().slice(0, 12)}`, type, at: nowIso(), caseId, data }
  await appendFile(caseEventsFile(worktree, caseId), `${JSON.stringify(event)}\n`, "utf8")
  return event
}

export async function listCaseEvents(worktree: string, caseId: string): Promise<CaseEvent[]> {
  try {
    const raw = await readFile(caseEventsFile(worktree, caseId), "utf8")
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CaseEvent)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

export type LegacyCaseInput = {
  caseId: string
  worktree: string
  legacyStateFiles?: string[]
  legacyNotes?: string
}

export async function migrateLegacyCase(input: LegacyCaseInput): Promise<{ state: CaseState; migrated: boolean }> {
  const file = caseStateFile(input.worktree, input.caseId)
  try {
    const existing = JSON.parse(await readFile(file, "utf8")) as CaseState
    return { state: validateCase(existing), migrated: false }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      if (error instanceof SyntaxError) throw error
      throw error
    }
  }

  const state = emptyCase(input.caseId)
  let migrated = false
  const files = input.legacyStateFiles ?? []
  for (const legacyFile of files) {
    try {
      const parsed = JSON.parse(await readFile(legacyFile, "utf8")) as Record<string, unknown>
      if (typeof parsed.category === "string") state.family = parsed.category
      if (typeof parsed.target === "string") state.target = parsed.target
      if (typeof parsed.flagFormat === "string") state.flagFormat = parsed.flagFormat
      migrated = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  if (input.legacyNotes?.trim()) {
    state.openQuestions.push("Review migrated notes.md content and convert claims into verified facts.")
    migrated = true
  }
  if (!migrated) return { state, migrated: false }

  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.migration-${process.pid}-${randomUUID()}`
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  await rename(temp, file)
  await appendCaseEvent(input.worktree, input.caseId, "case.migrated", { sourceFiles: files })
  return { state, migrated: true }
}
