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
  EXPERT_RAG_ENV_VARS,
  EXPERT_RAG_SERVER_ID,
  EXPERT_SOFT_DEPENDENCIES,
  EXPERT_SUPPORT_TOOLS,
  EXPERT_TEAM_RUNTIME_TOOLS,
  EXPERT_CORE_WORKFLOW_TOOLS,
} from "../src/expert-readiness.js"

// Retired local-retrieval helpers (lesson/retro/pattern-card/skill-repo/imported
// knowledge tooling). They were deleted together with the bundled corpus; local
// recall is served by the external `ctf_rag` MCP server alone.
const RETIRED_RETRIEVAL_TOOL_SHAPE = /^ctf-(?:lesson|retro|pattern|skill-repo|imported-knowledge)[a-z-]*$/

function allRequiredTools(): string[] {
  return [...EXPERT_REQUIRED_TOOLS]
}

/** Run `fn` with a temporary environment overlay, restoring prior values. */
function withEnv<T>(values: Record<string, string | undefined>, fn: () => T): T {
  const saved = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function asSet(items: string[]) {
  return new Set(items)
}

function makeUnreadyReport(overrides?: Partial<ExpertReadinessReport>): ExpertReadinessReport {
  return {
    ready: false,
    status: "blocked",
    reasons: ["missing required tools"],
    checks: [],
    missingTools: ["ctf-team-dispatch", "ctf-evidence-board"],
    missingSupportTools: ["ctf-tool-packs"],
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
    const withExtensions = new Set([...tools.map((t) => `${t}.ts`), ...tools.map((t) => `${t}.js`)])
    const report = evaluateExpertReadiness({
      registeredTools: withExtensions,
      teamModeEnabled: true,
      maxWorkers: 8,
    })
    expect(report.ready).toBe(true)
  })

  it("reports degraded when only optional support tools are missing", () => {
    const report = evaluateExpertReadiness({
      registeredTools: asSet(allRequiredTools()),
      teamModeEnabled: true,
      maxWorkers: 8,
    })
    expect(report.ready).toBe(true)
    expect(report.status).toBe("degraded")
    expect(report.reasons.join(" ")).toContain("optional support tools")
  })

  it("reports blocked when hard dependencies are missing", () => {
    const report = evaluateExpertReadiness({
      registeredTools: asSet(["ctf-evidence-board"]),
      teamModeEnabled: true,
      maxWorkers: 8,
    })
    expect(report.status).toBe("blocked")
    expect(report.ready).toBe(false)
  })

  it("detects missing support tools without blocking readiness", () => {
    const report = evaluateExpertReadiness({
      registeredTools: asSet(allRequiredTools()),
      teamModeEnabled: true,
      maxWorkers: 8,
    })
    expect(report.ready).toBe(true)
    // ctf-tool-packs and ctf-team-mode should be present in core pack
    expect(report.missingSupportTools).toBeDefined()
  })

  it("treats the ctf_rag backend as a non-blocking check that degrades, never blocks", () => {
    const completeRegistry = asSet([...EXPERT_REQUIRED_TOOLS, ...EXPERT_SUPPORT_TOOLS])
    const evaluate = () =>
      evaluateExpertReadiness({ registeredTools: completeRegistry, teamModeEnabled: true, maxWorkers: 8 })
    const unsetRagEnv: Record<string, string | undefined> = {}
    const configuredRagEnv: Record<string, string> = {}
    for (const name of EXPERT_RAG_ENV_VARS) {
      unsetRagEnv[name] = undefined
      configuredRagEnv[name] = "configured"
    }

    const missingBackend = withEnv(unsetRagEnv, evaluate)
    expect(missingBackend.ready).toBe(true)
    expect(missingBackend.status).toBe("degraded")
    expect(missingBackend.checks.find((entry) => entry.id === `mcp:${EXPERT_RAG_SERVER_ID}`)).toMatchObject({
      required: false,
      ok: false,
    })
    expect(missingBackend.reasons.join(" ")).toMatch(/retrieval backend unavailable/)

    const configuredBackend = withEnv(configuredRagEnv, evaluate)
    expect(configuredBackend.status).toBe("ready")
    expect(configuredBackend.checks.find((entry) => entry.id === `mcp:${EXPERT_RAG_SERVER_ID}`)?.ok).toBe(true)
  })

  it("keeps only live Team/Evidence tools in the hard-required Expert set", () => {
    expect([...EXPERT_REQUIRED_TOOLS]).toEqual([...EXPERT_TEAM_RUNTIME_TOOLS, ...EXPERT_CORE_WORKFLOW_TOOLS])
    for (const tool of EXPERT_REQUIRED_TOOLS) {
      expect(tool, `${tool} is a retired local-retrieval helper`).not.toMatch(RETIRED_RETRIEVAL_TOOL_SHAPE)
    }
  })

  it("keeps manifest expert readiness lists and structural expert contract metadata in sync", () => {
    const manifest = JSON.parse(readFileSync(resolve("ctf-agent.manifest.json"), "utf8")) as {
      default_entrypoints: string[]
      primary_agents: string[]
      support_primary_agents: string[]
      routing: { tool: string; skill: string; core_module: string }
      required_tools: string[]
      optional_pack_tools: string[]
      required_scripts: string[]
      required_indexes: string[]
      readiness_gate: {
        expert_required_tools: string[]
        expert_soft_dependencies: string[]
      }
    }
    expect(manifest.default_entrypoints).toContain("/ctf")
    expect(manifest.default_entrypoints).toContain("/ctf-expert")
    expect(manifest.primary_agents).toEqual(["ctf-fast", "ctf-expert"])
    expect(manifest.support_primary_agents).toContain("researcher")
    expect(manifest.routing.tool).toBe("ctf-route-plan")
    expect(manifest.routing.skill).toBe("ctf-router")
    expect(manifest.routing.core_module).toBe("packages/ctf-core/src/router.ts")
    // The manifest may not advertise a retired local-retrieval helper.
    for (const tool of [...manifest.required_tools, ...manifest.optional_pack_tools]) {
      expect(tool, `${tool} is a retired local-retrieval helper`).not.toMatch(RETIRED_RETRIEVAL_TOOL_SHAPE)
    }
    // ABSENT-BY-DESIGN: local retrieval moved to the external `ctf_rag` MCP
    // server, so no bundled `rag/...` index may be listed as required.
    expect(manifest.required_indexes.filter((rel) => rel.startsWith("rag/"))).toEqual([])
    for (const rel of manifest.required_scripts) {
      expect(readFileSync(resolve(rel), "utf8")).toBeDefined()
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
