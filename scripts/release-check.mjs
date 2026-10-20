import { existsSync } from "node:fs"
import { mkdir, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { repoRoot } from "./lib/opencode-ctf-install.mjs"
import { findForbiddenPackPaths, PACK_REQUIRED_PATHS, PACK_SIZE_WARN, toPosixRel } from "./lib/publish-assets.mjs"

async function readJsonFile(filePath) {
  const source = await readFile(filePath, "utf8")
  return JSON.parse(source.replace(/^\uFEFF/, ""))
}

const packageJson = await readJsonFile(path.join(repoRoot, "package.json"))
const lockJson = await readJsonFile(path.join(repoRoot, "package-lock.json"))
const errors = []
const warnings = []

function shortOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim().slice(0, 6000)
}

async function packInstallSmoke() {
  const tempRoot = path.join(repoRoot, `.tmp-release-pack-smoke-${process.pid}-${Date.now()}`)
  const extractDir = path.join(tempRoot, "extract")
  const configDir = path.join(tempRoot, "config")
  const cacheDir = path.join(tempRoot, "npm-cache")
  try {
    await mkdir(extractDir, { recursive: true })
    await mkdir(configDir, { recursive: true })
    await mkdir(cacheDir, { recursive: true })
    const env = {
      ...process.env,
      npm_config_cache: cacheDir,
      CTF_SKIP_PACK_PROBE: "1",
      CTF_IN_PACK_PROBE: "1",
    }
    const pack = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", tempRoot], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      maxBuffer: 32 * 1024 * 1024,
      env,
    })
    if (pack.status !== 0) throw new Error(`npm pack failed: ${shortOutput(pack) || `exit ${pack.status}`}`)
    const parsed = JSON.parse(pack.stdout)
    const entry = Array.isArray(parsed) ? parsed[0] : parsed
    const filename = entry?.filename
    if (!filename) throw new Error("npm pack did not report a tarball filename")
    const tarball = path.join(tempRoot, filename)
    const extract = spawnSync("tar", ["-xzf", tarball, "-C", extractDir], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
    })
    if (extract.status !== 0) throw new Error(`tar extract failed: ${shortOutput(extract) || `exit ${extract.status}`}`)
    const packageDir = path.join(extractDir, "package")
    const install = spawnSync(process.execPath, ["scripts/install.mjs"], {
      cwd: packageDir,
      encoding: "utf8",
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...env,
        OPENCODE_CONFIG_DIR: configDir,
        OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS: "0",
      },
    })
    if (install.status !== 0) {
      throw new Error(`published package install smoke failed: ${shortOutput(install) || `exit ${install.status}`}`)
    }
    if (!existsSync(path.join(configDir, "opencode-for-ctf.manifest.json"))) {
      throw new Error("published package install smoke did not create the managed manifest")
    }
    console.log("pack install smoke passed")
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

if (packageJson.version !== lockJson.version || packageJson.version !== lockJson.packages?.[""].version) {
  errors.push("package.json and package-lock.json versions must match")
}

for (const file of [
  "README.md",
  "LICENSE",
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
  "mcp-server/README.md",
  "mcp-server/ctf-tools-mcp-server.mjs",
  "mcp-server/launchers/browser.cmd",
  "mcp-server/launchers/cyberchef-mcp.cmd",
  "mcp-server/launchers/ctfd-mcp.cmd",
  "mcp-server/launchers/wiremcp.cmd",
  "mcp-server/vendor/WireMCP/index.js",
  "mcp-server/vendor/WireMCP/package.json",
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
  "LICENSE",
  "README.md",
  "third_party",
]) {
  if (!(packageJson.files ?? []).includes(required)) errors.push(`package files must include: ${required}`)
}

// Local knowledge retrieval is an external MCP server (ctf_rag), so no corpus
// should ship. Re-adding these roots would resurrect the retired implementation.
for (const forbidden of ["rag", "skills-external", "benchmarks", "retros", "patches", "knowledge", "lessons"]) {
  const listed = (packageJson.files ?? []).some((entry) => entry === forbidden || entry.startsWith(`${forbidden}/`))
  if (listed) errors.push(`package files must not include retired knowledge asset root: ${forbidden}`)
}

for (const required of ["runtime/README.md", "runtime/win-env", "runtime/wsl-env"]) {
  if (!(packageJson.files ?? []).includes(required))
    errors.push(`package files must include runtime asset: ${required}`)
}

if (!packageJson.dependencies?.["jsonc-parser"]) errors.push("jsonc-parser must be a runtime dependency")
if (!packageJson.dependencies?.["@modelcontextprotocol/sdk"]) {
  errors.push("@modelcontextprotocol/sdk must be a runtime dependency for MCP lifecycle support")
}
if (!packageJson.dependencies?.zod) errors.push("zod must be a runtime dependency for MCP lifecycle support")
if (!packageJson.dependencies?.["zod-to-json-schema"]) {
  errors.push("zod-to-json-schema must be a runtime dependency for ctf-tools MCP schema export")
}

const engine = packageJson.engines?.node
if (typeof engine !== "string" || !engine.includes("22.20")) {
  errors.push('package engines.node should allow Node 22.20+ (e.g. ">=22.20.0")')
}

// Retired corpus must be absent from the source tree so an install or pack can
// never pick it back up.
for (const retired of ["rag", "skills-external"]) {
  if (existsSync(path.join(repoRoot, retired))) errors.push(`retired knowledge tree must be removed: ${retired}`)
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
        warnings.push(`pack unpacked size ${unpacked} bytes exceeds warn threshold ${PACK_SIZE_WARN.unpackedBytes}`)
      }
      console.log(`pack probe: files=${files.length} compressed=${compressed} unpacked=${unpacked}`)
    } catch (error) {
      errors.push(`failed to parse npm pack --json: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    await packInstallSmoke()
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
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
