import { tool } from "@opencode-ai/plugin"
import { lstat, open, readFile } from "node:fs/promises"
import { safeExec } from "./lib/exec-utils.ts"
import path from "node:path"
const DEFAULT_INTERESTING =
  /(powershell|cmd\.exe|rundll32|regsvr32|wscript|cscript|mshta|schtasks|winexec|shellexecute|createprocess|loadlibrary|getprocaddress|virtualalloc|virtualprotect|writeprocessmemory|createremotethread|url(download|open)|wininet|ws2_32|http|https|socket|connect|crypt|aes|rc4|xor|base64|mutex|service|registry|autorun|startup|sandbox|vmware|virtualbox|debug)/i

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`target must stay inside the current workspace: ${input}`)
  return target
}

function entropy(buf: Buffer) {
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

function u16(buf: Buffer, off: number) {
  return off + 2 <= buf.length ? buf.readUInt16LE(off) : 0
}
function u32(buf: Buffer, off: number) {
  return off + 4 <= buf.length ? buf.readUInt32LE(off) : 0
}
function i32(buf: Buffer, off: number) {
  return off + 4 <= buf.length ? buf.readInt32LE(off) : 0
}

function machineName(machine: number) {
  const map: Record<number, string> = {
    0x14c: "i386",
    0x8664: "x86_64",
    0x1c0: "arm",
    0xaa64: "aarch64",
  }
  return map[machine] || `0x${machine.toString(16)}`
}

function subsystemName(subsystem: number) {
  const map: Record<number, string> = {
    1: "native",
    2: "windows_gui",
    3: "windows_cui",
    9: "windows_ce",
    10: "efi_application",
    14: "xbox",
  }
  return map[subsystem] || `0x${subsystem.toString(16)}`
}

function characteristicsFlags(ch: number) {
  const flags: string[] = []
  if (ch & 0x2000) flags.push("dll")
  if (ch & 0x0002) flags.push("executable")
  if (ch & 0x0100) flags.push("32bit")
  if (ch & 0x0020) flags.push("large_address_aware")
  return flags
}

function dllCharacteristicsFlags(ch: number) {
  const flags: string[] = []
  if (ch & 0x0040) flags.push("dynamic_base")
  if (ch & 0x0100) flags.push("nx_compat")
  if (ch & 0x0400) flags.push("no_seh")
  if (ch & 0x4000) flags.push("guard_cf")
  if (ch & 0x8000) flags.push("terminal_server_aware")
  return flags
}

function sectionFlags(ch: number) {
  const flags: string[] = []
  if (ch & 0x20000000) flags.push("exec")
  if (ch & 0x40000000) flags.push("read")
  if (ch & 0x80000000) flags.push("write")
  if (ch & 0x02000000) flags.push("discardable")
  return flags.join(",")
}

function printableStrings(buf: Buffer) {
  const text = buf.toString("latin1")
  const matches: Array<{ text: string; offset: number }> = []
  const re = /[ -~]{4,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    matches.push({ text: m[0], offset: m.index })
    if (matches.length >= 400) break
  }
  return matches
}

function compact(s: string, max = 14000) {
  if (s.length <= max) return s
  const head = s.slice(0, Math.floor(max * 0.6))
  const tail = s.slice(s.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${s.length - max} chars]...\n${tail}`
}

function sliceAroundLines(lines: string[], hitIdx: number, radius: number) {
  const start = Math.max(0, hitIdx - radius)
  const end = Math.min(lines.length, hitIdx + radius + 1)
  return lines.slice(start, end)
}

export default tool({
  description:
    "CTF reverse PE slice: extract compact PE metadata, suspicious imports/strings, sections, and keyword-focused disassembly slices without dumping huge outputs.",
  args: {
    target: tool.schema.string().describe("PE file path to inspect"),
    keyword: tool.schema
      .string()
      .optional()
      .describe("Regex keyword for focused string/disasm slices. Default malware/rev high-signal keywords."),
    maxStrings: tool.schema.number().optional().describe("Maximum interesting strings to return. Default 60."),
    disasmRadius: tool.schema.number().optional().describe("Lines around each keyword disasm hit. Default 3."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const buf = await readFile(target)
    if (buf.length < 0x100 || buf.subarray(0, 2).toString() !== "MZ") throw new Error("target is not a PE/MZ file")

    const e_lfanew = u32(buf, 0x3c)
    if (e_lfanew + 0x108 > buf.length || buf.subarray(e_lfanew, e_lfanew + 4).toString() !== "PE\0\0")
      throw new Error("invalid PE header")
    const coff = e_lfanew + 4
    const machine = u16(buf, coff)
    const numberOfSections = u16(buf, coff + 2)
    const timestamp = u32(buf, coff + 4)
    const sizeOfOptionalHeader = u16(buf, coff + 16)
    const characteristics = u16(buf, coff + 18)
    const opt = coff + 20
    const magic = u16(buf, opt)
    const pe32plus = magic === 0x20b
    const entryPoint = u32(buf, opt + 16)
    const imageBase = pe32plus ? Number(buf.readBigUInt64LE(opt + 24)) : u32(buf, opt + 28)
    const subsystem = u16(buf, opt + (pe32plus ? 68 : 68))
    const dllChars = u16(buf, opt + (pe32plus ? 70 : 70))
    const sectionTable = opt + sizeOfOptionalHeader

    const sections: Array<{
      name: string
      vsize: number
      vaddr: number
      rawSize: number
      rawPtr: number
      flags: string
      entropy: number
    }> = []
    for (let i = 0; i < numberOfSections; i++) {
      const off = sectionTable + i * 40
      if (off + 40 > buf.length) break
      const name = buf
        .subarray(off, off + 8)
        .toString("ascii")
        .replace(/\0+$/, "")
      const vsize = u32(buf, off + 8)
      const vaddr = u32(buf, off + 12)
      const rawSize = u32(buf, off + 16)
      const rawPtr = u32(buf, off + 20)
      const chars = u32(buf, off + 36)
      const raw =
        rawPtr && rawSize && rawPtr + rawSize <= buf.length ? buf.subarray(rawPtr, rawPtr + rawSize) : Buffer.alloc(0)
      sections.push({
        name,
        vsize,
        vaddr,
        rawSize,
        rawPtr,
        flags: sectionFlags(chars),
        entropy: Number(entropy(raw).toFixed(3)),
      })
    }

    const kw = args.keyword ? new RegExp(args.keyword, "i") : DEFAULT_INTERESTING
    const maxStrings = Math.max(10, Math.min(args.maxStrings ?? 60, 200))
    const strings = printableStrings(buf)
    const interestingStrings = strings.filter((s) => kw.test(s.text)).slice(0, maxStrings)

    const objdumpHeaders = (await safeExec("objdump", ["-x", target], path.dirname(target), 12000)).output
    const importLines = objdumpHeaders
      .split(/\r?\n/)
      .filter((line) => kw.test(line) || /DLL Name:|Ordinal\/Hint|Import Address Table/i.test(line))
    const suspiciousImports = importLines.filter((line) => kw.test(line)).slice(0, 80)

    const disasm = (await safeExec("objdump", ["-d", target], path.dirname(target), 20000)).output
    const disasmLines = disasm.split(/\r?\n/)
    const disasmHits: string[] = []
    for (let i = 0; i < disasmLines.length; i++) {
      if (!kw.test(disasmLines[i])) continue
      disasmHits.push(sliceAroundLines(disasmLines, i, Math.max(1, Math.min(args.disasmRadius ?? 3, 12))).join("\n"))
      if (disasmHits.length >= 8) break
    }

    const payload = {
      target,
      size: st.size,
      pe: {
        machine: machineName(machine),
        sections: numberOfSections,
        timestamp,
        pe32plus,
        entry_point: `0x${entryPoint.toString(16)}`,
        image_base: `0x${imageBase.toString(16)}`,
        subsystem: subsystemName(subsystem),
        characteristics: characteristicsFlags(characteristics),
        dll_characteristics: dllCharacteristicsFlags(dllChars),
      },
      sections,
      suspicious_imports: suspiciousImports,
      interesting_strings: interestingStrings.map((s) => ({ offset: `0x${s.offset.toString(16)}`, text: s.text })),
      disasm_slices: disasmHits,
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)

    return [
      `target: ${target}`,
      `size: ${st.size}`,
      `machine: ${payload.pe.machine}`,
      `pe32plus: ${payload.pe.pe32plus}`,
      `entry_point: ${payload.pe.entry_point}`,
      `image_base: ${payload.pe.image_base}`,
      `subsystem: ${payload.pe.subsystem}`,
      `characteristics: ${payload.pe.characteristics.join(", ") || "none"}`,
      `dll_characteristics: ${payload.pe.dll_characteristics.join(", ") || "none"}`,
      "sections:",
      ...sections
        .slice(0, 24)
        .map(
          (s) =>
            `- ${s.name}\tvaddr=0x${s.vaddr.toString(16)}\traw=0x${s.rawPtr.toString(16)}\tsize=${s.rawSize}\tflags=${s.flags || "none"}\tentropy=${s.entropy}`,
        ),
      "suspicious_imports:",
      ...(suspiciousImports.length ? suspiciousImports.map((x) => `- ${x}`) : ["- none"]),
      "interesting_strings:",
      ...(interestingStrings.length ? interestingStrings.map((s) => `- ${s.offset}: ${s.text}`) : ["- none"]),
      "disasm_slices:",
      ...(disasmHits.length ? disasmHits.map((x, i) => `--- slice ${i + 1} ---\n${compact(x, 1800)}`) : ["- none"]),
    ].join("\n")
  },
})
