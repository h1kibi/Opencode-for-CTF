import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_PLUGIN_CONFIG,
  isHookEnabled,
  loadPluginConfigWithPath,
  mergePluginConfig,
  resolveConfigCandidates,
} from "../src/plugin-config.js"

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

const tempDirs: string[] = []
const envSnapshot = {
  OPENCODE_CONFIG_DIR: process.env.OPENCODE_CONFIG_DIR,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
}

afterEach(() => {
  process.env.OPENCODE_CONFIG_DIR = envSnapshot.OPENCODE_CONFIG_DIR
  process.env.XDG_CONFIG_HOME = envSnapshot.XDG_CONFIG_HOME
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe("mergePluginConfig", () => {
  it("returns defaults for empty input", () => {
    const cfg = mergePluginConfig({})
    expect(cfg.default_mode).toBe("auto")
    expect(cfg.hashline.enabled).toBe(true)
    expect(cfg.disabled_hooks).toEqual([])
  })

  it("merges disabled hooks and nested flags", () => {
    const cfg = mergePluginConfig({
      default_mode: "fast",
      disabled_hooks: ["permission_auto_allow", "not-a-hook"],
      hashline: { enabled: false },
      team_mode: { enabled: false, max_workers: 3 },
    })
    expect(cfg.default_mode).toBe("fast")
    expect(cfg.team_mode.enabled).toBe(false)
    expect(cfg.team_mode.max_workers).toBe(3)
    expect(cfg.hashline.enabled).toBe(false)
    expect(cfg.disabled_hooks).toContain("permission_auto_allow")
    expect(cfg.disabled_hooks).toContain("hashline")
    expect(cfg.disabled_hooks).not.toContain("not-a-hook")
  })

  it("respects isHookEnabled", () => {
    const cfg = mergePluginConfig({ disabled_hooks: ["chat_params"] })
    expect(isHookEnabled(cfg, "chat_params")).toBe(false)
    expect(isHookEnabled(cfg, "hashline")).toBe(true)
    expect(isHookEnabled(DEFAULT_PLUGIN_CONFIG, "continuation")).toBe(true)
  })

  it("merges ctf_fast_budget independently from continuation", () => {
    const cfg = mergePluginConfig({
      continuation: { enabled: false },
      ctf_fast_budget: { enabled: true, soft_minutes: 30, escalate_on_expiry: false },
    })
    expect(cfg.continuation.enabled).toBe(false)
    expect(cfg.disabled_hooks).toContain("continuation")
    expect(cfg.ctf_fast_budget.enabled).toBe(true)
    expect(cfg.ctf_fast_budget.soft_minutes).toBe(30)
    expect(cfg.ctf_fast_budget.escalate_on_expiry).toBe(false)
  })

  it("clamps and validates ctf_fast_budget soft_minutes", () => {
    expect(mergePluginConfig({ ctf_fast_budget: { soft_minutes: 1 } }).ctf_fast_budget.soft_minutes).toBe(5)
    expect(mergePluginConfig({ ctf_fast_budget: { soft_minutes: 999 } }).ctf_fast_budget.soft_minutes).toBe(120)
    expect(mergePluginConfig({ ctf_fast_budget: { soft_minutes: -1 } }).ctf_fast_budget.soft_minutes).toBe(
      DEFAULT_PLUGIN_CONFIG.ctf_fast_budget.soft_minutes,
    )
  })
})

describe("resolveConfigCandidates", () => {
  it("includes opencode config basenames", () => {
    const paths = resolveConfigCandidates()
    expect(paths.some((p) => p.endsWith("opencode-for-ctf.jsonc"))).toBe(true)
    expect(paths.some((p) => p.endsWith("opencode-for-ctf.json"))).toBe(true)
  })
})

describe("loadPluginConfigWithPath", () => {
  it("loads JSONC with comments and trailing commas", async () => {
    const dir = makeTempDir("ctf-config-jsonc-")
    writeFileSync(
      join(dir, "opencode-for-ctf.jsonc"),
      `{
  // keep fast lane on
  "default_mode": "fast",
  "ctf_fast_budget": {
    "soft_minutes": 30,
  },
}
`,
    )

    const loaded = await loadPluginConfigWithPath(dir)
    expect(loaded.path).toBe(join(dir, "opencode-for-ctf.jsonc"))
    expect(loaded.config.default_mode).toBe("fast")
    expect(loaded.config.ctf_fast_budget.soft_minutes).toBe(30)
  })

  it("falls through from malformed nearest config to a sibling candidate", async () => {
    const dir = makeTempDir("ctf-config-fallback-")
    writeFileSync(join(dir, "opencode-for-ctf.jsonc"), `{ "default_mode": "fast", `)
    writeFileSync(join(dir, "opencode-for-ctf.json"), `{ "default_mode": "expert" }`)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const loaded = await loadPluginConfigWithPath(dir)
    expect(loaded.path).toBe(join(dir, "opencode-for-ctf.json"))
    expect(loaded.config.default_mode).toBe("expert")
    expect(warn).toHaveBeenCalled()
  })

  it("falls back to defaults when every candidate is malformed", async () => {
    const dir = makeTempDir("ctf-config-defaults-")
    writeFileSync(join(dir, "opencode-for-ctf.jsonc"), `{ "default_mode": "fast", `)
    process.env.OPENCODE_CONFIG_DIR = makeTempDir("ctf-config-empty-")
    process.env.XDG_CONFIG_HOME = makeTempDir("ctf-config-xdg-")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const loaded = await loadPluginConfigWithPath(dir)
    expect(loaded.path).toBeNull()
    expect(loaded.config).toEqual(DEFAULT_PLUGIN_CONFIG)
    expect(warn).toHaveBeenCalled()
  })
})
