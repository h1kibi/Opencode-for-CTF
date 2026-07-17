import { tool } from "@opencode-ai/plugin"
import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { safeExec, execFile } from "./lib/exec-utils.ts"
import path from "node:path"
import { inflateRawSync } from "node:zlib"
import crypto from "node:crypto"

type ZipEntry = {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

const HIGH_SIGNAL =
  /(flag|ctf|check|verify|valid|invalid|success|correct|wrong|fail|serial|license|password|secret|token|key|native|jni|loadLibrary|RegisterNatives|JNI_OnLoad|decrypt|encrypt|decode|encode|base64|xor|aes|des|rc4|md5|sha|frida|xposed|magisk|root|debug|emulator|qemu|TracerPid|dexclassloader|pathclassloader|loadDex|loadClass)/i
const PACKER_SIGNAL =
  /(jiagu|bangcle|ijiami|qihoo|tencent|legu|secneo|baiduprotect|sophix|tinker|protect|packer|DexClassLoader|PathClassLoader|loadDex|payload|libshell|stub|shell)/i

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`target must stay inside the current workspace: ${input}`)
  return target
}

async function exists(cmd: string) {
  try {
    await execFile(cmd, ["--version"], { timeout: 2500, maxBuffer: 128 * 1024, shell: process.platform === "win32" })
    return true
  } catch {
    try {
      await execFile(cmd, [], { timeout: 2500, maxBuffer: 128 * 1024, shell: process.platform === "win32" })
      return true
    } catch {
      return false
    }
  }
}

function u16(buf: Buffer, off: number) {
  return off + 2 <= buf.length ? buf.readUInt16LE(off) : 0
}
function u32(buf: Buffer, off: number) {
  return off + 4 <= buf.length ? buf.readUInt32LE(off) : 0
}

function listZip(buf: Buffer): ZipEntry[] {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 0x10000 - 22); i--) {
    if (u32(buf, i) === 0x06054b50) {
      eocd = i
      break
    }
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

function extractEntry(buf: Buffer, entry: ZipEntry, maxBytes = 5_000_000): Buffer | null {
  const off = entry.localHeaderOffset
  if (u32(buf, off) !== 0x04034b50) return null
  if (entry.uncompressedSize > maxBytes) return null
  const nameLen = u16(buf, off + 26)
  const extraLen = u16(buf, off + 28)
  const start = off + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return raw
  if (entry.method === 8) return inflateRawSync(raw)
  return null
}

function printableStrings(buf: Buffer, max = 500) {
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

function unique<T>(xs: T[]) {
  return [...new Set(xs)]
}
function firstMatch(text: string, re: RegExp) {
  return text.match(re)?.[1]?.trim() || ""
}

function parseAaptBadging(text: string) {
  return {
    package: firstMatch(text, /package:\s+name='([^']+)'/),
    versionCode: firstMatch(text, /versionCode='([^']+)'/),
    versionName: firstMatch(text, /versionName='([^']+)'/),
    minSdk: firstMatch(text, /sdkVersion:'([^']+)'/),
    targetSdk: firstMatch(text, /targetSdkVersion:'([^']+)'/),
    launchableActivity: firstMatch(text, /launchable-activity:\s+name='([^']+)'/),
    permissions: unique([...text.matchAll(/uses-permission:\s+name='([^']+)'/g)].map((m) => m[1])).slice(0, 80),
  }
}

function route(primarySignals: {
  native: boolean
  java: boolean
  packed: boolean
  assets: boolean
  flagLike: boolean
}) {
  if (primarySignals.flagLike)
    return {
      primaryRoute: "direct_flag_or_plaintext",
      confidence: "medium",
      firstProbe: "verify candidate strings before broad reversing",
      fallbackProbe: "ctf-apk-triage with larger maxStrings",
    }
  if (primarySignals.native)
    return {
      primaryRoute: "native_checker",
      confidence: "high",
      firstProbe: "run ctf-android-native-triage on APK or primary lib*.so",
      fallbackProbe: "ctf-elf-slice keyword=JNI|check|flag|verify",
    }
  if (primarySignals.packed)
    return {
      primaryRoute: "packed_or_dynamic_loader",
      confidence: "medium",
      firstProbe: "use adb/logcat/frida or inspect loader classes/assets before full jadx",
      fallbackProbe: "apktool no-src + targeted jadx loader package",
    }
  if (primarySignals.assets)
    return {
      primaryRoute: "assets_or_resource_decode",
      confidence: "medium",
      firstProbe: "extract suspicious assets and scan/decode them",
      fallbackProbe: "targeted jadx for asset open/read/decrypt references",
    }
  if (primarySignals.java)
    return {
      primaryRoute: "java_kotlin_checker",
      confidence: "medium",
      firstProbe: "run ctf-jadx-targeted-slice for check|verify|flag|success|failure",
      fallbackProbe: "apktool smali grep before full jadx",
    }
  return {
    primaryRoute: "unknown_apk_static",
    confidence: "low",
    firstProbe: "targeted dex strings + manifest components, avoid full jadx until route-gated",
    fallbackProbe: "ctf-rev-team if packed/native/multilayer signals grow",
  }
}

