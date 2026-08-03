import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { listToolNames } from "../src/ctf-tools.js"
import { compatAliasTarget, summarizeToolMetadata, toolMetadata, toolRequires, toolTier } from "../src/tool-metadata.js"
import { FAST_TOOL_ALLOWLIST } from "../src/tool-packs.js"

describe("tool metadata", () => {
  it("classifies compatibility aliases explicitly", () => {
    expect(toolTier("archive-safe-extract")).toBe("compat")
    expect(compatAliasTarget("archive-safe-extract")).toBe("ctf-safe-extract")
    expect(toolTier("ctf-java-analyze-pack")).toBe("compat")
    expect(compatAliasTarget("ctf-java-analyze-pack")).toBe("ctf-java-analyze")
    expect(toolTier("ctf-pwn-remote-check")).toBe("compat")
    expect(compatAliasTarget("ctf-pwn-remote-check")).toBe("ctf-pwn-remote-fingerprint")
    expect(toolTier("ctf-web-recon-pack")).toBe("compat")
    expect(compatAliasTarget("ctf-web-recon-pack")).toBe("ctf-web-analyze")
  })

  it("keeps fast allowlisted tools documented as light or compat", () => {
    for (const toolName of FAST_TOOL_ALLOWLIST) {
      expect(["light", "compat"]).toContain(toolTier(toolName))
    }
  })

  it("records execution requirements for representative tools", () => {
    expect(toolMetadata("ctf-pwn-docker-runner")).toMatchObject({
      category: "pwn-heavy",
      tier: "advanced",
      requires: ["docker"],
    })
    expect(toolMetadata("ctf-forensics-analyze")).toMatchObject({
      category: "forensics",
      tier: "light",
    })
    expect(toolMetadata("ctf-android-analyze")).toMatchObject({
      category: "android",
      tier: "advanced",
    })
    expect(toolMetadata("ctf-pwn-analyze")).toMatchObject({
      category: "pwn",
      tier: "light",
    })
    expect(toolMetadata("ctf-rev-analyze")).toMatchObject({
      category: "rev",
      tier: "light",
    })
    expect(toolMetadata("ctf-crypto-analyze")).toMatchObject({
      category: "crypto",
      tier: "light",
      requires: ["node"],
    })
    expect(toolMetadata("ctf-misc-analyze")).toMatchObject({
      category: "misc",
      tier: "light",
      requires: ["node", "file?"],
    })
    expect(toolMetadata("ctf-web-fuzz-plan")).toMatchObject({
      category: "web-heavy",
      tier: "advanced",
    })
    expect(toolMetadata("ctf-pattern-feedback")).toMatchObject({
      category: "maintenance",
      tier: "maintenance",
    })
    expect(toolMetadata("ctf-pwn-gdb-snapshot").requires).toContain("gdb")
    expect(toolMetadata("ctf-proto-probe").requires).toContain("python")
    expect(toolMetadata("ctf-web-probe").requires).toContain("fetch")
    expect(toolMetadata("ctf-stego-triage").requires).toContain("file")
    expect(toolMetadata("ctf-dex-patch-map").requires).toContain("node")
    expect(toolMetadata("ctf-godot-pack-inspect").requires).toContain("node")
  })

  it("keeps executable and advanced tools documented with requirements", async () => {
    const names = await listToolNames()
    const missing = names
      .map((name) => toolMetadata(name))
      .filter(
        (meta) =>
          (meta.tier === "advanced" || meta.effects.includes("execute")) && toolRequires(meta.name).length === 0,
      )
      .map((meta) => `${meta.name}:${meta.category}:${meta.tier}:${meta.effects.join("+")}`)

    expect(missing).toEqual([])
  })

  it("keeps compatibility aliases from mutating their target tool definition", async () => {
    const alias = await import("../tools/pwn/ctf-pwn-remote-check.js")
    const target = await import("../tools/pwn/ctf-pwn-remote-fingerprint.js")
    const javaAlias = await import("../tools/java/ctf-java-analyze-pack.js")
    const javaFacade = await import("../tools/java/ctf-java-analyze.js")
    const webAlias = await import("../tools/web/ctf-web-recon-pack.js")
    const webFacade = await import("../tools/web/ctf-web-analyze.js")

    expect(alias.default).not.toBe(target.default)
    expect(alias.default.description).toContain("Compatibility alias")
    expect(target.default.description).not.toContain("Compatibility alias")
    expect(javaFacade.default).not.toBe(javaAlias.default)
    expect(javaFacade.default.description).toContain("Stable facade")
    expect(webFacade.default).not.toBe(webAlias.default)
    expect(webFacade.default.description).toContain("Stable facade")
  })

  it("summarizes every registered source tool into a tier", async () => {
    const names = await listToolNames()
    const summary = summarizeToolMetadata(names)
    const total = Object.values(summary).reduce((acc, namesForTier) => acc + namesForTier.length, 0)
    expect(total).toBe(names.length)
    expect(summary.light.length).toBeGreaterThan(20)
    expect(summary.advanced).toContain("ctf-pwn-docker-runner")
    expect(summary.compat).toContain("ctf-java-analyze-pack")
    expect(summary.compat).toContain("ctf-pwn-remote-check")
    expect(summary.compat).toContain("ctf-web-recon-pack")
  })

  it("shows tier, effects, requirements, and alias target in tool-pack diagnostics", async () => {
    const mod = await import("../tools/core/ctf-tool-packs.js")
    const text = await mod.default.execute({ toolName: "ctf-pwn-remote-check" }, {} as never)

    expect(text).toContain("tiers:")
    expect(text).toContain("compat_aliases:")
    expect(text).toContain("tool ctf-pwn-remote-check -> pack pwn-heavy")
    expect(text).toContain("tier: compat")
    expect(text).toContain("requires: python, pwntools?")
    expect(text).toContain("alias_of: ctf-pwn-remote-fingerprint")
  }, 60_000)

  it("uses context.directory for config and local skill diagnostics instead of process cwd", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-tool-packs-workspace-"))
    const other = mkdtempSync(join(tmpdir(), "ctf-tool-packs-other-"))
    const skillName = "zz-local-tool-pack-skill"
    mkdirSync(join(workspace, "skills", skillName), { recursive: true })
    writeFileSync(
      join(workspace, "opencode-for-ctf.jsonc"),
      JSON.stringify({ tool_packs: ["core", "godot"], external_skills: true }),
      "utf8",
    )

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-tool-packs.js")
      const text = await mod.default.execute({}, { directory: workspace } as never)

      expect(text).toContain(`config_path: ${join(workspace, "opencode-for-ctf.jsonc")}`)
      expect(text).toContain("enabled: core, godot")
      expect(text).toContain(`expected_catalog_entries: ${skillName}`)
    } finally {
      process.chdir(prev)
    }
  }, 60_000)

  it("diagnoses explicitly enabled owner subagent tools as visible", async () => {
    const original = process.env.OPENCODE_CTF_TOOL_PACKS
    process.env.OPENCODE_CTF_TOOL_PACKS = "all"
    try {
      const mod = await import("../tools/core/ctf-tool-packs.js")
      const text = await mod.default.execute({ toolName: "ctf-web-runtime-map", agentName: "ctf-web" }, {} as never)

      expect(text).toContain("tool ctf-web-runtime-map -> pack web-heavy")
      expect(text).toContain("registered this session: yes")
      expect(text).toContain("visible on ctf-expert: yes")
      expect(text).toContain("diagnosed agent: ctf-web")
      expect(text).toContain("diagnosis: visible_in_plugin_registry")
    } finally {
      if (original === undefined) delete process.env.OPENCODE_CTF_TOOL_PACKS
      else process.env.OPENCODE_CTF_TOOL_PACKS = original
    }
  }, 60_000)

  it("diagnoses cross-family subagent heavy tools as gate-blocked even when registered", async () => {
    const original = process.env.OPENCODE_CTF_TOOL_PACKS
    process.env.OPENCODE_CTF_TOOL_PACKS = "all"
    try {
      const mod = await import("../tools/core/ctf-tool-packs.js")
      const text = await mod.default.execute({ toolName: "ctf-web-runtime-map", agentName: "ctf-pwn" }, {} as never)

      expect(text).toContain("tool ctf-web-runtime-map -> pack web-heavy")
      expect(text).toContain("registered this session: yes")
      expect(text).toContain("diagnosed agent: ctf-pwn")
      expect(text).toContain("diagnosis: subagent_gate_blocked")
    } finally {
      if (original === undefined) delete process.env.OPENCODE_CTF_TOOL_PACKS
      else process.env.OPENCODE_CTF_TOOL_PACKS = original
    }
  }, 60_000)
})
