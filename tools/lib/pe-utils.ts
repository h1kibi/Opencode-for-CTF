export type PeSection = {
  name: string
  virtualSize: number
  virtualAddress: number
  rawSize: number
  rawPointer: number
  characteristics: number
  entropy: number
}

export type PeInfo = {
  e_lfanew: number
  peOffset: number
  coffOffset: number
  optionalOffset: number
  magic: number
  pe32Plus: boolean
  machine: number
  numberOfSections: number
  sizeOfOptionalHeader: number
  sizeOfHeaders: number
  fileAlignment: number
  sectionAlignment: number
  imageBase: number
  entryPointRva: number
  sizeOfImage: number
  characteristics: number
  sections: PeSection[]
}

export function u16(buf: Buffer, off: number) {
  return off + 2 <= buf.length ? buf.readUInt16LE(off) : 0
}

export function u32(buf: Buffer, off: number) {
  return off + 4 <= buf.length ? buf.readUInt32LE(off) : 0
}

export function entropy(buf: Buffer): number {
  if (!buf.length) return 0
  const counts = new Array(256).fill(0)
  for (const byte of buf) counts[byte]++
  let result = 0
  for (const count of counts) {
    if (!count) continue
    const p = count / buf.length
    result -= p * Math.log2(p)
  }
  return result
}

function align(value: number, alignment: number) {
  if (!alignment) return value
  return Math.ceil(value / alignment) * alignment
}

export function parsePe(buf: Buffer): PeInfo | null {
  if (buf.length < 0x40 || buf.subarray(0, 2).toString("latin1") !== "MZ") return null
  const e_lfanew = u32(buf, 0x3c)
  if (e_lfanew + 0x108 > buf.length || buf.subarray(e_lfanew, e_lfanew + 4).toString("latin1") !== "PE\0\0") return null

  const peOffset = e_lfanew
  const coffOffset = e_lfanew + 4
  const machine = u16(buf, coffOffset)
  const numberOfSections = u16(buf, coffOffset + 2)
  const sizeOfOptionalHeader = u16(buf, coffOffset + 16)
  const characteristics = u16(buf, coffOffset + 18)
  const optionalOffset = coffOffset + 20
  if (optionalOffset + sizeOfOptionalHeader > buf.length) return null

  const magic = u16(buf, optionalOffset)
  const pe32Plus = magic === 0x20b
  const entryPointRva = u32(buf, optionalOffset + 16)
  const imageBase = pe32Plus ? Number(buf.readBigUInt64LE(optionalOffset + 24)) : u32(buf, optionalOffset + 28)
  const sectionAlignment = u32(buf, optionalOffset + 32)
  const fileAlignment = u32(buf, optionalOffset + 36)
  const sizeOfImage = u32(buf, optionalOffset + 56)
  const sizeOfHeaders = u32(buf, optionalOffset + 60)
  const sectionTable = optionalOffset + sizeOfOptionalHeader

  const sections: PeSection[] = []
  for (let i = 0; i < numberOfSections; i++) {
    const off = sectionTable + i * 40
    if (off + 40 > buf.length) break
    const name = buf
      .subarray(off, off + 8)
      .toString("latin1")
      .replace(/\0+$/, "")
    const virtualSize = u32(buf, off + 8)
    const virtualAddress = u32(buf, off + 12)
    const rawSize = u32(buf, off + 16)
    const rawPointer = u32(buf, off + 20)
    const sectionCharacteristics = u32(buf, off + 36)
    const raw = rawPointer && rawSize ? buf.subarray(rawPointer, rawPointer + rawSize) : Buffer.alloc(0)
    sections.push({
      name,
      virtualSize,
      virtualAddress,
      rawSize,
      rawPointer,
      characteristics: sectionCharacteristics,
      entropy: Number(entropy(raw).toFixed(3)),
    })
  }

  return {
    e_lfanew,
    peOffset,
    coffOffset,
    optionalOffset,
    magic,
    pe32Plus,
    machine,
    numberOfSections,
    sizeOfOptionalHeader,
    sizeOfHeaders,
    fileAlignment,
    sectionAlignment,
    imageBase,
    entryPointRva,
    sizeOfImage,
    characteristics,
    sections,
  }
}

/**
 * Rebuild an on-disk PE from a memory image that starts at the PE image base.
 *
 * Memory-mapped PE images use RVA-relative section data instead of raw
 * pointers. The original raw pointers may point into a packed stub or an
 * unrelated area, so this helper reconstructs headers and section storage
 * from virtual addresses.
 */
