import { describe, expect, it } from "vitest"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  ALL_TOOL_PACKS,
  DEFAULT_TOOL_PACKS,
  packForTool,
  resolveEnabledPacks,
  summarizePacks,
  toolAllowedByPacks,
} from "../src/tool-packs.ts"
import { listToolNames, loadCtfTools, loadCtfToolsWithReport } from "../src/ctf-tools.ts"

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
  "ctf-pwn-runner",
  "ctf-pwn-offset",
  "ctf-pwn-remote-fingerprint",
  "ctf-python-inline",
] as const

const FAST_LIGHT_REV_TOOLS = ["ctf-rev-analyze", "ctf-rev-closure-ladder", "ctf-binary-probe"] as const

const FAST_LIGHT_CRYPTO_TOOLS = ["ctf-crypto-analyze", "ctf-rsa-probe"] as const

const FAST_LIGHT_MISC_TOOLS = ["ctf-misc-analyze", "ctf-encoding-chain", "ctf-python-inline"] as const

describe("packForTool", () => {
  it("classifies core helpers", () => {
    expect(packForTool("ctf-route-plan")).toBe("core")
    expect(packForTool("ctf-file-triage")).toBe("core")
    expect(packForTool("ctf-flag-grep")).toBe("core")
    expect(packForTool("ctf-tool-packs")).toBe("core")
  })

  it("classifies category prefixes", () => {
    expect(packForTool("ctf-web-probe")).toBe("web")
    expect(packForTool("ctf-web-analyze")).toBe("web")
    expect(packForTool("ctf-web-recon-pack")).toBe("web-heavy")
    expect(packForTool("ctf-pwn-runner")).toBe("pwn")
    expect(packForTool("ctf-pwn-analyze")).toBe("pwn")
    expect(packForTool("ctf-pwn-offset")).toBe("pwn")
    expect(packForTool("ctf-pwn-remote-fingerprint")).toBe("pwn")
    expect(packForTool("ctf-pwn-remote-check")).toBe("pwn-heavy")
    expect(packForTool("ctf-pwn-stage-harness")).toBe("pwn-heavy")
    expect(packForTool("ctf-proto-probe")).toBe("core")
    expect(packForTool("ctf-binary-probe")).toBe("core")
    expect(packForTool("ctf-elf-slice")).toBe("core")
    expect(packForTool("ctf-pwn-probe")).toBe("pwn")
    expect(packForTool("ctf-pwn-libc-hint")).toBe("pwn")
    expect(packForTool("ctf-rev-analyze")).toBe("rev")
    expect(packForTool("ctf-rev-pe-slice")).toBe("rev")
    expect(packForTool("ctf-crypto-analyze")).toBe("crypto")
    expect(packForTool("ctf-rsa-probe")).toBe("crypto")
    expect(packForTool("ctf-misc-analyze")).toBe("misc")
    expect(packForTool("ctf-forensics-analyze")).toBe("forensics")
    expect(packForTool("ctf-pcap-probe")).toBe("forensics")
    expect(packForTool("ctf-java-map")).toBe("java")
    expect(packForTool("ctf-java-analyze")).toBe("core")
    expect(packForTool("ctf-java-analyze-pack")).toBe("java")
    expect(packForTool("ctf-android-analyze")).toBe("android")
    expect(packForTool("ctf-android-dynamic-macro")).toBe("android-dynamic")
    expect(packForTool("ctf-android-runtime-check")).toBe("android")
    expect(packForTool("ctf-godot-decompile")).toBe("godot")
  })
})

describe("resolveEnabledPacks", () => {
  it("defaults exclude android and godot", () => {
    const enabled = resolveEnabledPacks()
    expect(enabled.has("core")).toBe(true)
    expect(enabled.has("pwn")).toBe(true)
    expect(enabled.has("maintenance")).toBe(false)
    expect(enabled.has("android")).toBe(false)
    expect(enabled.has("godot")).toBe(false)
    expect(DEFAULT_TOOL_PACKS).not.toContain("android")
  })

  it("supports all token", () => {
    const enabled = resolveEnabledPacks(["all"])
    expect(enabled.has("android")).toBe(true)
    expect(enabled.has("godot")).toBe(true)
  })

  it("always includes core", () => {
    const enabled = resolveEnabledPacks(["web"])
    expect(enabled.has("core")).toBe(true)
    expect(enabled.has("web")).toBe(true)
    expect(enabled.has("pwn")).toBe(false)
  })
})

