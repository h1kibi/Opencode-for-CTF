import { tool } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { inflateRawSync } from "node:zlib"

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; localHeaderOffset: number }
type MethodMap = { className: string; methodName: string; proto: string; methodIdx: number; codeOff: number; headerEnd: number; insnsEnd: number; codeEnd: number; insnsSize: number }
type Patch = { offset: number; size?: number; old?: string; new?: string; source: string }
type DexLoad = { dex: Buffer; dexName: string; container: string; availableDexEntries: string[] }
type ByteDiff = {
  patchSize: number
  oldBytes: string
  newBytes: string
  dexBytes: string
  oldMatchesDex: boolean | null
  newMatchesDex: boolean | null
  changedByteOffsets: number[]
  codeUnits16: { dex: string[]; old: string[]; next: string[] }
}

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function u16(buf: Buffer, off: number) { return off + 2 <= buf.length ? buf.readUInt16LE(off) : 0 }
function u32(buf: Buffer, off: number) { return off + 4 <= buf.length ? buf.readUInt32LE(off) : 0 }

function readUleb(buf: Buffer, state: { off: number }) {
  let result = 0
  let shift = 0
  for (let i = 0; i < 5; i++) {
    const byte = buf[state.off++] ?? 0
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return result >>> 0
    shift += 7
  }
  return result >>> 0
}

function readString(buf: Buffer, off: number) {
  const state = { off }
  readUleb(buf, state)
  const start = state.off
  let end = start
  while (end < buf.length && buf[end] !== 0) end++
  return buf.subarray(start, end).toString("utf8")
}

