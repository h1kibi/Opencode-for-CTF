import { describe, expect, it } from "vitest"
import { explainToolVisibility, summarizeToolVisibilityMatrix } from "../src/capabilities/tool-visibility.js"
import { buildFamilyCapabilityMatrix } from "../src/capabilities/family-capability-view.js"
import { buildRuntimeCapabilitySummary } from "../src/capabilities/runtime-capability-summary.js"

describe("tool visibility capability view", () => {
  const exported = ["ctf-route-plan", "ctf-pwn-runner", "ctf-team-dispatch"]
  const enabled = ["core", "pwn", "web"]

  it("marks a core fast tool as visible on ctf-fast", () => {
    const result = explainToolVisibility({
      toolName: "ctf-route-plan",
      agentName: "ctf-fast",
      enabledPacks: enabled,
      exportedToolNames: exported,
    })
    expect(result.visible).toBe(true)
    expect(result.category).toBe("visible")
  })

  it("marks an expert-only tool as blocked on ctf-fast", () => {
    const result = explainToolVisibility({
      toolName: "ctf-team-dispatch",
      agentName: "ctf-fast",
      enabledPacks: ["core"],
      exportedToolNames: ["ctf-team-dispatch"],
    })
    expect(result.visible).toBe(false)
    expect(result.category).toBe("fast_surface_blocked")
  })

  it("marks a missing exported tool as not registered", () => {
    const result = explainToolVisibility({
      toolName: "ctf-web-probe",
      agentName: "ctf-expert",
      enabledPacks: ["core", "web"],
      exportedToolNames: ["ctf-route-plan"],
    })
    expect(result.visible).toBe(false)
    expect(result.category).toBe("tool_not_in_process_registry")
  })

  it("builds a visibility matrix grouped by category", () => {
    const matrix = summarizeToolVisibilityMatrix({
      toolNames: ["ctf-route-plan", "ctf-team-dispatch"],
      agentName: "ctf-fast",
      enabledPacks: ["core"],
      exportedToolNames: ["ctf-route-plan", "ctf-team-dispatch"],
    })
    expect(matrix.visible).toContain("ctf-route-plan")
    expect(matrix.fast_surface_blocked).toContain("ctf-team-dispatch")
  })
})

describe("family capability matrix", () => {
  it("groups family readiness by status", () => {
    const matrix = buildFamilyCapabilityMatrix({
      registeredTools: ["ctf-route-plan"],
      enabledToolPacks: ["core"],
    })
    expect(matrix.blocked.length).toBeGreaterThan(0)
    expect(matrix.reports.length).toBeGreaterThan(0)
  })
})

describe("runtime capability summary", () => {
  it("combines expert and family summaries", () => {
    const summary = buildRuntimeCapabilitySummary({
      registeredTools: [
        "ctf-route-plan",
        "ctf-team-dispatch",
        "ctf-team-status",
        "ctf-team-collect",
        "ctf-team-cancel",
        "ctf-team-cancel-route",
        "ctf-team-close",
        "ctf-team-recover",
        "ctf-team-adopt",
        "ctf-evidence-board",
        "ctf-mcp-control",
        "ctf-decompose-task",
      ],
      enabledPacks: ["core", "pwn"],
      teamModeEnabled: true,
      maxWorkers: 4,
      toolPacks: ["core", "pwn"],
      expertToolPacks: [],
      configPath: null,
    })
    expect(summary.exportedToolCount).toBeGreaterThan(0)
    expect(summary.family.reports.length).toBeGreaterThan(0)
  })
})
