import { existsSync } from "node:fs"
import { mkdir, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { discoverToolEntries } from "./lib/tool-discovery.mjs"

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const pluginDir = path.join(root, "dist", "plugin")
const wireMcpDir = path.join(root, "dist", "wiremcp")
const toolsDir = path.join(root, "tools")
const wireMcpEntry = path.join(root, "mcp-server", "vendor", "WireMCP", "index.js")

await rm(pluginDir, { recursive: true, force: true })
await rm(wireMcpDir, { recursive: true, force: true })
await mkdir(pluginDir, { recursive: true })
await mkdir(wireMcpDir, { recursive: true })
const entryPoints = { index: path.join(root, "src", "plugin.ts") }
for (const entry of await discoverToolEntries(toolsDir, { extensions: [".ts"] })) {
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
  alias: {
    // Resolve workspace packages from their public source entrypoints while bundling.
    "ctf-benchmark-core": path.join(root, "packages", "ctf-benchmark-core", "src", "index.ts"),
    "ctf-core": path.join(root, "packages", "ctf-core", "src", "index.ts"),
    // The package's UMD entry keeps dynamic require("./impl/*") calls that
    // cannot be inlined; the install smoke then fails with "Cannot find
    // module './impl/format'". Pin the ESM entry so esbuild bundles it.
    "jsonc-parser": "jsonc-parser/lib/esm/main.js",
  },
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
