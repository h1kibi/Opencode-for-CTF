import { describe, expect, it } from "vitest"
import {
  DEFAULT_TOOL_PACKS,
  packForTool,
  resolveEnabledPacks,
  toolAllowedByPacks,
} from "../src/tool-packs.ts"
import { loadCtfTools } from "../src/ctf-tools.ts"

const FAST_LIGHT_WEB_TOOLS = [
  "ctf-web-fingerprint",
  "ctf-web-blackbox-map",
  "ctf-web-probe",
  "ctf-python-inline",
] as const

describe("packForTool", () => {
  it("classifies core helpers", () => {
    expect(packForTool("ctf-route-plan")).toBe("core")
    expect(packForTool("ctf-file-triage")).toBe("core")
    expect(packForTool("ctf-flag-grep")).toBe("core")
    expect(packForTool("ctf-tool-packs")).toBe("core")
  })

  it("classifies category prefixes", () => {
    expect(packForTool("ctf-web-probe")).toBe("web")
    expect(packForTool("ctf-pwn-runner")).toBe("pwn")
    expect(packForTool("ctf-pwn-offset")).toBe("pwn")
    expect(packForTool("ctf-pwn-remote-check")).toBe("pwn")
    expect(packForTool("ctf-proto-probe")).toBe("core")
    expect(packForTool("ctf-pwn-probe")).toBe("pwn")
    expect(packForTool("ctf-pwn-libc-hint")).toBe("pwn")
    expect(packForTool("ctf-rev-pe-slice")).toBe("rev")
    expect(packForTool("ctf-rsa-probe")).toBe("crypto")
    expect(packForTool("ctf-pcap-probe")).toBe("forensics")
    expect(packForTool("ctf-java-map")).toBe("java")
    expect(packForTool("ctf-android-runtime-check")).toBe("android")
    expect(packForTool("ctf-godot-decompile")).toBe("godot")
  })
})

describe("resolveEnabledPacks", () => {
  it("defaults exclude android and godot", () => {
    const enabled = resolveEnabledPacks()
    expect(enabled.has("core")).toBe(true)
    expect(enabled.has("pwn")).toBe(true)
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
  it("loads the repository tool definitions without aborting on one bad module", async () => {
    const tools = await loadCtfTools({ all: true })
    expect(Object.keys(tools).length).toBeGreaterThan(100)
    expect(tools["ctf-file-triage"]).toBeDefined()
    expect(tools["ctf-flag-grep"]).toBeDefined()
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
})
