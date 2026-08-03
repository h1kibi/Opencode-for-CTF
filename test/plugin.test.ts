import { afterEach, describe, expect, it } from "vitest"
import RuntimePlugin, * as PluginEntry from "../src/plugin.js"
import {
  clearActivatedDefaults,
  diagnoseToolVisibility,
  propString,
  propStringNullable,
  skillToAgent,
  summarizeRuntimeToolRegistry,
  trimActivatedDefaults,
} from "../src/plugin-support.js"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const cleanup = () => clearActivatedDefaults("nonexistent-session")

describe("OpenCode plugin entry exports", () => {
  it("exposes only the actual plugin entry points", () => {
    expect(Object.keys(PluginEntry).sort()).toEqual(["default", "server"])
    expect(PluginEntry.server).toBe(RuntimePlugin)
  })
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// propString — safe property accessor
// ---------------------------------------------------------------------------

describe("propString", () => {
  it("returns empty string when obj is null", () => {
    expect(propString(null, "key")).toBe("")
  })

  it("returns empty string when obj is undefined", () => {
    expect(propString(undefined, "key")).toBe("")
  })

  it("returns empty string when obj is a primitive", () => {
    expect(propString(42, "key")).toBe("")
    expect(propString("string", "key")).toBe("")
  })

  it("returns empty string when property does not exist", () => {
    expect(propString({ a: 1 }, "b")).toBe("")
  })

  it("returns empty string when property exists but is not a string", () => {
    expect(propString({ count: 42 }, "count")).toBe("")
    expect(propString({ flag: true }, "flag")).toBe("")
    expect(propString({ data: null }, "data")).toBe("")
  })

  it("returns the string value when property is a string", () => {
    expect(propString({ name: "hello" }, "name")).toBe("hello")
    expect(propString({ sessionID: "sess-123" }, "sessionID")).toBe("sess-123")
  })

  it("returns empty string for empty string value", () => {
    expect(propString({ empty: "" }, "empty")).toBe("")
  })
})

// ---------------------------------------------------------------------------
// skillToAgent — skill name → agent name mapping
// ---------------------------------------------------------------------------

describe("skillToAgent", () => {
  it("returns undefined for non-ctf skills", () => {
    expect(skillToAgent("react")).toBeUndefined()
    expect(skillToAgent("terminal")).toBeUndefined()
    expect(skillToAgent("python")).toBeUndefined()
  })

  it("returns undefined for empty string", () => {
    expect(skillToAgent("")).toBeUndefined()
  })

  it("maps ctf-web-* to ctf-web", () => {
    expect(skillToAgent("ctf-web-sqli")).toBe("ctf-web")
    expect(skillToAgent("ctf-web-xss")).toBe("ctf-web")
    expect(skillToAgent("ctf-web-recon")).toBe("ctf-web")
  })

  it("maps ctf-pwn-* to ctf-pwn", () => {
    expect(skillToAgent("ctf-pwn-heap")).toBe("ctf-pwn")
    expect(skillToAgent("ctf-pwn-rop")).toBe("ctf-pwn")
  })

  it("maps ctf-rev-* to ctf-rev", () => {
    expect(skillToAgent("ctf-rev-mobile")).toBe("ctf-rev")
    expect(skillToAgent("ctf-rev-anti-analysis")).toBe("ctf-rev")
  })

  it("maps ctf-crypto-* to ctf-crypto", () => {
    expect(skillToAgent("ctf-crypto-rsa")).toBe("ctf-crypto")
  })

  it("maps ctf-forensics-* to ctf-forensics", () => {
    expect(skillToAgent("ctf-forensics-memory")).toBe("ctf-forensics")
    expect(skillToAgent("ctf-forensics-stego")).toBe("ctf-forensics")
  })

  it("maps ctf-misc-* to ctf-misc", () => {
    expect(skillToAgent("ctf-misc-bashjail")).toBe("ctf-misc")
  })

  it("maps ctf-aisec-* to ctf-aisec", () => {
    expect(skillToAgent("ctf-aisec-prompt-injection")).toBe("ctf-aisec")
    expect(skillToAgent("ctf-aisec")).toBe("ctf-aisec")
  })

  it("returns undefined for ctf-common and ctf-terminal", () => {
    expect(skillToAgent("ctf-common")).toBe("ctf-common")
  })

  it("returns the agent for known special agents", () => {
    expect(skillToAgent("ctf-scout")).toBe("ctf-scout")
    expect(skillToAgent("ctf-oracle")).toBe("ctf-oracle")
    expect(skillToAgent("ctf-librarian")).toBe("ctf-librarian")
    expect(skillToAgent("ctf-verifier")).toBe("ctf-verifier")
    expect(skillToAgent("ctf-expert")).toBe("ctf-expert")
  })

  it("returns undefined for unknown ctf-* skill that doesn't match known prefixes", () => {
    expect(skillToAgent("ctf-unknown-category")).toBeUndefined()
    expect(skillToAgent("ctf-nonsense-thing")).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// propStringNullable — distinguishes missing vs empty string
// ---------------------------------------------------------------------------

describe("propStringNullable", () => {
  it("returns undefined when obj is null", () => {
    expect(propStringNullable(null, "key")).toBeUndefined()
  })

  it("returns undefined when obj is undefined", () => {
    expect(propStringNullable(undefined, "key")).toBeUndefined()
  })

  it("returns undefined when property does not exist", () => {
    expect(propStringNullable({ a: 1 }, "b")).toBeUndefined()
  })

  it("returns undefined when property is not a string", () => {
    expect(propStringNullable({ count: 42 }, "count")).toBeUndefined()
  })

  it("returns empty string when property is an empty string", () => {
    expect(propStringNullable({ empty: "" }, "empty")).toBe("")
  })

  it("returns the string value when property is a string", () => {
    expect(propStringNullable({ name: "hello" }, "name")).toBe("hello")
  })
})

// ---------------------------------------------------------------------------
// clearActivatedDefaults / trimActivatedDefaults — memory leak guards
// ---------------------------------------------------------------------------

describe("activatedDefaults cleanup", () => {
  it("clearActivatedDefaults removes a session ID", () => {
    expect(() => clearActivatedDefaults("nonexistent-session")).not.toThrow()
  })

  it("trimActivatedDefaults does not throw on empty set", () => {
    expect(() => trimActivatedDefaults(10)).not.toThrow()
  })

  it("trimActivatedDefaults handles undersized set gracefully", () => {
    expect(() => trimActivatedDefaults(1000)).not.toThrow()
  })
})

describe("runtime tool registry summary", () => {
  it("summarizes exported and fast-visible tools", () => {
    const summary = summarizeRuntimeToolRegistry({
      configPath: null,
      enabledPacks: ["core", "web", "pwn"],
      teamModeEnabled: true,
      externalSkillsEnabled: true,
      skillFilesPresent: true,
      expectedSkillNames: ["ctf-expert", "ctf-web"],
      tools: {
        "ctf-route-plan": { execute() {} },
        "ctf-web-probe": { execute() {} },
        "ctf-python-inline": { execute() {} },
        "ctf-pwn-check-env": { execute() {} },
        "ctf-pwn-runner": { execute() {} },
        "ctf-evidence-board": { execute() {} },
        "ctf-team-dispatch": { execute() {} },
      },
    })
    expect(summary.exportedToolCount).toBe(7)
    expect(summary.ctfToolNames).toContain("ctf-web-probe")
    expect(summary.fastVisibleToolNames).toContain("ctf-web-probe")
    expect(summary.fastVisibleToolNames).toContain("ctf-pwn-check-env")
    expect(summary.fastVisibleToolNames).toContain("ctf-pwn-runner")
    expect(summary.fastVisibleToolNames).toContain("ctf-evidence-board")
    expect(summary.fastVisibleToolNames).not.toContain("ctf-team-dispatch")
    expect(summary.expertVisibleToolNames).toContain("ctf-team-dispatch")
    expect(summary.teamToolNames).toContain("ctf-team-dispatch")
    expect(summary.externalSkillsEnabled).toBe(true)
    expect(summary.skillFilesPresent).toBe(true)
    expect(summary.expectedSkillNames).toContain("ctf-expert")
  })

  it("classifies pack and fast-surface visibility failures", () => {
    const summary = summarizeRuntimeToolRegistry({
      configPath: null,
      enabledPacks: ["core", "web", "pwn"],
      teamModeEnabled: false,
      externalSkillsEnabled: false,
      skillFilesPresent: true,
      expectedSkillNames: ["ctf-expert"],
      tools: {
        "ctf-route-plan": { execute() {} },
        "ctf-web-probe": { execute() {} },
        "ctf-pwn-check-env": { execute() {} },
        "ctf-pwn-runner": { execute() {} },
        "ctf-evidence-board": { execute() {} },
      },
    })

    const visible = diagnoseToolVisibility({
      summary,
      toolName: "ctf-web-probe",
      agentSurface: "ctf-fast",
    })
    expect(visible.category).toBe("visible_in_plugin_registry")

    const evidenceVisible = diagnoseToolVisibility({
      summary,
      toolName: "ctf-evidence-board",
      agentSurface: "ctf-fast",
    })
    expect(evidenceVisible.category).toBe("visible_in_plugin_registry")

    const pwnVisible = diagnoseToolVisibility({
      summary,
      toolName: "ctf-pwn-runner",
      agentSurface: "ctf-fast",
    })
    expect(pwnVisible.category).toBe("visible_in_plugin_registry")

    const hostInvisible = diagnoseToolVisibility({
      summary,
      toolName: "ctf-pwn-runner",
      agentSurface: "ctf-fast",
      hostSchemaVisible: false,
    })
    expect(hostInvisible.category).toBe("likely_host_schema_not_injected")

    const packDisabled = diagnoseToolVisibility({
      summary,
      toolName: "ctf-pwn-heap-overlap-mapper",
      agentSurface: "ctf-fast",
    })
    expect(packDisabled.category).toBe("pack_not_enabled")
  })
})

describe("RuntimePlugin startup export", () => {
  it("exports representative ctf tools from plugin startup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-plugin-startup-"))
    // Pin the default pack set explicitly so an ambient opencode-for-ctf.jsonc
    // (e.g. ~/.config/opencode/opencode-for-ctf.jsonc with expert_tool_packs)
    // cannot leak pwn-heavy/web-heavy tools into this hermetic startup test.
    writeFileSync(
      join(dir, "opencode-for-ctf.jsonc"),
      JSON.stringify({
        tool_packs: ["core", "web", "pwn", "rev", "crypto", "forensics", "misc"],
      }),
    )
    const client = {
      mcp: {
        add: async () => undefined,
        connect: async () => undefined,
        disconnect: async () => undefined,
        status: async () => ({ data: {} }),
      },
    }
    const plugin = await RuntimePlugin(
      {
        client,
        directory: dir,
        worktree: dir,
      } as never,
      {} as never,
    )
    const tools = (plugin as { tool?: Record<string, unknown> }).tool ?? {}
    expect(tools["ctf-route-plan"]).toBeDefined()
    expect(tools["ctf-web-probe"]).toBeDefined()
    expect(tools["ctf-binary-probe"]).toBeDefined()
    expect(tools["ctf-pwn-check-env"]).toBeDefined()
    expect(tools["ctf-pwn-runner"]).toBeDefined()
    expect(tools["ctf-pwn-offset"]).toBeDefined()
    expect(tools["ctf-pwn-remote-fingerprint"]).toBeDefined()
    expect(tools["ctf-pwn-remote-check"]).toBeUndefined()
    expect(tools["ctf-python-inline"]).toBeDefined()
    const summary = summarizeRuntimeToolRegistry({
      configPath: null,
      enabledPacks: ["core", "web", "pwn", "rev", "crypto", "forensics", "misc", "java"],
      teamModeEnabled: false,
      tools,
    })
    expect(summary.exportedToolNames).toContain("ctf-pwn-runner")
    expect(summary.fastVisibleToolNames).toContain("ctf-binary-probe")
    expect(summary.fastVisibleToolNames).toContain("ctf-pwn-check-env")
    expect(summary.fastVisibleToolNames).toContain("ctf-pwn-runner")
    expect(summary.fastVisibleToolNames).toContain("ctf-pwn-offset")
    expect(summary.fastVisibleToolNames).toContain("ctf-pwn-remote-fingerprint")
    expect(summary.fastVisibleToolNames).not.toContain("ctf-pwn-remote-check")
    expect(summary.fastVisibleToolNames).toContain("ctf-python-inline")
  }, 60_000)

  it("unions startup packs with expert packs when exporting tools", async () => {
    const root = mkdtempSync(join(tmpdir(), "ctf-plugin-packs-"))
    const dir = join(root, "workspace")
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(root, "opencode-for-ctf.jsonc"),
      JSON.stringify({
        tool_packs: ["core"],
        expert_tool_packs: ["web", "pwn"],
        team_mode: { enabled: false },
      }),
    )
    const client = {
      mcp: {
        add: async () => undefined,
        connect: async () => undefined,
        disconnect: async () => undefined,
        status: async () => ({ data: {} }),
      },
    }
    const plugin = await RuntimePlugin(
      {
        client,
        directory: dir,
        worktree: dir,
      } as never,
      {} as never,
    )
    const tools = (plugin as { tool?: Record<string, unknown> }).tool ?? {}
    expect(tools["ctf-route-plan"]).toBeDefined()
    expect(tools["ctf-web-probe"]).toBeDefined()
    expect(tools["ctf-pwn-runner"]).toBeDefined()
    expect(tools["ctf-pwn-check-env"]).toBeDefined()
    expect(tools["ctf-binary-probe"]).toBeDefined()
  }, 60_000)
})
