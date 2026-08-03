import { describe, expect, it } from "vitest"
import { decodeMaybeUtf16 } from "../tools/lib/exec-utils.ts"

describe("decodeMaybeUtf16", () => {
  it("detects UTF-16LE output without a BOM", () => {
    expect(decodeMaybeUtf16(Buffer.from("CTF{wide}", "utf16le"))).toBe("CTF{wide}")
  })

  it("honors a UTF-16LE BOM", () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("flag", "utf16le")])
    expect(decodeMaybeUtf16(buf)).toBe("flag")
  })

  it("leaves UTF-8 output untouched", () => {
    expect(decodeMaybeUtf16(Buffer.from("upx -d ok", "utf8"))).toBe("upx -d ok")
  })
})
