import { tool } from "@opencode-ai/plugin"
import { lstat, open } from "node:fs/promises"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`target must stay inside the current workspace: ${input}`)
  return target
}

async function readSample(target: string, maxBytes = 4 * 1024 * 1024) {
  const fh = await open(target, "r")
  try {
    const st = await fh.stat()
    const out = Buffer.allocUnsafe(Math.min(st.size, maxBytes))
    const { bytesRead } = await fh.read(out, 0, out.length, 0)
    return out.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

function printableStrings(buf: Buffer) {
  const text = buf.toString("latin1")
  return Array.from(text.matchAll(/[ -~]{4,}/g), (m) => m[0]).slice(0, 4000)
}

function uniq<T>(arr: T[]) { return Array.from(new Set(arr)) }

export default tool({
  description: "CTF rev Unicorn helper: detect Unicorn/Capstone/Qiling API signals, infer likely arch/mode/register setup, and emit a replay skeleton plan for self-decrypt/emulation challenges.",
  args: {
    target: tool.schema.string().describe("Binary/script/sample path to inspect"),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const sample = await readSample(target)
    const strings = printableStrings(sample)
    const joined = strings.join("\n")

    const unicornApis = uniq(strings.filter((s) => /uc_open|uc_mem_map|uc_mem_write|uc_reg_write|uc_emu_start|uc_hook_add|uc_close/i.test(s))).slice(0, 80)
    const capstoneApis = uniq(strings.filter((s) => /cs_open|cs_disasm|cs_option|cs_free/i.test(s))).slice(0, 40)
    const qilingApis = uniq(strings.filter((s) => /qiling|ql\.run|ql\.hook|ql\.mem/i.test(s))).slice(0, 40)
    const archHints = uniq(strings.filter((s) => /UC_ARCH_|UC_MODE_|riscv|mips|arm64|aarch64|x86_64|amd64/i.test(s))).slice(0, 60)
    const regHints = uniq(strings.filter((s) => /UC_[A-Z0-9_]*REG_[A-Z0-9_]+/i.test(s))).slice(0, 80)
    const memHints = uniq(strings.filter((s) => /0x[0-9a-f]{4,}|map|write|payload|code|data|stack/i.test(s))).slice(0, 80)
    const apiHistogram = {
      uc_open: strings.filter((s) => /uc_open/i.test(s)).length,
      uc_mem_map: strings.filter((s) => /uc_mem_map/i.test(s)).length,
      uc_mem_write: strings.filter((s) => /uc_mem_write/i.test(s)).length,
      uc_reg_write: strings.filter((s) => /uc_reg_write/i.test(s)).length,
      uc_emu_start: strings.filter((s) => /uc_emu_start/i.test(s)).length,
      cs_open: strings.filter((s) => /cs_open/i.test(s)).length,
      qiling: strings.filter((s) => /qiling|ql\.run/i.test(s)).length,
    }

    let inferredArch = "unknown"
    if (/UC_ARCH_RISCV|riscv/i.test(joined)) inferredArch = "riscv"
    else if (/UC_ARCH_MIPS|mips/i.test(joined)) inferredArch = "mips"
    else if (/UC_ARCH_ARM64|aarch64/i.test(joined)) inferredArch = "arm64"
    else if (/UC_ARCH_X86|x86_64|amd64/i.test(joined)) inferredArch = "x86"

    let inferredMode = "unknown"
    if (/UC_MODE_RISCV64|riscv64/i.test(joined)) inferredMode = "riscv64"
    else if (/UC_MODE_64|64-bit/i.test(joined)) inferredMode = "64"
    else if (/UC_MODE_32|32-bit/i.test(joined)) inferredMode = "32"

    const detected = unicornApis.length >= 2 || capstoneApis.length >= 2 || qilingApis.length >= 1
    const confidence = unicornApis.length >= 4 || (unicornApis.length >= 2 && capstoneApis.length >= 1)
      ? "high"
      : detected
        ? "medium"
        : "low"
    const liveDumpNeeded = detected && /payload|decrypt|mem_write|uc_mem_write|uc_emu_start|self-decrypt/i.test(joined)
    const markerDrivenDumpPlan = liveDumpNeeded
      ? [
          "run target in controlled Linux substrate until a stable stdout/input marker appears",
          "dump target live memory after self-decrypt stage instead of statically guessing the payload bytes",
          "prefer payload bytes from dump over wrapper-embedded encrypted blobs when arch/mode disagree",
        ]
      : []
    const replayBuilderPlan = detected
      ? [
          "recover uc_open -> arch/mode first",
          "recover uc_mem_map / uc_mem_write ranges next",
          "recover uc_reg_write state before uc_emu_start",
          "emit a replay script that stops at compare/check PC and prints key registers/memory",
        ]
      : []
    const replayPlan = detected ? [
      "identify uc_open arguments to recover arch/mode before disassembling payload",
      "recover uc_mem_map / uc_mem_write ranges and treat them as payload/data staging regions",
      "recover uc_reg_write register constants before uc_emu_start; these define initial machine state",
      "dump live memory after self-decrypt stage, then replay only the final payload rather than the whole wrapper",
      "stop replay at the compare/check loop or at the first success/failure branch and print registers/memory",
    ] : ["no strong Unicorn/Qiling/Capstone signal; fall back to generic reverse workflow"]

    const skeleton = detected ? [
      "from unicorn import *",
      "# arch/mode from uc_open",
      "mu = Uc(<ARCH>, <MODE>)",
      "# map recovered regions from uc_mem_map",
      "mu.mem_map(<BASE>, <SIZE>)",
      "# write decrypted payload/data from dump or embedded blob",
      "mu.mem_write(<BASE>, payload_bytes)",
      "# restore key registers from uc_reg_write",
      "mu.reg_write(<REG>, <VALUE>)",
      "# emulate recovered start/end from uc_emu_start",
      "mu.emu_start(<START>, <END>)",
      "# print registers / memory of interest",
    ] : []
    const recommendedNext = detected
      ? liveDumpNeeded
        ? "build a live-memory dump step at the first stable marker, then feed the dumped payload into a Unicorn replay script"
        : "recover uc_open/uc_mem_map/uc_reg_write/uc_emu_start call arguments and generate a replay skeleton before deeper reversing"
      : "no strong Unicorn signal; continue with generic reverse workflow"
    const helperChain = detected
      ? [
          "ctf-rev-unicorn-helper -> recover static API clues",
          "live memory dump after stable marker -> obtain final decrypted payload",
          "generate Unicorn replay script -> stop at compare/check boundary",
        ]
      : ["generic reverse workflow"]

    const payload = {
      schema_version: "rev_unicorn_helper.v2",
      target,
      size: st.size,
      detected_unicorn_style: detected,
      confidence,
      inferred_arch: inferredArch,
      inferred_mode: inferredMode,
      api_histogram: apiHistogram,
      live_dump_needed: liveDumpNeeded,
      unicorn_apis: unicornApis,
      capstone_apis: capstoneApis,
      qiling_apis: qilingApis,
      arch_hints: archHints,
      reg_hints: regHints,
      mem_hints: memHints,
      marker_driven_dump_plan: markerDrivenDumpPlan,
      replay_builder_plan: replayBuilderPlan,
      replay_plan: replayPlan,
      replay_skeleton: skeleton,
      helper_chain: helperChain,
      recommended_next: recommendedNext,
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "rev_unicorn_helper:",
      "- schema_version: rev_unicorn_helper.v2",
      `- target: ${target}`,
      `- size: ${st.size}`,
      `- detected_unicorn_style: ${detected}`,
      `- confidence: ${confidence}`,
      `- inferred_arch: ${inferredArch}`,
      `- inferred_mode: ${inferredMode}`,
      `- live_dump_needed: ${liveDumpNeeded}`,
      "api_histogram:",
      ...Object.entries(apiHistogram).map(([k, v]) => `- ${k}: ${v}`),
      "unicorn_apis:",
      ...(unicornApis.length ? unicornApis.map((x) => `- ${x}`) : ["- none"]),
      "capstone_apis:",
      ...(capstoneApis.length ? capstoneApis.map((x) => `- ${x}`) : ["- none"]),
      "qiling_apis:",
      ...(qilingApis.length ? qilingApis.map((x) => `- ${x}`) : ["- none"]),
      "arch_hints:",
      ...(archHints.length ? archHints.map((x) => `- ${x}`) : ["- none"]),
      "reg_hints:",
      ...(regHints.length ? regHints.map((x) => `- ${x}`) : ["- none"]),
      "marker_driven_dump_plan:",
      ...(markerDrivenDumpPlan.length ? markerDrivenDumpPlan.map((x) => `- ${x}`) : ["- none"]),
      "replay_builder_plan:",
      ...(replayBuilderPlan.length ? replayBuilderPlan.map((x) => `- ${x}`) : ["- none"]),
      "replay_plan:",
      ...replayPlan.map((x) => `- ${x}`),
      "replay_skeleton:",
      ...(skeleton.length ? skeleton.map((x) => `- ${x}`) : ["- none"]),
      "helper_chain:",
      ...helperChain.map((x) => `- ${x}`),
      `recommended_next: ${recommendedNext}`,
    ].join("\n")
  },
})
