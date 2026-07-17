import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { repoRoot } from "./lib/opencode-ctf-install.mjs"
import {
  findForbiddenPackPaths,
  PACK_REQUIRED_PATHS,
  PACK_SIZE_WARN,
  toPosixRel,
} from "./lib/publish-assets.mjs"

const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"))
const lockJson = JSON.parse(await readFile(path.join(repoRoot, "package-lock.json"), "utf8"))
const errors = []
const warnings = []

if (packageJson.version !== lockJson.version || packageJson.version !== lockJson.packages?.[""].version) {
  errors.push("package.json and package-lock.json versions must match")
}

for (const file of [
  "README.md",
  "README_EN.md",
  "INSTALL.md",
  "SECURITY.md",
  "LICENSE",
  "CHANGELOG.md",
  "opencode-for-ctf.example.jsonc",
  "third_party/NOTICE.md",
  "scripts/install.mjs",
  "scripts/upgrade.mjs",
  "scripts/uninstall.mjs",
  "scripts/status.mjs",
  "scripts/doctor-install.mjs",
  "scripts/cli.mjs",
  "scripts/build-plugin.mjs",
  "scripts/lib/opencode-ctf-install.mjs",
  "scripts/lib/publish-assets.mjs",
]) {
  if (!existsSync(path.join(repoRoot, file))) errors.push(`missing release file: ${file}`)
}

if (!existsSync(path.join(repoRoot, "dist", "plugin", "index.js"))) {
  errors.push("missing bundled plugin: dist/plugin/index.js; run npm run build:plugin")
}

for (const [name, target] of Object.entries(packageJson.bin ?? {})) {
  if (!existsSync(path.join(repoRoot, target))) errors.push(`missing bin target for ${name}: ${target}`)
}

for (const required of [
  "agents",
  "commands",
  "skills",
  "rules",
  "templates",
  "dist/plugin",
  "scripts/lib",
  "INSTALL.md",
  "LICENSE",
  "SECURITY.md",
  "third_party",
  // Slim knowledge allowlist (do not list bare "knowledge/" — that re-includes card history)
  "knowledge/lessons",
  "knowledge/pwn",
  "knowledge/rev",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json",
  "knowledge/pattern-cards/java-web",
  "knowledge/pattern-cards/pwn-curated.cards.v1.json",
  "knowledge/pattern-cards/synonyms.json",
]) {
  if (!(packageJson.files ?? []).includes(required)) errors.push(`package files must include: ${required}`)
}

// Guard against re-bloating: bare "knowledge" directory entry would ship intermediate cards.
if ((packageJson.files ?? []).includes("knowledge")) {
  errors.push(
    'package files must not list bare "knowledge" (use explicit slim knowledge paths so intermediate cards stay out of the tarball)',
  )
}

// Slim default pack: these must NOT be published as package roots.
for (const forbidden of ["skills-external", "benchmarks", "retros", "patches"]) {
  const listed = (packageJson.files ?? []).some(
    (entry) => entry === forbidden || entry.startsWith(`${forbidden}/`) || entry.startsWith("skills-external/"),
  )
  if (listed) errors.push(`package files must not include non-default asset root: ${forbidden}`)
}

for (const required of [
  "mcp-servers/wireshark-mcp/server.js",
  "mcp-servers/wireshark-mcp/package.json",
  "mcp-servers/packettracer-gui-mcp/server.py",
  "mcp-servers/packettracer-gui-mcp/requirements.txt",
  "runtime/README.md",
  "runtime/win-env",
  "runtime/wsl-env",
]) {
  if (!(packageJson.files ?? []).includes(required)) errors.push(`package files must include runtime asset: ${required}`)
}

if (!packageJson.dependencies?.["jsonc-parser"]) errors.push("jsonc-parser must be a runtime dependency")
if (!packageJson.dependencies?.["@modelcontextprotocol/sdk"]) {
  errors.push("@modelcontextprotocol/sdk must be a runtime dependency for bundled local MCP servers")
}
if (!packageJson.dependencies?.zod) errors.push("zod must be a runtime dependency for bundled local MCP servers")

const engine = packageJson.engines?.node
if (typeof engine !== "string" || !engine.includes("22.20")) {
  errors.push('package engines.node should allow Node 22.20+ (e.g. ">=22.20.0")')
}

// Runtime knowledge surface must exist in the source tree (install / pack inputs).
for (const required of [
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json",
  "knowledge/pattern-cards/java-web/java-web.cards.v1.json",
  "knowledge/pattern-cards/pwn-curated.cards.v1.json",
  "knowledge/pattern-cards/synonyms.json",
]) {
  if (!existsSync(path.join(repoRoot, required))) errors.push(`missing runtime knowledge asset: ${required}`)
}

// Optional: pack dry-run content gate (skip when CTF_SKIP_PACK_PROBE=1 for quick local checks).
// Always use --ignore-scripts so prepack → release-check → pack cannot recurse.
if (process.env.CTF_SKIP_PACK_PROBE !== "1" && process.env.CTF_IN_PACK_PROBE !== "1") {
  process.env.CTF_IN_PACK_PROBE = "1"
  const pack = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CTF_IN_PACK_PROBE: "1", CTF_SKIP_PACK_PROBE: "1" },
  })
  if (pack.status !== 0) {
    errors.push(`npm pack --dry-run --json failed: ${pack.stderr || pack.stdout || `exit ${pack.status}`}`)
  } else {
    try {
      const parsed = JSON.parse(pack.stdout)
      const entry = Array.isArray(parsed) ? parsed[0] : parsed
      const files = (entry?.files ?? []).map((f) => toPosixRel(f.path ?? f))
      const offenders = findForbiddenPackPaths(files)
      if (offenders.length) {
        errors.push(
          `published tarball contains forbidden slim-pack paths (${offenders.length}): ${offenders
            .slice(0, 8)
            .join(", ")}${offenders.length > 8 ? "…" : ""}`,
        )
      }
      for (const required of PACK_REQUIRED_PATHS) {
        const hit = files.some((f) => {
          const n = f.replace(/^package\//, "")
          return n === required || n.endsWith(`/${required}`)
        })
        if (!hit) errors.push(`published tarball missing required path: ${required}`)
      }
      const compressed = Number(entry?.size ?? 0)
      const unpacked = Number(entry?.unpackedSize ?? 0)
      if (compressed > PACK_SIZE_WARN.compressedBytes) {
        warnings.push(
          `pack compressed size ${compressed} bytes exceeds warn threshold ${PACK_SIZE_WARN.compressedBytes}`,
        )
      }
      if (unpacked > PACK_SIZE_WARN.unpackedBytes) {
        warnings.push(
          `pack unpacked size ${unpacked} bytes exceeds warn threshold ${PACK_SIZE_WARN.unpackedBytes}`,
        )
      }
      console.log(`pack probe: files=${files.length} compressed=${compressed} unpacked=${unpacked}`)
    } catch (error) {
      errors.push(`failed to parse npm pack --json: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

if (warnings.length) {
  console.warn(warnings.map((warning) => `release check warn: ${warning}`).join("\n"))
}
if (errors.length) {
  console.error(errors.map((error) => `release check: ${error}`).join("\n"))
  process.exit(1)
}
console.log(`release check passed for ${packageJson.name}@${packageJson.version}`)
