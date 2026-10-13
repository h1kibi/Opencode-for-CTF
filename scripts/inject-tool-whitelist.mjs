/**
 * Inject all plugin-exported CTF tools into the opencode.jsonc `tools` whitelist.
 *
 * The OpenCode Config.tools field ({ [key: string]: boolean }) acts as a global
 * tool enable/disable switch.  Plugin tools that are not listed in this map
 * are not exposed as LLM-callable functions, even when the plugin exports them
 * via Hooks.tool.
 *
 * Usage:
 *   node scripts/inject-tool-whitelist.mjs
 *
 * The script reads the current config, computes the tool list from the plugin
 * loader, merges ctf-* / archive-* / anysearch_* / ctf_rag* tools
 * as `true`, and writes back preserving existing config and JSONC comments.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { applyEdits, modify, parse } from "jsonc-parser"
import { loadCtfTools } from "../src/ctf-tools.ts"
import { resolveEnabledPacks } from "../src/tool-packs.ts"

const jsonFormatting = { insertSpaces: true, tabSize: 2, eol: "\n" }

function configDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "."
  return path.join(home, ".config", "opencode")
}

function configPath() {
  const dir = configDir()
  const jsonc = path.join(dir, "opencode.jsonc")
  if (existsSync(jsonc)) return jsonc
  return path.join(dir, "opencode.json")
}

async function exportedPluginToolNames() {
  const enabledPacks = resolveEnabledPacks()
  const tools = await loadCtfTools({ packs: [...enabledPacks] })
  return Object.keys(tools).filter(
    (name) => name.startsWith("ctf-") || name.startsWith("archive-") || name.startsWith("anysearch_") || name.startsWith("ctf_rag"),
  )
}

async function main() {
  const file = configPath()
  if (!existsSync(file)) {
    console.error(`[inject-tools] Config file not found: ${file}`)
    process.exit(1)
  }

  // Backup
  const backup = `${file}.bak.tool-inject-${Date.now()}`
  writeFileSync(backup, readFileSync(file, "utf8"))
  console.log(`[inject-tools] Backup: ${backup}`)

  // Read current config
  const raw = readFileSync(file, "utf8")
  const parsed = parse(raw, [], { allowTrailingComma: true, disallowComments: false })

  // Get current tools map
  const currentTools =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.tools && typeof parsed.tools === "object"
      ? { ...parsed.tools }
      : {}

  // Get exported plugin tool names
  const names = await exportedPluginToolNames()
  console.log(`[inject-tools] Found ${names.length} plugin tools to enable`)

  // Merge: set all plugin tools to true (preserve existing entries)
  let added = 0
  for (const name of names) {
    if (!(name in currentTools)) {
      currentTools[name] = true
      added++
    } else if (currentTools[name] !== true) {
      currentTools[name] = true
      added++
    }
  }

  if (added === 0) {
    console.log("[inject-tools] All plugin tools already enabled — nothing to do")
    rmSync(backup, { force: true })
    return
  }

  console.log(`[inject-tools] Adding/updating ${added} tool entries`)

  // Write using jsonc-parser modify to preserve comments
  let text = raw
  text = applyEdits(text, modify(text, ["tools"], currentTools, { formattingOptions: jsonFormatting }))

  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    writeFileSync(tmp, text.endsWith("\n") ? text : `${text}\n`, "utf8")
    renameSync(tmp, file)
    console.log(`[inject-tools] Updated ${file} with ${Object.keys(currentTools).length} tool entries`)
  } finally {
    try {
      rmSync(tmp, { force: true })
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error("[inject-tools] Fatal:", err)
  process.exit(1)
})
