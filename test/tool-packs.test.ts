import { describe, expect, it } from "vitest"
import {
  packForTool,
  resolveEnabledPacks,
  summarizePacks,
  toolAllowedForAgent,
  FAST_TOOL_ALLOWLIST,
  isFastToolAgent,
} from "../src/tool-packs.ts"

const FAST_LIGHT_WEB_TOOLS = [
  "ctf-web-fingerprint",
  "ctf-web-blackbox-map",
  "ctf-web-probe",
  "ctf-python-inline",
] as const

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
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-offset")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-remote-check")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-proto-probe")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-probe")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-libc-hint")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-evidence-board")).toBe(false)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-team-mode")).toBe(false)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-heap-overlap-mapper")).toBe(false)
  })

  it("keeps the promised lightweight web and script helpers available on ctf-fast", () => {
    for (const toolName of FAST_LIGHT_WEB_TOOLS) {
      expect(FAST_TOOL_ALLOWLIST.has(toolName)).toBe(true)
      expect(toolAllowedForAgent(toolName, "ctf-fast")).toBe(true)
    }
  })

  it("toolAllowedForAgent blocks expert-only tools on ctf-fast", () => {
    expect(toolAllowedForAgent("ctf-route-plan", "ctf-fast")).toBe(true)
    expect(toolAllowedForAgent("ctf-evidence-board", "ctf-fast")).toBe(false)
    expect(toolAllowedForAgent("ctf-evidence-board", "ctf-expert")).toBe(true)
    expect(toolAllowedForAgent("ctf-mcp-control", "ctf-expert")).toBe(true)
  })
})
