import { fileURLToPath } from "node:url"
import path from "node:path"

const __filename = fileURLToPath(import.meta.url)
const SRC_DIR = path.dirname(__filename)

/**
 * Resolve the plugin root (the directory that contains templates/, skills/,
 * mcp-server/, ...) from the directory this module lives in.
 *
 * Supported layouts:
 * - source checkout:             <repo>/src/asset-paths.ts            -> <repo>
 * - repo bundle:                 <repo>/dist/plugin/index.js          -> <repo>
 * - repo bundle (shared chunks): <repo>/dist/plugin/chunks/chunk-*.js -> <repo>
 * - managed install:             <config>/opencode-for-ctf/plugin/    -> <config>/opencode-for-ctf
 * - managed install (chunks):    <config>/opencode-for-ctf/plugin/chunks/chunk-*.js
 *                                                                     -> <config>/opencode-for-ctf
 *
 * Bundled builds emit shared chunks one level below the plugin dir, so the
 * module dir basename is "chunks" instead of "plugin" there.
 *
 * The `moduleDir` parameter is injectable for tests.
 */
export function resolvePluginRoot(moduleDir: string = SRC_DIR): string {
  if (path.basename(moduleDir) !== "plugin") {
    // Bundled builds emit shared chunks under <root>/plugin/chunks.
    if (path.basename(moduleDir) === "chunks") {
      const parent = path.dirname(path.dirname(moduleDir))
      // Repository bundle: <repo>/dist/plugin/chunks -> root is <repo>.
      if (path.basename(parent) === "dist") return path.resolve(moduleDir, "../../..")
      // Managed install: <config>/opencode-for-ctf/plugin/chunks -> root is <config>/opencode-for-ctf.
      return path.resolve(moduleDir, "../..")
    }
    // Source runs from repo/src (or any other unbundled checkout).
    return path.resolve(moduleDir, "..")
  }

  const parent = path.dirname(moduleDir)
  // Repository bundle runs from repo/dist/plugin.
  if (path.basename(parent) === "dist") return path.resolve(moduleDir, "../..")

  // Managed install runs from <opencode-config>/opencode-for-ctf/plugin.
  return parent
}

export const PLUGIN_ROOT = resolvePluginRoot()

/**
 * Local knowledge retrieval is owned by the external `ctf_rag` MCP server
 * (RAG-Agent), not by this plugin: there is no bundled corpus, no card index,
 * and no lesson/retro store to resolve here any more. The MCP server's paths
 * come from the `CTF_RAG_*` environment variables at activation time.
 * See `src/mcp-server-registry.ts`.
 */
export function templatesDir(): string {
  return path.join(PLUGIN_ROOT, "templates")
}
