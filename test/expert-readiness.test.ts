import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  evaluateExpertReadiness,
  type ExpertReadinessReport,
  formatExpertReadinessFailure,
  formatExpertRecoverySteps,
  extractResumeHints,
  EXPERT_REQUIRED_TOOLS,
  EXPERT_SOFT_DEPENDENCIES,
  EXPERT_TEAM_RUNTIME_TOOLS,
  EXPERT_CORE_WORKFLOW_TOOLS,
} from "../src/expert-readiness.js"

function allRequiredTools(): string[] {
  return [...EXPERT_REQUIRED_TOOLS]
}

function asSet(items: string[]) {
  return new Set(items)
}

function makeReadyReport(overrides?: Partial<ExpertReadinessReport>): ExpertReadinessReport {
  return {
    ready: true,
    checks: [],
    missingTools: [],
    missingSupportTools: [],
    configPath: "/home/user/.config/opencode/opencode-for-ctf.jsonc",
    teamModeEnabled: true,
    maxWorkers: 8,
    toolPacks: ["core", "web", "pwn"],
    expertToolPacks: [],
    ...overrides,
  }
}

function makeUnreadyReport(overrides?: Partial<ExpertReadinessReport>): ExpertReadinessReport {
  return {
    ready: false,
    checks: [],
    missingTools: ["ctf-team-dispatch", "ctf-evidence-board"],
    missingSupportTools: ["ctf-handoff"],
    configPath: "/home/user/.config/opencode/opencode-for-ctf.jsonc",
    teamModeEnabled: true,
    maxWorkers: 8,
    toolPacks: ["core"],
    expertToolPacks: [],
    ...overrides,
  }
}

describe("evaluateExpertReadiness", () => {
  it("reports ready when all required tools present and team_mode enabled", () => {
    const report = evaluateExpertReadiness({
      registeredTools: asSet(allRequiredTools()),
      teamModeEnabled: true,
      maxWorkers: 8,
      toolPacks: ["all"],
      configPath: "/tmp/opencode-for-ctf.jsonc",
    })
    expect(report.ready).toBe(true)
    expect(report.missingTools).toEqual([])
  })

  it("reports not ready when team tools missing", () => {
    const registered = asSet(["ctf-mcp-control", "ctf-evidence-board"])
    const report = evaluateExpertReadiness({
      registeredTools: registered,
      teamModeEnabled: true,
      maxWorkers: 8,
    })
    expect(report.ready).toBe(false)
    expect(report.missingTools.length).toBeGreaterThan(0)
    expect(report.missingTools).toContain("ctf-team-dispatch")
    expect(report.missingTools).toContain("ctf-team-recover")
    // ctf-evidence-board IS present, team tools are the ones missing
    expect(report.missingTools).not.toContain("ctf-evidence-board")
  })

  it("reports not ready when team_mode is disabled", () => {
    const report = evaluateExpertReadiness({
      registeredTools: asSet(allRequiredTools()),
      teamModeEnabled: false,
      maxWorkers: 4,
    })
    expect(report.ready).toBe(false)
    expect(report.teamModeEnabled).toBe(false)
    expect(report.maxWorkers).toBe(4)
  })

  it("reports not ready when both team_mode disabled and tools missing", () => {
    const report = evaluateExpertReadiness({
      registeredTools: asSet([]),
      teamModeEnabled: false,
      maxWorkers: 3,
      toolPacks: [],
      expertToolPacks: [],
    })
    expect(report.ready).toBe(false)
    expect(report.missingTools.length).toBeGreaterThan(0)
    expect(report.toolPacks).toEqual([])
    expect(report.expertToolPacks).toEqual([])
  })

  it("supports tools with .ts/.js extensions in registered set", () => {
    const tools = allRequiredTools()
    const withExtensions = new Set([
      ...tools.map((t) => `${t}.ts`),
      ...tools.map((t) => `${t}.js`),
    ])
    const report = evaluateExpertReadiness({
      registeredTools: withExtensions,
      teamModeEnabled: true,
      maxWorkers: 8,
    })
    expect(report.ready).toBe(true)
  })

  it("detects missing support tools without blocking readiness", () => {
    const report = evaluateExpertReadiness({
      registeredTools: asSet(allRequiredTools()),
      teamModeEnabled: true,
      maxWorkers: 8,
    })
    expect(report.ready).toBe(true)
    // ctf-handoff, ctf-tool-packs, ctf-team-mode should be present in core pack
    expect(report.missingSupportTools).toBeDefined()
  })

  it("keeps manifest expert readiness lists in sync with runtime constants", () => {
    const manifest = JSON.parse(readFileSync(resolve("ctf-agent.manifest.json"), "utf8")) as {
      readiness_gate: {
        expert_required_tools: string[]
        expert_soft_dependencies: string[]
      }
    }
    expect(manifest.readiness_gate.expert_required_tools).toEqual([...EXPERT_REQUIRED_TOOLS])
    expect(manifest.readiness_gate.expert_soft_dependencies).toEqual([...EXPERT_SOFT_DEPENDENCIES])
  })
})