function listZip(buf: Buffer): ZipEntry[] {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 0x10000 - 22); i--) {
    if (u32(buf, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error("invalid zip/apk: EOCD not found")
  const total = u16(buf, eocd + 10)
  const cdOffset = u32(buf, eocd + 16)
  const entries: ZipEntry[] = []
  let off = cdOffset
  for (let i = 0; i < total && off + 46 <= buf.length; i++) {
    if (u32(buf, off) !== 0x02014b50) break
    const method = u16(buf, off + 10)
    const compressedSize = u32(buf, off + 20)
    const uncompressedSize = u32(buf, off + 24)
    const nameLen = u16(buf, off + 28)
    const extraLen = u16(buf, off + 30)
    const commentLen = u16(buf, off + 32)
    const localHeaderOffset = u32(buf, off + 42)
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString("utf8")
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset })
    off += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function extractEntry(buf: Buffer, entry: ZipEntry): Buffer | null {
  const off = entry.localHeaderOffset
  if (u32(buf, off) !== 0x04034b50) return null
  const nameLen = u16(buf, off + 26)
  const extraLen = u16(buf, off + 28)
  const start = off + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return raw
  if (entry.method === 8) return inflateRawSync(raw)
  return null
}

async function loadDex(input: string, dexEntry?: string): Promise<DexLoad> {
  const buf = await readFile(input)
  if (buf.subarray(0, 8).toString("latin1").startsWith("dex\n")) return { dex: buf, dexName: path.basename(input), container: input, availableDexEntries: [path.basename(input)] }
  if (/\.(apk|jar|zip)$/i.test(input)) {
    const entries = listZip(buf).filter((entry) => /^classes\d*\.dex$/.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name))
    if (!entries.length) throw new Error("no classes*.dex entry found in archive")
    const selected = dexEntry ? entries.find((entry) => entry.name === dexEntry) : entries[0]
    if (!selected) throw new Error(`requested dexEntry not found: ${dexEntry}`)
    const dex = extractEntry(buf, selected)
    if (!dex) throw new Error(`failed to extract ${selected.name}`)
    return { dex, dexName: selected.name, container: input, availableDexEntries: entries.map((entry) => entry.name) }
  }
  throw new Error("target must be .dex or APK/JAR/ZIP containing classes*.dex")
}

function protoString(dex: Buffer, protoIdsOff: number, protoIdx: number, types: string[]) {
  const off = protoIdsOff + protoIdx * 12
  const returnTypeIdx = u32(dex, off + 4)
  const parametersOff = u32(dex, off + 8)
  const params: string[] = []
  if (parametersOff) {
    const size = u32(dex, parametersOff)
    for (let i = 0; i < size; i++) params.push(types[u16(dex, parametersOff + 4 + i * 2)] || "?")
  }
  return `(${params.join(",")})${types[returnTypeIdx] || "V"}`
}

function buildMethodMap(dex: Buffer): MethodMap[] {
  if (!dex.subarray(0, 4).equals(Buffer.from("dex\n"))) throw new Error("not a dex file")
  const stringIdsSize = u32(dex, 0x38)
  const stringIdsOff = u32(dex, 0x3c)
  const typeIdsSize = u32(dex, 0x40)
  const typeIdsOff = u32(dex, 0x44)
  const protoIdsOff = u32(dex, 0x4c)
  const methodIdsSize = u32(dex, 0x58)
  const methodIdsOff = u32(dex, 0x5c)
  const classDefsSize = u32(dex, 0x60)
  const classDefsOff = u32(dex, 0x64)

  const strings = Array.from({ length: stringIdsSize }, (_, i) => readString(dex, u32(dex, stringIdsOff + i * 4)))
  const types = Array.from({ length: typeIdsSize }, (_, i) => strings[u32(dex, typeIdsOff + i * 4)] || `type_${i}`)
  const methods = Array.from({ length: methodIdsSize }, (_, i) => {
    const off = methodIdsOff + i * 8
    const classIdx = u16(dex, off)
    const protoIdx = u16(dex, off + 2)
    const nameIdx = u32(dex, off + 4)
    return { className: types[classIdx] || `type_${classIdx}`, methodName: strings[nameIdx] || `method_${i}`, proto: protoString(dex, protoIdsOff, protoIdx, types) }
  })

  const out: MethodMap[] = []
  for (let i = 0; i < classDefsSize; i++) {
    const off = classDefsOff + i * 32
    const classIdx = u32(dex, off)
    const className = types[classIdx] || `class_${i}`
    const classDataOff = u32(dex, off + 24)
    if (!classDataOff) continue
    const state = { off: classDataOff }
    const staticFieldsSize = readUleb(dex, state)
    const instanceFieldsSize = readUleb(dex, state)
    const directMethodsSize = readUleb(dex, state)
    const virtualMethodsSize = readUleb(dex, state)
    for (let f = 0, fieldIdx = 0; f < staticFieldsSize + instanceFieldsSize; f++) {
      fieldIdx += readUleb(dex, state)
      readUleb(dex, state)
    }
    for (let kind = 0; kind < 2; kind++) {
      let methodIdx = 0
      const count = kind === 0 ? directMethodsSize : virtualMethodsSize
      for (let m = 0; m < count; m++) {
        methodIdx += readUleb(dex, state)
        readUleb(dex, state)
        const codeOff = readUleb(dex, state)
        if (!codeOff) continue
        const triesSize = u16(dex, codeOff + 6)
        const insnsSize = u32(dex, codeOff + 12)
        const headerEnd = codeOff + 16
        const insnsEnd = headerEnd + insnsSize * 2
        const alignedInsnsEnd = insnsEnd + ((triesSize > 0 && (insnsEnd % 4) !== 0) ? 2 : 0)
        const codeEnd = alignedInsnsEnd
        const method = methods[methodIdx] || { className, methodName: `method_${methodIdx}`, proto: "(...)" }
        out.push({ className, methodName: method.methodName, proto: method.proto, methodIdx, codeOff, headerEnd, insnsEnd, codeEnd, insnsSize })
      }
    }
  }
  return out.sort((a, b) => a.codeOff - b.codeOff)
}

function parseIntLike(value: string | number | undefined | null) {
  if (value === undefined || value === null) return Number.NaN
  if (typeof value === "number") return value
  const raw = String(value).trim()
  if (!raw) return Number.NaN
  return /^0x/i.test(raw) ? Number.parseInt(raw, 16) : Number(raw)
}

function normalizeHexLike(value: string | undefined) {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^[0-9a-fA-F\s:_-]+$/.test(trimmed)) {
    const hex = trimmed.replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "")
    if (hex.length >= 2 && hex.length % 2 === 0) return hex.toLowerCase()
  }
  return undefined
}

function hexToBuf(value: string | undefined) {
  const hex = normalizeHexLike(value)
  return hex ? Buffer.from(hex, "hex") : null
}

function bufHex(buf: Buffer) {
  return buf.toString("hex")
}

function codeUnits16(buf: Buffer) {
  const out: string[] = []
  for (let i = 0; i + 1 < buf.length; i += 2) out.push(`0x${buf.readUInt16LE(i).toString(16).padStart(4, "0")}`)
  if (buf.length % 2 === 1) out.push(`tail_byte:${buf[buf.length - 1].toString(16).padStart(2, "0")}`)
  return out
}

