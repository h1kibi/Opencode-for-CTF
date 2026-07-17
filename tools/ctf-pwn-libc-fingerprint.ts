import { tool } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { readFile, lstat } from "node:fs/promises"
import path from "node:path"
import { safeExec } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function symbolOffset(lines: string[], name: string) {
  const re = new RegExp(`\\b${escapeRegExp(name)}\\b`)
  for (const line of lines) {
    if (!re.test(line)) continue
    const m = line.match(/\b([0-9a-f]{6,16})\b/i)
    if (m) return `0x${m[1]}`
  }
  return "unknown"
}

function extractAscii(buf: Buffer, needle: RegExp, limit = 8) {
  const text = buf.toString("latin1")
  const out: string[] = []
  const lines = text.split(/\x00|\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (needle.test(trimmed)) out.push(trimmed)
    if (out.length >= limit) break
  }
  return out
}

function firstMatch(text: string, re: RegExp) {
  const m = text.match(re)
  return m?.[1]?.trim() || "unknown"
}

export default tool({
  description:
    "CTF pwn libc fingerprint helper: extract sha256, BuildID, release strings, loader/interpreter clues, and compact symbol tuples to identify or compare a libc quickly.",
  args: {
    libc: tool.schema.string().describe("Workspace-relative libc path."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per helper command in ms. Default 6000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const libc = resolveInsideWorkspace(context.directory, args.libc)
    const st = await lstat(libc)
    if (!st.isFile()) throw new Error("libc must be a file")
    const cwd = path.dirname(libc)
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 6000, 30000))
    const raw = await readFile(libc)
    const sha256 = createHash("sha256").update(raw).digest("hex")

    const readelfHeaderR = await safeExec("readelf", ["-h", libc], cwd, timeoutMs)
    const readelfHeader = readelfHeaderR.output
    const readelfNotesR = await safeExec("readelf", ["-n", libc], cwd, timeoutMs)
    const readelfNotes = readelfNotesR.output
    const readelfDynR = await safeExec("readelf", ["-d", libc], cwd, timeoutMs)
    const readelfDyn = readelfDynR.output
    const readelfSymsR = await safeExec("readelf", ["-Ws", libc], cwd, timeoutMs)
    const readelfSyms = readelfSymsR.output
    const nmR = await safeExec("nm", ["-D", libc], cwd, timeoutMs)
    const nmOut = nmR.output
    const fileR = await safeExec("file", [libc], cwd, timeoutMs)
    const fileOut = fileR.output

    const symbolLines = `${readelfSyms}\n${nmOut}`.split(/\r?\n/)
    const keySymbols = {
      __libc_start_main: symbolOffset(symbolLines, "__libc_start_main"),
      system: symbolOffset(symbolLines, "system"),
      puts: symbolOffset(symbolLines, "puts"),
      read: symbolOffset(symbolLines, "read"),
      write: symbolOffset(symbolLines, "write"),
      open: symbolOffset(symbolLines, "open"),
      openat: symbolOffset(symbolLines, "openat"),
      setcontext: symbolOffset(symbolLines, "setcontext"),
      mprotect: symbolOffset(symbolLines, "mprotect"),
      execve: symbolOffset(symbolLines, "execve"),
      __free_hook: symbolOffset(symbolLines, "__free_hook"),
      __malloc_hook: symbolOffset(symbolLines, "__malloc_hook"),
    }

    const releaseStrings = extractAscii(
      raw,
      /(glibc|gnu c library|release version|ubuntu|debian|fedora|build-id|libc\.so\.6)/i,
      12,
    )
    const arch = firstMatch(readelfHeader, /Machine:\s*(.+)/i)
    const elfClass = firstMatch(readelfHeader, /Class:\s*(.+)/i)
    const endian = firstMatch(readelfHeader, /Data:\s*(.+)/i)
    const buildId = firstMatch(readelfNotes, /Build ID:\s*([0-9a-f]+)/i)
    const soname = firstMatch(readelfDyn, /SONAME.*\[(.+?)\]/i)
    const needed = Array.from(readelfDyn.matchAll(/Shared library: \[(.+?)\]/g))
      .map((m) => m[1])
      .slice(0, 8)

    const tuple = [
      keySymbols.__libc_start_main,
      keySymbols.system,
      keySymbols.puts,
      keySymbols.read,
      keySymbols.write,
      keySymbols.open,
      keySymbols.setcontext,
      keySymbols.mprotect,
    ].join(":")

    const payload = {
      libc,
      size: st.size,
      sha256,
      build_id: buildId,
      arch,
      class: elfClass,
      endian,
      soname,
      needed,
      file: fileOut,
      release_strings: releaseStrings,
      key_symbols: keySymbols,
      fingerprint_tuple: tuple,
      notes: [
        "Use sha256 + BuildID first when comparing libc files.",
        "Use the compact fingerprint tuple when exact hashes are unavailable but offsets must be compared quickly.",
        "If a remote leak matches a known __libc_start_main/puts tuple, recheck loader/libc pair before mutating gadgets.",
      ],
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_libc_fingerprint:",
      `libc: ${libc}`,
      `size: ${st.size}`,
      `sha256: ${sha256}`,
      `build_id: ${buildId}`,
      `arch: ${arch}`,
      `class: ${elfClass}`,
      `endian: ${endian}`,
      `soname: ${soname}`,
      "needed:",
      ...(needed.length ? needed.map((x) => `- ${x}`) : ["- none"]),
      "release_strings:",
      ...(releaseStrings.length ? releaseStrings.map((x) => `- ${x}`) : ["- none"]),
      "key_symbols:",
      ...Object.entries(keySymbols).map(([k, v]) => `- ${k}: ${v}`),
      `fingerprint_tuple: ${tuple}`,
      "notes:",
      "- Use sha256 + BuildID first when comparing libc files.",
      "- Use the compact fingerprint tuple when exact hashes are unavailable but offsets must be compared quickly.",
      "- If a remote leak matches a known __libc_start_main/puts tuple, recheck loader/libc pair before mutating gadgets.",
    ].join("\n")
  },
})
