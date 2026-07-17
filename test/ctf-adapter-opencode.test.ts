import { describe, expect, it } from "vitest"
import {
  agentForMode,
  COMPAT_AGENTS,
  DEFAULT_ENTRY_COMMAND,
  effectiveSolveMode,
  isL0Command,
  PRIMARY_AGENTS,
  decideRoute,
} from "../packages/ctf-adapter-opencode/src/index.js"

describe("ctf-adapter-opencode", () => {
  it("exposes the default /ctf entry and two primaries", () => {
    expect(DEFAULT_ENTRY_COMMAND).toBe("/ctf")
    expect(PRIMARY_AGENTS).toEqual(["ctf-fast", "ctf-expert"])
    expect(COMPAT_AGENTS).toEqual([])
  })

  it("maps modes to primary agents", () => {
    expect(agentForMode("fast")).toBe("ctf-fast")
    expect(agentForMode("expert")).toBe("ctf-expert")
    expect(agentForMode("resume")).toBe("ctf-expert")
  })

  it("effectiveSolveMode applies config when request is auto", () => {
    expect(effectiveSolveMode("auto", "expert")).toBe("expert")
    expect(effectiveSolveMode("fast", "expert")).toBe("fast")
    expect(effectiveSolveMode(undefined, "auto")).toBe("auto")
  })

  it("recognizes L0 commands", () => {
    expect(isL0Command("/ctf")).toBe(true)
    expect(isL0Command("ctf-help")).toBe(true)
    expect(isL0Command("/ctf-pwn-heap-menu-map")).toBe(false)
  })

  it("re-exports the shared router", () => {
    const d = decideRoute({ text: "http://x/ flask", mode: "auto" })
    expect(d.command.startsWith("/ctf")).toBe(true)
  })
})
