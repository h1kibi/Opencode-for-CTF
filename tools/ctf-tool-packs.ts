import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"
import { PLUGIN_ROOT } from "../src/asset-paths.ts"
import { loadCtfTools } from "../src/ctf-tools.ts"
import { diagnoseToolVisibility, summarizeRuntimeToolRegistry } from "../src/plugin.ts"
import {
  ALL_TOOL_PACKS,
  DEFAULT_TOOL_PACKS,
  packForTool,
  resolveEnabledPacks,
  summarizePacks,
  toolAllowedForAgent,
} from "../src/tool-packs.ts"

async function listToolNames(): Promise<string[]> {
  const bundled = path.join(path.dirname(fileURLToPath(import.meta.url)), "tools")
  // When running from source, this file lives in tools/; when bundled, next to other tools.
  const candidates = [
    path.dirname(fileURLToPath(import.meta.url)),
    path.join(PLUGIN_ROOT, "tools"),
    bundled,
  ]
  for (const dir of candidates) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const names = entries
        .filter((e) => e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".js")))
        .map((e) => e.name.replace(/\.(ts|js)$/, ""))
      if (names.length > 10) return names.sort()
    } catch {
      // try next
    }
  }
  return []
}

/**
 * Inspect which tool packs are active and how tools are classified.
 * Pack membership is fixed at plugin startup; change opencode-for-ctf.jsonc
 * or OPENCODE_CTF_TOOL_PACKS and restart OpenCode to reload.
 */
export default tool({
  description:
    "Show CTF tool pack status: enabled packs, tools per pack, and how to enable android/godot/all. Packs load at plugin startup from opencode-for-ctf.jsonc tool_packs or OPENCODE_CTF_TOOL_PACKS.",
  args: {
    toolName: tool.schema.string().optional().describe("Optional tool basename to classify"),
  },
  async execute(args) {
    const names = await listToolNames()
    const byPack = summarizePacks(names)
    const enabled = resolveEnabledPacks()
    const exportedTools = await loadCtfTools({ packs: [...enabled] })
    const exportedNames = Object.keys(exportedTools).sort()
    const summary = summarizeRuntimeToolRegistry({
      configPath: null,
      enabledPacks: enabled,
      tools: exportedTools,
      teamModeEnabled: false,
    })
    const diskCtfTools = names.filter((name) => name.startsWith("ctf-") || name.startsWith("archive-")).sort()
    const exportedCtfTools = exportedNames.filter((name) => name.startsWith("ctf-") || name.startsWith("archive-")).sort()
    const missingFromRegistry = diskCtfTools.filter((name) => !exportedCtfTools.includes(name))
    const filteredByPack = diskCtfTools.filter((name) => !enabled.has(packForTool(name)))
    const fastVisible = exportedNames.filter((name) => toolAllowedForAgent(name, "ctf-fast")).sort()
    const filteredByFastSurface = exportedCtfTools.filter((name) => !fastVisible.includes(name))
    const lines: string[] = [
      "CTF tool packs",
      "",
      `enabled: ${[...enabled].sort().join(", ")}`,
      `defaults: ${DEFAULT_TOOL_PACKS.join(", ")}`,
      `all packs: ${ALL_TOOL_PACKS.join(", ")}`,
      `disk ctf tools: ${diskCtfTools.length}`,
      `exported ctf tools: ${exportedCtfTools.length}`,
      `ctf-fast visible tools: ${fastVisible.length}`,
      "",
      "counts:",
    ]
    for (const pack of ALL_TOOL_PACKS) {
      const mark = enabled.has(pack) ? "on " : "off"
      lines.push(`  [${mark}] ${pack}: ${byPack[pack].length} tools`)
    }
    if (args.toolName) {
      const name = args.toolName.replace(/\.(ts|js)$/, "")
      const diagnosis = diagnoseToolVisibility({
        summary,
        toolName: name,
        agentSurface: "ctf-fast",
      })
      lines.push("", `tool ${name} → pack ${packForTool(name)}`)
      lines.push(
        `registered this session: ${enabled.has(packForTool(name)) ? "yes" : "no (enable pack + restart)"}`,
      )
      lines.push(`exported in plugin registry: ${exportedNames.includes(name) ? "yes" : "no"}`)
      lines.push(`visible on ctf-fast: ${fastVisible.includes(name) ? "yes" : "no"}`)
      lines.push(`diagnosis: ${diagnosis.category}`)
      for (const reason of diagnosis.reasons) lines.push(`  because: ${reason}`)
      lines.push(`  next_action: ${diagnosis.nextAction}`)
    }
    if (missingFromRegistry.length) {
      lines.push("", `missing from exported registry (${missingFromRegistry.length}): ${missingFromRegistry.join(", ")}`)
    }
    if (filteredByPack.length) {
      lines.push("", `filtered by pack (${filteredByPack.length}): ${filteredByPack.join(", ")}`)
    }
    if (filteredByFastSurface.length) {
      lines.push("", `filtered by ctf-fast surface (${filteredByFastSurface.length}): ${filteredByFastSurface.join(", ")}`)
    }
    lines.push(
      "",
      "Architecture:",
      "  - Process registry (startup): tool_packs ∪ expert_tool_packs → all tools expert may use",
      "  - ctf-fast session: FAST_TOOL_ALLOWLIST filter at tool.execute (subset)",
      "  - /ctf expert route: session surface unlocks full registered set",
      "",
      "Enable rare packs (example opencode-for-ctf.jsonc):",
      '  { "tool_packs": ["core", "web", "pwn", "rev", "crypto", "forensics", "misc", "java"] }',
      '  { "expert_tool_packs": ["android", "godot"] }',
      "Or all packs:",
      '  { "tool_packs": ["all"] }',
      "Or env: OPENCODE_CTF_TOOL_PACKS=all",
      "",
      "Restart OpenCode after changing packs (true hot-load of new packs is not supported).",
    )
    return lines.join("\n")
  },
})