export function rebuildPeFromMemory(
  image: Buffer,
  options: { fileAlignment?: number; maxSectionBytes?: number } = {},
): Buffer {
  const pe = parsePe(image)
  if (!pe) throw new Error("memory image does not contain a valid PE header at base")

  const fileAlignment = options.fileAlignment ?? (pe.fileAlignment || 0x200)
  const maxSectionBytes = options.maxSectionBytes ?? 512 * 1024 * 1024
  const maxOutputBytes = 1024 * 1024 * 1024
  const headerSize = Math.max(pe.sizeOfHeaders || 0x200, align(0x200, fileAlignment))
  let fileSize = align(headerSize, fileAlignment)
  const sectionFileMap: Array<{ section: PeSection; rawPointer: number; rawSize: number }> = []

  for (const section of pe.sections) {
    const rawPointer = align(fileSize, fileAlignment)
    const rawSize = Math.min(Math.max(section.rawSize, section.virtualSize), maxSectionBytes)
    sectionFileMap.push({ section, rawPointer, rawSize })
    fileSize = rawPointer + rawSize
  }

  if (fileSize > maxOutputBytes) throw new Error(`rebuilt PE would be ${fileSize} bytes; refusing to allocate`)

  const out = Buffer.alloc(fileSize)
  const headerCopy = image.subarray(0, Math.min(headerSize, image.length))
  headerCopy.copy(out, 0)
  if (out.length > headerSize) out.fill(0, headerSize)

  for (const entry of sectionFileMap) {
    const { section, rawPointer, rawSize } = entry
    if (!rawSize) continue
    const src = image.subarray(section.virtualAddress, section.virtualAddress + rawSize)
    src.copy(out, rawPointer)
    // Refresh the section raw pointer/size so normal PE loaders and objdump
    // can consume the rebuilt file without relying on the packed stub.
    const table = peSectionTableOffset(pe, section.name)
    if (table >= 0 && table + 20 <= out.length) {
      out.writeUInt32LE(rawPointer, table + 20)
      out.writeUInt32LE(rawSize, table + 16)
    }
  }

  // A rebuilt memory image should not present a stale checksum.
  if (pe.optionalOffset + 64 <= out.length) {
    out.writeUInt32LE(0, pe.optionalOffset + 64)
  }
  return out
}

export function peSectionTableOffset(pe: PeInfo, name: string): number {
  const sectionTable = pe.optionalOffset + pe.sizeOfOptionalHeader
  for (let i = 0; i < pe.sections.length; i++) {
    if (pe.sections[i].name === name) return sectionTable + i * 40
  }
  return -1
}

export function peSectionByRva(pe: PeInfo, rva: number): PeSection | undefined {
  return pe.sections.find(
    (section) =>
      rva >= section.virtualAddress && rva < section.virtualAddress + Math.max(section.virtualSize, section.rawSize),
  )
}

/**
 * Build a hybrid PE that keeps the original on-disk headers/imports/resources
 * but replaces runtime-unpacked executable sections with data from a memory
 * image. This is the stable analysis form for packed PE: a pure memory rebuild
 * often leaves IAT/ImageBase/metadata in a state that confuses ReVa/Ghidra.
 */
export function rebuildHybridPe(
  original: Buffer,
  memoryImage: Buffer,
  options: {
    fileAlignment?: number
    maxSectionBytes?: number
    preferMemorySections?: Set<string>
  } = {},
): Buffer {
  const originalPe = parsePe(original)
  const memoryPe = parsePe(memoryImage)
  if (!originalPe || !memoryPe) throw new Error("original and memory image must both be valid PE files")

  const fileAlignment = options.fileAlignment ?? (originalPe.fileAlignment || 0x200)
  const maxSectionBytes = options.maxSectionBytes ?? 512 * 1024 * 1024
  const maxOutputBytes = 1024 * 1024 * 1024
  const headerSize = Math.max(originalPe.sizeOfHeaders || 0x200, align(0x200, fileAlignment))
  let fileSize = align(headerSize, fileAlignment)
  const entries: Array<{
    section: PeSection
    source: "original" | "memory"
    rawPointer: number
    rawSize: number
  }> = []

  for (const section of originalPe.sections) {
    const memorySection = memoryPe.sections.find(
      (candidate) => candidate.name === section.name || candidate.virtualAddress === section.virtualAddress,
    )
    const forceMemory = options.preferMemorySections?.has(section.name.toLowerCase())
    const executable = (section.characteristics & 0x20000000) !== 0
    const originalEmpty = section.rawSize === 0
    const memoryHasData = Boolean(memorySection && (memorySection.rawSize > 0 || memorySection.virtualSize > 0))
    const useMemory = memoryHasData && (forceMemory || executable || originalEmpty)
    const rawSize = Math.min(
      useMemory && memorySection
        ? Math.max(section.rawSize, section.virtualSize, memorySection.virtualSize)
        : Math.max(section.rawSize, section.virtualSize),
      maxSectionBytes,
    )
    const rawPointer = align(fileSize, fileAlignment)
    entries.push({ section, source: useMemory ? "memory" : "original", rawPointer, rawSize })
    fileSize = rawPointer + rawSize
  }

  if (fileSize > maxOutputBytes) throw new Error(`hybrid PE would be ${fileSize} bytes; refusing to allocate`)

  const out = Buffer.alloc(fileSize)
  const headerCopy = original.subarray(0, Math.min(headerSize, original.length))
  headerCopy.copy(out, 0)
  if (out.length > headerSize) out.fill(0, headerSize)

  for (const entry of entries) {
    const { section, source, rawPointer, rawSize } = entry
    if (!rawSize) continue
    if (source === "memory") {
      const memorySection = memoryPe.sections.find(
        (candidate) => candidate.name === section.name || candidate.virtualAddress === section.virtualAddress,
      )
      if (memorySection) {
        const src = memoryImage.subarray(memorySection.virtualAddress, memorySection.virtualAddress + rawSize)
        src.copy(out, rawPointer)
      }
    } else {
      const src = original.subarray(section.rawPointer, section.rawPointer + rawSize)
      src.copy(out, rawPointer)
    }
    const table = peSectionTableOffset(originalPe, section.name)
    if (table >= 0 && table + 20 <= out.length) {
      out.writeUInt32LE(rawPointer, table + 20)
      out.writeUInt32LE(rawSize, table + 16)
    }
  }

  if (originalPe.optionalOffset + 64 <= out.length) {
    out.writeUInt32LE(0, originalPe.optionalOffset + 64)
  }
  return out
}
