import { describe, expect, it } from "vitest"
import { mkdtemp, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { resolveBundledToolsDir } from "../src/ctf-tools.ts"

describe("resolveBundledToolsDir (bundle layout regression)", () => {
  // Regression for the managed-install P0: esbuild `splitting` moves shared
  // modules into plugin/chunks/, which made the old import.meta.url-based
  // resolution look for plugin/chunks/tools and then a non-existent
  // <install-root>/tools, failing the whole plugin load with ENOENT.
  it("finds tools/ next to plugin/index.js when running from chunks/", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-bundle-chunks-"))
    await mkdir(path.join(root, "plugin", "chunks"), { recursive: true })
    await mkdir(path.join(root, "plugin", "tools"), { recursive: true })

    const resolved = await resolveBundledToolsDir(path.join(root, "plugin", "chunks"))
    expect(resolved).toBe(path.join(root, "plugin", "tools"))
  })

  it("finds tools/ next to the entry when running from plugin/ (no splitting)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-bundle-plain-"))
    await mkdir(path.join(root, "plugin", "tools"), { recursive: true })

    const resolved = await resolveBundledToolsDir(path.join(root, "plugin"))
    expect(resolved).toBe(path.join(root, "plugin", "tools"))
  })

  it("returns empty when no bundled tools/ exists (caller falls back to source root)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-bundle-empty-"))
    await mkdir(path.join(root, "src"), { recursive: true })

    expect(await resolveBundledToolsDir(path.join(root, "src"))).toBe("")
  })
})
