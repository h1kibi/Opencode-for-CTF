import { tool } from "@opencode-ai/plugin"
import apkTriage from "./ctf-apk-triage.ts"
import nativeTriage from "./ctf-android-native-triage.ts"
import runtimeCheck from "./ctf-android-runtime-check.ts"
import { directoryFromContext, workspaceRootFromContext } from "../lib/workspace-path.ts"

/** Route-specific static follow-up guidance for APK branches without direct native dispatch. */
const STATIC_FOLLOWUP_GAPS: Record<string, string> = {
  java_kotlin_checker:
    "no bounded Java/Kotlin static follow-up tool is registered; work from the APK triage dex string hits, then ctf-dex-patch-map when patch records exist",
  assets_or_resource_decode: "decode only the suspect assets with ctf-apk-resource-read or extract them directly",
  unknown_apk_static:
    "rerun ctf-apk-triage with a larger maxStrings or run ctf-android-native-triage on the strongest signal",
}

type ApkTriagePayload = {
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

export default tool({
  description:
    "CTF Android analysis facade: stable APK first-pass entrypoint that runs bounded APK triage, then optionally follows one native/runtime route without starting broad decompilation by default.",
  args: {
    target: tool.schema.string().describe("Workspace-relative APK path."),
    followStatic: tool.schema
      .boolean()
      .optional()
      .describe("Run one bounded static follow-up from the triage route (native triage). Default false."),
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
      } else if (STATIC_FOLLOWUP_GAPS[route]) {
        skipped.push(`static_followup_unavailable_for_route=${route}: ${STATIC_FOLLOWUP_GAPS[route]}`)
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
          : route === "packed_or_dynamic_loader"
            ? "ctf-android-packed-closure-helper, then runtime only after equivalence is clear"
            : route === "assets_or_resource_decode"
              ? "ctf-apk-resource-read or extract only suspicious assets"
              : route === "java_kotlin_checker"
                ? "ctf-dex-patch-map over the APK dex, then ctf-java-analyze; no bounded Java/Kotlin slice tool is registered"
                : "ctf-android-native-triage, then ctf-apk-triage with a larger maxStrings",
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
