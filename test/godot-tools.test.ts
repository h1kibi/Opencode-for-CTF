import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

const PROJECT_GODOT = [
  "config_version=5",
  "",
  "[application]",
  'config/name="BabyGame"',
  'run/main_scene="res://scenes/main.tscn"',
  "",
].join("\n")

const MAIN_GD = [
  "extends Node",
  'const SECRET = "flag{godot_secret_in_script}"',
  "func _ready():",
  "\tprint(SECRET)",
  "",
].join("\n")

const MAIN_TSCN = [
  "[gd_scene load_steps=2 format=3]",
  "",
  '[node name="Main" type="Node"]',
  'secret = "flag{tscn_embedded}"',
  "",
].join("\n")

async function makeGodotProject(workspace: string) {
  await mkdir(path.join(workspace, "scripts"), { recursive: true })
  await mkdir(path.join(workspace, "scenes"), { recursive: true })
  await writeFile(path.join(workspace, "project.godot"), PROJECT_GODOT, "utf8")
  await writeFile(path.join(workspace, "scripts", "main.gd"), MAIN_GD, "utf8")
  await writeFile(path.join(workspace, "scenes", "main.tscn"), MAIN_TSCN, "utf8")
}

describe("godot project tools", () => {
  it("groups a GDScript source file into flag-like and internal strings", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-godot-scan")
    try {
      await makeGodotProject(workspace)
      const module = await import("../tools/godot/ctf-godot-gdc-scan.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "scripts/main.gd" }, { directory: workspace, worktree: workspace })

      expect(text.startsWith("CTF_GODOT_GDC_SCAN:")).toBe(true)
      expect(text).toContain(`- size: ${MAIN_GD.length}`)
      expect(text).toContain("- string_count: 4")
      expect(text).toContain("flag_like:")
      expect(text).toContain('const SECRET = "flag{godot_secret_in_script}"')
      expect(text).toContain("next_probe:")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("inventories an unpacked project and surfaces its high-signal strings", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-godot-pack")
    try {
      await makeGodotProject(workspace)
      const module = await import("../tools/godot/ctf-godot-pack-inspect.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "." }, { directory: workspace, worktree: workspace })

      expect(text.startsWith("CTF_GODOT_PACK_INSPECT:")).toBe(true)
      expect(text).toContain("- file_count_inspected: 3")
      expect(text).toContain("- gd_count: 1")
      expect(text).toContain("- scene_count: 1")
      expect(text).toContain("top_targets:")
      expect(text).toMatch(/gd_source scripts[\\/]main\.gd/)
      expect(text).toContain("flag{godot_secret_in_script}")
      expect(text).toContain("flag{tscn_embedded}")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("reads the key fields of a scene resource", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-godot-resource")
    try {
      await makeGodotProject(workspace)
      const module = await import("../tools/godot/ctf-godot-resource-read.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "scenes/main.tscn" }, { directory: workspace, worktree: workspace })

      expect(text.startsWith("CTF_GODOT_RESOURCE_READ:")).toBe(true)
      expect(text).toContain(`- size: ${MAIN_TSCN.length}`)
      expect(text).toContain("- hit_count: 2")
      expect(text).toContain('[node name="Main" type="Node"]')
      expect(text).toContain("next_probe:")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
