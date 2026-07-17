import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"
import { PLUGIN_ROOT } from "../src/asset-paths.ts"
import {
  ALL_TOOL_PACKS,
  DEFAULT_TOOL_PACKS,
  packForTool,
  resolveEnabledPacks,
  summarizePacks,
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
    const lines: string[] = [
      "CTF tool packs",
      "",
      `enabled: ${[...enabled].sort().join(", ")}`,
      `defaults: ${DEFAULT_TOOL_PACKS.join(", ")}`,
      `all packs: ${ALL_TOOL_PACKS.join(", ")}`,
      "",
      "counts:",
    ]
    for (const pack of ALL_TOOL_PACKS) {
      const mark = enabled.has(pack) ? "on " : "off"
      lines.push(`  [${mark}] ${pack}: ${byPack[pack].length} tools`)
    }
    if (args.toolName) {
      const name = args.toolName.replace(/\.(ts|js)$/, "")
      lines.push("", `tool ${name} → pack ${packForTool(name)}`)
      lines.push(
        `registered this session: ${enabled.has(packForTool(name)) ? "yes" : "no (enable pack + restart)"}`,
      )
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
