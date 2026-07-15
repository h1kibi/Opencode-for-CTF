import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { inflateRawSync } from "node:zlib"
import crypto from "node:crypto"

const execFile = promisify(execFileCb)
const JNI_RE = /(JNI_OnLoad|RegisterNatives|Java_[A-Za-z0-9_]+|GetStringUTFChars|NewStringUTF|FindClass|GetMethodID|Call(Object|Boolean|Int|Void)Method)/i
const SUSPICIOUS_RE = /(flag|ctf|check|verify|valid|wrong|correct|success|fail|strcmp|strncmp|memcmp|strlen|strstr|AES|DES|RC4|MD5|SHA|base64|xor|encrypt|decrypt|ptrace|TracerPid|frida|xposed|magisk|qemu|emulator|__android_log_print)/i

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; localHeaderOffset: number }
function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`target must stay inside the current workspace: ${input}`)
  return target
}
function u16(buf: Buffer, off: number) { return off + 2 <= buf.length ? buf.readUInt16LE(off) : 0 }
function u32(buf: Buffer, off: number) { return off + 4 <= buf.length ? buf.readUInt32LE(off) : 0 }
function isElf(buf: Buffer) { return buf.length > 4 && buf[0] === 0x7f && buf.subarray(1, 4).toString() === "ELF" }
function listZip(buf: Buffer): ZipEntry[] {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 0x10000 - 22); i--) if (u32(buf, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) return []
  const total = u16(buf, eocd + 10), cdOffset = u32(buf, eocd + 16)
  const entries: ZipEntry[] = []
  let off = cdOffset
  for (let i = 0; i < total && off + 46 <= buf.length; i++) {
    if (u32(buf, off) !== 0x02014b50) break
    const method = u16(buf, off + 10), compressedSize = u32(buf, off + 20), uncompressedSize = u32(buf, off + 24)
    const nameLen = u16(buf, off + 28), extraLen = u16(buf, off + 30), commentLen = u16(buf, off + 32), localHeaderOffset = u32(buf, off + 42)
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString("utf8")
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset })
    off += 46 + nameLen + extraLen + commentLen
  }
  return entries
}
function extractEntry(buf: Buffer, entry: ZipEntry, maxBytes = 30_000_000) {
  if (entry.uncompressedSize > maxBytes) return null
  const off = entry.localHeaderOffset
  if (u32(buf, off) !== 0x04034b50) return null
  const start = off + 30 + u16(buf, off + 26) + u16(buf, off + 28)
  const raw = buf.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return raw
  if (entry.method === 8) return inflateRawSync(raw)
  return null
}
function printableStrings(buf: Buffer, max = 1200) {
  const text = buf.toString("latin1")
  const out: string[] = []
  const re = /[ -~]{4,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) { out.push(m[0]); if (out.length >= max) break }
  return out
}
async function tryExec(cmd: string, args: string[], cwd: string, timeout = 10000) {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { cwd, timeout, maxBuffer: 4 * 1024 * 1024, shell: process.platform === "win32" })
    return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`.trim()
  }
}
function unique(xs: string[]) { return [...new Set(xs)] }
function archFromElf(buf: Buffer) {
  const cls = buf[4] === 2 ? "ELF64" : "ELF32"
  const machine = u16(buf, 18)
  const map: Record<number, string> = { 3: "x86", 40: "arm", 62: "x86_64", 183: "aarch64" }
  return `${cls}/${map[machine] || `machine_0x${machine.toString(16)}`}`
}

export default tool({
  description: "CTF Android native triage: scan APK lib*.so or a single .so for ELF metadata, JNI exports/RegisterNatives, imports, suspicious strings, and next native route.",
  args: {
    target: tool.schema.string().describe("Workspace-relative APK or .so path"),
    maxStrings: tool.schema.number().optional().describe("Maximum suspicious strings per library. Default 80."),
    outDir: tool.schema.string().optional().describe("Workspace-relative artifact directory. Default work/android-native-triage/<target>"),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const raw = await readFile(target)
    const outRel = args.outDir || path.join("work", "android-native-triage", path.basename(target).replace(/[^A-Za-z0-9_.-]/g, "_"))
    const outDir = resolveInsideWorkspace(context.directory, outRel)
    await mkdir(outDir, { recursive: true })
    const maxStrings = Math.max(20, Math.min(args.maxStrings ?? 80, 300))
    const libs: Array<{ name: string; data: Buffer }> = []
    if (isElf(raw)) libs.push({ name: path.basename(target), data: raw })
    else {
      for (const e of listZip(raw).filter((x) => /^lib\/[^/]+\/[^/]+\.so$/.test(x.name))) {
        const data = extractEntry(raw, e)
        if (data && isElf(data)) libs.push({ name: e.name, data })
      }
    }
    const reports = []
    for (const lib of libs.slice(0, 40)) {
      const safeName = lib.name.replace(/[^A-Za-z0-9_.-]/g, "_")
      const libPath = path.join(outDir, safeName)
      await writeFile(libPath, lib.data)
      const strings = printableStrings(lib.data, 3000)
      const jni = unique(strings.filter((s) => JNI_RE.test(s))).slice(0, maxStrings)
      const suspicious = unique(strings.filter((s) => SUSPICIOUS_RE.test(s))).slice(0, maxStrings)
      const readelfDyn = await tryExec("readelf", ["-Ws", libPath], outDir, 10000)
      const nmDyn = await tryExec("nm", ["-D", libPath], outDir, 8000)
      const symbolText = `${readelfDyn}\n${nmDyn}`
      const exportedJni = unique(symbolText.split(/\r?\n/).filter((l) => /JNI_OnLoad|RegisterNatives|Java_/.test(l)).map((l) => l.trim())).slice(0, 80)
      const imported = unique(symbolText.split(/\r?\n/).filter((l) => /UND| U /.test(l) && /(strcmp|strncmp|memcmp|strlen|strstr|__android_log_print|ptrace|open|read|AES|SHA|MD5|JNI)/i.test(l)).map((l) => l.trim())).slice(0, 80)
      reports.push({
        name: lib.name,
        extracted: path.relative(context.directory, libPath),
        sha256: crypto.createHash("sha256").update(lib.data).digest("hex"),
        size: lib.data.length,
        arch: archFromElf(lib.data),
        hasJNIOnLoad: /JNI_OnLoad/.test(`${symbolText}\n${strings.join("\n")}`),
        hasRegisterNatives: /RegisterNatives/.test(`${symbolText}\n${strings.join("\n")}`),
        exportedJni,
        importedInteresting: imported,
        jniStrings: jni,
        suspiciousStrings: suspicious,
      })
    }
    const primary = reports.find((r) => r.hasJNIOnLoad || r.hasRegisterNatives || r.exportedJni.length) || reports.find((r) => r.suspiciousStrings.length) || reports[0]
    const payload = {
      target,
      artifact_dir: outDir,
      library_count: libs.length,
      primary_library: primary?.name || "none",
      route_recommendation: primary ? {
        primarySo: primary.name,
        likelyBoundary: primary.exportedJni[0] || primary.jniStrings.find((s) => /Java_|JNI_OnLoad|RegisterNatives/i.test(s)) || "unknown",
        nextTool: "ctf-elf-slice or IDA/ReVa focused on exported JNI/check/flag strings",
        nextProbe: primary.hasRegisterNatives ? "recover RegisterNatives table and Java native method mapping" : "xref JNI/exported Java_* function and compare/check strings",
      } : { primarySo: "none", likelyBoundary: "none", nextTool: "ctf-apk-triage", nextProbe: "APK has no ELF native libraries" },
      libraries: reports,
    }
    await writeFile(path.join(outDir, "android-native-triage.json"), JSON.stringify(payload, null, 2), "utf8")
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "verdict: android_native_triage",
      `target: ${target}`,
      `library_count: ${libs.length}`,
      `primary_library: ${payload.primary_library}`,
      "libraries:",
      ...(reports.length ? reports.slice(0, 30).map((r) => `- ${r.name} ${r.arch} size=${r.size} JNI_OnLoad=${r.hasJNIOnLoad} RegisterNatives=${r.hasRegisterNatives}`) : ["- none"]),
      "jni_exports_or_register_signals:",
      ...(primary ? [...primary.exportedJni, ...primary.jniStrings].slice(0, 40).map((s) => `- ${s}`) : ["- none"]),
      "interesting_imports:",
      ...(primary?.importedInteresting.length ? primary.importedInteresting.slice(0, 40).map((s) => `- ${s}`) : ["- none"]),
      "suspicious_strings:",
      ...(primary?.suspiciousStrings.length ? primary.suspiciousStrings.slice(0, 60).map((s) => `- ${s}`) : ["- none"]),
      "route_recommendation:",
      `- primarySo: ${payload.route_recommendation.primarySo}`,
      `- likelyBoundary: ${payload.route_recommendation.likelyBoundary}`,
      `- nextTool: ${payload.route_recommendation.nextTool}`,
      `- nextProbe: ${payload.route_recommendation.nextProbe}`,
      "artifacts:",
      `- ${path.relative(context.directory, path.join(outDir, "android-native-triage.json"))}`,
    ].join("\n")
  },
})
