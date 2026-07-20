/**
 * opencode-for-ctf setup script.
 *
 * Reads .env and generates opencode.json with resolved paths.
 * Usage: node scripts/setup.mjs
 */

import { copyFile, mkdir, readdir } from "node:fs/promises"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

const ENV_PATH = resolve(ROOT, ".env")
const OUTPUT_PATH = resolve(process.env.OPENCODE_SETUP_OUTPUT || join(ROOT, "opencode.json"))
const CONFIG_DIR = resolve(process.env.OPENCODE_CONFIG_DIR || join(os.homedir(), ".config", "opencode"))

// ── Load .env ──────────────────────────────────────────────────────
function loadEnv(path) {
  const env = {}
  if (!existsSync(path)) {
    console.warn(`[setup] .env not found at ${path}; using process environment.`)
  } else {
    const text = readFileSync(path, "utf-8")
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq === -1) continue
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  }
  return { ...env, ...process.env }
}

// ── Validate ───────────────────────────────────────────────────────
function check(name, value) {
  if (!value) {
    console.error(`[setup] Missing required env var: ${name}`)
    process.exit(1)
  }
}

const env = loadEnv(ENV_PATH)
check("PLUGIN_DIR", env.PLUGIN_DIR)
check("WORKSPACE_DIR", env.WORKSPACE_DIR)

const pluginDir = resolve(env.PLUGIN_DIR)
const workspaceDir = resolve(env.WORKSPACE_DIR)
const ghidraDir = env.GHIDRA_INSTALL_DIR ? resolve(env.GHIDRA_INSTALL_DIR) : ""

// ── Generate opencode.json ─────────────────────────────────────────
const config = {
  $schema: "https://opencode.ai/config.json",
  plugin: [`file:${pluginDir}`],
  default_agent: "ctf-fast",
  small_model: "deepseek/deepseek-v4-flash",
  skills: {
    paths: [join(pluginDir, "skills"), join(pluginDir, "skills-external", "ctf-skills")],
  },
  instructions: [join(pluginDir, "rules", "zh-rules.md"), join(pluginDir, "rules", "en-solve-rules.md")],
  mcp: {
    filesystem: {
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", workspaceDir],
      enabled: true,
    },
  },
}

if (ghidraDir) {
  config.mcp["ReVa"] = {
    type: "local",
    command: ["mcp-reva"],
    environment: { GHIDRA_INSTALL_DIR: ghidraDir },
    enabled: true,
    timeout: 120000,
  }
}

if (env.WIREMCP_LAUNCHER) {
  config.mcp["wireshark-mcp"] = {
    type: "local",
    command: ["python", resolve(env.WIREMCP_LAUNCHER), "--stdio"],
    enabled: true,
  }
}

await mkdir(dirname(OUTPUT_PATH), { recursive: true })
writeFileSync(OUTPUT_PATH, JSON.stringify(config, null, 2), "utf-8")

async function installDefinitions(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true })
  const installed = []
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    const source = join(sourceDir, entry.name)
    const target = join(targetDir, entry.name)
    if (existsSync(target)) {
      if (readFileSync(source, "utf-8") === readFileSync(target, "utf-8")) continue
      if (process.env.OPENCODE_CTF_FORCE !== "1") {
        console.warn(`[setup] preserving existing definition: ${target}`)
        continue
      }
      const backup = `${target}.bak-opencode-for-ctf`
      if (!existsSync(backup)) await copyFile(target, backup)
    }
    await copyFile(source, target)
    installed.push(target)
  }
  return installed
}

const installedAgents = await installDefinitions(join(ROOT, "agents"), join(CONFIG_DIR, "agents"))
const installedCommands = await installDefinitions(join(ROOT, "commands"), join(CONFIG_DIR, "commands"))

console.log(`[setup] Generated ${OUTPUT_PATH}`)
console.log(`[setup] Plugin dir : ${pluginDir}`)
console.log(`[setup] Workspace   : ${workspaceDir}`)
console.log(`[setup] OpenCode config dir: ${CONFIG_DIR}`)
console.log(`[setup] Installed ${installedAgents.length} agents and ${installedCommands.length} commands`)
console.log("")
console.log("[setup] Next steps:")
console.log("  1. Copy or symlink this opencode.json to your OpenCode config directory:")
console.log("     ~/.config/opencode/opencode.jsonc")
console.log("  2. Add your provider (API key) and other MCP servers to that file.")
