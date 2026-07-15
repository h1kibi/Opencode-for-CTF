import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

function has(text: string, re: RegExp) {
  return re.test(text)
}

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function score(text: string) {
  const signals: string[] = []
  if (has(text, /extract\.dat|code_item|class_data|classes\.dex|dex patch|patch.*dex/i)) signals.push("dex_code_item_patch")
  if (has(text, /libshell\.so|JNI_OnLoad|RegisterNatives|native.*patch|arm64-v8a|\.so/i)) signals.push("native_shell_or_jni")
  if (has(text, /DexClassLoader|PathClassLoader|InMemoryDexClassLoader|loadDex|loadClass|classloader/i)) signals.push("classloader_swap")
  if (has(text, /apktool.*fail|jadx.*fail|decompile.*fail|smali.*exception/i)) signals.push("static_tool_fragility")
  if (has(text, /libndk_translation|x86_64|arm64-only|ABI|ro\.product\.cpu/i)) signals.push("runtime_abi_mismatch")
  if (has(text, /frida|logcat|run-as|private dir|tombstone|adb/i)) signals.push("dynamic_probe_needed")
  if (has(text, /anti-debug|ptrace|TracerPid|emulator|qemu|root|magisk/i)) signals.push("anti_analysis")
  return [...new Set(signals)]
}

function nextProbe(signals: string[]) {
  if (signals.includes("runtime_abi_mismatch")) return "Run ctf-android-runtime-doctor and do not trust dynamic native closure until an arm64-v8a runtime is available."
  if (signals.includes("dex_code_item_patch")) return "Run ctf-dex-patch-map on APK/classes.dex plus extracted patch records, then inspect only hit owner methods."
  if (signals.includes("native_shell_or_jni")) return "Run ctf-android-native-triage, map RegisterNatives/JNI exports, and locate the patch writer boundary."
  if (signals.includes("classloader_swap")) return "Trace classloader/dex load calls with logcat or Frida before broad JADX."
  if (signals.includes("dynamic_probe_needed")) return "Run ctf-android-dynamic-macro with allowInstall only after approval; inspect logcat and run-as listing."
  return "Run ctf-apk-triage first, then choose native/JADX/assets/runtime route from the strongest signal."
}

async function loadPluginTool<TArgs extends Record<string, unknown>, TResult = unknown>(contextDir: string, toolFile: string, args: TArgs): Promise<TResult> {
  const mod = await import(pathToFileUrl(resolveInsideWorkspace(contextDir, toolFile)))
  const pluginTool = mod.default as { execute?: (args: TArgs, context: { directory: string }) => Promise<TResult> }
  if (!pluginTool?.execute) throw new Error(`tool missing execute(): ${toolFile}`)
  return pluginTool.execute(args, { directory: contextDir })
}

function pathToFileUrl(p: string) {
  const normalized = p.replace(/\\/g, "/")
  return `file:///${normalized.replace(/^([A-Za-z]):/, "$1:")}`
}

function compactJson(value: unknown) {
  if (typeof value === "string") {
    try { return JSON.parse(value) } catch { return value }
  }
  return value
}

function summarizeSignals(parts: string[]) {
  return score(parts.join("\n"))
}

function safeSlug(input: string) {
  return input.replace(/[^A-Za-z0-9_.-]+/g, "_")
}

function dexClassToPackageHint(name: string) {
  const cleaned = name.replace(/^L/, "").replace(/;$/, "")
  const parts = cleaned.split("/")
  if (parts.length <= 1) return cleaned
  return parts.slice(0, -1).join("/")
}

function dexMethodPattern(hitMethods: string[]) {
  const tokens = new Set<string>()
  for (const item of hitMethods) {
    const right = item.split("->")[1] || ""
    const methodName = right.split("(")[0] || ""
    if (methodName && /^[A-Za-z_][A-Za-z0-9_$]{1,80}$/.test(methodName)) tokens.add(methodName)
  }
  const base = ["flag", "check", "verify", "native", "loadLibrary", "JNI", "decrypt", "encrypt", "extract", "patch"]
  for (const item of base) tokens.add(item)
  return [...tokens].slice(0, 24).join("|")
}

