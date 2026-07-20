import { describe, expect, it } from "vitest"
import {
  evaluateAllFamilyReadiness,
  evaluateFamilyReadiness,
  formatFamilyReadinessSummary,
  formatStartupEnvironmentSummary,
  summarizeStartupEnvironment,
} from "../src/family-readiness.js"
import { FAMILY_CAPABILITY_CONTRACTS } from "../src/family-capability-contracts.js"
import { AGENT_MCP_DEFAULTS } from "../src/agent-mcp-profiles.js"

function registeredFor(family: keyof typeof FAMILY_CAPABILITY_CONTRACTS): string[] {
  const contract = FAMILY_CAPABILITY_CONTRACTS[family]
  return [...contract.requiredTools, ...contract.supportTools]
}

describe("family readiness", () => {
  it("reports ready when required packs, tools, and MCP defaults are present", () => {
    const report = evaluateFamilyReadiness({
      family: "web",
      registeredTools: registeredFor("web"),
      enabledToolPacks: ["core", "web"],
    })
    expect(report.status).toBe("ready")
    expect(report.missingRequiredTools).toEqual([])
    expect(report.missingToolPacks).toEqual([])
    expect(report.missingDefaultMcps).toEqual([])
  })

  it("reports blocked when a required family pack is missing", () => {
    const report = evaluateFamilyReadiness({
      family: "crypto",
      registeredTools: registeredFor("crypto"),
      enabledToolPacks: ["core"],
    })
    expect(report.status).toBe("blocked")
    expect(report.missingToolPacks).toContain("crypto")
  })

  it("reports blocked when a required tool is missing", () => {
    const report = evaluateFamilyReadiness({
      family: "pwn",
      registeredTools: ["ctf-binary-probe"],
      enabledToolPacks: ["core", "pwn"],
    })
    expect(report.status).toBe("blocked")
    expect(report.missingRequiredTools).toContain("ctf-pwn-runner")
  })

  it("reports degraded when only support tools are missing", () => {
    const contract = FAMILY_CAPABILITY_CONTRACTS.rev
    const report = evaluateFamilyReadiness({
      family: "rev",
      registeredTools: [...contract.requiredTools],
      enabledToolPacks: ["core", "rev"],
    })
    expect(report.status).toBe("degraded")
    expect(report.missingSupportTools.length).toBeGreaterThan(0)
  })

  it("reports blocked when contract defaults drift from agent defaults", () => {
    const original = AGENT_MCP_DEFAULTS["ctf-misc"]
    AGENT_MCP_DEFAULTS["ctf-misc"] = ["filesystem"]
    try {
      const report = evaluateFamilyReadiness({
        family: "misc",
        registeredTools: registeredFor("misc"),
        enabledToolPacks: ["core", "misc"],
      })
      expect(report.status).toBe("blocked")
      expect(report.missingDefaultMcps).toContain("context7")
    } finally {
      AGENT_MCP_DEFAULTS["ctf-misc"] = original
    }
  })

  it("evaluates all families in one pass", () => {
    const reports = evaluateAllFamilyReadiness({
      registeredTools: Object.values(FAMILY_CAPABILITY_CONTRACTS).flatMap((contract) => [
        ...contract.requiredTools,
        ...contract.supportTools,
      ]),
      enabledToolPacks: ["core", "web", "pwn", "rev", "crypto", "forensics", "misc", "java"],
    })
    expect(reports).toHaveLength(6)
    expect(reports.every((report) => ["ready", "degraded", "blocked"].includes(report.status))).toBe(true)
  })

  it("surfaces MCP backend remediation for forensics", () => {
    const checks = FAMILY_CAPABILITY_CONTRACTS.forensics.readinessChecks
    expect(checks.find((check) => check.id === "mcp:wireshark")?.remediation).toContain("WIREMCP_LAUNCHER")
    expect(checks.find((check) => check.id === "mcp:cyberchef")?.detail).toContain("cyberchef-mcp")
  })

  it("formats compact family readiness summaries", () => {
    const report = evaluateFamilyReadiness({
      family: "forensics",
      registeredTools: ["ctf-pcap-probe"],
      enabledToolPacks: ["core", "forensics"],
    })
    const text = formatFamilyReadinessSummary(report)
    expect(text).toContain("[forensics]")
    expect(text).toContain("missing required tools")
  })
})

describe("startup environment summary", () => {
  it("surfaces Kali guidance", () => {
    const summary = summarizeStartupEnvironment({
      "env:os": { ok: true, detail: "host os=linux", behaviorOk: true },
      "env:shell": { ok: true, detail: "active shell=bash", behaviorOk: true },
      "env:kali": { ok: true, detail: "kali linux detected", behaviorOk: true },
      "env:wsl": { ok: false, detail: "wsl not detected", behaviorOk: false },
    })
    expect(summary.os).toBe("linux")
    expect(summary.substrate).toBe("kali")
    expect(summary.guidance.join(" ")).toContain("Kali")
  })

  it("surfaces Windows PowerShell guidance", () => {
    const text = formatStartupEnvironmentSummary({
      "env:os": { ok: true, detail: "host os=windows", behaviorOk: true },
      "env:shell": { ok: true, detail: "active shell=powershell", behaviorOk: true },
      "env:kali": { ok: false, detail: "kali linux not detected", behaviorOk: false },
      "env:wsl": { ok: false, detail: "wsl not detected", behaviorOk: false },
    })
    expect(text).toContain("os=windows")
    expect(text).toContain("shell=powershell")
    expect(text).toContain("curl.exe")
    expect(text).toContain("python -c")
    expect(text).toContain("avoid bash/heredoc examples")
  })

  it("keeps WSL summary in the Linux bucket", () => {
    const summary = summarizeStartupEnvironment({
      "env:os": { ok: true, detail: "host os=linux", behaviorOk: true },
      "env:shell": { ok: true, detail: "active shell=bash", behaviorOk: true },
      "env:kali": { ok: false, detail: "kali linux not detected", behaviorOk: false },
      "env:wsl": { ok: true, detail: "wsl detected", behaviorOk: true },
    })
    expect(summary.substrate).toBe("native-linux")
    expect(summary.guidance.join(" ")).toContain("Linux environment launched via WSL")
    expect(summary.guidance.join(" ")).toContain("bash/heredoc")
  })

  it("keeps generic native Linux guidance neutral", () => {
    const summary = summarizeStartupEnvironment({
      "env:os": { ok: true, detail: "host os=linux", behaviorOk: true },
      "env:shell": { ok: true, detail: "active shell=bash", behaviorOk: true },
      "env:kali": { ok: false, detail: "kali linux not detected", behaviorOk: false },
      "env:wsl": { ok: false, detail: "wsl not detected", behaviorOk: false },
    })
    expect(summary.substrate).toBe("native-linux")
    expect(summary.guidance.join(" ")).toContain("bash")
    expect(summary.guidance.join(" ")).toContain("python - <<'PY'")
    expect(summary.guidance.join(" ")).not.toContain("curl.exe")
  })
})
