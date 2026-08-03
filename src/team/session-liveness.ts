import type { TeamRun } from "./team-types.ts"

export type SessionPresence = "present" | "absent" | "unknown"

function isNotFoundLike(value: unknown): boolean {
  const text = errorText(value)
  return /(?:\b404\b|not[\s_-]*found|does\s+not\s+exist|deleted|unknown[\s_-]*session)/i.test(text)
}

function errorText(value: unknown, seen = new Set<object>()): string {
  if (value instanceof Error) return value.message
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  if (typeof value !== "object") return String(value)

  if (seen.has(value)) return ""
  seen.add(value)
  const record = value as Record<string, unknown>
  return [
    record.message,
    record.error,
    record.code,
    record.status,
    record.statusCode,
    record.data,
  ]
    .map((item) => errorText(item, seen))
    .filter(Boolean)
    .join(" ")
}

/**
 * Probe a parent session without treating an unavailable SDK surface as proof
 * that the session is gone. Adoption is fail-closed when presence is unknown.
 */
export async function probeSessionPresence(client: any, directory: string, sessionID: string): Promise<SessionPresence> {
  const session = client?.session
  if (!sessionID || !session) return "unknown"

  if (typeof session.get === "function") {
    try {
      const response = await session.get({ path: { id: sessionID }, query: { directory } })
      if (response?.error) return isNotFoundLike(response.error) ? "absent" : "unknown"
      if (!response || !Object.prototype.hasOwnProperty.call(response, "data")) return "unknown"
      if (response.data === null) return "absent"
      if (response.data === undefined || typeof response.data !== "object" || Array.isArray(response.data)) {
        return "unknown"
      }
      return response.data.id === sessionID ? "present" : "unknown"
    } catch (error) {
      return isNotFoundLike(error) ? "absent" : "unknown"
    }
  }

  if (typeof session.list === "function") {
    try {
      const response = await session.list({ query: { directory } })
      if (response?.error || !Array.isArray(response?.data)) return "unknown"
      return response.data.some((item: any) => item?.id === sessionID) ? "present" : "absent"
    } catch {
      return "unknown"
    }
  }

  return "unknown"
}

export function hasOpenTeamWorker(run: TeamRun): boolean {
  return run.jobs.some(
    (job) =>
      !["completed", "failed", "cancelled", "cancel_failed", "interrupted"].includes(job.status) ||
      job.retryPending ||
      Boolean(job.retrySessionID),
  )
}
