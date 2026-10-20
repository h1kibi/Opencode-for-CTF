import { tool } from "@opencode-ai/plugin"
import { access } from "node:fs/promises"
import { recordRuntimeArtifact, updateRuntimeSession } from "../lib/rev-runtime-session-store.ts"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseJsonObjectArg } from "../lib/json-args.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"

function normalizeRel(input: string) {
  return input.replace(/\\/g, "/")
}

function compact(text: string, max = 8000) {
  if (text.length <= max) return text
  return `${text.slice(0, Math.floor(max * 0.65))}\n...[truncated ${text.length - max} chars]...\n${text.slice(text.length - Math.floor(max * 0.35))}`
}

type UnicornTarget = {
  inputArch: string
  inputMode: string
  arch: string
  mode: string
  archConst: string
  modeConst: string
  constModule: string
}

function normalizeUnicornTarget(arch: string, mode: string): UnicornTarget {
  const inputArch = arch.trim().toLowerCase()
  const inputMode = mode.trim().toLowerCase()
  const modeFor = (fallback: string) => {
    const value = inputMode || fallback
    if (value === "64" || value === "x64") return { mode: "64", modeConst: "UC_MODE_64" }
    if (value === "32" || value === "x86" || value === "arm") return { mode: "32", modeConst: "UC_MODE_32" }
    if (value === "arm64" || value === "aarch64") return { mode: "arm", modeConst: "UC_MODE_ARM" }
    if (value === "thumb") return { mode: "thumb", modeConst: "UC_MODE_THUMB" }
    if (value === "riscv64") return { mode: "riscv64", modeConst: "UC_MODE_RISCV64" }
    if (value === "riscv32") return { mode: "riscv32", modeConst: "UC_MODE_RISCV32" }
    if (value === "mips64") return { mode: "mips64", modeConst: "UC_MODE_MIPS64" }
    if (value === "mips32" || value === "mips") return { mode: "mips32", modeConst: "UC_MODE_MIPS32" }
    throw new Error(`unsupported Unicorn mode '${mode}' for arch '${arch}'`)
  }

  if (["x86_64", "amd64", "x64"].includes(inputArch)) {
    return { inputArch, inputMode, arch: "x86", archConst: "UC_ARCH_X86", constModule: "x86_const", ...modeFor("64") }
  }
  if (["x86", "i386", "i686"].includes(inputArch)) {
    return { inputArch, inputMode, arch: "x86", archConst: "UC_ARCH_X86", constModule: "x86_const", ...modeFor("32") }
  }
  if (["arm64", "aarch64"].includes(inputArch)) {
    return {
      inputArch,
      inputMode,
      arch: "arm64",
      archConst: "UC_ARCH_ARM64",
      constModule: "arm64_const",
      ...modeFor("arm64"),
    }
  }
  if (["arm", "arm32"].includes(inputArch)) {
    return { inputArch, inputMode, arch: "arm", archConst: "UC_ARCH_ARM", constModule: "arm_const", ...modeFor("arm") }
  }
  if (inputArch === "thumb") {
    return {
      inputArch,
      inputMode,
      arch: "arm",
      archConst: "UC_ARCH_ARM",
      constModule: "arm_const",
      ...modeFor("thumb"),
    }
  }
  if (["riscv", "riscv64"].includes(inputArch)) {
    return {
      inputArch,
      inputMode,
      arch: "riscv",
      archConst: "UC_ARCH_RISCV",
      constModule: "riscv_const",
      ...modeFor("riscv64"),
    }
  }
  if (inputArch === "riscv32") {
    return {
      inputArch,
      inputMode,
      arch: "riscv",
      archConst: "UC_ARCH_RISCV",
      constModule: "riscv_const",
      ...modeFor("riscv32"),
    }
  }
  if (["mips", "mips32"].includes(inputArch)) {
    return {
      inputArch,
      inputMode,
      arch: "mips",
      archConst: "UC_ARCH_MIPS",
      constModule: "mips_const",
      ...modeFor("mips32"),
    }
  }
  if (inputArch === "mips64") {
    return {
      inputArch,
      inputMode,
      arch: "mips",
      archConst: "UC_ARCH_MIPS",
      constModule: "mips_const",
      ...modeFor("mips64"),
    }
  }
  throw new Error(
    `unsupported Unicorn arch '${arch}' (supported: x86_64, x86, arm64, arm, thumb, riscv64, riscv32, mips32, mips64)`,
  )
}

