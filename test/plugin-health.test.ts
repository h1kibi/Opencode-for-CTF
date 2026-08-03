import { describe, expect, it } from "vitest"
import { summarizePluginHealthReport } from "../src/plugin-health.ts"

describe("plugin health summary", () => {
  it("reads nested pluginDiagnostic fields from status output", () => {
    const summary = summarizePluginHealthReport({
      writtenAt: "2026-07-31T10:00:00.000Z",
      source: "status",
      state: "degraded",
      pluginDiagnostic: {
        pluginImportOk: false,
        pluginImportError: "Cannot find module",
        nextAction: "reinstall",
      },
    })

    expect(summary.present).toBe(true)
    expect(summary.source).toBe("status")
    expect(summary.state).toBe("degraded")
    expect(summary.pluginImportOk).toBe(false)
    expect(summary.pluginImportError).toBe("Cannot find module")
    expect(summary.nextAction).toBe("reinstall")
  })

  it("falls back to legacy top-level runtime probe fields", () => {
    const summary = summarizePluginHealthReport({
      source: "doctor-install",
      pluginRuntimeImportOk: true,
      pluginRuntimeImportError: null,
    })

    expect(summary.pluginImportOk).toBe(true)
    expect(summary.pluginImportError).toBe(null)
  })
})