function buildByteDiff(dex: Buffer, patch: Patch): ByteDiff | null {
  const oldBuf = hexToBuf(patch.old)
  const newBuf = hexToBuf(patch.new)
  const inferredSize = patch.size || oldBuf?.length || newBuf?.length || 0
  if (!inferredSize || patch.offset < 0 || patch.offset + inferredSize > dex.length) return null
  const dexSlice = dex.subarray(patch.offset, patch.offset + inferredSize)
  const oldSized = oldBuf ? (oldBuf.length === inferredSize ? oldBuf : oldBuf.subarray(0, inferredSize)) : null
  const newSized = newBuf ? (newBuf.length === inferredSize ? newBuf : newBuf.subarray(0, inferredSize)) : null
  const changedByteOffsets: number[] = []
  for (let i = 0; i < inferredSize; i++) {
    const a = oldSized?.[i]
    const b = newSized?.[i]
    if (a !== undefined && b !== undefined && a !== b) changedByteOffsets.push(i)
  }
  return {
    patchSize: inferredSize,
    oldBytes: oldSized ? bufHex(oldSized) : "",
    newBytes: newSized ? bufHex(newSized) : "",
    dexBytes: bufHex(dexSlice),
    oldMatchesDex: oldSized ? oldSized.equals(dexSlice) : null,
    newMatchesDex: newSized ? newSized.equals(dexSlice) : null,
    changedByteOffsets,
    codeUnits16: {
      dex: codeUnits16(dexSlice),
      old: oldSized ? codeUnits16(oldSized) : [],
      next: newSized ? codeUnits16(newSized) : [],
    },
  }
}

function parsePatchBuffer(buf: Buffer, patchFormat: string) {
  const patches: Patch[] = []
  const fmt = patchFormat.toLowerCase()
  if (fmt === "u32le_pairs" || fmt === "extract_dat_u32le_pairs") {
    for (let off = 0; off + 8 <= buf.length; off += 8) {
      const offset = buf.readUInt32LE(off)
      const size = buf.readUInt32LE(off + 4)
      patches.push({ offset, size, source: fmt })
    }
  }
  return patches
}

function parsePatches(text: string): Patch[] {
  const patches: Patch[] = []
  try {
    const parsed = JSON.parse(text) as unknown
    const rows = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed ? Object.values(parsed as Record<string, unknown>) : []
    for (const row of rows) {
      if (!row || typeof row !== "object") continue
      const item = row as Record<string, unknown>
      const rawOffset = item.offset ?? item.off ?? item.dexOffset ?? item.codeOffset
      if (rawOffset === undefined) continue
      const offset = parseIntLike(rawOffset as string | number | null | undefined)
      if (!Number.isFinite(offset)) continue
      const rawSize = item.size ?? item.length ?? item.len
      patches.push({ offset, size: rawSize === undefined ? undefined : parseIntLike(rawSize as string | number | null | undefined), old: item.old === undefined ? undefined : String(item.old), new: item.new === undefined ? undefined : String(item.new), source: "json" })
    }
  } catch {}

  for (const line of text.split(/\r?\n/)) {
    const offsetMatch = line.match(/(?:offset|off|dexOffset|codeOffset)?\s*[:=]?\s*(0x[0-9a-fA-F]+|\d+)/i)
    if (!offsetMatch) continue
    const sizeMatch = line.match(/(?:size|len|length)\s*[:=]?\s*(0x[0-9a-fA-F]+|\d+)/i)
    const oldMatch = line.match(/(?:old|before)\s*[:=]\s*([0-9a-fA-Fx\s:_-]+)/i)
    const newMatch = line.match(/(?:new|after)\s*[:=]\s*([0-9a-fA-Fx\s:_-]+)/i)
    const offset = parseIntLike(offsetMatch[1])
    const size = sizeMatch ? parseIntLike(sizeMatch[1]) : Number.NaN
    if (Number.isFinite(offset)) patches.push({ offset, size: Number.isFinite(size) ? size : undefined, old: oldMatch?.[1], new: newMatch?.[1], source: "text" })
  }
  return patches.filter((patch, index, arr) => arr.findIndex((other) => other.offset === patch.offset && other.size === patch.size && other.old === patch.old && other.new === patch.new) === index)
}

function findOwner(methods: MethodMap[], patch: Patch) {
  const size = patch.size || 1
  const end = patch.offset + size
  const exact = methods.find((method) => patch.offset >= method.codeOff && end <= method.codeEnd)
  if (exact) {
    const region = end <= exact.headerEnd ? "code_header" : patch.offset >= exact.headerEnd && end <= exact.insnsEnd ? "insns" : "post_insns_or_try_region"
    return { status: "hit_code_item", method: exact, delta: patch.offset - exact.codeOff, region }
  }
  const nearest = methods.reduce<MethodMap | null>((best, method) => {
    if (method.codeOff > patch.offset) return best
    if (!best || method.codeOff > best.codeOff) return method
    return best
  }, null)
  return { status: nearest ? "nearest_before_no_containment" : "no_method_before_offset", method: nearest, delta: nearest ? patch.offset - nearest.codeOff : null, region: "unknown" }
}

