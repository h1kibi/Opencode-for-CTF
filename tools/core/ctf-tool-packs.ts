import { readdir } from "node:fs/promises"
import path from "node:path"
import { tool } from "@opencode-ai/plugin"
import { summarizeFamilyCapabilityMatrix } from "../../src/capabilities/family-capability-view.ts"
import { buildRuntimeCapabilitySummary } from "../../src/capabilities/runtime-capability-summary.ts"
import { PLUGIN_ROOT } from "../../src/asset-paths.ts"
import { listToolNames as discoverToolNames, loadCtfTools } from "../../src/ctf-tools.ts"
import { compatAliasTarget, summarizeToolMetadata, toolMetadata } from "../../src/tool-metadata.ts"
import { diagnoseToolVisibility, summarizeRuntimeToolRegistry } from "../../src/plugin-support.ts"
import { directoryFromContext } from "../lib/workspace-path.ts"
import { EXPERT_TEAM_RUNTIME_TOOLS } from "../../src/expert-readiness.ts"
import { createRuntimeClient } from "../../src/sdk.ts"
import { createTeamTools } from "../../src/team-runtime.ts"
import {
  ALL_TOOL_PACKS,
  DEFAULT_TOOL_PACKS,
  packForTool,
  resolveEnabledPacks,
  summarizePacks,
  toolAllowedForAgent,
} from "../../src/tool-packs.ts"

const FAST_LIGHT_PWN_TOOLS = [
  "ctf-binary-probe",
  "ctf-pwn-check-env",
  "ctf-pwn-fast-skeleton-hints",
  "ctf-pwn-runner",
  "ctf-pwn-offset",
  "ctf-pwn-remote-fingerprint",
  "ctf-python-inline",
] as const

async function listExpectedSkillNames(baseDir?: string): Promise<{ skillFilesPresent: boolean; names: string[] }> {
  const bundled = path.join(PLUGIN_ROOT, "skills")
  const local = baseDir ? path.resolve(baseDir, "skills") : null
  for (const dir of [local, bundled].filter((value): value is string => Boolean(value))) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const names = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
      if (names.length) return { skillFilesPresent: true, names }
    } catch {
      // try next
    }
  }
  return { skillFilesPresent: false, names: [] }
}

