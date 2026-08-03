import { describe, expect, it } from "vitest"
import { packForTool } from "../src/tool-packs.ts"

describe("high capability tool packs", () => {
  it("classifies heavy facade tools separately", () => {
    expect(packForTool("ctf-pwn-stage-harness")).toBe("pwn-heavy")
    expect(packForTool("ctf-pwn-remote-check")).toBe("pwn-heavy")
    expect(packForTool("ctf-web-fuzz-plan")).toBe("web-heavy")
    expect(packForTool("ctf-waf-bypass-plan")).toBe("web-heavy")
    expect(packForTool("ctf-pcap-carve")).toBe("forensics-heavy")
    expect(packForTool("ctf-pcap-extract")).toBe("forensics-heavy")
    expect(packForTool("ctf-stego-triage")).toBe("forensics-heavy")
    expect(packForTool("ctf-web-observe")).toBe("core")
  })
})
