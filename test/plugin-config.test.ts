import { describe, expect, it } from "vitest"
import {
  DEFAULT_PLUGIN_CONFIG,
  isHookEnabled,
  mergePluginConfig,
  resolveConfigCandidates,
} from "../src/plugin-config.js"

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
})

describe("resolveConfigCandidates", () => {
  it("includes opencode config basenames", () => {
    const paths = resolveConfigCandidates()
    expect(paths.some((p) => p.endsWith("opencode-for-ctf.jsonc"))).toBe(true)
    expect(paths.some((p) => p.endsWith("opencode-for-ctf.json"))).toBe(true)
  })
})