describe("loadCtfTools packs", () => {
  it("discovers tools recursively while keeping basename registry keys", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-tools-recursive-"))
    await mkdir(path.join(root, "web"), { recursive: true })
    await writeFile(
      path.join(root, "web", "ctf-web-fixture.ts"),
      [
        'import { tool } from "@opencode-ai/plugin"',
        "export default tool({",
        '  description: "fixture",',
        "  args: {},",
        '  async execute() { return "ok" },',
        "})",
        "",
      ].join("\n"),
      "utf8",
    )

    await expect(listToolNames(root)).resolves.toEqual(["ctf-web-fixture"])
    const { tools, report } = await loadCtfToolsWithReport({ root, all: true })
    expect(tools["ctf-web-fixture"]).toBeDefined()
    expect(report.criticalRegistered).toEqual([])
    expect(report.criticalMissing).toEqual([])
  })

  it("loads the repository tool definitions without aborting on one bad module", async () => {
    const tools = await loadCtfTools({ all: true })
    expect(Object.keys(tools).length).toBeGreaterThan(100)
    expect(tools["ctf-file-triage"]).toBeDefined()
    expect(tools["ctf-flag-grep"]).toBeDefined()
  }, 60_000)

  it("keeps manifest required_tools available under default packs", async () => {
    const manifest = JSON.parse(await readFile("ctf-agent.manifest.json", "utf8")) as {
      required_tools: string[]
    }
    const tools = await loadCtfTools()
    for (const toolName of manifest.required_tools) {
      expect(tools[toolName], `${toolName} should load under default packs`).toBeDefined()
    }
  }, 60_000)

  it("reports criticalMissing only for tools inside the enabled pack surface", async () => {
    const { report } = await loadCtfToolsWithReport({ packs: ["core", "rev"] })
    expect(report.criticalMissing).not.toContain("ctf-pwn-runner")
    expect(report.criticalMissing).not.toContain("ctf-web-blackbox-map")
    expect(report.criticalRegistered).toContain("ctf-route-plan")
  }, 60_000)

  it("can load a reduced core+web surface", async () => {
    const tools = await loadCtfTools({ packs: ["core", "web"] })
    expect(tools["ctf-route-plan"]).toBeDefined()
    expect(tools["ctf-file-triage"]).toBeDefined()
    expect(tools["ctf-web-probe"]).toBeDefined()
    expect(tools["ctf-pwn-runner"]).toBeUndefined()
    expect(tools["ctf-android-runtime-check"]).toBeUndefined()
    expect(toolAllowedByPacks("ctf-web-probe", resolveEnabledPacks(["core", "web"]))).toBe(true)
  }, 60_000)

  it("keeps the fast lightweight web and script helpers loadable under core+web packs", async () => {
    const tools = await loadCtfTools({ packs: ["core", "web"] })
    for (const toolName of FAST_LIGHT_WEB_TOOLS) {
      expect(tools[toolName]).toBeDefined()
      expect(toolAllowedByPacks(toolName, resolveEnabledPacks(["core", "web"]))).toBe(true)
    }
  }, 60_000)

  it("keeps the fast lightweight PWN helpers loadable under core+pwn packs", async () => {
    const tools = await loadCtfTools({ packs: ["core", "pwn"] })
    for (const toolName of FAST_LIGHT_PWN_TOOLS) {
      expect(tools[toolName]).toBeDefined()
      expect(toolAllowedByPacks(toolName, resolveEnabledPacks(["core", "pwn"]))).toBe(true)
    }
    expect(tools["ctf-web-probe"]).toBeUndefined()
    expect(tools["ctf-pwn-remote-check"]).toBeUndefined()
    expect(tools["ctf-pwn-stage-harness"]).toBeUndefined()
  }, 60_000)

  it("keeps the fast lightweight REV helpers loadable under core+rev packs", async () => {
    const tools = await loadCtfTools({ packs: ["core", "rev"] })
    for (const toolName of FAST_LIGHT_REV_TOOLS) {
      expect(tools[toolName]).toBeDefined()
      expect(toolAllowedByPacks(toolName, resolveEnabledPacks(["core", "rev"]))).toBe(true)
    }
    expect(tools["ctf-web-probe"]).toBeUndefined()
    expect(tools["ctf-pwn-analyze"]).toBeUndefined()
  }, 60_000)

  it("keeps the fast lightweight crypto helpers loadable under core+crypto packs", async () => {
    const tools = await loadCtfTools({ packs: ["core", "crypto"] })
    for (const toolName of FAST_LIGHT_CRYPTO_TOOLS) {
      expect(tools[toolName]).toBeDefined()
      expect(toolAllowedByPacks(toolName, resolveEnabledPacks(["core", "crypto"]))).toBe(true)
    }
    expect(tools["ctf-web-probe"]).toBeUndefined()
    expect(tools["ctf-pwn-analyze"]).toBeUndefined()
  }, 60_000)

  it("keeps the fast lightweight misc helpers loadable under core+misc packs", async () => {
    const tools = await loadCtfTools({ packs: ["core", "misc"] })
    for (const toolName of FAST_LIGHT_MISC_TOOLS) {
      expect(tools[toolName]).toBeDefined()
      expect(toolAllowedByPacks(toolName, resolveEnabledPacks(["core", "misc"]))).toBe(true)
    }
    expect(tools["ctf-web-probe"]).toBeUndefined()
    expect(tools["ctf-crypto-analyze"]).toBeUndefined()
  }, 60_000)

  it("loads deep PWN helpers only when pwn-heavy is enabled", async () => {
    const tools = await loadCtfTools({ packs: ["core", "pwn", "pwn-heavy"] })
    expect(tools["ctf-pwn-remote-check"]).toBeDefined()
    expect(tools["ctf-pwn-stage-harness"]).toBeDefined()
    expect(toolAllowedByPacks("ctf-pwn-stage-harness", resolveEnabledPacks(["core", "pwn", "pwn-heavy"]))).toBe(true)
  }, 60_000)

  it("loads maintenance helpers only when maintenance is enabled", async () => {
    const defaultTools = await loadCtfTools({ packs: DEFAULT_TOOL_PACKS })
    expect(defaultTools["ctf-pattern-feedback"]).toBeUndefined()
    expect(defaultTools["ctf-runtime-selftest"]).toBeUndefined()

    const maintenanceTools = await loadCtfTools({ packs: ["core", "maintenance"] })
    expect(maintenanceTools["ctf-pattern-feedback"]).toBeDefined()
    expect(maintenanceTools["ctf-runtime-selftest"]).toBeDefined()
  }, 60_000)

  it("loads every opt-in pack with representative tools when explicitly enabled", async () => {
    const cases: Array<[string, string[]]> = [
      ["maintenance", ["archive-safe-extract", "ctf-background-job"]],
      ["pwn-heavy", ["ctf-pwn-stage-harness", "ctf-pwn-container-probe"]],
      ["web-heavy", ["ctf-web-runtime-map", "ctf-web-recon-pack"]],
      ["rev-heavy", ["ctf-rev-unicorn-helper", "ctf-rev-unicorn-replay-builder"]],
      ["java", ["ctf-java-map", "ctf-java-analyze-pack"]],
      ["forensics-heavy", ["ctf-pcap-carve", "ctf-artifact-page"]],
      ["android", ["ctf-android-analyze", "ctf-apk-triage"]],
      ["android-dynamic", ["ctf-android-dynamic-macro"]],
      ["godot", ["ctf-godot-pack-inspect", "ctf-godot-decompile"]],
    ]

    for (const [pack, toolNames] of cases) {
      const tools = await loadCtfTools({ packs: ["core", pack] })
      for (const toolName of toolNames) {
        expect(tools[toolName], `${pack} should export ${toolName}`).toBeDefined()
        expect(toolAllowedByPacks(toolName, resolveEnabledPacks(["core", pack])), `${toolName} pack`).toBe(true)
      }
    }
  }, 60_000)

  it("keeps every public pack non-empty", async () => {
    const summary = summarizePacks(await listToolNames())
    for (const pack of ALL_TOOL_PACKS) {
      expect(summary[pack].length, `${pack} should have at least one tool`).toBeGreaterThan(0)
    }
  })
})
