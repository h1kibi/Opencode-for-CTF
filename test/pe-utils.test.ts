import { describe, expect, it } from "vitest"
import {
  entropy,
  parsePe,
  peSectionByRva,
  peSectionTableOffset,
  rebuildHybridPe,
  rebuildPeFromMemory,
  u16,
  u32,
} from "../tools/lib/pe-utils.ts"

function buildMemoryPe(): Buffer {
  const size = 0x2000
  const buf = Buffer.alloc(size)
  buf.write("MZ", 0, "latin1")
  buf.writeUInt32LE(0x40, 0x3c)
  buf.write("PE\0\0", 0x40, "latin1")
  buf.writeUInt16LE(0x8664, 0x44)
  buf.writeUInt16LE(1, 0x46)
  buf.writeUInt16LE(0xf0, 0x54)
  buf.writeUInt16LE(0x22, 0x56)
  buf.writeUInt16LE(0x20b, 0x58)
  buf.writeUInt32LE(0x1000, 0x68)
  buf.writeBigUInt64LE(0x140000000n, 0x70)
  buf.writeUInt32LE(0x1000, 0x78)
  buf.writeUInt32LE(0x200, 0x7c)
  buf.writeUInt32LE(0x2000, 0x90)
  buf.writeUInt32LE(0x200, 0x94)
  buf.writeUInt32LE(0, 0x98)
  const sectionTable = 0x58 + 0xf0
  buf.write(".text\0\0\0", sectionTable, "latin1")
  buf.writeUInt32LE(0x100, sectionTable + 8)
  buf.writeUInt32LE(0x1000, sectionTable + 12)
  buf.writeUInt32LE(0x200, sectionTable + 16)
  buf.writeUInt32LE(0x200, sectionTable + 20)
  buf.writeUInt32LE(0x60000020, sectionTable + 36)
  for (let i = 0; i < 0x100; i++) buf[0x1000 + i] = 0xcc
  return buf
}

describe("PE parse/rebuild", () => {
  it("parses a memory-mapped PE image", () => {
    const pe = parsePe(buildMemoryPe())
    expect(pe).not.toBeNull()
    expect(pe?.pe32Plus).toBe(true)
    expect(pe?.imageBase).toBe(0x140000000)
    expect(pe?.sections[0].name).toBe(".text")
  })

  it("rejects malformed images and keeps primitive reads bounded", () => {
    expect(parsePe(Buffer.from("MZ"))).toBeNull()
    expect(parsePe(Buffer.alloc(0x40))).toBeNull()

    const invalidSignature = buildMemoryPe()
    invalidSignature.write("PX\0\0", 0x40, "latin1")
    expect(parsePe(invalidSignature)).toBeNull()

    expect(u16(Buffer.alloc(1), 0)).toBe(0)
    expect(u32(Buffer.alloc(3), 0)).toBe(0)
    expect(entropy(Buffer.alloc(0))).toBe(0)
  })

  it("locates PE sections by RVA and reports unknown names", () => {
    const pe = parsePe(buildMemoryPe())
    expect(pe).not.toBeNull()
    expect(pe && peSectionByRva(pe, 0x1000)?.name).toBe(".text")
    expect(pe && peSectionByRva(pe, 0x3000)).toBeUndefined()
    expect(pe && peSectionTableOffset(pe, ".missing")).toBe(-1)
  })

  it("rejects invalid images before attempting PE rebuilds", () => {
    expect(() => rebuildPeFromMemory(Buffer.alloc(0))).toThrow(/valid PE header/)
    expect(() => rebuildHybridPe(Buffer.alloc(0), buildMemoryPe())).toThrow(/valid PE files/)
  })
  it("rebuilds a memory image into a file with raw section data", () => {
    const memory = buildMemoryPe()
    const rebuilt = rebuildPeFromMemory(memory)
    expect(rebuilt.subarray(0, 2).toString("latin1")).toBe("MZ")
    const pe = parsePe(rebuilt)
    expect(pe?.sections[0].rawPointer).toBe(0x200)
    expect(pe?.sections[0].rawSize).toBe(0x200)
    expect(rebuilt.subarray(0x200, 0x300).every((byte) => byte === 0xcc)).toBe(true)
  })

  it("hybrid rebuild keeps original headers and replaces executable memory sections", () => {
    const original = buildMemoryPe()
    const memory = buildMemoryPe()
    original[0x10] = 0x58
    const hybrid = rebuildHybridPe(original, memory)
    expect(hybrid.subarray(0, 2).toString("latin1")).toBe("MZ")
    expect(hybrid[0x10]).toBe(0x58)
    expect(hybrid.subarray(0x200, 0x300).every((byte) => byte === 0xcc)).toBe(true)
    const pe = parsePe(hybrid)
    expect(pe?.sections[0].rawPointer).toBe(0x200)
  })
})
