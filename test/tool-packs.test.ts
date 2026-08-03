import { describe, expect, it } from "vitest"
import {
  packForTool,
  resolveEnabledPacks,
  summarizePacks,
  toolAllowedForAgent,
  toolAllowedForSubagent,
  FAST_TOOL_ALLOWLIST,
  isFastToolAgent,
} from "../src/tool-packs.ts"

const FAST_LIGHT_WEB_TOOLS = [
  "ctf-web-analyze",
  "ctf-web-fingerprint",
  "ctf-web-blackbox-map",
  "ctf-web-probe",
  "ctf-python-inline",
] as const

const FAST_LIGHT_PWN_TOOLS = [
  "ctf-binary-probe",
  "ctf-pwn-analyze",
  "ctf-pwn-check-env",
  "ctf-pwn-fast-skeleton-hints",
  "ctf-pwn-runner",
  "ctf-pwn-offset",
  "ctf-pwn-remote-fingerprint",
  "ctf-python-inline",
] as const

const FAST_LIGHT_REV_TOOLS = ["ctf-rev-analyze", "ctf-binary-probe"] as const

const FAST_LIGHT_CRYPTO_TOOLS = ["ctf-crypto-analyze", "ctf-rsa-probe"] as const

const FAST_LIGHT_MISC_TOOLS = ["ctf-misc-analyze", "ctf-python-inline"] as const

describe("summarizePacks", () => {
  it("groups names by pack", () => {
    const summary = summarizePacks(["ctf-route-plan", "ctf-web-probe", "ctf-pwn-runner", "ctf-android-runtime-check"])
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

  it("keeps maintenance tools opt-in", () => {
    expect(resolveEnabledPacks().has("maintenance")).toBe(false)
    expect([...resolveEnabledPacks(["maintenance"])].sort()).toEqual(["core", "maintenance"])
  })

  it("ignores unknown packs while preserving the validated core surface", () => {
    expect([...resolveEnabledPacks(["typo-pack"])].sort()).toEqual(["core"])
  })

  it("normalizes legacy java-heavy pack name to java", () => {
    expect([...resolveEnabledPacks(["java-heavy"])].sort()).toEqual(["core", "java"])
  })
})

describe("packForTool stability", () => {
  it("keeps unknown ctf tools in core", () => {
    expect(packForTool("ctf-brand-new-helper")).toBe("core")
  })

  it("classifies ctf-mcp-control as core", () => {
    expect(packForTool("ctf-mcp-control")).toBe("core")
  })

  it("keeps cross-family focused probes in core", () => {
    expect(packForTool("ctf-binary-probe")).toBe("core")
    expect(packForTool("ctf-elf-slice")).toBe("core")
    expect(packForTool("ctf-proto-probe")).toBe("core")
  })

  it("classifies maintenance tools outside the default solve surface", () => {
    expect(packForTool("ctf-pattern-feedback")).toBe("maintenance")
    expect(packForTool("ctf-runtime-selftest")).toBe("maintenance")
  })
})

describe("fast tool surface", () => {
  it("treats ctf-fast as fast agent", () => {
    expect(isFastToolAgent("ctf-fast")).toBe(true)
    expect(isFastToolAgent("ctf-expert")).toBe(false)
  })

  it("allowlists triage and light probes only", () => {
    expect(FAST_TOOL_ALLOWLIST.has("ctf-route-plan")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-web-analyze")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-web-fingerprint")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-analyze")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-runner")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-fast-skeleton-hints")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-offset")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-remote-fingerprint")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-remote-check")).toBe(false)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-proto-probe")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-probe")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-libc-hint")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-crypto-analyze")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-forensics-analyze")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-rev-analyze")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-misc-analyze")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-evidence-board")).toBe(true)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-team-mode")).toBe(false)
    expect(FAST_TOOL_ALLOWLIST.has("ctf-pwn-heap-overlap-mapper")).toBe(false)
    expect(packForTool("ctf-pwn-heap-overlap-mapper")).toBe("pwn-heavy")
  })

  it("keeps the promised lightweight web and script helpers available on ctf-fast", () => {
    for (const toolName of FAST_LIGHT_WEB_TOOLS) {
      expect(FAST_TOOL_ALLOWLIST.has(toolName)).toBe(true)
      expect(toolAllowedForAgent(toolName, "ctf-fast")).toBe(true)
    }
  })

  it("keeps the promised lightweight PWN helpers available on ctf-fast", () => {
    for (const toolName of FAST_LIGHT_PWN_TOOLS) {
      expect(FAST_TOOL_ALLOWLIST.has(toolName)).toBe(true)
      expect(toolAllowedForAgent(toolName, "ctf-fast")).toBe(true)
    }
  })

  it("keeps the promised lightweight REV helpers available on ctf-fast", () => {
    for (const toolName of FAST_LIGHT_REV_TOOLS) {
      expect(FAST_TOOL_ALLOWLIST.has(toolName)).toBe(true)
      expect(toolAllowedForAgent(toolName, "ctf-fast")).toBe(true)
    }
  })

  it("keeps the promised lightweight crypto helpers available on ctf-fast", () => {
    for (const toolName of FAST_LIGHT_CRYPTO_TOOLS) {
      expect(FAST_TOOL_ALLOWLIST.has(toolName)).toBe(true)
      expect(toolAllowedForAgent(toolName, "ctf-fast")).toBe(true)
    }
  })

  it("keeps the promised lightweight misc helpers available on ctf-fast", () => {
    for (const toolName of FAST_LIGHT_MISC_TOOLS) {
      expect(FAST_TOOL_ALLOWLIST.has(toolName)).toBe(true)
      expect(toolAllowedForAgent(toolName, "ctf-fast")).toBe(true)
    }
  })

  it("toolAllowedForAgent permits evidence init but blocks expert-only controls on ctf-fast", () => {
    expect(toolAllowedForAgent("ctf-route-plan", "ctf-fast")).toBe(true)
    expect(toolAllowedForAgent("ctf-evidence-board", "ctf-fast")).toBe(true)
    expect(toolAllowedForAgent("ctf-team-mode", "ctf-fast")).toBe(false)
    expect(toolAllowedForAgent("ctf-evidence-board", "ctf-expert")).toBe(true)
    expect(toolAllowedForAgent("ctf-mcp-control", "ctf-expert")).toBe(true)
  })
})

