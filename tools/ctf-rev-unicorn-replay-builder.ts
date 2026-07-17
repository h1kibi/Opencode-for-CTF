import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`target must stay inside the current workspace: ${input}`)
  return target
}

function normalizeRel(input: string) {
  return input.replace(/\\/g, "/")
}

function compact(text: string, max = 8000) {
  if (text.length <= max) return text
  return `${text.slice(0, Math.floor(max * 0.65))}\n...[truncated ${text.length - max} chars]...\n${text.slice(text.length - Math.floor(max * 0.35))}`
}

function mapArch(arch: string) {
  const v = arch.trim().toLowerCase()
  if (v === "riscv") return "UC_ARCH_RISCV"
  if (v === "mips") return "UC_ARCH_MIPS"
  if (v === "arm64" || v === "aarch64") return "UC_ARCH_ARM64"
  if (v === "x86") return "UC_ARCH_X86"
  return "<ARCH>"
}

function mapMode(mode: string) {
  const v = mode.trim().toLowerCase()
  if (v === "riscv64") return "UC_MODE_RISCV64"
  if (v === "64") return "UC_MODE_64"
  if (v === "32") return "UC_MODE_32"
  return "<MODE>"
}

export default tool({
  description:
    "CTF rev Unicorn replay builder: generate a replay script skeleton from inferred arch/mode, dumped payload bytes, and optional start/stop state for self-decrypt / Unicorn-backed checkers.",
  args: {
    payloadFile: tool.schema.string().describe("Workspace-relative dumped payload or code blob file."),
    arch: tool.schema.string().describe("Recovered or inferred arch, e.g. riscv, mips, arm64, x86."),
    mode: tool.schema.string().describe("Recovered or inferred mode, e.g. riscv64, 64, 32."),
    mapBase: tool.schema.string().optional().describe("Base VA for mem_map/mem_write. Default 0x400000."),
    mapSize: tool.schema.string().optional().describe("Mapped size. Default 0x200000."),
    emuStart: tool.schema.string().optional().describe("Recovered emulation start PC. Default mapBase."),
    emuEnd: tool.schema.string().optional().describe("Recovered emulation stop PC or sentinel. Default 0."),
    stopPc: tool.schema.string().optional().describe("Optional PC to stop at and inspect state."),
    regsJson: tool.schema
      .string()
      .optional()
      .describe("Optional JSON object of register=value pairs to restore before emulation."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory for generated replay script. Default work/rev-unicorn-replay."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const payloadFile = resolveInsideWorkspace(context.directory, args.payloadFile)
    const outDir = resolveInsideWorkspace(context.directory, args.outDir || "work/rev-unicorn-replay")
    await mkdir(outDir, { recursive: true })

    const arch = args.arch.trim()
    const mode = args.mode.trim()
    const mapBase = args.mapBase?.trim() || "0x400000"
    const mapSize = args.mapSize?.trim() || "0x200000"
    const emuStart = args.emuStart?.trim() || mapBase
    const emuEnd = args.emuEnd?.trim() || "0"
    const stopPc = args.stopPc?.trim() || ""
    const regs = args.regsJson ? (JSON.parse(args.regsJson) as Record<string, string | number>) : {}
    const replayPath = path.join(outDir, "unicorn_replay.py")
    const relPayload = normalizeRel(path.relative(outDir, payloadFile))

    const regLines = Object.entries(regs).length
      ? Object.entries(regs).map(
          ([k, v]) =>
            `mu.reg_write(${k}, ${typeof v === "number" ? `0x${v.toString(16)}` : JSON.stringify(String(v))})`,
        )
      : ["# mu.reg_write(UC_<ARCH>_REG_<REG>, <VALUE>)"]

    const stopHook = stopPc
      ? [
          `STOP_PC = int(${JSON.stringify(stopPc)}, 0)`,
          "def hook_code(mu, address, size, user_data):",
          "    if address == STOP_PC:",
          "        print(f'HIT STOP_PC=0x{address:x}')",
          "        raise UcError(0)",
          "mu.hook_add(UC_HOOK_CODE, hook_code)",
        ]
      : ["# Optional: hook code and stop at a recovered compare/check PC"]

    const script =
      [
        "from pathlib import Path",
        "from unicorn import *",
        "from unicorn.riscv_const import *  # adjust for non-RISC-V targets if needed",
        "",
        `ARCH = ${mapArch(arch)}`,
        `MODE = ${mapMode(mode)}`,
        `MAP_BASE = int(${JSON.stringify(mapBase)}, 0)`,
        `MAP_SIZE = int(${JSON.stringify(mapSize)}, 0)`,
        `EMU_START = int(${JSON.stringify(emuStart)}, 0)`,
        `EMU_END = int(${JSON.stringify(emuEnd)}, 0)`,
        `PAYLOAD_PATH = Path(__file__).resolve().parent / ${JSON.stringify(relPayload)}`,
        "payload = PAYLOAD_PATH.read_bytes()",
        "mu = Uc(ARCH, MODE)",
        "mu.mem_map(MAP_BASE, MAP_SIZE)",
        "mu.mem_write(MAP_BASE, payload)",
        ...regLines,
        ...stopHook,
        "try:",
        "    mu.emu_start(EMU_START, EMU_END)",
        "except UcError as e:",
        "    print(f'emu_stop: {e}')",
        "print('Replay finished; inspect key registers and memory here.')",
      ].join("\n") + "\n"

    await writeFile(replayPath, script, "utf8")

    const payload = {
      schema_version: "rev_unicorn_replay_builder.v1",
      payload_file: normalizeRel(path.relative(context.directory, payloadFile)),
      replay_script: normalizeRel(path.relative(context.directory, replayPath)),
      arch,
      mode,
      map_base: mapBase,
      map_size: mapSize,
      emu_start: emuStart,
      emu_end: emuEnd,
      stop_pc: stopPc || "none",
      reg_count: Object.keys(regs).length,
      next_actions: [
        "run the replay script in the same Linux substrate that produced the payload dump",
        "if arch/mode mismatch with runtime dump, correct those first before editing constraints",
        "add recovered uc_reg_write state and compare/check stop PC before deeper symbolic work",
      ],
      replay_script_preview: compact(script, 3000),
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "rev_unicorn_replay_builder:",
      "- schema_version: rev_unicorn_replay_builder.v1",
      `- payload_file: ${payload.payload_file}`,
      `- replay_script: ${payload.replay_script}`,
      `- arch: ${arch}`,
      `- mode: ${mode}`,
      `- map_base: ${mapBase}`,
      `- map_size: ${mapSize}`,
      `- emu_start: ${emuStart}`,
      `- emu_end: ${emuEnd}`,
      `- stop_pc: ${stopPc || "none"}`,
      `- reg_count: ${Object.keys(regs).length}`,
      "next_actions:",
      ...payload.next_actions.map((x) => `- ${x}`),
      "replay_script_preview:",
      payload.replay_script_preview,
    ].join("\n")
  },
})
