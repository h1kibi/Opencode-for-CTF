import { describe, expect, it } from "vitest"
import { packForTool } from "../src/tool-packs.ts"

describe("high capability tool packs", () => {
  it("classifies heavy facade tools separately", () => {
    expect(packForTool("ctf-stego-triage")).toBe("forensics-heavy")
    expect(packForTool("ctf-web-observe")).toBe("core")
  })
})
