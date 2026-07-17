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
    expect(toolAllowedForAgent("ctf-evidence-board", "ctf-fast")).toBe(false)
  })

  it("2. fast allowlist is strict; handoff is on allowlist for lane switch", () => {
    expect(FAST_TOOL_ALLOWLIST.has("ctf-handoff")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-evidence-board")).toBe(false)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-route-plan")).toBe(true)
  })

  it("3/4. team route ids are documented constants via session surface independence", () => {
    // routeId validation is in team-runtime schema; smoke that expert surface allows team tools
    expect(toolAllowedForAgent("ctf-team-dispatch", "ctf-expert")).toBe(true)
    expect(toolAllowedForAgent("ctf-mcp-control", "ctf-expert")).toBe(true)
  })
})
