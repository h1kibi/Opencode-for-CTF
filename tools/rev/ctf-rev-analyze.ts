import { tool } from "@opencode-ai/plugin"
import { lstat, open } from "node:fs/promises"
import path from "node:path"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import binaryProbe from "../core/ctf-binary-probe.ts"
import elfSlice from "../core/ctf-elf-slice.ts"
import closureLadder from "./ctf-rev-closure-ladder.ts"
import capabilityCheck from "./ctf-rev-capability-check.ts"
import peSlice from "./ctf-rev-pe-slice.ts"

type Route = "elf" | "pe" | "mach-o" | "dex" | "apk" | "java" | "wasm" | "python-bytecode" | "unknown"

async function readHead(target: string, bytes = 8) {
  const fh = await open(target, "r")
  try {
    const out = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(out, 0, bytes, 0)
    return out.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

function routeFor(target: string, head: Buffer, forced?: string): { route: Route; reason: string } {
  const mode = (forced ?? "auto").toLowerCase()
  if (["elf", "pe", "mach-o", "dex", "apk", "java", "wasm", "python-bytecode", "unknown"].includes(mode)) {
    return { route: mode as Route, reason: `forced:${mode}` }
  }

  const base = path.basename(target)
  if (head.subarray(0, 4).toString("latin1") === "\x7fELF") return { route: "elf", reason: "ELF magic" }
  if (head.subarray(0, 2).toString("latin1") === "MZ") return { route: "pe", reason: "MZ/PE magic" }
  const magic = head.subarray(0, 4).toString("hex")
  if (["feedface", "cefaedfe", "feedfacf", "cffaedfe"].includes(magic))
    return { route: "mach-o", reason: "Mach-O magic" }
  if (head.subarray(0, 8).toString("latin1") === "dex\n035\x00" || /^classes(?:[2-9]|[1-9][0-9]+)\.dex$/i.test(base)) {
    return { route: "dex", reason: "DEX magic or classes*.dex filename" }
  }
  if (/\.apk$/i.test(base)) return { route: "apk", reason: "APK extension" }
  if (head.subarray(0, 4).toString("hex") === "cafebabe" || /\.(jar|war|class)$/i.test(base)) {
    return {
      route: "java",
      reason: head.subarray(0, 4).toString("hex") === "cafebabe" ? "JVM class magic" : "JVM archive/class extension",
    }
  }
  if (/\.wasm$/i.test(base) || head.subarray(0, 4).toString("hex") === "0061736d") {
    return { route: "wasm", reason: "WASM extension or magic" }
  }
  if (/\.(pyc|pyo)$/i.test(base)) return { route: "python-bytecode", reason: "Python bytecode extension" }
  return { route: "unknown", reason: "no native/app bytecode signature matched" }
}

function indent(value: unknown) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n")
}

export default tool({
  description:
    "CTF REV analysis facade: stable lightweight first-pass entrypoint for native reverse artifacts. Delegates to ctf-binary-probe plus one focused ELF/PE slice when useful; closure ranking is optional after checker/transform evidence exists.",
  args: {
    target: tool.schema.string().describe("Workspace-relative reverse artifact path."),
    route: tool.schema
      .string()
      .optional()
      .describe("auto | elf | pe | mach-o | dex | apk | java | wasm | python-bytecode | unknown. Default auto."),
    keyword: tool.schema
      .string()
      .optional()
      .describe("Optional regex keyword forwarded to ELF/PE slice, e.g. flag|check|verify|success|fail."),
    maxStrings: tool.schema
      .number()
      .optional()
      .describe("Maximum interesting strings for delegated probes. Default delegated tool default."),
    disasmRadius: tool.schema
      .number()
      .optional()
      .describe("Lines around PE disassembly keyword hits. Default delegated tool default."),
    slice: tool.schema
      .boolean()
      .optional()
      .describe("Run one focused ELF/PE slice when route supports it. Default true."),
    checkCapabilities: tool.schema
      .boolean()
      .optional()
      .describe("Run ctf-rev-capability-check for host tools/packs. Default false to keep ordinary triage fast."),
    rankClosure: tool.schema
      .boolean()
      .optional()
      .describe("Also run ctf-rev-closure-ladder using probe/slice evidence. Default false."),
    primitive: tool.schema
      .string()
      .optional()
      .describe("Optional suspected checker/transform primitive forwarded to closure ladder when rankClosure=true."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const stat = await lstat(target)
    if (!stat.isFile()) throw new Error("target must be a regular file")

    const head = await readHead(target, 16)
    const decision = routeFor(target, head, args.route)
    const toolContext = { directory, worktree: workspace } as never

    let probe: unknown = null
    let sliceResult: unknown = null
    let closure: unknown = null
    let capabilityCheckResult: Record<string, unknown> | null = null
    const skipped: string[] = []

    if (decision.route === "elf" || decision.route === "pe" || decision.route === "unknown") {
      probe = await binaryProbe.execute(
        {
          target: args.target,
          maxStrings: args.maxStrings,
        },
        toolContext,
      )
    } else {
      skipped.push(`binary_probe_skipped: ${decision.route} is better handled by an artifact-specific facade`)
    }

    if (args.slice !== false && decision.route === "elf") {
      sliceResult = await elfSlice.execute(
        {
          target: args.target,
          keyword: args.keyword,
          maxStrings: args.maxStrings,
          jsonOnly: args.jsonOnly === true,
        },
        toolContext,
      )
    } else if (args.slice !== false && decision.route === "pe") {
      sliceResult = await peSlice.execute(
        {
          target: args.target,
          keyword: args.keyword,
          maxStrings: args.maxStrings,
          disasmRadius: args.disasmRadius,
          jsonOnly: args.jsonOnly === true,
        },
        toolContext,
      )
    } else if (args.slice === false) {
      skipped.push("slice_skipped: slice=false")
    } else {
      skipped.push(`slice_skipped: route ${decision.route} has no low-noise native slice`)
    }

    if (args.checkCapabilities) {
      try {
        const rawCapability = await capabilityCheck.execute(
          { family: decision.route, target: args.target, jsonOnly: true },
          toolContext,
        )
        capabilityCheckResult = JSON.parse(String(rawCapability)) as Record<string, unknown>
      } catch (error) {
        capabilityCheckResult = {
          schema_version: "rev_capability.v1",
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        }
      }
    } else {
      skipped.push("capability_check_skipped: set checkCapabilities=true to probe host tools and enabled packs")
    }

    const closureEvidence = [probe, sliceResult].filter(Boolean).map(String).join("\n").slice(0, 12000)
    if (args.rankClosure) {
      closure = await closureLadder.execute(
        {
          evidence: closureEvidence || `${decision.route}: ${decision.reason}`,
          primitive: args.primitive,
          jsonOnly: args.jsonOnly === true,
        },
        toolContext,
      )
    } else {
      skipped.push("closure_ladder_skipped: set rankClosure=true after checker/transform/runtime evidence exists")
    }

    const routeCapability =
      decision.route === "apk"
        ? { selectedTool: "ctf-android-analyze", requiredPack: "android", availability: "optional-pack" }
        : decision.route === "java"
          ? { selectedTool: "ctf-java-analyze", requiredPack: "core", availability: "available" }
          : decision.route === "dex"
            ? {
                selectedTool: "ctf-dex-patch-map / ctf-android-native-triage",
                requiredPack: "android",
                availability: "optional-pack",
              }
            : decision.route === "wasm"
              ? {
                  selectedTool: "wasm inspection / ctf-rev wasm reference",
                  requiredPack: "rev",
                  availability: "available",
                }
              : decision.route === "mach-o"
                ? {
                    selectedTool: "otool / llvm-objdump / Ghidra fallback",
                    requiredPack: "rev",
                    availability: "external-or-local",
                  }
                : decision.route === "python-bytecode"
                  ? {
                      selectedTool: "python dis / pycdc fallback",
                      requiredPack: "rev",
                      availability: "external-or-local",
                    }
                  : {
                      selectedTool:
                        decision.route === "elf"
                          ? "ctf-elf-slice"
                          : decision.route === "pe"
                            ? "ctf-rev-pe-slice"
                            : "ctf-binary-probe",
                      requiredPack: "rev",
                      availability: "available",
                    }

    let nextToolHint =
      decision.route === "apk"
        ? "Enable android pack and run ctf-android-analyze; avoid full JADX until the facade selects Java/native/assets/runtime."
        : decision.route === "java"
          ? "Run ctf-java-analyze for JVM archive/class/source routing before decompiler-wide reading."
          : decision.route === "dex"
            ? "Enable android pack and run ctf-android-native-triage or ctf-dex-patch-map; keep JNI/native evidence linked."
            : decision.route === "mach-o"
              ? "Use otool/llvm-objdump or Ghidra fallback, then record architecture and load commands before emulation."
              : decision.route === "wasm"
                ? "Load ctf-rev wasm reference and inspect exports/imports/linear memory before broad decompilation."
                : decision.route === "python-bytecode"
                  ? "Load ctf-rev Python bytecode reference and inspect entrypoint/constants before executing extracted code."
                  : "Use ctf-rev-closure-ladder only after a concrete checker, transform, VM, or runtime-dump primitive is identified."

    const capabilityPayload = capabilityCheckResult as Record<string, unknown> | null
    const capabilityStatus = typeof capabilityPayload?.status === "string" ? capabilityPayload.status : null
    const recommendedPath = capabilityPayload?.recommended_path
    if (recommendedPath && typeof recommendedPath === "object") {
      const nextAction = (recommendedPath as { next_action?: unknown }).next_action
      if (typeof nextAction === "string" && nextAction.trim()) nextToolHint = nextAction
    }
    const payload = {
      target,
      size: stat.size,
      fingerprint: {
        family: decision.route,
        confidence: args.route ? "forced" : decision.route === "unknown" ? "low" : "high",
        detectedBy: decision.reason,
      },
      capability: capabilityStatus ? { ...routeCapability, availability: capabilityStatus } : routeCapability,
      capability_check: capabilityCheckResult,
      route: decision.route,
      routeReason: decision.reason,
      probe,
      slice: sliceResult,
      closure,
      skipped,
      nextToolHint,
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_REV_ANALYZE:",
      `- target: ${target}`,
      `- size: ${stat.size}`,
      `- route: ${decision.route}`,
      `- route_reason: ${decision.reason}`,
      `- next_tool_hint: ${nextToolHint}`,
      "- probe:",
      probe ? indent(probe) : "  skipped",
      "- slice:",
      sliceResult ? indent(sliceResult) : "  skipped",
      "- closure_ladder:",
      closure ? indent(closure) : "  skipped",
      "- skipped:",
      ...skipped.map((line) => `  ${line}`),
    ].join("\n")
  },
})
