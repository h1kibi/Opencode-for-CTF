import path from "node:path"
import { atomicUpdateJsonFile, loadJsonFile } from "./state-store.ts"
import { runtimeStateRoot } from "./paths.ts"

/**
 * Per-session tool surface after hard routing.
 * /ctf is declared with agent: ctf-fast, but BINDING route may be expert;
 * tool.execute.before must allow expert tools for that session.
 */

export type SessionToolSurface = "ctf-fast" | "ctf-expert"

type PersistedSurface = {
  surface: SessionToolSurface
  source?: "explicit" | "route" | "explicit-fast" | "legacy"
  version?: 2
  updatedAt: string
}

type PersistedSurfaces = Record<string, PersistedSurface>

const sessionToolSurface = new Map<string, SessionToolSurface>()
const SESSION_SURFACE_MAX = 100

function surfacesFile(worktree: string) {
  return path.join(runtimeStateRoot(worktree), "session-surfaces.json")
}

export function rememberSessionSurface(sessionID: string | undefined | null, surface: SessionToolSurface): void {
  if (!sessionID) return
  if (sessionToolSurface.size >= SESSION_SURFACE_MAX) {
    const first = sessionToolSurface.keys().next().value
    if (first !== undefined) sessionToolSurface.delete(first)
  }
  sessionToolSurface.set(sessionID, surface)
}

/** Restore only provenance-backed surfaces; legacy Expert records are demoted. */
export async function restoreSessionSurfaces(worktree: string): Promise<void> {
  const file = surfacesFile(worktree)
  const stored = await loadJsonFile<PersistedSurfaces>(file, {})
  let changed = false
  const entries = Object.entries(stored)
    .map(([sessionID, value]) => {
      if (!value || (value.surface !== "ctf-fast" && value.surface !== "ctf-expert")) return undefined
      if (
        value.version !== 2 ||
        value.source === "legacy" ||
        (value.surface === "ctf-expert" && value.source !== "explicit" && value.source !== "route")
      ) {
        stored[sessionID] = { ...value, surface: "ctf-fast", source: "legacy", version: 2 }
        changed = true
      }
      return [sessionID, stored[sessionID]] as const
    })
    .filter((entry): entry is readonly [string, PersistedSurface] => Boolean(entry))
    .sort((a, b) => String(a[1].updatedAt).localeCompare(String(b[1].updatedAt)))
    .slice(-SESSION_SURFACE_MAX)
  for (const [sessionID, value] of entries) rememberSessionSurface(sessionID, value.surface)
  if (changed) await atomicUpdateJsonFile<PersistedSurfaces>(file, {}, () => stored)
}

export async function persistSessionSurface(
  worktree: string,
  sessionID: string | undefined | null,
  surface: SessionToolSurface,
  source: "explicit" | "route" | "explicit-fast" = surface === "ctf-expert" ? "explicit" : "explicit-fast",
): Promise<void> {
  if (!sessionID) return
  await atomicUpdateJsonFile<PersistedSurfaces>(surfacesFile(worktree), {}, (current) => ({
    ...current,
    [sessionID]: { surface, source, version: 2, updatedAt: new Date().toISOString() },
  }))
}

export async function removePersistedSessionSurface(
  worktree: string,
  sessionID: string | undefined | null,
): Promise<void> {
  if (!sessionID) return
  const file = surfacesFile(worktree)
  await atomicUpdateJsonFile<PersistedSurfaces>(file, {}, (current) => {
    if (!current[sessionID]) return current
    const next = { ...current }
    delete next[sessionID]
    return next
  })
}

export function getSessionSurface(sessionID: string | undefined | null): SessionToolSurface | undefined {
  if (!sessionID) return undefined
  return sessionToolSurface.get(sessionID)
}

export function clearSessionSurface(sessionID: string | undefined | null): void {
  if (!sessionID) return
  sessionToolSurface.delete(sessionID)
}

/** Resolve agent name used for tool allowlist checks. */
export function surfaceAgentForTools(sessionID: string | undefined | null, agentName: string): string {
  if (agentName === "ctf-expert") return agentName
  if (sessionID && sessionToolSurface.get(sessionID) === "ctf-expert") return "ctf-expert"
  return agentName
}

/** Resolve agent name for status/continuation bookkeeping. */
export function surfaceAgentForStatus(
  sessionID: string | undefined | null,
  agentName: string | undefined,
): string | undefined {
  const remembered = getSessionSurface(sessionID)
  if (remembered === "ctf-expert") return "ctf-expert"
  if (agentName !== undefined && agentName !== "") return agentName
  return remembered
}
