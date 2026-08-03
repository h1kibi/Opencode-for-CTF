import { describe, expect, it } from "vitest"
import { decideRoute, probeFileMagic, probeFileTree } from "../packages/ctf-core/src/index.js"

describe("router calibration (§4.6)", () => {
  it("a single ambiguous keyword yields modest confidence, not ~0.95", () => {
    const d = decideRoute({ text: "heap", mode: "auto" })
    expect(d.confidence).toBeLessThan(0.7)
  })

  it("two distinct hard signals force the expert lane", () => {
    const d = decideRoute({ text: "kernel heap exploit", mode: "auto" })
    expect(d.mode).toBe("expert")
  })

  it("strong unambiguous signals still reach the fast lane with calibrated confidence", () => {
    const d = decideRoute({ text: "http://127.0.0.1:8000 flask xss sqli ssrf admin bot", mode: "auto" })
    expect(d.mode).toBe("fast")
    expect(d.category).toBe("web")
    expect(d.confidence).toBeGreaterThan(0.6)
  })

  it("confidence is capped at 0.9 even for overwhelming evidence", () => {
    const d = decideRoute({
      text: "checksec libc ret2libc pwntools ELF heap tcache fsop rop srop shellcode gdb qemu seccomp got plt chall.elf",
      mode: "auto",
    })
    expect(d.confidence).toBeLessThanOrEqual(0.9)
  })

  it("keeps alternates populated for re-routing", () => {
    const d = decideRoute({ text: "pcap with http login and sql error", mode: "auto" })
    expect(d.alternates.length).toBeGreaterThan(0)
  })
})

describe("file probes (§4.6 — attachment-only routing)", () => {
  it("maps extensions to family signals", () => {
    const signals = probeFileTree(["chall.elf", "flag.enc", "dump.pcapng", "photo.png", "readme.txt"])
    expect(signals).toContain("pwn")
    expect(signals).toContain("rev")
    expect(signals).toContain("forensics")
    expect(signals).toContain("stego")
    expect(signals).toContain("pwn-ish-name")
  })

  it("maps magic bytes to binary signals", () => {
    const signals = probeFileMagic([
      { name: "a", hex: "7f454c460102" },
      { name: "b", hex: "504b03041400" },
      { name: "c", hex: "d4c3b2a1" },
    ])
    expect(signals).toContain("elf")
    expect(signals).toContain("zip")
    expect(signals).toContain("pcap")
  })

  it("ignores junk hex and unknown files without crashing", () => {
    expect(probeFileMagic([{ name: "x", hex: "deadbeef" }])).toEqual([])
    expect(probeFileMagic([{ name: "y", hex: "not-hex!" }])).toEqual([])
    expect(probeFileTree([])).toEqual([])
  })

  it("routes an attachment-only challenge via probe signals", () => {
    // No challenge text at all — only an ELF with a pcap attachment.
    const d = decideRoute({
      signals: [...probeFileTree(["chall", "dump.pcap"]), ...probeFileMagic([{ name: "chall", hex: "7f454c46" }])],
      mode: "auto",
    })
    expect(["pwn", "forensics"]).toContain(d.category)
  })
})
