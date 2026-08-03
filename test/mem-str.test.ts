import { describe, expect, it } from "vitest"
import { sanitizeMemoryString, scanAsciiStrings, scanMemoryStrings, scanUtf16Strings } from "../tools/lib/mem-str.ts"

describe("memory string scanning", () => {
  it("scans ASCII strings with byte offsets", () => {
    const buf = Buffer.from("xx CTF{hello} yy")
    const hits = scanAsciiStrings(buf, 4)
    expect(hits).toHaveLength(1)
    expect(hits[0].text).toBe("xx CTF{hello} yy")
    expect(hits[0].offset).toBe(0)
  })

  it("scans UTF-16LE strings and skips interleaved NUL bytes", () => {
    const buf = Buffer.from("CTF{wide}", "utf16le")
    const hits = scanUtf16Strings(buf, true, 4)
    expect(hits).toHaveLength(1)
    expect(hits[0].encoding).toBe("utf16le")
    expect(hits[0].text).toBe("CTF{wide}")
  })

  it("finds UTF-16 strings at odd byte alignment", () => {
    const buf = Buffer.concat([Buffer.from("x"), Buffer.from("CTF{odd}", "utf16le")])
    const hits = scanUtf16Strings(buf, true, 4)
    expect(hits.some((hit) => hit.text === "CTF{odd}" && hit.offset === 1)).toBe(true)
  })

  it("supports pattern and maxHits filtering", () => {
    const buf = Buffer.concat([Buffer.from("CTF{one}"), Buffer.from([0]), Buffer.from("CTF{two}")])
    const hits = scanMemoryStrings(buf, { minLength: 4, pattern: /CTF\{two\}/ })
    expect(hits.map((hit) => hit.text)).toEqual(["CTF{two}"])
  })

  it("sanitizes control characters without losing readable text", () => {
    expect(sanitizeMemoryString("A\u0000B")).toBe("A\\x00B")
  })
})
