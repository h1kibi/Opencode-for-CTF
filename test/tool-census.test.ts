import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { describe, expect, it } from "vitest"
import { createTeamTools } from "../src/team/team-runtime-core.ts"
import { packForTool, resolveEnabledPacks, toolAllowedByPacks } from "../src/tool-packs.ts"

const root = process.cwd()

const manifest = JSON.parse(readFileSync(join(root, "ctf-agent.manifest.json"), "utf8")) as {
  required_tools?: string[]
  optional_pack_tools?: string[]
  registered_tools?: string[]
  runtime_tools?: string[]
}

/** Tools created by Team Mode at runtime; they have no file under tools/. */
const runtimeToolNames = Object.keys(
  // Registry enumeration only: creation stores the client without calling it.
  createTeamTools({} as unknown as OpencodeClient, root),
).sort()

/** Underscore MCP namespace injected at runtime (ctf_rag_*, ctf_filesystem_*). */
const UNDERSCORE_MCP_TOOLS = ["ctf_rag", "ctf_rag_ctf_rag", "ctf_filesystem_read_file", "ctf_filesystem_list_directory"]

/** Mirror the loader's discovery rules: every .ts/.js file under tools/, minus lib/. */
function diskToolNames(): string[] {
  const names: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === "lib") continue
        walk(join(dir, entry.name))
        continue
      }
      if (!entry.isFile() || !/\.(ts|js)$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue
      names.push(entry.name.replace(/\.(ts|js)$/, ""))
    }
  }
  walk(join(root, "tools"))
  return names.sort()
}

describe("tool pack census (anti-orphan)", () => {
  it("registers every tool file on disk in a real pack (never quarantine)", () => {
    const quarantined = diskToolNames().filter((name) => packForTool(name) === "quarantine")
    expect(
      quarantined,
      `orphan tools must be registered explicitly in tool-packs.ts: ${quarantined.join(", ")}`,
    ).toEqual([])
  })

  it("registers runtime team tools and underscore MCP tools in core", () => {
    for (const name of [...runtimeToolNames, ...UNDERSCORE_MCP_TOOLS]) {
      expect(packForTool(name), name).toBe("core")
    }
  })

  it("keeps manifest-required and optional pack tools out of quarantine", () => {
    const names = [...(manifest.required_tools ?? []), ...(manifest.optional_pack_tools ?? [])]
    const quarantined = names.filter((name) => packForTool(name) === "quarantine")
    expect(quarantined, `manifest tools must stay registered: ${quarantined.join(", ")}`).toEqual([])
  })

  it("manifest registered_tools equals the disk tool set (whitelist integrity)", () => {
    const registered = new Set(manifest.registered_tools ?? [])
    const disk = new Set(diskToolNames())
    expect(registered.size, "registered_tools must not be empty").toBeGreaterThan(150)
    const missing = [...disk].filter((name) => !registered.has(name))
    const extra = [...registered].filter((name) => !disk.has(name))
    expect(missing, `disk tools missing from registered_tools: ${missing.join(", ")}`).toEqual([])
    expect(extra, `registered_tools entries without a disk tool: ${extra.join(", ")}`).toEqual([])
  })

  it("manifest runtime_tools matches the tools created by Team Mode", () => {
    const declared = [...(manifest.runtime_tools ?? [])].sort()
    expect(declared).toEqual(runtimeToolNames)

    const registered = new Set(manifest.registered_tools ?? [])
    const overlapping = runtimeToolNames.filter((name) => registered.has(name))
    expect(overlapping, `runtime-only tools must not be in registered_tools: ${overlapping.join(", ")}`).toEqual([])
  })

  it("gives quarantine an explicit escape hatch (all / quarantine token)", () => {
    const all = resolveEnabledPacks(["all"])
    expect(toolAllowedByPacks("ctf-brand-new-helper", all)).toBe(true)
    const explicit = resolveEnabledPacks(["core", "quarantine"])
    expect(toolAllowedByPacks("ctf-brand-new-helper", explicit)).toBe(true)
    const defaults = resolveEnabledPacks()
    expect(toolAllowedByPacks("ctf-brand-new-helper", defaults)).toBe(false)
  })
})
