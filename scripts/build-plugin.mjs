import { existsSync } from "node:fs"
import { mkdir, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const pluginDir = path.join(root, "dist", "plugin")
const wireMcpDir = path.join(root, "dist", "wiremcp")
const toolsDir = path.join(root, "tools")
const wireMcpEntry = path.join(root, "mcp-server", "vendor", "WireMCP", "index.js")

async function discoverToolEntries(dir, baseDir = dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "lib") continue
      files.push(...(await discoverToolEntries(path.join(dir, entry.name), baseDir)))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue
    const name = entry.name.slice(0, -3)
    files.push({
      name,
      path: path.join(dir, entry.name),
      relative: path.relative(baseDir, path.join(dir, entry.name)),
    })
  }
  files.sort((a, b) => a.name.localeCompare(b.name) || a.relative.localeCompare(b.relative))

  const seen = new Map()
  for (const file of files) {
    const existing = seen.get(file.name)
    if (existing) throw new Error(`duplicate tool basename "${file.name}": ${existing} and ${file.relative}`)
    seen.set(file.name, file.relative)
  }

  return files
}

await rm(pluginDir, { recursive: true, force: true })
await rm(wireMcpDir, { recursive: true, force: true })
await mkdir(pluginDir, { recursive: true })
await mkdir(wireMcpDir, { recursive: true })
const entryPoints = { index: path.join(root, "src", "plugin.ts") }
for (const entry of await discoverToolEntries(toolsDir)) {
  entryPoints[`tools/${entry.name}`] = entry.path
}

await build({
  entryPoints,
  outdir: pluginDir,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  entryNames: "[dir]/[name]",
  chunkNames: "chunks/[name]-[hash]",
  sourcemap: false,
  legalComments: "none",
  banner: {
    // Bundled CommonJS dependencies use dynamic require for Node built-ins.
    js: 'import { createRequire as __nodeCreateRequire } from "node:module"; const require = __nodeCreateRequire(import.meta.url);',
  },
})

if (existsSync(wireMcpEntry)) {
  await build({
    entryPoints: [wireMcpEntry],
    outfile: path.join(wireMcpDir, "index.js"),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    sourcemap: false,
    legalComments: "none",
  })
}

console.log(
  `Built plugin, ${(await readdir(path.join(pluginDir, "tools"))).length} bundled tools, and managed WireMCP runtime.`,
)