export default tool({
  description:
    "CTF Android APK quick triage: package/launch activity/permissions, dex/native/assets/packer/JNI high-signal summary and route recommendation without full JADX.",
  args: {
    target: tool.schema.string().describe("Workspace-relative APK path"),
    maxStrings: tool.schema.number().optional().describe("Maximum high-signal strings to return. Default 120."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative artifact directory. Default work/apk-triage/<apk-name>"),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const buf = await readFile(target)
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex")
    const entries = listZip(buf)
    const maxStrings = Math.max(20, Math.min(args.maxStrings ?? 120, 500))
    const outRel =
      args.outDir || path.join("work", "apk-triage", path.basename(target).replace(/[^A-Za-z0-9_.-]/g, "_"))
    const outDir = resolveInsideWorkspace(context.directory, outRel)
    await mkdir(outDir, { recursive: true })

    const cwd = path.dirname(target)
    const aapt = await safeExec("aapt", ["dump", "badging", target], cwd, 12000)
    const apkanalyzer = await safeExec("apkanalyzer", ["manifest", "print", target], cwd, 12000)
    const apkid = await safeExec("apkid", [target], cwd, 12000)
    const aaptInfo = aapt.ok
      ? parseAaptBadging(aapt.output)
      : {
          package: "",
          versionCode: "",
          versionName: "",
          minSdk: "",
          targetSdk: "",
          launchableActivity: "",
          permissions: [] as string[],
        }

    const dexEntries = entries.filter((e) => /^classes\d*\.dex$/.test(e.name))
    const libEntries = entries.filter((e) => /^lib\/[^/]+\/[^/]+\.so$/.test(e.name))
    const assetEntries = entries.filter((e) => /^(assets|res\/raw|res\/xml)\//.test(e.name))
    const certEntries = entries.filter((e) => /^META-INF\/.+\.(RSA|DSA|EC|SF|MF)$/i.test(e.name))

    const dexStrings: string[] = []
    for (const e of dexEntries.slice(0, 8)) {
      const data = extractEntry(buf, e, 30_000_000)
      if (!data) continue
      dexStrings.push(...printableStrings(data, 2000).filter((s) => HIGH_SIGNAL.test(s)))
    }
    const nativeStrings: string[] = []
    for (const e of libEntries.slice(0, 12)) {
      const data = extractEntry(buf, e, 20_000_000)
      if (!data) continue
      nativeStrings.push(...printableStrings(data, 1200).filter((s) => HIGH_SIGNAL.test(s)))
    }

    const highDex = unique(dexStrings).slice(0, maxStrings)
    const highNative = unique(nativeStrings).slice(0, maxStrings)
    const allHigh = [...highDex, ...highNative, ...assetEntries.map((e) => e.name)].join("\n")

    const loadLibraryCalls = unique(highDex.filter((s) => /loadLibrary|System\.load/i.test(s))).slice(0, 40)
    const suspiciousAssets = assetEntries
      .filter(
        (e) =>
          PACKER_SIGNAL.test(e.name) ||
          /flag|key|secret|payload|dex|so|dat|bin|enc|crypt|base64/i.test(e.name) ||
          e.uncompressedSize > 500_000,
      )
      .slice(0, 80)
    const flagLike = unique(
      [...highDex, ...highNative].filter((s) => /(?:[A-Z0-9_]{2,}\{|flag\{|ctf\{|DASCTF\{|NSSCTF\{|BUUCTF\{)/i.test(s)),
    ).slice(0, 20)
    const packingSignals = unique([
      ...entries
        .map((e) => e.name)
        .filter((n) => PACKER_SIGNAL.test(n) && !/m3_dynamic_|androidx\.dynamicanimation/i.test(n)),
      ...highDex.filter((s) => PACKER_SIGNAL.test(s)),
      ...(apkid.ok ? apkid.output.split(/\r?\n/).filter((l) => PACKER_SIGNAL.test(l)) : []),
    ]).slice(0, 80)

    const nativeLikely =
      libEntries.length > 0 &&
      (/JNI_OnLoad|RegisterNatives|Java_|loadLibrary/i.test(allHigh) ||
        loadLibraryCalls.length > 0 ||
        libEntries.some((e) => /libshell|shell|protect|loader|patch/i.test(e.name)) ||
        suspiciousAssets.some((e) => /extract|payload|dex|dat|so/i.test(e.name)))
    const primary = route({
      native: nativeLikely,
      java: /check|verify|success|correct|wrong|flag|ctf/i.test(allHigh),
      packed: packingSignals.length > 0,
      assets: suspiciousAssets.length > 0,
      flagLike: flagLike.length > 0,
    })

    const payload = {
      target,
      artifact_dir: outDir,
      identity: {
        sha256,
        size: st.size,
        package: aaptInfo.package,
        versionCode: aaptInfo.versionCode,
        versionName: aaptInfo.versionName,
        minSdk: aaptInfo.minSdk,
        targetSdk: aaptInfo.targetSdk,
        launchableActivity: aaptInfo.launchableActivity,
      },
      tool_status: { aapt: aapt.ok, apkanalyzer: apkanalyzer.ok, apkid: apkid.ok },
      manifest: { permissions: aaptInfo.permissions, manifest_summary_available: apkanalyzer.ok },
      dex: {
        dexCount: dexEntries.length,
        dexFiles: dexEntries.map((e) => ({ name: e.name, size: e.uncompressedSize })),
        highValueStrings: highDex.slice(0, maxStrings),
      },
      native: {
        abiList: unique(libEntries.map((e) => e.name.split("/")[1])).sort(),
        soFiles: libEntries.map((e) => ({ name: e.name, size: e.uncompressedSize })),
        loadLibraryCalls,
        suspiciousNativeStrings: highNative.slice(0, maxStrings),
      },
      assets: {
        suspiciousAssets: suspiciousAssets.map((e) => ({ name: e.name, size: e.uncompressedSize })),
        assetCount: assetEntries.length,
        certFiles: certEntries.map((e) => e.name),
      },
      packing: { signals: packingSignals, apkid: apkid.ok ? apkid.output.split(/\r?\n/).slice(0, 40) : [] },
      strings: { flagLike, highSignal: unique([...highDex, ...highNative]).slice(0, maxStrings) },
      route_recommendation: primary,
    }

    await writeFile(path.join(outDir, "apk-triage.json"), JSON.stringify(payload, null, 2), "utf8")
    await writeFile(path.join(outDir, "aapt-badging.txt"), aapt.output || "aapt unavailable or failed", "utf8")
    await writeFile(
      path.join(outDir, "apkanalyzer-manifest.txt"),
      apkanalyzer.output || "apkanalyzer unavailable or failed",
      "utf8",
    )
    await writeFile(
      path.join(outDir, "high-signal-strings.txt"),
      unique([...highDex, ...highNative]).join("\n"),
      "utf8",
    )
    await writeFile(
      path.join(outDir, "zip-entries.txt"),
      entries.map((e) => `${e.uncompressedSize}\t${e.name}`).join("\n"),
      "utf8",
    )

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "verdict: apk_triage",
      `target: ${target}`,
      `sha256: ${sha256}`,
      `package: ${payload.identity.package || "unknown"}`,
      `launchableActivity: ${payload.identity.launchableActivity || "unknown"}`,
      `sdk: min=${payload.identity.minSdk || "?"} target=${payload.identity.targetSdk || "?"}`,
      `dexCount: ${dexEntries.length}`,
      `nativeLibs: ${libEntries.length} (${payload.native.abiList.join(", ") || "none"})`,
      `assets/raw/xml entries: ${assetEntries.length}`,
      `tools: aapt=${aapt.ok ? "ok" : "missing/fail"} apkanalyzer=${apkanalyzer.ok ? "ok" : "missing/fail"} apkid=${apkid.ok ? "ok" : "missing/fail"}`,
      "permissions:",
      ...(aaptInfo.permissions.length
        ? aaptInfo.permissions.slice(0, 30).map((p) => `- ${p}`)
        : ["- unknown/aapt unavailable"]),
      "native_libraries:",
      ...(libEntries.length
        ? libEntries.slice(0, 40).map((e) => `- ${e.name} (${e.uncompressedSize} bytes)`)
        : ["- none"]),
      "loadLibrary_or_loader_signals:",
      ...(loadLibraryCalls.length ? loadLibraryCalls.slice(0, 25).map((s) => `- ${s}`) : ["- none"]),
      "suspicious_assets:",
      ...(suspiciousAssets.length
        ? suspiciousAssets.slice(0, 30).map((e) => `- ${e.name} (${e.uncompressedSize} bytes)`)
        : ["- none"]),
      "packing_signals:",
      ...(packingSignals.length ? packingSignals.slice(0, 30).map((s) => `- ${s}`) : ["- none"]),
      "flag_like_strings:",
      ...(flagLike.length ? flagLike.map((s) => `- ${s}`) : ["- none"]),
      "route_recommendation:",
      `- primaryRoute: ${primary.primaryRoute}`,
      `- confidence: ${primary.confidence}`,
      `- firstProbe: ${primary.firstProbe}`,
      `- fallbackProbe: ${primary.fallbackProbe}`,
      "artifacts:",
      `- ${path.relative(context.directory, path.join(outDir, "apk-triage.json"))}`,
      `- ${path.relative(context.directory, path.join(outDir, "high-signal-strings.txt"))}`,
      `- ${path.relative(context.directory, path.join(outDir, "zip-entries.txt"))}`,
    ].join("\n")
  },
})