describe("formatExpertReadinessFailure", () => {
  it("includes missing tool names", () => {
    const report = makeUnreadyReport()
    const text = formatExpertReadinessFailure(report, {
      challengeText: "REV challenge binary",
    })
    expect(text).toContain("ctf-team-dispatch")
    expect(text).toContain("ctf-evidence-board")
    expect(text).toContain("Missing required tools")
    // Should NOT say Expert Mode is active
    expect(text).not.toContain("Binding contract")
  })

  it("includes config diagnostics", () => {
    const report = makeUnreadyReport()
    const text = formatExpertReadinessFailure(report)
    expect(text).toContain(report.configPath!)
    expect(text).toContain("team_mode.enabled=true")
    expect(text).toContain("team_mode.max_workers=8")
    expect(text).toContain("tool_packs=")
  })

  it("includes session note when provided", () => {
    const report = makeUnreadyReport()
    const text = formatExpertReadinessFailure(report, {
      sessionNote: "command agent via /ctf-expert",
    })
    expect(text).toContain("command agent via /ctf-expert")
  })

  it("includes restart fix instructions", () => {
    const report = makeUnreadyReport()
    const text = formatExpertReadinessFailure(report)
    expect(text).toContain("Restart OpenCode")
    expect(text).toContain("team_mode.enabled=true")
    expect(text).toContain("/ctf-expert")
  })

  it("includes recovery steps after restart", () => {
    const report = makeUnreadyReport()
    const text = formatExpertReadinessFailure(report, {
      challengeText: "my challenge",
      handoffPath: "/tmp/work/expert-handoff.md",
    })
    expect(text).toContain("After restart")
    expect(text).toContain("/ctf-expert")
    expect(text).toContain("my challenge")
    expect(text).toContain("expert-handoff.md")
  })

  it("handles missing tools with team_mode disabled reason", () => {
    const report = makeUnreadyReport({ missingTools: [], teamModeEnabled: false })
    const text = formatExpertReadinessFailure(report)
    expect(text).toContain("team runtime tools are not registered")
  })

  it("does not mention evidence or handoff paths when none given", () => {
    const report = makeUnreadyReport()
    const text = formatExpertReadinessFailure(report)
    expect(text).not.toContain("expert-handoff.md")
    // Generic resume note should still appear
    expect(text).toContain("work/ctf-evidence")
  })

  it("forbids using concurrent task() as a substitute", () => {
    const report = makeUnreadyReport()
    const text = formatExpertReadinessFailure(report)
    expect(text).toContain("Do not substitute")
    expect(text).toContain("Do not continue Expert Mode")
  })
})

describe("formatExpertRecoverySteps", () => {
  it("generates default recovery when no opts given", () => {
    const text = formatExpertRecoverySteps()
    expect(text).toContain("After restart")
    expect(text).toContain("/ctf-expert")
    expect(text).toContain("challenge description")
  })

  it("includes handoff path when provided", () => {
    const text = formatExpertRecoverySteps({
      handoffPath: "/home/user/work/expert-handoff.md",
    })
    expect(text).toContain("expert-handoff.md")
    expect(text).toContain("do not restart from zero")
  })

  it("includes evidence path when provided", () => {
    const text = formatExpertRecoverySteps({
      evidencePath: "/home/user/work/ctf-evidence/challenge/Evidence.md",
    })
    expect(text).toContain("Evidence.md")
    expect(text).toContain("ctf-evidence")
  })
})

describe("extractResumeHints", () => {
  it("extracts expert-handoff.md path from text", () => {
    const hints = extractResumeHints("Resume from /tmp/work/expert-handoff.md")
    expect(hints.handoffPath).toContain("expert-handoff.md")
  })

  it("extracts handoff.md path (without expert- prefix)", () => {
    const hints = extractResumeHints("See /home/user/work/handoff.md for context")
    expect(hints.handoffPath).toContain("handoff.md")
  })

  it("extracts Evidence.md path", () => {
    const hints = extractResumeHints("Evidence.md in /tmp/work/ctf-evidence/")
    expect(hints.evidencePath).toContain("Evidence.md")
  })

  it("extracts ctf-evidence work directory", () => {
    const hints = extractResumeHints("Check work/ctf-evidence/challenge/ for notes")
    expect(hints.evidencePath).toContain("work/ctf-evidence/challenge")
  })

  it("returns empty when no paths found", () => {
    const hints = extractResumeHints("Solve this challenge quickly")
    expect(hints.handoffPath).toBeUndefined()
    expect(hints.evidencePath).toBeUndefined()
  })

  it("extracts Windows-style paths", () => {
    const hints = extractResumeHints("C:\\Users\\ctf\\work\\expert-handoff.md")
    expect(hints.handoffPath).toContain("expert-handoff.md")
  })
})
