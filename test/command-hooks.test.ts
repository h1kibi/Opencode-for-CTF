import { describe, expect, it } from "vitest"
import { handleCommandExecuteBefore } from "../src/hooks/command-hooks.js"
import { DEFAULT_PLUGIN_CONFIG } from "../src/plugin-config.js"
import { clearSessionSurface, getSessionSurface, rememberSessionSurface } from "../src/session-surface.js"

describe("command hooks", () => {
  it("fail-fast checks expert readiness before /resume proceeds", async () => {
    await expect(
      handleCommandExecuteBefore({
        meta: { command: "resume", arguments: "work/ctf-evidence/demo", sessionID: "resume-unready" },
        output: {},
        pluginConfig: DEFAULT_PLUGIN_CONFIG,
        worktree: process.cwd(),
        directory: process.cwd(),
        expertReadinessReport: () => ({ ready: false }),
        expertReadinessFailureText: () => "resume preflight failed",
        requireExpertReadiness: () => undefined,
        promoteExpertSurface: () => undefined,
        promoteFastSurface: () => undefined,
      }),
    ).rejects.toThrow("resume preflight failed")
  })

  it("promotes /resume sessions to the expert tool surface after readiness passes", async () => {
    const sessionID = "resume-ready"
    clearSessionSurface(sessionID)
    const output: Record<string, any> = {}

    await handleCommandExecuteBefore({
      meta: { command: "resume", arguments: "work/ctf-evidence/demo", sessionID },
      output,
      pluginConfig: DEFAULT_PLUGIN_CONFIG,
      worktree: process.cwd(),
      directory: process.cwd(),
      expertReadinessReport: () => ({ ready: true }),
      expertReadinessFailureText: () => "unexpected failure",
      requireExpertReadiness: () => undefined,
      promoteExpertSurface: (sid) => rememberSessionSurface(sid, "ctf-expert"),
      promoteFastSurface: () => undefined,
    })

    expect(getSessionSurface(sessionID)).toBe("ctf-expert")
    expect(output.parts?.[0]?.text).toContain("CTF RESUME MODE")
    clearSessionSurface(sessionID)
  })
})