function renderRegisterValue(value: string | number, name: string): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error(`register '${name}' must be an integer`)
    return String(value)
  }
  const text = String(value).trim()
  if (!/^[+-]?(?:0x[0-9a-f]+|0b[01]+|0o[0-7]+|[0-9]+)$/i.test(text)) {
    throw new Error(`register '${name}' value must be a decimal or prefixed integer: ${text}`)
  }
  return `int(${JSON.stringify(text)}, 0)`
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
    sessionPath: tool.schema
      .string()
      .optional()
      .describe("Optional workspace-relative rev_runtime_session.v1 JSON to register payload and replay artifacts."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const payloadFile = resolveFromDirectoryInsideWorkspace(directory, workspace, args.payloadFile)
    const outDir = resolveInsideWorkspace(workspace, args.outDir || "work/rev-unicorn-replay")
    await mkdir(outDir, { recursive: true })

    const target = normalizeUnicornTarget(args.arch, args.mode)
    const mapBase = args.mapBase?.trim() || "0x400000"
    const mapSize = args.mapSize?.trim() || "0x200000"
    const emuStart = args.emuStart?.trim() || mapBase
    const emuEnd = args.emuEnd?.trim() || "0"
    const stopPc = args.stopPc?.trim() || ""
    const regs = parseJsonObjectArg("regsJson", args.regsJson) as Record<string, string | number>
    const replayPath = path.join(outDir, "unicorn_replay.py")
    const relPayload = normalizeRel(path.relative(outDir, payloadFile))

    const regLines = Object.entries(regs).length
      ? Object.entries(regs).map(([k, v]) => `mu.reg_write(${k}, ${renderRegisterValue(v, k)})`)
      : [`# register constants from unicorn.${target.constModule}; add mu.reg_write(REGISTER, VALUE)`]

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
        `from unicorn.${target.constModule} import *`,
        "",
        `ARCH = ${target.archConst}`,
        `MODE = ${target.modeConst}`,
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

    let runtimeSession: unknown = null
    if (args.sessionPath) {
      const sessionFile = resolveInsideWorkspace(workspace, args.sessionPath)
      if (
        !(await access(sessionFile)
          .then(() => true)
          .catch(() => false))
      ) {
        throw new Error(`runtime session not found: ${normalizeRel(path.relative(workspace, sessionFile))}`)
      }
      if (
        await access(sessionFile)
          .then(() => true)
          .catch(() => false)
      ) {
        runtimeSession = await recordRuntimeArtifact(sessionFile, workspace, {
          path: normalizeRel(path.relative(workspace, payloadFile)),
          kind: "payload-input",
          source: "ctf-rev-unicorn-replay-builder",
          status: "available",
        })
        runtimeSession = await recordRuntimeArtifact(sessionFile, workspace, {
          path: normalizeRel(path.relative(workspace, replayPath)),
          kind: "unicorn-replay-script",
          source: "ctf-rev-unicorn-replay-builder",
          status: "generated",
          notes: `arch=${target.arch} mode=${target.mode} map=${mapBase}+${mapSize}`,
        })
        runtimeSession = await updateRuntimeSession(sessionFile, workspace, "prepare_replay", {
          summary: "Unicorn replay script generated",
          stage: "prepared",
          substrate: { kind: "unicorn", arch: target.arch, mode: target.mode },
          next_action: [
            "run replay in the same substrate as the captured payload",
            "record a native-vs-replay oracle before oracle_verified",
          ],
        })
      }
    }

    const payload = {
      schema_version: "rev_unicorn_replay_builder.v1",
      payload_file: normalizeRel(path.relative(directory, payloadFile)),
      replay_script: normalizeRel(path.relative(directory, replayPath)),
      arch: target.arch,
      mode: target.mode,
      input_arch: target.inputArch,
      input_mode: target.inputMode,
      unicorn_arch_const: target.archConst,
      unicorn_mode_const: target.modeConst,
      register_const_module: target.constModule,
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
      runtime_session: runtimeSession ? { linked: true, session_path: args.sessionPath } : { linked: false },
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "rev_unicorn_replay_builder:",
      "- schema_version: rev_unicorn_replay_builder.v1",
      `- payload_file: ${payload.payload_file}`,
      `- replay_script: ${payload.replay_script}`,
      `- arch: ${target.arch} (input=${target.inputArch})`,
      `- mode: ${target.mode} (input=${target.inputMode})`,
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
