import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { FAST_TOOL_ALLOWLIST, SUBAGENT_LIGHT_TOOLS } from "../src/tool-packs.js"
import { toolMetadata } from "../src/tool-metadata.js"

/**
 * Tool registry drift checks:
 * allowlists, subagent surfaces, and the agent manifest must reference only
 * tools that actually exist on disk — a dangling name means the agent is told
 * about a tool that never registers.
 */

const PROJECT_ROOT = path.join(fileURLToPath(new URL("..", import.meta.url)))

/** All tool basenames under tools/ (excluding lib helpers). */
function toolNamesOnDisk(): Set<string> {
  const names = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === "lib") continue
        walk(path.join(dir, entry.name))
      } else if (entry.isFile() && /\.(ts|js)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        names.add(entry.name.replace(/\.(ts|js)$/, ""))
      }
    }
  }
  walk(path.join(PROJECT_ROOT, "tools"))
  return names
}

/** Runtime-generated tools (team mode, MCP lifecycle) are not files on disk. */
const RUNTIME_GENERATED = [
  "ctf-team-dispatch",
  "ctf-team-status",
  "ctf-team-collect",
  "ctf-team-cancel",
  "ctf-team-cancel-route",
  "ctf-team-close",
  "ctf-team-recover",
  "ctf-team-adopt",
  "ctf-team-repair",
]

describe("tool registry drift", () => {
  it("FAST_TOOL_ALLOWLIST references only tools that exist on disk", () => {
    const onDisk = toolNamesOnDisk()
    const missing = [...FAST_TOOL_ALLOWLIST].filter((name) => !onDisk.has(name))
    expect(missing).toEqual([])
  })

  it("subagent light allowlists reference only tools that exist on disk", () => {
    const onDisk = toolNamesOnDisk()
    const missing: string[] = []
    for (const [agent, tools] of Object.entries(SUBAGENT_LIGHT_TOOLS)) {
      for (const name of tools) {
        if (!onDisk.has(name)) missing.push(`${agent}: ${name}`)
      }
    }
    expect(missing).toEqual([])
  })

  it("manifest tool references exist on disk (or are runtime-generated)", () => {
    const manifest = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "ctf-agent.manifest.json"), "utf8")) as {
      required_tools?: string[]
      optional_pack_tools?: string[]
      readiness_gate?: { expert_required_tools?: string[] }
    }
    const onDisk = toolNamesOnDisk()
    const refs = [
      ...(manifest.required_tools ?? []),
      ...(manifest.optional_pack_tools ?? []),
      ...(manifest.readiness_gate?.expert_required_tools ?? []),
    ]
    const missing = [...new Set(refs)].filter((name) => !onDisk.has(name) && !RUNTIME_GENERATED.includes(name))
    expect(missing).toEqual([])
  })

  it("compat aliases in tool metadata never point at missing tools", () => {
    const onDisk = toolNamesOnDisk()
    const broken: string[] = []
    for (const name of onDisk) {
      const meta = toolMetadata(name)
      if (meta.aliasOf && !onDisk.has(meta.aliasOf)) broken.push(`${name} -> ${meta.aliasOf}`)
    }
    expect(broken).toEqual([])
  })
})
