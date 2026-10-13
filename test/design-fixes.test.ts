import { describe, expect, it } from "vitest"
import {
  rememberSessionSurface,
  clearSessionSurface,
  getSessionSurface,
  surfaceAgentForTools,
} from "../src/session-surface.ts"
import { FAST_TOOL_ALLOWLIST, toolAllowedForAgent } from "../src/tool-packs.ts"

describe("problem fixes integration", () => {
  it("1. session surface promotes /ctf-as-fast to expert tools", () => {
    const sid = "sess-fix-1"
    clearSessionSurface(sid)
    rememberSessionSurface(sid, "ctf-expert")
    expect(getSessionSurface(sid)).toBe("ctf-expert")
    expect(surfaceAgentForTools(sid, "ctf-fast")).toBe("ctf-expert")
    // evidence board allowed when surface is expert even if agent string is ctf-fast
    const effective = surfaceAgentForTools(sid, "ctf-fast")
    expect(toolAllowedForAgent("ctf-evidence-board", effective)).toBe(true)
    expect(toolAllowedForAgent("ctf-team-dispatch", effective)).toBe(true)
    clearSessionSurface(sid)
    expect(toolAllowedForAgent("ctf-evidence-board", "ctf-fast")).toBe(true)
    expect(toolAllowedForAgent("ctf-team-dispatch", "ctf-fast")).toBe(false)
  })

  it("2. fast allowlist is strict; evidence init is on allowlist and cross-lane handoff is gone", () => {
    expect(FAST_TOOL_ALLOWLIST.has("ctf-handoff")).toBe(false)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-evidence-board")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-route-plan")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-team-dispatch")).toBe(false)
  })
})
