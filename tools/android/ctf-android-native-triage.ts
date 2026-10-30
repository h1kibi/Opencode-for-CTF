import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { safeExec } from "../lib/exec-utils.ts"
import path from "node:path"
import { listArchiveEntries, readArchiveEntry } from "../lib/archive-utils.ts"
import crypto from "node:crypto"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
const JNI_RE =
  /(JNI_OnLoad|RegisterNatives|Java_[A-Za-z0-9_]+|GetStringUTFChars|NewStringUTF|FindClass|GetMethodID|Call(Object|Boolean|Int|Void)Method)/i
const SUSPICIOUS_RE =
  /(flag|ctf|check|verify|valid|wrong|correct|success|fail|strcmp|strncmp|memcmp|strlen|strstr|AES|DES|RC4|MD5|SHA|base64|xor|encrypt|decrypt|ptrace|TracerPid|frida|xposed|magisk|qemu|emulator|__android_log_print)/i

function isElf(buf: Buffer) {
  return buf.length > 4 && buf[0] === 0x7f && buf.subarray(1, 4).toString() === "ELF"
}
function printableStrings(buf: Buffer, max = 1200) {
  const text = buf.toString("latin1")
  const out: string[] = []
  const re = /[ -~]{4,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(m[0])
    if (out.length >= max) break
  }
  return out
}
function unique(xs: string[]) {
  return [...new Set(xs)]
}

export default tool({
  description:
    "CTF Android native triage: scan APK lib*.so or a single .so for ELF metadata, JNI exports/RegisterNatives, imports, suspicious strings, and next native route.",
  args: {
    target: tool.schema.string().describe("Workspace-relative APK or .so path"),
    maxStrings: tool.schema.number().optional().describe("Maximum suspicious strings per library. Default 80."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative artifact directory. Default work/android-native-triage/<target>"),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const raw = await readFile(target)
    const outRel =
      args.outDir || path.join("work", "android-native-triage", path.basename(target).replace(/[^A-Za-z0-9_.-]/g, "_"))
    const outDir = resolveInsideWorkspace(workspace, outRel)
    await mkdir(outDir, { recursive: true })
    const maxStrings = Math.max(20, Math.min(args.maxStrings ?? 80, 300))
    const libs: Array<{ name: string; data: Buffer }> = []
    if (isElf(raw)) libs.push({ name: path.basename(target), data: raw })
    else {
      for (const e of (await listArchiveEntries(target)).filter((x) => /^lib\/[^/]+\/[^/]+\.so$/.test(x.name))) {
        const data = await readArchiveEntry(target, e.name, workspace, 30_000_000)
        if (isElf(data)) libs.push({ name: e.name, data })
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
      const { output: readelfDyn } = await safeExec("readelf", ["-Ws", libPath], outDir, 10000)
      const { output: nmDyn } = await safeExec("nm", ["-D", libPath], outDir, 8000)
      const symbolText = `${readelfDyn}\n${nmDyn}`
      const exportedJni = unique(
        symbolText
          .split(/\r?\n/)
          .filter((l) => /JNI_OnLoad|RegisterNatives|Java_/.test(l))
          .map((l) => l.trim()),
      ).slice(0, 80)
      const imported = unique(
        symbolText
          .split(/\r?\n/)
          .filter(
            (l) =>
              /UND| U /.test(l) &&
              /(strcmp|strncmp|memcmp|strlen|strstr|__android_log_print|ptrace|open|read|AES|SHA|MD5|JNI)/i.test(l),
          )
          .map((l) => l.trim()),
      ).slice(0, 80)
      reports.push({
        name: lib.name,
        extracted: path.relative(directory, libPath),
        sha256: crypto.createHash("sha256").update(lib.data).digest("hex"),
        size: lib.data.length,
        arch: (await safeExec("file", [libPath], outDir, 8000)).output,
        hasJNIOnLoad: /JNI_OnLoad/.test(`${symbolText}\n${strings.join("\n")}`),
        hasRegisterNatives: /RegisterNatives/.test(`${symbolText}\n${strings.join("\n")}`),
        exportedJni,
        importedInteresting: imported,
        jniStrings: jni,
        suspiciousStrings: suspicious,
      })
    }
    const primary =
      reports.find((r) => r.hasJNIOnLoad || r.hasRegisterNatives || r.exportedJni.length) ||
      reports.find((r) => r.suspiciousStrings.length) ||
      reports[0]
    const payload = {
      target,
      artifact_dir: outDir,
      library_count: libs.length,
      primary_library: primary?.name || "none",
      route_recommendation: primary
        ? {
            primarySo: primary.name,
            likelyBoundary:
              primary.exportedJni[0] ||
              primary.jniStrings.find((s) => /Java_|JNI_OnLoad|RegisterNatives/i.test(s)) ||
              "unknown",
            nextTool: "ctf-elf-slice or ReVa focused on exported JNI/check/flag strings",
            nextProbe: primary.hasRegisterNatives
              ? "recover RegisterNatives table and Java native method mapping"
              : "xref JNI/exported Java_* function and compare/check strings",
          }
        : {
            primarySo: "none",
            likelyBoundary: "none",
            nextTool: "ctf-android-analyze",
            nextProbe: "APK has no ELF native libraries",
          },
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
      ...(reports.length
        ? reports
            .slice(0, 30)
            .map(
              (r) =>
                `- ${r.name} ${r.arch} size=${r.size} JNI_OnLoad=${r.hasJNIOnLoad} RegisterNatives=${r.hasRegisterNatives}`,
            )
        : ["- none"]),
      "jni_exports_or_register_signals:",
      ...(primary ? [...primary.exportedJni, ...primary.jniStrings].slice(0, 40).map((s) => `- ${s}`) : ["- none"]),
      "interesting_imports:",
      ...(primary?.importedInteresting.length
        ? primary.importedInteresting.slice(0, 40).map((s) => `- ${s}`)
        : ["- none"]),
      "suspicious_strings:",
      ...(primary?.suspiciousStrings.length ? primary.suspiciousStrings.slice(0, 60).map((s) => `- ${s}`) : ["- none"]),
      "route_recommendation:",
      `- primarySo: ${payload.route_recommendation.primarySo}`,
      `- likelyBoundary: ${payload.route_recommendation.likelyBoundary}`,
      `- nextTool: ${payload.route_recommendation.nextTool}`,
      `- nextProbe: ${payload.route_recommendation.nextProbe}`,
      "artifacts:",
      `- ${path.relative(directory, path.join(outDir, "android-native-triage.json"))}`,
    ].join("\n")
  },
})