describe("subagent opt-in pack surface", () => {
  it("keeps heavy tools blocked unless the matching pack is enabled for that subagent family", () => {
    expect(toolAllowedForSubagent("ctf-web-source-map", "ctf-web", ["core", "web"])).toBe(true)
    expect(toolAllowedForSubagent("ctf-web-source-map", "ctf-scout", ["core", "web"])).toBe(true)
    expect(toolAllowedForSubagent("ctf-web-source-map", "ctf-misc", ["core", "web"])).toBe(true)
    expect(toolAllowedForSubagent("ctf-web-source-map", "ctf-pwn", ["core", "web"])).toBe(false)
    expect(toolAllowedForSubagent("ctf-web-runtime-map", "ctf-web", ["core", "web"])).toBe(false)
    expect(toolAllowedForSubagent("ctf-web-runtime-map", "ctf-web", ["core", "web-heavy"])).toBe(true)
    expect(toolAllowedForSubagent("ctf-web-runtime-map", "ctf-pwn", ["core", "web-heavy"])).toBe(false)
  })

  it("allows explicitly enabled heavy packs only on their owner subagents", () => {
    expect(toolAllowedForSubagent("ctf-pwn-stage-harness", "ctf-pwn", ["core", "pwn-heavy"])).toBe(true)
    expect(toolAllowedForSubagent("ctf-pwn-stage-harness", "ctf-web", ["core", "pwn-heavy"])).toBe(false)
    expect(toolAllowedForSubagent("ctf-android-dynamic-macro", "ctf-rev", ["core", "android-dynamic"])).toBe(true)
    expect(toolAllowedForSubagent("ctf-android-dynamic-macro", "ctf-forensics", ["core", "android-dynamic"])).toBe(
      false,
    )
  })

  it("keeps maintenance tools scoped to librarian and retro when explicitly enabled", () => {
    expect(toolAllowedForSubagent("ctf-runtime-selftest", "ctf-librarian", ["core", "maintenance"])).toBe(true)
    expect(toolAllowedForSubagent("ctf-runtime-selftest", "ctf-retro", ["core", "maintenance"])).toBe(true)
    expect(toolAllowedForSubagent("ctf-runtime-selftest", "ctf-web", ["core", "maintenance"])).toBe(false)
  })
})