export default tool({
  description: "CTF APK packed/native closure helper: classify shell/JNI/dex-patch/classloader/ABI blockers and optionally auto-chain APK triage, native triage, runtime doctor, and dex patch map.",
  args: {
    evidence: tool.schema.string().optional().describe("Compact APK triage/runtime/decompiler evidence. Optional when apk is provided."),
    apk: tool.schema.string().optional().describe("Workspace-relative APK path for auto-chain mode."),
    patchFile: tool.schema.string().optional().describe("Optional workspace-relative patch file for ctf-dex-patch-map."),
    patchFormat: tool.schema.string().optional().describe("auto | json | text | u32le_pairs | extract_dat_u32le_pairs. Passed to ctf-dex-patch-map when patchFile is supplied."),
    dexEntry: tool.schema.string().optional().describe("Optional dex entry such as classes2.dex for ctf-dex-patch-map."),
    serial: tool.schema.string().optional().describe("Optional adb serial for runtime doctor."),
    targetAndroid: tool.schema.string().optional().describe("Expected target Android version/profile, e.g. Android 11 or Pixel 4a / Android 11 / arm64."),
    targetAbi: tool.schema.string().optional().describe("Expected target ABI, e.g. arm64-v8a."),
    maxRows: tool.schema.number().optional().describe("Maximum mapped patch rows to summarize. Default 20."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const parts: string[] = []
    const artifacts: Record<string, unknown> = {}

    if (args.evidence) parts.push(args.evidence)

    if (args.apk) {
      const apkTri = await loadPluginTool(context.directory, "tools/ctf-apk-triage.ts", { target: args.apk, jsonOnly: true })
      const apkTriJson = compactJson(apkTri) as Record<string, unknown>
      artifacts.apkTriage = apkTriJson
      parts.push(JSON.stringify(apkTriJson))

      const nativeTri = await loadPluginTool(context.directory, "tools/ctf-android-native-triage.ts", { target: args.apk, jsonOnly: true })
      const nativeTriJson = compactJson(nativeTri) as Record<string, unknown>
      artifacts.nativeTriage = nativeTriJson
      parts.push(JSON.stringify(nativeTriJson))

      const runtimeDoc = await loadPluginTool(context.directory, "tools/ctf-android-runtime-doctor.ts", {
        apk: args.apk,
        serial: args.serial,
        targetAndroid: args.targetAndroid,
        targetAbi: args.targetAbi,
        jsonOnly: true,
      })
      const runtimeDocJson = compactJson(runtimeDoc) as Record<string, unknown>
      artifacts.runtimeDoctor = runtimeDocJson
      parts.push(JSON.stringify(runtimeDocJson))

      if (args.patchFile) {
        const patchMap = await loadPluginTool(context.directory, "tools/ctf-dex-patch-map.ts", {
          target: args.apk,
          patchFile: args.patchFile,
          patchFormat: args.patchFormat,
          dexEntry: args.dexEntry,
          maxRows: args.maxRows || 20,
          jsonOnly: true,
        })
        const patchMapJson = compactJson(patchMap) as Record<string, unknown>
        artifacts.dexPatchMap = patchMapJson
        parts.push(JSON.stringify(patchMapJson))
      }
    } else if (args.patchFile) {
      const patchPath = resolveInsideWorkspace(context.directory, args.patchFile)
      parts.push(await readFile(patchPath, "utf8").catch(() => ""))
    }

    const mergedEvidence = parts.join("\n")
    const signals = summarizeSignals(parts)

    const runtimeVerdict = String((artifacts.runtimeDoctor as Record<string, unknown> | undefined)?.verdict || "")
    const apkRoute = String(((artifacts.apkTriage as Record<string, unknown> | undefined)?.route_recommendation as Record<string, unknown> | undefined)?.primaryRoute || "")
    const patchRows = Number((artifacts.dexPatchMap as Record<string, unknown> | undefined)?.patchesSeen || 0)
    const mapped = ((artifacts.dexPatchMap as Record<string, unknown> | undefined)?.mapped as Array<Record<string, unknown>> | undefined) || []
    const hitMethods = mapped
      .filter((row) => String((row.owner as Record<string, unknown> | undefined)?.status || "") === "hit_code_item")
      .map((row) => {
        const owner = (row.owner as Record<string, unknown> | undefined)?.method as Record<string, unknown> | undefined
        return owner ? `${owner.className as string}->${owner.methodName as string}${owner.proto as string}` : "unknown"
      })
      .slice(0, 12)
    const packageHint = hitMethods.length ? dexClassToPackageHint(hitMethods[0].split("->")[0] || "") : ""

    if (args.apk && hitMethods.length > 0) {
      const jadxSlice = await loadPluginTool(context.directory, "tools/ctf-jadx-targeted-slice.ts", {
        target: args.apk,
        packageHint: packageHint || undefined,
        patterns: dexMethodPattern(hitMethods),
        maxHits: 12,
        radius: 5,
        jsonOnly: true,
      })
      const jadxSliceJson = compactJson(jadxSlice) as Record<string, unknown>
      artifacts.jadxTargetedSlice = jadxSliceJson
      parts.push(JSON.stringify(jadxSliceJson))
    }

    const route = runtimeVerdict === "NOT_EQUIVALENT_X86_TRANSLATION_RISK" ? "blocked_runtime_equivalence"
      : patchRows > 0 ? "dex_code_item_patch_mapping"
      : apkRoute === "native_checker" || signals.includes("native_shell_or_jni") ? "native_shell_jni_patch_boundary"
      : apkRoute === "packed_or_dynamic_loader" || signals.includes("classloader_swap") ? "second_stage_dex_loader"
      : signals.includes("static_tool_fragility") ? "tool_fragility_use_slices"
      : "needs_apk_triage"

    const selectedNextProbe = route === "blocked_runtime_equivalence"
      ? "Stop same-runtime native closure on x86_64 emulator; continue static JNI/patch-owner recovery and wait for real arm64 runtime for final confirmation."
      : route === "dex_code_item_patch_mapping"
        ? `Inspect only mapped owner methods${hitMethods.length ? `: ${hitMethods.join("; ")}` : ""}; use the focused JADX slice if present, then trace the native patch writer or loader boundary.`
        : route === "native_shell_jni_patch_boundary"
          ? "Use ctf-android-native-triage results to focus on JNI_OnLoad/RegisterNatives and recover the Java-native method map before broader browsing."
          : route === "second_stage_dex_loader"
            ? "Inspect loader/classloader methods and dynamic dex artifacts before broad JADX; use logcat/run-as only as supporting evidence on x86_64 emulator."
            : nextProbe(signals)

    const jadxSlice = artifacts.jadxTargetedSlice as { hits?: Array<Record<string, unknown>> } | undefined
    const jadxHits = Number(jadxSlice?.hits?.length || 0)
    const jadxTopFiles = (jadxSlice?.hits || [])
      .slice(0, 6)
      .map((hit) => `${String(hit.file || "unknown")}:${String(hit.line || "?")}`)

    const payload = {
      route,
      signals,
      runtimeVerdict: runtimeVerdict || "unknown",
      apkPrimaryRoute: apkRoute || "unknown",
      patchRows,
      hitMethods,
      packageHint,
      jadxHits,
      jadxTopFiles,
      selectedNextProbe,
      closureOrder: [
        "runtime equivalence doctor",
        "APK triage + native triage",
        "DEX patch owner map when patch records exist",
        "focused JADX slice for hit owner methods when available",
        "focused owner-method/JNI boundary inspection",
        "dynamic macro only for supporting evidence on x86_64 emulator",
      ],
      stopRules: [
        "Do not continue x86_64 emulator dynamic native testing for arm64-only libraries after libndk_translation or runtime-doctor mismatch evidence appears.",
        "Do not wait for global JADX/apktool success when a patch or loader boundary is already identified.",
        "After DEX patch owner resolution, inspect only owner methods and patch writer xrefs before broad code browsing.",
      ],
      artifacts,
      mergedEvidencePreview: mergedEvidence.slice(0, 4000),
    }

    const outDir = resolveInsideWorkspace(context.directory, path.join("work", "android-packed-open", safeSlug(args.apk ? path.basename(args.apk) : "evidence-only")))
    await mkdir(outDir, { recursive: true })
    const summaryPath = path.join(outDir, "summary.json")
    const handoffPath = path.join(outDir, "handoff.md")
    await writeFile(summaryPath, JSON.stringify(payload, null, 2), "utf8")
    const handoff = [
      "# Android Packed Closure Handoff",
      "",
      `- route: ${payload.route}`,
      `- runtime_verdict: ${payload.runtimeVerdict}`,
      `- apk_primary_route: ${payload.apkPrimaryRoute}`,
      `- patch_rows: ${payload.patchRows}`,
      `- hit_methods: ${payload.hitMethods.join("; ") || "none"}`,
      `- package_hint: ${payload.packageHint || "none"}`,
      `- jadx_hits: ${payload.jadxHits}`,
      `- jadx_top_files: ${payload.jadxTopFiles.join("; ") || "none"}`,
      `- selected_next_probe: ${payload.selectedNextProbe}`,
      "",
      "## Closure Order",
      ...payload.closureOrder.map((item) => `- ${item}`),
      "",
      "## Stop Rules",
      ...payload.stopRules.map((item) => `- ${item}`),
      "",
      "## Notes",
      "- Runtime on x86_64 Android Studio emulator is supporting evidence only when arm64 native closure matters.",
      "- Use summary.json for machine-readable resume/handoff; use this markdown file for quick human restart context.",
    ].join("\n")
    await writeFile(handoffPath, handoff, "utf8")

    if (args.jsonOnly) return JSON.stringify({ ...payload, artifactDir: outDir, summaryPath, handoffPath }, null, 2)
    return [
      "ANDROID_PACKED_CLOSURE:",
      `- route: ${payload.route}`,
      `- runtime_verdict: ${payload.runtimeVerdict}`,
      `- apk_primary_route: ${payload.apkPrimaryRoute}`,
      `- signals: ${payload.signals.join(", ") || "none"}`,
      `- patch_rows: ${payload.patchRows}`,
      `- hit_methods: ${payload.hitMethods.join("; ") || "none"}`,
      `- package_hint: ${payload.packageHint || "none"}`,
      `- jadx_hits: ${payload.jadxHits}`,
      `- jadx_top_files: ${payload.jadxTopFiles.join("; ") || "none"}`,
      `- artifact_dir: ${outDir}`,
      `- summary: ${summaryPath}`,
      `- handoff: ${handoffPath}`,
      `- selected_next_probe: ${payload.selectedNextProbe}`,
      "- closure_order:",
      ...payload.closureOrder.map((item) => `  - ${item}`),
      "- stop_rules:",
      ...payload.stopRules.map((item) => `  - ${item}`),
    ].join("\n")
  },
})
