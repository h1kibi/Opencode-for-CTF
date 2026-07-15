import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"

const execFile = promisify(execFileCb)

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

async function safeExec(cmd: string, args: string[], cwd: string, ms = 7000) {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { cwd, timeout: ms, maxBuffer: 1024 * 1024 })
    return `${stdout}${stderr ? `\n${stderr}` : ""}`
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`
  }
}

function grepLines(text: string, re: RegExp, limit = 30) {
  return text.split(/\r?\n/).filter((line) => re.test(line)).slice(0, limit).map((line) => line.trim())
}

function hasUsefulPopSequence(text: string) {
  const lower = text.toLowerCase()
  const rbx = /pop rbx/.test(lower)
  const rbp = /pop rbp/.test(lower)
  const r12 = /pop r12/.test(lower)
  const r13 = /pop r13/.test(lower)
  const r14 = /pop r14/.test(lower)
  const r15 = /pop r15/.test(lower)
  return rbx && rbp && r12 && r13 && r14 && r15
}

function gadgetShape(popSeq: boolean, callSeq: boolean, symbolHit: boolean) {
  if (popSeq && callSeq) return "complete_pop_and_call_shape"
  if (popSeq && symbolHit) return "pop_shape_with_symbol_call_shape_unconfirmed"
  if (callSeq && symbolHit) return "call_shape_with_symbol_pop_shape_unconfirmed"
  if (popSeq) return "pop_shape_only"
  if (callSeq) return "call_shape_only"
  if (symbolHit) return "symbol_only"
  return "not_found"
}

function decision(symbolHit: boolean, popSeq: boolean, callSeq: boolean, evidence: string) {
  const lower = evidence.toLowerCase()
  if (/static|musl|stripped/.test(lower) && !symbolHit && !popSeq) return "ret2csu_unlikely_collect_alternate_call_or_syscall_route"
  if (popSeq && callSeq) return "ret2csu_candidate_worth_testing_after_control_proof"
  if (symbolHit && (popSeq || callSeq)) return "ret2csu_candidate_worth_testing_after_control_proof"
  if (popSeq || callSeq) return "ret2csu_partial_shape_needs_matching_second_gadget_before_promotion"
  if (symbolHit) return "ret2csu_symbol_present_but_gadget_shape_unconfirmed"
  return "ret2csu_not_evidenced_yet_do_not_prioritize"
}

export default tool({
  description: "CTF pwn ret2csu checker: inspect __libc_csu_init symbols/gadget shape and decide whether ret2csu is a worthwhile ROP candidate.",
  args: {
    binary: tool.schema.string().optional().describe("Workspace-relative ELF binary path."),
    evidence: tool.schema.string().optional().describe("Optional pasted readelf/objdump/ROPgadget/notes evidence."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per helper command in ms. Default 7000."),
  },
  async execute(args, context) {
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 7000, 30000))
    const pastedEvidence = args.evidence ?? ""
    let binary = "not_provided"
    let cwd = context.directory
    let ropOut = ""
    let readelfOut = ""
    let objdumpOut = ""

    if (args.binary) {
      binary = resolveInsideWorkspace(context.directory, args.binary)
      cwd = path.dirname(binary)
      ropOut = await safeExec("ROPgadget", ["--binary", binary, "--only", "pop|mov|call|ret"], cwd, timeoutMs)
      readelfOut = await safeExec("readelf", ["-Ws", binary], cwd, timeoutMs)
      objdumpOut = await safeExec("objdump", ["-d", binary], cwd, timeoutMs)
    }

    const combined = [ropOut, readelfOut, objdumpOut, pastedEvidence].join("\n")
    const symbolLines = grepLines(combined, /__libc_csu_init|libc_csu|_init\b/i, 20)
    const popSequenceLines = grepLines(combined, /pop rbx|pop rbp|pop r12|pop r13|pop r14|pop r15/i, 40)
    const callSequenceLines = grepLines(combined, /call.*\[(r12|r13|r14|r15|rbx)|mov\s+r(d|s)i|mov\s+edx|mov\s+rsi|mov\s+edi/i, 40)
    const retLines = grepLines(combined, /:\s*ret\b|\bretq?\b/i, 12)
    const symbolHit = symbolLines.some((x) => /__libc_csu_init|libc_csu/i.test(x))
    const popSeq = hasUsefulPopSequence(combined)
    const callSeq = callSequenceLines.some((x) => /call/i.test(x))
    const shape = gadgetShape(popSeq, callSeq, symbolHit)
    const routeDecision = decision(symbolHit, popSeq, callSeq, pastedEvidence)

    return [
      "pwn_ret2csu_check:",
      "schema_version: pwn_ret2csu_check.v1",
      `binary: ${binary}`,
      `route_decision: ${routeDecision}`,
      `gadget_shape: ${shape}`,
      "promotion_gate:",
      popSeq && callSeq ? "- pass: both pop-chain and call-chain shape are present; ret2csu can enter top route only after control proof." : "- hold: require both pop-chain and call-chain shape, or a clear reason why the missing half is otherwise available.",
      "symbol_evidence:",
      ...(symbolLines.length ? symbolLines.map((x) => `- ${x}`) : ["- none"]),
      "pop_sequence_evidence:",
      ...(popSequenceLines.length ? popSequenceLines.map((x) => `- ${x}`) : ["- none"]),
      "call_sequence_evidence:",
      ...(callSequenceLines.length ? callSequenceLines.map((x) => `- ${x}`) : ["- none"]),
      "ret_alignment_evidence:",
      ...(retLines.length ? retLines.map((x) => `- ${x}`) : ["- none"]),
      "ret2csu_prerequisites:",
      "- RIP/control offset is proven and payload can place at least the csu pop-chain frame.",
      "- A callable function pointer exists in GOT/init/fini arrays or another controlled/readable table.",
      "- rbx/rbp loop condition can be satisfied, commonly rbx=0 and rbp=1.",
      "- r12/r13/r14/r15 mapping to call target and arguments is verified for this binary, not assumed from memory.",
      "- The second/call gadget is paired with the first/pop gadget from the same binary/runtime and does not clobber required arguments unexpectedly.",
      "- Stack alignment and any post-call continuation are planned.",
      "stop_rules:",
      "- If no csu symbol/gadget shape is present after ROPgadget and objdump evidence, do not keep forcing ret2csu.",
      "- If a simple pop rdi/pop rsi/pop rdx route already exists, ret2csu should not outrank it without a missing-gadget reason.",
      "- If PIE/base is unknown and csu address is needed, first obtain a code leak or choose a non-PIE route.",
    ].join("\n")
  },
})