export default tool({
  description: "CTF DEX patch mapper: map extract.dat-style dex offsets to class->method code_item owners and patch containment status.",
  args: {
    target: tool.schema.string().describe("Workspace-relative .dex or APK/JAR/ZIP containing classes.dex."),
    dexEntry: tool.schema.string().optional().describe("Optional dex entry inside APK/ZIP, e.g. classes2.dex. Default classes.dex / first entry."),
    patchFile: tool.schema.string().optional().describe("Workspace-relative patch file with text/JSON or supported binary records."),
    patchFormat: tool.schema.string().optional().describe("auto | text | json | u32le_pairs | extract_dat_u32le_pairs. Default auto."),
    patches: tool.schema.string().optional().describe("Inline text/JSON patch records. Use when no patchFile is available."),
    maxRows: tool.schema.number().optional().describe("Maximum rows to print. Default 80."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const patchFormat = (args.patchFormat || "auto").toLowerCase()
    const { dex, dexName, container, availableDexEntries } = await loadDex(target, args.dexEntry)
    const methods = buildMethodMap(dex)
    let patches: Patch[] = []
    if (args.patchFile) {
      const patchBuf = await readFile(resolveInsideWorkspace(context.directory, args.patchFile))
      if (patchFormat === "u32le_pairs" || patchFormat === "extract_dat_u32le_pairs") {
        patches = parsePatchBuffer(patchBuf, patchFormat)
      } else {
        const text = patchBuf.toString("utf8")
        patches = parsePatches(text)
        if (!patches.length && patchFormat === "auto" && patchBuf.length >= 8 && patchBuf.length % 8 === 0) {
          patches = parsePatchBuffer(patchBuf, "u32le_pairs")
        }
      }
    } else if (args.patches) {
      patches = parsePatches(args.patches)
    }
    const mapped = patches.map((patch) => ({ patch, owner: findOwner(methods, patch), diff: buildByteDiff(dex, patch) }))
    const payload = {
      container,
      dexName,
      availableDexEntries,
      dexSize: dex.length,
      methodCodeItems: methods.length,
      patchesSeen: patches.length,
      mapped,
      highSignalMethods: methods.filter((method) => /(main|check|verify|flag|native|patch|decode|decrypt|load)/i.test(`${method.className}.${method.methodName}`)).slice(0, 80),
      limitations: [
        "Maps dex file offsets to code_item owners; it does not prove semantic effect by itself.",
        "Binary patch parsing currently supports simple u32le offset/size pair streams; richer extract.dat layouts still need preprocessing.",
        "This tool now shows byte and 16-bit code-unit diffs, but full smali/opcode semantics should still be confirmed with baksmali or a focused slice.",
      ],
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    const maxRows = Math.max(1, Math.min(200, args.maxRows || 80))
    const lines = [
      "DEX_PATCH_MAP:",
      `- container: ${container}`,
      `- dex: ${dexName}`,
      `- available_dex_entries: ${availableDexEntries.join(", ")}`,
      `- dex_size: ${dex.length}`,
      `- method_code_items: ${methods.length}`,
      `- patches_seen: ${patches.length}`,
      "- mapped_patches:",
      ...mapped.slice(0, maxRows).map((row) => {
        const method = row.owner.method
        const diffSuffix = row.diff
          ? ` dex=${row.diff.dexBytes || "-"} old=${row.diff.oldBytes || "-"} new=${row.diff.newBytes || "-"} old_match=${row.diff.oldMatchesDex === null ? "na" : row.diff.oldMatchesDex} new_match=${row.diff.newMatchesDex === null ? "na" : row.diff.newMatchesDex}`
          : " diff=unavailable"
        return `  - off=0x${row.patch.offset.toString(16)} size=${row.patch.size ?? "?"} status=${row.owner.status} region=${row.owner.region} owner=${method ? `${method.className}->${method.methodName}${method.proto}@0x${method.codeOff.toString(16)}+0x${String(row.owner.delta?.toString(16) ?? "?")}` : "none"}${diffSuffix}`
      }),
      "- patch_code_unit_views:",
      ...mapped.slice(0, Math.min(maxRows, 30)).flatMap((row) => row.diff ? [
        `  - off=0x${row.patch.offset.toString(16)} changed_byte_offsets=${row.diff.changedByteOffsets.join(",") || "none"}`,
        `    dex16=${row.diff.codeUnits16.dex.join(" ") || "-"}`,
        `    old16=${row.diff.codeUnits16.old.join(" ") || "-"}`,
        `    new16=${row.diff.codeUnits16.next.join(" ") || "-"}`,
      ] : []),
      "- high_signal_methods:",
      ...payload.highSignalMethods.slice(0, 30).map((method) => `  - ${method.className}->${method.methodName}${method.proto} code=0x${method.codeOff.toString(16)}..0x${method.codeEnd.toString(16)} insns=${method.insnsSize}`),
    ]
    return lines.join("\n")
  },
})
