import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  clearSessionSurface,
  getSessionSurface,
  persistSessionSurface,
  rememberSessionSurface,
  removePersistedSessionSurface,
  restoreSessionSurfaces,
  surfaceAgentForTools,
} from "../src/session-surface.ts"

describe("persisted session surfaces", () => {
  it("restores an expert surface after the in-memory map is cleared", async () => {
    const worktree = await mkdtemp(path.join(os.tmpdir(), "ctf-session-surface-"))
    const sessionID = `surface-${Date.now()}-${Math.random()}`
    try {
      rememberSessionSurface(sessionID, "ctf-expert")
      await persistSessionSurface(worktree, sessionID, "ctf-expert")
      clearSessionSurface(sessionID)
      expect(getSessionSurface(sessionID)).toBeUndefined()

      await restoreSessionSurfaces(worktree)
      expect(getSessionSurface(sessionID)).toBe("ctf-expert")
      expect(surfaceAgentForTools(sessionID, "ctf-fast")).toBe("ctf-expert")

      const statePath = path.join(worktree, "runtime", "state", "session-surfaces.json")
      expect(JSON.parse(await readFile(statePath, "utf8"))[sessionID].surface).toBe("ctf-expert")

      await removePersistedSessionSurface(worktree, sessionID)
      clearSessionSurface(sessionID)
    } finally {
      await rm(worktree, { recursive: true, force: true })
      clearSessionSurface(sessionID)
    }
  })
})
