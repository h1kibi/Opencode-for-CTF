/**
 * Per-session tool surface after hard routing.
 * /ctf is declared with agent: ctf-fast, but BINDING route may be expert —
 * tool.execute.before must allow expert tools for that session.
 */

export type SessionToolSurface = "ctf-fast" | "ctf-expert"

const sessionToolSurface = new Map<string, SessionToolSurface>()
const SESSION_SURFACE_MAX = 100

export function rememberSessionSurface(
  sessionID: string | undefined | null,
  surface: SessionToolSurface,
): void {
  if (!sessionID) return
  if (sessionToolSurface.size >= SESSION_SURFACE_MAX) {
    const first = sessionToolSurface.keys().next().value
    if (first !== undefined) sessionToolSurface.delete(first)
  }
  sessionToolSurface.set(sessionID, surface)
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
export function surfaceAgentForTools(
  sessionID: string | undefined | null,
  agentName: string,
): string {
  if (agentName === "ctf-expert" || agentName === "ctf-master") return agentName
  if (sessionID && sessionToolSurface.get(sessionID) === "ctf-expert") return "ctf-expert"
  return agentName
}
