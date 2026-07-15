import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { analyzePwnDisasmText } from "./lib/pwn-disasm-analysis.ts"

const execFile = promisify(execFileCb)

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

async function safeExec(cmd: string, args: string[], cwd: string, timeout = 12000) {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { cwd, timeout, maxBuffer: 4 * 1024 * 1024 })
    return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`.trim()
  }
}

export default tool({
  description: "CTF pwn stack frame solver: input function disassembly and emit precise frame offsets, rbp-derived expressions, and candidate leak surfaces.",
  args: {
    binary: tool.schema.string().optional().describe("Workspace-relative ELF binary path to objdump automatically."),
    evidence: tool.schema.string().optional().describe("Function disassembly, decompilation, or source notes."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per external tool call in ms. Default 12000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 12000, 30000))
    let text = String(args.evidence || "")
    if (args.binary) {
      const target = resolveInsideWorkspace(context.directory, args.binary)
      text = await safeExec("objdump", ["-d", "-M", "intel", target], path.dirname(target), timeoutMs)
    }
    if (text.trim().length < 16) return "BLOCK: provide binary=... or evidence=..."
    const analysis = analyzePwnDisasmText(text)
    const rbpExpressions = analysis.stackLayoutHints.filter((x) => x.startsWith("-")).map((x) => `rbp${x.split(":", 1)[0]} => ${x}`)
    const leakSurfaces = analysis.constraintHints.filter((x) => /compared against|checker gate/.test(x)).slice(0, 10)
    const lower = text.toLowerCase()
    const callsiteReuse = [] as string[]
    if (/lea\s+r(ax|di|si|dx|cx|8|9),\s*\[rbp-0x[0-9a-f]+\]/.test(lower) && /mov\s+rdi,\s*r(ax|di|si|dx|cx|8|9)/.test(lower) && /call.*<(printf|puts)@plt>|call.*printf|call.*puts/.test(lower)) {
      callsiteReuse.push("frame_indexed_first_arg_control")
    }
    if (/leave\s*;?\s*ret|\bleave\b/.test(lower) && /rbp/.test(lower)) callsiteReuse.push("leave_ret_pseudostack_candidate")
    if (/call.*<(printf|puts)@plt>|call.*printf|call.*puts/.test(lower) && /rbp-0x[0-9a-f]+/.test(lower)) callsiteReuse.push("original_callsite_reuse_candidate")
    const midFunctionRisks = [] as string[]
    if (callsiteReuse.includes("original_callsite_reuse_candidate")) midFunctionRisks.push("mid_function_reentry_may_skip_prologue_initialization")
    if (/printf/.test(lower)) midFunctionRisks.push("printf_varargs_state_may_be_unstable_on_mid_function_reentry")
    if (/leave\s*;?\s*ret|\bleave\b/.test(lower)) midFunctionRisks.push("verify_saved_rbp_saved_ret_and_rsp_migration_before_closure")
    const frameOffMatch = text.match(/\[rbp\s*-\s*0x([0-9a-f]+)\]/i)
    const frameArgOffset = frameOffMatch ? `0x${parseInt(frameOffMatch[1], 16).toString(16)}` : ""
    const callsiteMatch = text.match(/\b([0-9a-f]{6,16})[:\s].*call\s+.*(?:<(printf|puts|write)[^>]*>|printf|puts|write)/i)
    const callsite = callsiteMatch ? `0x${callsiteMatch[1]}` : "<callsite_before_arg_setup>"
    const highPriorityPrimitive = callsiteReuse.includes("frame_indexed_first_arg_control") || callsiteReuse.includes("original_callsite_reuse_candidate")
      ? {
          name: "FRAME_INDEXED_CALLSITE_LEAK",
          priority: "P0",
          frame_arg_offset: frameArgOffset || "unknown",
          callsite,
          rbp_formula: frameArgOffset ? `rbp = target + ${frameArgOffset}` : "rbp = target + k",
          minimal_probe: frameArgOffset ? `payload = b'A'*<offset_to_saved_rbp> + p64(target + ${frameArgOffset}) + p64(${callsite})` : `payload = b'A'*<offset_to_saved_rbp> + p64(target + k) + p64(${callsite})`,
          oracle: "target bytes or raw GOT/libc pointer bytes printed before crash/EOF",
          blockers_before_closure: ["do not debug fake-stack libc calls until this probe is tried", "complex closure failure does not falsify original callsite primitive"],
        }
      : null
    const payload = {
      schema_version: "pwn_stack_frame_solver.v1",
      stack_layout_hints: analysis.stackLayoutHints,
      rbp_expressions: rbpExpressions,
      candidate_leak_surfaces: leakSurfaces,
      callsite_reuse_signals: callsiteReuse,
      high_priority_primitive: highPriorityPrimitive,
      mid_function_reentry_risks: midFunctionRisks,
      red_flag_tags: analysis.redFlagTags,
      route_pressure: analysis.routePressure,
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_stack_frame_solver:",
      "stack_layout_hints:",
      ...(payload.stack_layout_hints.length ? payload.stack_layout_hints.map((x: string) => `- ${x}`) : ["- none"]),
      "rbp_expressions:",
      ...(payload.rbp_expressions.length ? payload.rbp_expressions.map((x: string) => `- ${x}`) : ["- none"]),
      "candidate_leak_surfaces:",
      ...(payload.candidate_leak_surfaces.length ? payload.candidate_leak_surfaces.map((x: string) => `- ${x}`) : ["- none"]),
      "callsite_reuse_signals:",
      ...(payload.callsite_reuse_signals.length ? payload.callsite_reuse_signals.map((x: string) => `- ${x}`) : ["- none"]),
      "high_priority_primitive:",
      ...(payload.high_priority_primitive ? [
        `- name: ${payload.high_priority_primitive.name}`,
        `- priority: ${payload.high_priority_primitive.priority}`,
        `- frame_arg_offset: ${payload.high_priority_primitive.frame_arg_offset}`,
        `- callsite: ${payload.high_priority_primitive.callsite}`,
        `- rbp_formula: ${payload.high_priority_primitive.rbp_formula}`,
        `- minimal_probe: ${payload.high_priority_primitive.minimal_probe}`,
        `- oracle: ${payload.high_priority_primitive.oracle}`,
      ] : ["- none"]),
      "mid_function_reentry_risks:",
      ...(payload.mid_function_reentry_risks.length ? payload.mid_function_reentry_risks.map((x: string) => `- ${x}`) : ["- none"]),
      "red_flag_tags:",
      ...(payload.red_flag_tags.length ? payload.red_flag_tags.map((x: string) => `- ${x}`) : ["- none"]),
      "route_pressure:",
      ...(payload.route_pressure.length ? payload.route_pressure.map((x: string) => `- ${x}`) : ["- none"]),
    ].join("\n")
  },
})
