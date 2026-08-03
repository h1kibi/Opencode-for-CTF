import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { auditConfigHygiene, isSourceCheckoutMinimalConfig } from "../scripts/check-config-hygiene.js"

describe("config hygiene audit", () => {
  it("does not warn about default_agent for the intentional source-checkout minimal config", () => {
    const text = readFileSync("opencode.jsonc", "utf8")
    expect(isSourceCheckoutMinimalConfig(text)).toBe(true)
    expect(auditConfigHygiene(text).map((finding) => finding.message)).not.toContain(
      "default_agent is not explicitly set to ctf-fast",
    )
  })

  it("still warns when an installed-style config omits default_agent", () => {
    const text = `{
  "plugin": ["file:/repo/dist/plugin/index.js"],
  "instructions": [
    "./rules/zh-rules.md",
    "./rules/agent-equipment.md"
  ]
}`
    expect(isSourceCheckoutMinimalConfig(text)).toBe(false)
    expect(auditConfigHygiene(text).map((finding) => finding.message)).toContain(
      "default_agent is not explicitly set to ctf-fast",
    )
  })
})