export default tool({
  description:
    "Show CTF tool pack status: enabled packs, tools per pack, visibility by agent, and how to enable heavy/maintenance/rare packs. Packs load at plugin startup from opencode-for-ctf.jsonc tool_packs or OPENCODE_CTF_TOOL_PACKS.",
  args: {
    toolName: tool.schema.string().optional().describe("Optional tool basename to classify"),
    agentName: tool.schema
      .string()
      .optional()
      .describe("Optional agent/surface to diagnose, e.g. ctf-fast, ctf-expert, ctf-web, ctf-pwn."),
  },
  async execute(args, context) {
    const directory = directoryFromContext(context)
    const names = await discoverToolNames()
    const byPack = summarizePacks(names)
    const byTier = summarizeToolMetadata(names)
    const loadedConfig = await (await import("../../src/plugin-config.ts")).loadPluginConfigWithPath(directory)
    const enabled = resolveEnabledPacks(
      [...(loadedConfig.config.tool_packs ?? []), ...(loadedConfig.config.expert_tool_packs ?? [])].length
        ? [...(loadedConfig.config.tool_packs ?? []), ...(loadedConfig.config.expert_tool_packs ?? [])]
        : undefined,
    )
    const exportedTools = await loadCtfTools({ packs: [...enabled] })
    // Team controls are created dynamically by the plugin entrypoint rather
    // than discovered from tools/. Recreate the same definitions here so
    // readiness reflects the live runtime registry instead of only static files.
    if (loadedConfig.config.team_mode.enabled) {
      const teamTools = createTeamTools(createRuntimeClient(directory), directory, context.worktree, {
        maxWorkers: loadedConfig.config.team_mode.max_workers,
        maxJobAttempts: loadedConfig.config.team_mode.max_job_attempts,
      })
      for (const name of EXPERT_TEAM_RUNTIME_TOOLS) {
        if (!exportedTools[name] && teamTools[name]) exportedTools[name] = teamTools[name]
      }
    }
    const exportedNames = Object.keys(exportedTools).sort()
    const expectedSkills = await listExpectedSkillNames(directory)
    const summary = summarizeRuntimeToolRegistry({
      configPath: loadedConfig.path,
      enabledPacks: enabled,
      tools: exportedTools,
      teamModeEnabled: loadedConfig.config.team_mode.enabled,
      externalSkillsEnabled: loadedConfig.config.external_skills,
      expectedSkillNames: expectedSkills.names,
      skillFilesPresent: expectedSkills.skillFilesPresent,
    })
    const capabilitySummary = buildRuntimeCapabilitySummary({
      registeredTools: exportedNames,
      enabledPacks: [...enabled],
      teamModeEnabled: loadedConfig.config.team_mode.enabled,
      maxWorkers: loadedConfig.config.team_mode.max_workers,
      toolPacks: loadedConfig.config.tool_packs,
      expertToolPacks: loadedConfig.config.expert_tool_packs,
      configPath: loadedConfig.path,
    })
    const familySummaryText = summarizeFamilyCapabilityMatrix(capabilitySummary.family)
    const diskCtfTools = names.filter((name) => name.startsWith("ctf-") || name.startsWith("archive-")).sort()
    const exportedCtfTools = exportedNames
      .filter((name) => name.startsWith("ctf-") || name.startsWith("archive-"))
      .sort()
    const missingFromRegistry = diskCtfTools.filter((name) => !exportedCtfTools.includes(name))
    const filteredByPack = diskCtfTools.filter((name) => !enabled.has(packForTool(name)))
    const fastVisible = exportedNames.filter((name) => toolAllowedForAgent(name, "ctf-fast")).sort()
    const filteredByFastSurface = exportedCtfTools.filter((name) => !fastVisible.includes(name))
    const fastPwnExpected = [...FAST_LIGHT_PWN_TOOLS]
    const fastPwnExported = fastPwnExpected.filter((name) => exportedNames.includes(name))
    const fastPwnVisible = fastPwnExpected.filter((name) => fastVisible.includes(name))
    const fastPwnMissing = fastPwnExpected.filter((name) => !fastPwnVisible.includes(name))
    const lines: string[] = [
      "CTF tool packs",
      "",
      `enabled: ${[...enabled].sort().join(", ")}`,
      `config_path: ${loadedConfig.path ?? "(defaults)"}`,
      `team_mode.enabled: ${loadedConfig.config.team_mode.enabled ? "true" : "false"}`,
      `external_skills: ${loadedConfig.config.external_skills ? "true" : "false"}`,
      `defaults: ${DEFAULT_TOOL_PACKS.join(", ")}`,
      `all packs: ${ALL_TOOL_PACKS.join(", ")}`,
      `disk ctf tools: ${diskCtfTools.length}`,
      `exported ctf tools: ${exportedCtfTools.length}`,
      `ctf-fast visible tools: ${fastVisible.length}`,
      `ctf-expert visible tools: ${summary.expertVisibleToolCount}`,
      `expert ready: ${capabilitySummary.expertReady ? "yes" : "no"}`,
      `expert readiness: ${capabilitySummary.expertReadinessStatus}`,
      ...(capabilitySummary.expertReadinessReasons.length
        ? [`expert readiness reasons: ${capabilitySummary.expertReadinessReasons.join("; ")}`]
        : []),
      `skill files present: ${summary.skillFilesPresent ? "true" : "false"}`,
      `expected published skills: ${summary.expectedSkillNames?.length ?? 0}`,
      "",
      "counts:",
    ]
    for (const pack of ALL_TOOL_PACKS) {
      const mark = enabled.has(pack) ? "on " : "off"
      lines.push(`  [${mark}] ${pack}: ${byPack[pack].length} tools`)
    }
    lines.push(
      "",
      "fast pwn light tools:",
      `  expected: ${fastPwnExpected.join(", ")}`,
      `  exported: ${fastPwnExported.length ? fastPwnExported.join(", ") : "(none)"}`,
      `  ctf-fast visible: ${fastPwnVisible.length ? fastPwnVisible.join(", ") : "(none)"}`,
    )
    if (fastPwnMissing.length) {
      lines.push("  missing:")
      for (const name of fastPwnMissing) {
        const diagnosis = diagnoseToolVisibility({
          summary,
          toolName: name,
          agentSurface: "ctf-fast",
        })
        lines.push(`    - ${name}: ${diagnosis.category}`)
      }
    }
    lines.push(
      "",
      "skills:",
      `  files_present: ${summary.skillFilesPresent ? "yes" : "no"}`,
      `  external_skills_enabled: ${summary.externalSkillsEnabled ? "yes" : "no"}`,
      `  expected_catalog_entries: ${summary.expectedSkillNames?.length ? summary.expectedSkillNames.join(", ") : "(none)"}`,
      "",
      "family capability summary:",
      familySummaryText,
    )
    if (!summary.externalSkillsEnabled && summary.skillFilesPresent) {
      lines.push(
        "  note: skill files exist on disk, but external_skills is disabled; if subagents report no skills, this is a likely startup/publication gate rather than a permission issue.",
      )
    }
    lines.push("", "tiers:")
    for (const [tier, toolNames] of Object.entries(byTier)) {
      lines.push(`  ${tier}: ${toolNames.length}`)
    }

    const compat = names.filter((name) => compatAliasTarget(name))
    if (compat.length) {
      lines.push("", "compat_aliases:")
      for (const name of compat) lines.push(`  ${name} -> ${compatAliasTarget(name)}`)
    }

    if (args.toolName) {
      const name = args.toolName.replace(/\.(ts|js)$/, "")
      const agentName = args.agentName || "ctf-fast"
      const diagnosis = diagnoseToolVisibility({
        summary,
        toolName: name,
        agentSurface: agentName,
      })
      const meta = toolMetadata(name)
      lines.push("", `tool ${name} -> pack ${packForTool(name)}`)
      lines.push(`tier: ${meta.tier}`)
      lines.push(`effects: ${meta.effects.length ? meta.effects.join(", ") : "(none)"}`)
      lines.push(`requires: ${meta.requires.length ? meta.requires.join(", ") : "(none)"}`)
      if (meta.aliasOf) lines.push(`alias_of: ${meta.aliasOf}`)
      lines.push(`registered this session: ${enabled.has(packForTool(name)) ? "yes" : "no (enable pack + restart)"}`)
      lines.push(`exported in plugin registry: ${exportedNames.includes(name) ? "yes" : "no"}`)
      lines.push(`visible on ctf-fast: ${fastVisible.includes(name) ? "yes" : "no"}`)
      lines.push(`visible on ctf-expert: ${summary.expertVisibleToolNames.includes(name) ? "yes" : "no"}`)
      lines.push(`diagnosed agent: ${agentName}`)
      lines.push(`diagnosis: ${diagnosis.category}`)
      for (const reason of diagnosis.reasons) lines.push(`  because: ${reason}`)
      lines.push(`  next_action: ${diagnosis.nextAction}`)
    }
    if (missingFromRegistry.length) {
      lines.push(
        "",
        `missing from exported registry (${missingFromRegistry.length}): ${missingFromRegistry.join(", ")}`,
      )
    }
    if (filteredByPack.length) {
      lines.push("", `filtered by pack (${filteredByPack.length}): ${filteredByPack.join(", ")}`)
    }
    if (filteredByFastSurface.length) {
      lines.push(
        "",
        `filtered by ctf-fast surface (${filteredByFastSurface.length}): ${filteredByFastSurface.join(", ")}`,
      )
    }
    lines.push(
      "",
      "Architecture:",
      "  - Process registry (startup): tool_packs + expert_tool_packs -> all tools expert may use",
      "  - ctf-fast session: FAST_TOOL_ALLOWLIST filter at tool.execute (subset)",
      "  - /ctf expert route: session surface unlocks full registered set",
      "",
      "Enable rare packs (example opencode-for-ctf.jsonc):",
      '  { "tool_packs": ["core", "web", "pwn", "rev", "crypto", "forensics", "misc"] }',
      '  { "expert_tool_packs": ["pwn-heavy", "web-heavy", "rev-heavy", "java", "forensics-heavy", "maintenance", "android", "android-dynamic", "godot"] }',
      "Or all packs:",
      '  { "tool_packs": ["all"] }',
      "Or env: OPENCODE_CTF_TOOL_PACKS=all",
      "",
      "Restart OpenCode after changing packs (true hot-load of new packs is not supported).",
    )
    return lines.join("\n")
  },
})
