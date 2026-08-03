import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { packForTool } from "../src/tool-packs.js"
import { resolveFromDirectoryInsideWorkspace, resolveInsideWorkspace } from "../tools/lib/workspace-path.js"

const PROJECT_ROOT = path.join(fileURLToPath(new URL("..", import.meta.url)))

const LOCAL_HELPER_ALLOWLIST = new Set<string>()

const FOLDER_PACK_EXCEPTIONS = new Map([
  ["tools/web/ctf-source-first-pack.ts", "core"],
  ["tools/web/ctf-source-map-read.ts", "core"],
  ["tools/web/ctf-web-observe.ts", "core"],
  ["tools/web/ctf-whitebox-env-check.ts", "core"],
  ["tools/web/ctf-whitebox-handoff.ts", "core"],
  ["tools/core/ctf-local-harness-verifier.ts", "pwn-heavy"],
  ["tools/java/ctf-java-analyze.ts", "core"],
])

function normalizePath(file: string): string {
  return file.replace(/\\/g, "/")
}

async function listToolSourceFiles(dir = "tools"): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(path.join(PROJECT_ROOT, dir), { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await listToolSourceFiles(file)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) out.push(normalizePath(file))
  }
  return out
}

describe("workspace path helper", () => {
  it("resolves paths inside the workspace and rejects escapes", () => {
    const root = PROJECT_ROOT

    expect(resolveInsideWorkspace(root, ".")).toBe(path.resolve(root))
    expect(resolveInsideWorkspace(root, "work/out")).toContain("work")
    expect(() => resolveInsideWorkspace(root, "../outside")).toThrow(/workspace/)
  })

  it("keeps local resolveInsideWorkspace implementations limited to special default semantics", async () => {
    const files = (await listToolSourceFiles()).filter((file) => file !== "tools/lib/workspace-path.ts")

    const localHelpers: string[] = []
    for (const file of files) {
      const text = await readFile(path.join(PROJECT_ROOT, file), "utf8")
      if (text.includes("function resolveInsideWorkspace")) localHelpers.push(file)
    }

    expect(localHelpers.sort()).toEqual([...LOCAL_HELPER_ALLOWLIST].sort())
  })

  it("keeps tool folder placement aligned with pack classification except documented core-surface bridges", async () => {
    const files = (await listToolSourceFiles()).filter((file) => !file.startsWith("tools/lib/"))
    const mismatches: string[] = []

    for (const file of files) {
      const parts = normalizePath(file).split("/")
      const folder = parts[1]
      const basename = path.basename(file, ".ts")
      const pack = packForTool(basename)
      const allowed = FOLDER_PACK_EXCEPTIONS.get(file)
      if (allowed === pack) continue
      if (
        folder !== pack &&
        !(folder === "forensics" && pack === "forensics-heavy") &&
        !(folder === "pwn" && pack === "pwn-heavy") &&
        !(folder === "web" && pack === "web-heavy") &&
        !(folder === "rev" && pack === "rev-heavy") &&
        !(folder === "android" && pack === "android-dynamic") &&
        !(folder === "core" && pack === "maintenance")
      ) {
        mismatches.push(`${file}: folder=${folder} pack=${pack}`)
      }
    }

    expect(mismatches).toEqual([])
  })

  it("resolves challenge-relative inputs while enforcing the worktree boundary", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ctf-ws-root-"))
    const challenge = path.join(root, "challenge")
    mkdirSync(challenge)
    mkdirSync(path.join(root, "bin"))
    writeFileSync(path.join(root, "bin", "chall"), "x", "utf8")

    expect(resolveFromDirectoryInsideWorkspace(challenge, root, "../bin/chall")).toBe(path.join(root, "bin", "chall"))
    expect(() => resolveFromDirectoryInsideWorkspace(challenge, root, "../../escape")).toThrow(/workspace/)
  })

  it("rejects symlink/junction escapes outside the workspace", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ctf-ws-"))
    const outside = mkdtempSync(path.join(tmpdir(), "ctf-ws-out-"))
    writeFileSync(path.join(outside, "flag.txt"), "flag{leak}", "utf8")
    const linkType = process.platform === "win32" ? "junction" : "dir"
    symlinkSync(outside, path.join(root, "leak"), linkType)

    expect(() => resolveInsideWorkspace(root, "leak/flag.txt")).toThrow(/symlink/)
    expect(() => resolveInsideWorkspace(root, "leak")).toThrow(/symlink/)
    // deep path where the symlink is an intermediate component
    mkdirSync(path.join(root, "sub"))
    symlinkSync(outside, path.join(root, "sub", "hop"), linkType)
    expect(() => resolveInsideWorkspace(root, "sub/hop/flag.txt")).toThrow(/symlink/)
  })

  it("allows symlinks that stay inside the workspace", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ctf-ws-"))
    mkdirSync(path.join(root, "real"))
    writeFileSync(path.join(root, "real", "a.txt"), "x", "utf8")
    const linkType = process.platform === "win32" ? "junction" : "dir"
    symlinkSync(path.join(root, "real"), path.join(root, "alias"), linkType)

    expect(resolveInsideWorkspace(root, "alias/a.txt")).toContain("alias")
  })

  it("keeps accepting normal and not-yet-created paths", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ctf-ws-"))
    expect(resolveInsideWorkspace(root, "work/out")).toContain("work")
    expect(() => resolveInsideWorkspace(root, "../outside")).toThrow(/workspace/)
    expect(() => resolveInsideWorkspace(root, ".")).not.toThrow()
  })
})
