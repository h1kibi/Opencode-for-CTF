import { describe, expect, it } from "vitest"
import {
  planRoute,
  resolveSolveMode,
  primaryAgentForDecision,
  formatHardRouteHandoff,
  buildCtfEntryInjection,
} from "../src/route-runtime.ts"
import type { PluginUserConfig } from "../src/plugin-config.ts"
import { DEFAULT_PLUGIN_CONFIG } from "../src/plugin-config.ts"
import {
  rememberSessionSurface,
  surfaceAgentForTools,
  clearSessionSurface,
  getSessionSurface,
} from "../src/session-surface.ts"

describe("resolveSolveMode", () => {
  it("prefers explicit fast/expert over config", () => {
    expect(resolveSolveMode("fast", "expert")).toBe("fast")
    expect(resolveSolveMode("expert", "fast")).toBe("expert")
  })

  it("uses config when requested is auto or empty", () => {
    expect(resolveSolveMode("auto", "expert")).toBe("expert")
    expect(resolveSolveMode(undefined, "fast")).toBe("fast")
    expect(resolveSolveMode("", "auto")).toBe("auto")
  })
})

describe("planRoute + default_mode", () => {
  it("forces expert lane when config default_mode is expert", () => {
    const d = planRoute({ text: "simple xor cipher baby", mode: "auto" }, "expert")
    expect(d.mode).toBe("expert")
    expect(d.agent).toBe("ctf-expert")
  })

  it("can still resume on evidence branch even with default fast", () => {
    const d = planRoute({ text: "web chall", hasEvidenceBranch: true, mode: "auto" }, "fast")
    expect(d.mode).toBe("resume")
    expect(primaryAgentForDecision(d)).toBe("ctf-expert")
  })

  it("routes strong web URL toward a decision with web category", () => {
    const d = planRoute(
      { text: "http://127.0.0.1:8000 flask xss admin bot", mode: "auto" },
      "auto",
    )
    expect(d.category === "web" || d.agent.includes("web") || d.mode === "expert").toBe(true)
  })
})

describe("formatHardRouteHandoff", () => {
  it("marks decision as BINDING and names primary agent", () => {
    const d = planRoute({ text: "checksec libc ret2libc", mode: "fast" }, "auto")
    const text = formatHardRouteHandoff(d, { configDefaultMode: "auto" })
    expect(text).toContain("BINDING")
    expect(text).toContain("primary_session_agent:")
    expect(text).toContain("MANDATORY")
  })
})

describe("buildCtfEntryInjection", () => {
  it("includes config default_mode context via plan", () => {
    const cfg: PluginUserConfig = { ...DEFAULT_PLUGIN_CONFIG, default_mode: "expert" }
    const planned = buildCtfEntryInjection({
      userText: "http://127.0.0.1/ challenge",
      config: cfg,
    })
    expect(planned.text).toContain("CTF SOLVE MODE")
    expect(planned.text).toContain("BINDING")
    expect(planned.text).toMatch(/ctf-expert|expert/)
    expect(planned.primary).toBe("ctf-expert")
    expect(planned.decision.mode).toBe("expert")
  })
})

describe("session tool surface", () => {
  it("promotes ctf-fast agent name to expert tools when session routed expert", () => {
    const sid = "sess-route-test-1"
    clearSessionSurface(sid)
    rememberSessionSurface(sid, "ctf-expert")
    expect(getSessionSurface(sid)).toBe("ctf-expert")
    expect(surfaceAgentForTools(sid, "ctf-fast")).toBe("ctf-expert")
    expect(surfaceAgentForTools(sid, "ctf-expert")).toBe("ctf-expert")
    clearSessionSurface(sid)
    expect(surfaceAgentForTools(sid, "ctf-fast")).toBe("ctf-fast")
  })
})
