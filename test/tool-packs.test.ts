import { describe, expect, it } from "vitest"
import {
  packForTool,
  resolveEnabledPacks,
  summarizePacks,
  toolAllowedForAgent,
  FAST_TOOL_ALLOWLIST,
  isFastToolAgent,
} from "../src/tool-packs.ts"

describe("summarizePacks", () => {
  it("groups names by pack", () => {
    const summary = summarizePacks([
      "ctf-route-plan",
      "ctf-web-probe",
      "ctf-pwn-runner",
      "ctf-android-runtime-check",
    ])
    expect(summary.core).toContain("ctf-route-plan")
    expect(summary.web).toContain("ctf-web-probe")
    expect(summary.pwn).toContain("ctf-pwn-runner")
    expect(summary.android).toContain("ctf-android-runtime-check")
  })
})

describe("resolveEnabledPacks env isolation", () => {
  it("accepts explicit list over empty", () => {
    expect([...resolveEnabledPacks(["pwn"])].sort()).toEqual(["core", "pwn"])
  })

  it("ignores unknown packs while preserving the validated core surface", () => {
    expect([...resolveEnabledPacks(["typo-pack"])].sort()).toEqual(["core"])
  })
})

describe("packForTool stability", () => {
  it("keeps unknown ctf tools in core", () => {
    expect(packForTool("ctf-brand-new-helper")).toBe("core")
  })

  it("classifies ctf-mcp-control as core", () => {
    expect(packForTool("ctf-mcp-control")).toBe("core")
  })
})

describe("fast tool surface", () => {
  it("treats ctf-fast as fast agent", () => {
    expect(isFastToolAgent("ctf-fast")).toBe(true)
    expect(isFastToolAgent("ctf-expert")).toBe(false)
  })

  it("allowlists triage and light probes only", () => {
    expect(FAST_TOOL_ALLOWLIST.has("ctf-route-plan")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-web-fingerprint")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-runner")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-evidence-board")).toBe(false)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-team-mode")).toBe(false)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-heap-overlap-mapper")).toBe(false)
  })

  it("toolAllowedForAgent blocks expert-only tools on ctf-fast", () => {
    expect(toolAllowedForAgent("ctf-route-plan", "ctf-fast")).toBe(true)
    expect(toolAllowedForAgent("ctf-evidence-board", "ctf-fast")).toBe(false)
    expect(toolAllowedForAgent("ctf-evidence-board", "ctf-expert")).toBe(true)
    expect(toolAllowedForAgent("ctf-mcp-control", "ctf-expert")).toBe(true)
  })
})
