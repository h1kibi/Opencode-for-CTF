import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { safeExec } from "../lib/exec-utils.ts"
import { extractFlagCandidates } from "ctf-core"
import path from "node:path"
import crypto from "node:crypto"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import { listArchiveEntries, readArchiveEntry } from "../lib/archive-utils.ts"

const HIGH_SIGNAL =
  /(flag|ctf|check|verify|valid|invalid|success|correct|wrong|fail|serial|license|password|secret|token|key|native|jni|loadLibrary|RegisterNatives|JNI_OnLoad|decrypt|encrypt|decode|encode|base64|xor|aes|des|rc4|md5|sha|frida|xposed|magisk|root|debug|emulator|qemu|TracerPid|dexclassloader|pathclassloader|loadDex|loadClass)/i
const PACKER_SIGNAL =
  /(jiagu|bangcle|ijiami|qihoo|tencent|legu|secneo|baiduprotect|sophix|tinker|protect|packer|DexClassLoader|PathClassLoader|loadDex|payload|libshell|stub|shell)/i

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
  flagCandidate: boolean
}) {
  if (primarySignals.flagCandidate)
    return {
      primaryRoute: "flag_candidate_or_plaintext",
      confidence: "medium",
      firstProbe: "verify candidate strings before broad reversing",
      fallbackProbe: "ctf-android-analyze with larger maxStrings",
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
      firstProbe: "use adb/logcat/frida or inspect loader classes/assets before static expansion",
      fallbackProbe: "apktool no-src plus targeted loader-class and asset inspection",
    }
  if (primarySignals.assets)
    return {
      primaryRoute: "assets_or_resource_decode",
      confidence: "medium",
      firstProbe: "extract suspicious assets and scan/decode them",
      fallbackProbe: "inspect asset open/read/decrypt references in bytecode or smali",
    }
  if (primarySignals.java)
    return {
      primaryRoute: "java_kotlin_checker",
      confidence: "medium",
      firstProbe: "run ctf-java-analyze and inspect only check|verify|flag|success|failure targets",
      fallbackProbe: "use apktool smali output and ctf-dex-patch-map for focused owner methods",
    }
  return {
    primaryRoute: "unknown_apk_static",
    confidence: "low",
    firstProbe: "targeted dex strings + manifest components, then choose a route-specific analyzer",
    fallbackProbe: "ctf-rev-team if packed/native/multilayer signals grow",
  }
}

export default tool({
  description:
    "CTF Android APK quick triage: package/launch activity/permissions, dex/native/assets/packer/JNI high-signal summary and route recommendation.",
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
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const buf = await readFile(target)
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex")
    const entries = (await listArchiveEntries(target)).map((entry) => ({
      ...entry,
      method: 0,
      compressedSize: entry.size ?? 0,
      uncompressedSize: entry.size ?? 0,
      localHeaderOffset: 0,
    }))
    const maxStrings = Math.max(20, Math.min(args.maxStrings ?? 120, 500))
    const outRel =
      args.outDir || path.join("work", "apk-triage", path.basename(target).replace(/[^A-Za-z0-9_.-]/g, "_"))
    const outDir = resolveInsideWorkspace(workspace, outRel)
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
      const data = await readArchiveEntry(target, e.name, workspace, 30_000_000)
      dexStrings.push(...printableStrings(data, 2000).filter((s) => HIGH_SIGNAL.test(s)))
    }
    const nativeStrings: string[] = []
    for (const e of libEntries.slice(0, 12)) {
      const data = await readArchiveEntry(target, e.name, workspace, 20_000_000)
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
    const flagLikeStrings = unique(
      [...highDex, ...highNative].filter((s) => /(?:[A-Z0-9_]{2,}\{|flag\{|ctf\{|DASCTF\{|NSSCTF\{|BUUCTF\{)/i.test(s)),
    ).slice(0, 20)
    const flagCandidateText = [...highDex, ...highNative].join("\n")
    const flagCandidates = extractFlagCandidates(flagCandidateText, {
      source: target,
      origin: "apk-strings",
      text: flagCandidateText,
    }).slice(0, 20)
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
      flagCandidate: flagCandidates.length > 0,
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
      strings: {
        // Compatibility alias: this is an unverified hint list, never a success signal.
        flagLike: flagLikeStrings,
        flagLikeStrings,
        flag_candidates: flagCandidates,
        highSignal: unique([...highDex, ...highNative]).slice(0, maxStrings),
      },
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
      `verdict: ${flagCandidates.length ? "flag_candidate" : "apk_triage"}`,
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
      "direct_solve: no",
      `candidate_status: ${flagCandidates.length ? "pending_oracle" : "none"}`,
      "oracle_verified: false",
      `next_tool: ${flagCandidates.length ? "ctf-evidence-board (command=flag-verify)" : primary.firstProbe}`,
      "flag_candidates:",
      ...(flagCandidates.length ? flagCandidates.map((candidate) => `- ${JSON.stringify(candidate)}`) : ["- none"]),
      "flag_like_strings (unverified hints):",
      ...(flagLikeStrings.length ? flagLikeStrings.map((s) => `- ${s}`) : ["- none"]),
      "route_recommendation:",
      `- primaryRoute: ${primary.primaryRoute}`,
      `- confidence: ${primary.confidence}`,
      `- firstProbe: ${primary.firstProbe}`,
      `- fallbackProbe: ${primary.fallbackProbe}`,
      "artifacts:",
      `- ${path.relative(directory, path.join(outDir, "apk-triage.json"))}`,
      `- ${path.relative(directory, path.join(outDir, "high-signal-strings.txt"))}`,
      `- ${path.relative(directory, path.join(outDir, "zip-entries.txt"))}`,
    ].join("\n")
  },
})
