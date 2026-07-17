import { mkdir, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const pluginDir = path.join(root, "dist", "plugin")
const toolsDir = path.join(root, "tools")

await rm(pluginDir, { recursive: true, force: true })
await mkdir(pluginDir, { recursive: true })
const entryPoints = { index: path.join(root, "src", "plugin.ts") }
for (const entry of await readdir(toolsDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".ts")) {
    entryPoints[`tools/${entry.name.slice(0, -3)}`] = path.join(toolsDir, entry.name)
  }
}

await build({
  entryPoints,
  outdir: pluginDir,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "bundle",
  entryNames: "[dir]/[name]",
  chunkNames: "chunks/[name]-[hash]",
  sourcemap: false,
  legalComments: "none",
  banner: {
    // Bundled CommonJS dependencies use dynamic require for Node built-ins.
    js: 'import { createRequire as __nodeCreateRequire } from "node:module"; const require = __nodeCreateRequire(import.meta.url);',
  },
})

console.log(`Built plugin and ${(await readdir(path.join(pluginDir, "tools"))).length} bundled tools.`)
