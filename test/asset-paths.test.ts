import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { resolvePluginRoot } from "../src/asset-paths.ts"

const tempDirs: string[] = []

function tempRoot(prefix: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("resolvePluginRoot layout detection", () => {
  it("resolves a source checkout layout (repo/src)", () => {
    const root = tempRoot("asset-src-")
    expect(resolvePluginRoot(path.join(root, "src"))).toBe(root)
  })

  it("resolves the repo bundle layout (repo/dist/plugin)", () => {
    const root = tempRoot("asset-dist-")
    expect(resolvePluginRoot(path.join(root, "dist", "plugin"))).toBe(root)
  })

  it("resolves the repo bundle with shared chunks (repo/dist/plugin/chunks)", () => {
    const root = tempRoot("asset-dist-chunks-")
    expect(resolvePluginRoot(path.join(root, "dist", "plugin", "chunks"))).toBe(root)
  })

  it("resolves the managed install layout (<config>/opencode-for-ctf/plugin)", () => {
    const root = tempRoot("asset-install-")
    expect(resolvePluginRoot(path.join(root, "opencode-for-ctf", "plugin"))).toBe(path.join(root, "opencode-for-ctf"))
  })

  it("resolves the managed install with shared chunks (<config>/opencode-for-ctf/plugin/chunks)", () => {
    const root = tempRoot("asset-install-chunks-")
    expect(resolvePluginRoot(path.join(root, "opencode-for-ctf", "plugin", "chunks"))).toBe(
      path.join(root, "opencode-for-ctf"),
    )
  })

  it("defaults to the real module directory and resolves to the repo root in source runs", () => {
    // Default argument is SRC_DIR (this repo's src/), so the source layout
    // must resolve to the repository root where rag/ lives.
    expect(path.basename(resolvePluginRoot())).not.toBe("src")
    expect(path.basename(resolvePluginRoot())).not.toBe("chunks")
    expect(path.basename(resolvePluginRoot())).not.toBe("plugin")
  })
})
