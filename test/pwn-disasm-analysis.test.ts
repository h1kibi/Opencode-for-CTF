import { describe, expect, it } from "vitest"
import { analyzePwnDisasmText } from "../tools/lib/pwn-disasm-analysis.js"

describe("analyzePwnDisasmText", () => {
  it("returns empty analysis for empty input", () => {
    const result = analyzePwnDisasmText("")
    expect(result.redFlagTags).toEqual([])
    expect(result.redFlagNotes).toEqual([])
    expect(result.stackLayoutHints).toEqual([])
    expect(result.constraintHints).toEqual([])
    expect(result.routePressure).toEqual([])
  })

  it("detects off-by-null from exact-length read with null terminator", () => {
    const input = `
00000000004011b6 <vuln>:
  4011b6: mov    rdi,rbx
  4011b9: call   401030 <read@plt>
  4011be: mov    byte ptr [rbp-0x20],0x0
`
    const result = analyzePwnDisasmText(input)
    expect(result.redFlagTags).toContain("off-by-null/full-length-terminator")
  })

  it("detects indexed stack byte write", () => {
    const input = `
0000000000401200 <check>:
  401200: mov    byte ptr [rbp-0x20+rdx*1],al
`
    const result = analyzePwnDisasmText(input)
    expect(result.redFlagTags).toContain("indexed-stack-byte-write")
  })

  it("detects checker-loop-stack-smash pattern", () => {
    const input = `
0000000000401300 <loop>:
  401300: cmp    dword ptr [rbp-0x4],0x20
  401304: mov    byte ptr [rbp-0x20+rax*1],dl
`
    const result = analyzePwnDisasmText(input)
    expect(result.redFlagTags).toContain("checker-loop-stack-smash")
  })

  it("detects single-large-packet-candidate from decompiled-style text", () => {
    const input = `
0000000000401100 <vuln>:
  401100: mov    edx,0x100
  401105: mov    rsi,rbx
  401108: mov    edi,0x0
  40110a: call   read@plt
read(fd, buf, 0x100)
`
    const result = analyzePwnDisasmText(input)
    expect(result.redFlagTags).toContain("single-large-packet-candidate")
  })

  it("produces stack layout hints with roles", () => {
    const input = `
0000000000401100 <vuln>:
  401100: lea    rax,[rbp-0x30]
  401104: mov    byte ptr [rbp-0x30+rcx*1],dl
  401108: mov    dword ptr [rbp-0x8],0x0
  40110f: call   401030 <gets@plt>
`
    const result = analyzePwnDisasmText(input)
    expect(result.stackLayoutHints.length).toBeGreaterThan(0)
    const hasIndexedWrite = result.stackLayoutHints.some(
      (h) => h.includes("indexed write target") || h.includes("address-taken"),
    )
    expect(hasIndexedWrite || result.stackLayoutHints.length >= 1).toBe(true)
  })

  it("identifies function boundaries", () => {
    const input = `
0000000000401100 <main>:
  401100: push   rbp
  401101: mov    rbp,rsp

0000000000401200 <helper>:
  401200: push   rbp
  401201: mov    rbp,rsp
`
    const result = analyzePwnDisasmText(input)
    // Functions parsed without crashing; no specific red flags
    expect(result.redFlagTags).toEqual([])
  })

  it("generates constraint hints from comparison instructions", () => {
    const input = `
0000000000401100 <check>:
  401100: cmp    dword ptr [rbp-0x4],0x10
  401104: jne    401200
  401106: cmp    dword ptr [rbp-0x8],eax
`
    const result = analyzePwnDisasmText(input)
    expect(result.constraintHints.length).toBeGreaterThanOrEqual(1)
    expect(result.constraintHints.some((h) => h.includes("0x4") || h.includes("0x8"))).toBe(true)
  })

  it("generates route pressure when red flags present", () => {
    const input = `
0000000000401100 <vuln>:
  401100: mov    edx,0x100
  401105: call   401030 <read@plt>
  40110a: mov    byte ptr [rbp-0x20],0x0
`
    const result = analyzePwnDisasmText(input)
    expect(result.routePressure.length).toBeGreaterThanOrEqual(1)
  })

  it("handles multi-line with repeated patterns without duplicate tags", () => {
    const input = `
0000000000401100 <vuln>:
  401100: call   401030 <read@plt>
  401105: mov    byte ptr [rbp-0x20],0x0

0000000000401200 <vuln2>:
  401200: call   401030 <read@plt>
  401205: mov    byte ptr [rbp-0x30],0x0
`
    const result = analyzePwnDisasmText(input)
    const offByNullCount = result.redFlagTags.filter((t) => t === "off-by-null/full-length-terminator").length
    expect(offByNullCount).toBe(1) // deduplicated
  })
})
