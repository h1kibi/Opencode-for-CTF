import { tool } from "@opencode-ai/plugin"
import apkTriage from "./ctf-apk-triage.ts"
import nativeTriage from "./ctf-android-native-triage.ts"
import runtimeCheck from "./ctf-android-runtime-check.ts"
import jadxTargetedSlice from "./ctf-jadx-targeted-slice.ts"
import { directoryFromContext, workspaceRootFromContext } from "../lib/workspace-path.ts"

type ApkTriagePayload = {
  identity?: {
    package?: string
  }
  route_recommendation?: {
    primaryRoute?: string
    confidence?: string
    firstProbe?: string
    fallbackProbe?: string
  }
}

function parseJson(text: unknown): ApkTriagePayload {
  if (typeof text !== "string") return {}
  try {
    return JSON.parse(text) as ApkTriagePayload
  } catch {
    return {}
  }
}

function packageToPath(packageName?: string) {
  return packageName ? packageName.replace(/\./g, "/") : undefined
}

export default tool({
  description:
    "CTF Android analysis facade: stable APK first-pass entrypoint that runs bounded APK triage, then optionally follows one native/JADX/runtime route without starting broad decompilation by default.",
  args: {
    target: tool.schema.string().describe("Workspace-relative APK path."),
    followStatic: tool.schema
      .boolean()
      .optional()
      .describe(
        "Run one static follow-up from triage route. Native follow-up is bounded; JADX may run targeted decompilation. Default false.",
      ),
    includeRuntime: tool.schema
      .boolean()
      .optional()
      .describe("Also run adb/frida runtime readiness check. Default false."),
    maxStrings: tool.schema.number().optional().describe("Maximum APK/native high-signal strings. Default 120."),
    outDir: tool.schema
      .string()
      .optional()
      .describe(
        "Workspace-relative artifact directory for apk triage. Default delegated tool chooses work/apk-triage/<apk>.",
      ),
    packageHint: tool.schema
      .string()
      .optional()
      .describe(
        "Optional package/class path hint for JADX targeted slice. Defaults to package name from triage when available.",
      ),
    jadxPatterns: tool.schema
      .string()
      .optional()
      .describe(
        "Optional regex for JADX slice. Default check|verify|flag|success|wrong|native|loadLibrary|decrypt|encrypt.",
      ),
    runJadx: tool.schema
      .boolean()
      .optional()
      .describe("When followStatic selects JADX, run jadx if cache is missing. Default true."),
    serial: tool.schema.string().optional().describe("Optional adb serial for includeRuntime."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const toolContext = {
      directory: directoryFromContext(context),
      worktree: workspaceRootFromContext(context),
    } as never
    const triageText = await apkTriage.execute(
      {
        target: args.target,
        maxStrings: args.maxStrings ?? 120,
        outDir: args.outDir,
        jsonOnly: true,
      },
      toolContext,
    )
    const triage = parseJson(triageText)
    const route = triage.route_recommendation?.primaryRoute || "unknown_apk_static"
    const packageHint = args.packageHint || packageToPath(triage.identity?.package)

    const followups: Array<{ route: string; tool: string; result: unknown }> = []
    const skipped: string[] = []

    if (args.followStatic) {
      if (route === "native_checker" || route === "packed_or_dynamic_loader") {
        followups.push({
          route,
          tool: "ctf-android-native-triage",
          result: await nativeTriage.execute(
            {
              target: args.target,
              maxStrings: args.maxStrings ?? 120,
            },
            toolContext,
          ),
        })
      } else if (
        route === "java_kotlin_checker" ||
        route === "assets_or_resource_decode" ||
        route === "unknown_apk_static"
      ) {
        followups.push({
          route,
          tool: "ctf-jadx-targeted-slice",
          result: await jadxTargetedSlice.execute(
            {
              target: args.target,
              patterns: args.jadxPatterns,
              packageHint,
              runJadx: args.runJadx !== false,
              maxHits: 30,
            },
            toolContext,
          ),
        })
      } else {
        skipped.push(`static_followup_skipped_for_route=${route}`)
      }
    } else {
      skipped.push("static_followup_skipped: set followStatic=true after reviewing APK triage route")
    }

    if (args.includeRuntime) {
      followups.push({
        route: "runtime_readiness",
        tool: "ctf-android-runtime-check",
        result: await runtimeCheck.execute(
          {
            serial: args.serial,
            jsonOnly: false,
          },
          toolContext,
        ),
      })
    } else {
      skipped.push("runtime_check_skipped: set includeRuntime=true only when dynamic/ADB evidence matters")
    }

    const payload = {
      target: args.target,
      route,
      confidence: triage.route_recommendation?.confidence || "unknown",
      firstProbe: triage.route_recommendation?.firstProbe || "",
      fallbackProbe: triage.route_recommendation?.fallbackProbe || "",
      triage,
      followups,
      skipped,
      next_tool_hint:
        route === "native_checker"
          ? "ctf-android-native-triage or ctf-elf-slice on the primary JNI library"
          : route === "java_kotlin_checker"
            ? "ctf-jadx-targeted-slice with packageHint and tight patterns"
            : route === "packed_or_dynamic_loader"
              ? "ctf-android-packed-closure-helper, then runtime only after equivalence is clear"
              : route === "assets_or_resource_decode"
                ? "ctf-apk-resource-read or extract only suspicious assets"
                : "ctf-jadx-targeted-slice or ctf-android-native-triage based on the strongest string/native signal",
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_ANDROID_ANALYZE:",
      `- target: ${args.target}`,
      `- route: ${payload.route}`,
      `- confidence: ${payload.confidence}`,
      `- first_probe: ${payload.firstProbe || "none"}`,
      `- fallback_probe: ${payload.fallbackProbe || "none"}`,
      `- next_tool_hint: ${payload.next_tool_hint}`,
      "- triage:",
      String(triageText)
        .split(/\r?\n/)
        .map((line) => `  ${line}`)
        .join("\n"),
      "- followups:",
      ...(followups.length
        ? followups.flatMap((entry) => [
            `  ${entry.tool} (${entry.route}):`,
            ...String(entry.result)
              .split(/\r?\n/)
              .map((line) => `    ${line}`),
          ])
        : ["  none"]),
      "- skipped:",
      ...skipped.map((line) => `  ${line}`),
    ].join("\n")
  },
})
