import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { readFile } from "node:fs/promises"
import { safeExec } from "./lib/exec-utils.ts"
import {
  binshOffsetBigInt,
  hexOrUnknown,
  parseOneGadgetCompact,
  parseVersion,
  symbolOffsetBigInt,
} from "./lib/pwn-libc-core.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

function parseHex(value: string) {
  const clean = value.trim().replace(/^0x/i, "").replace(/[^0-9a-fA-F]/g, "")
  if (!clean) throw new Error("leakAddress must be a hex value")
  return BigInt(`0x${clean}`)
}

export default tool({
  description:
    "CTF pwn libc hint: convert one leaked symbol address into a libc base guess and compact offset hints using a local bundled libc.",
  args: {
    libc: tool.schema.string().describe("Workspace-relative libc path."),
    leakSymbol: tool.schema.string().describe("Leaked symbol name, for example puts or __libc_start_main."),
    leakAddress: tool.schema.string().describe("Leaked absolute address in hex form, for example 0x7ffff7a5d000."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per helper command in ms. Default 6000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const libc = resolveInsideWorkspace(context.directory, args.libc)
    const cwd = path.dirname(libc)
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 6000, 30000))
    const raw = await readFile(libc)
    const text = raw.toString("latin1")
    const leakAddress = parseHex(args.leakAddress)
    const leakSymbol = String(args.leakSymbol).trim()
    const readelfR = await safeExec("readelf", ["-Ws", libc], cwd, timeoutMs)
    const nmR = await safeExec("nm", ["-D", libc], cwd, timeoutMs)
    const oneGadgetR = await safeExec("one_gadget", [libc], cwd, timeoutMs)
    const lines = `${readelfR.output}\n${nmR.output}`.split(/\r?\n/)
    const leakOffset = symbolOffsetBigInt(lines, leakSymbol)
    const systemOffset = symbolOffsetBigInt(lines, "system")
    const putsOffset = symbolOffsetBigInt(lines, "puts")
    const libcStartMainOffset = symbolOffsetBigInt(lines, "__libc_start_main")
    const setcontextOffset = symbolOffsetBigInt(lines, "setcontext")
    const mprotectOffset = symbolOffsetBigInt(lines, "mprotect")
    const execveOffset = symbolOffsetBigInt(lines, "execve")
    const binshOffset = binshOffsetBigInt(raw)
    const libcBase = leakOffset === null ? null : leakAddress - leakOffset
    const oneGadgets = parseOneGadgetCompact(oneGadgetR.output)
    const payload = {
      schema_version: "pwn_libc_hint.v1",
      libc,
      glibc_version: parseVersion(text),
      leak_symbol: leakSymbol,
      leak_address: `0x${leakAddress.toString(16)}`,
      leak_offset: hexOrUnknown(leakOffset),
      libc_base: hexOrUnknown(libcBase),
      symbol_offsets: {
        system: hexOrUnknown(systemOffset),
        puts: hexOrUnknown(putsOffset),
        __libc_start_main: hexOrUnknown(libcStartMainOffset),
        setcontext: hexOrUnknown(setcontextOffset),
        mprotect: hexOrUnknown(mprotectOffset),
        execve: hexOrUnknown(execveOffset),
      },
      symbol_addresses:
        libcBase === null
          ? null
          : {
              system: systemOffset === null ? "unknown" : `0x${(libcBase + systemOffset).toString(16)}`,
              puts: putsOffset === null ? "unknown" : `0x${(libcBase + putsOffset).toString(16)}`,
              __libc_start_main:
                libcStartMainOffset === null ? "unknown" : `0x${(libcBase + libcStartMainOffset).toString(16)}`,
              setcontext: setcontextOffset === null ? "unknown" : `0x${(libcBase + setcontextOffset).toString(16)}`,
              mprotect: mprotectOffset === null ? "unknown" : `0x${(libcBase + mprotectOffset).toString(16)}`,
              execve: execveOffset === null ? "unknown" : `0x${(libcBase + execveOffset).toString(16)}`,
            },
      bin_sh_offset: hexOrUnknown(binshOffset),
      bin_sh_address: libcBase !== null && binshOffset !== null ? `0x${(libcBase + binshOffset).toString(16)}` : "unknown",
      one_gadget_hints: oneGadgets,
      best_fast_path:
        libcBase !== null && systemOffset !== null && binshOffset !== null
          ? "use the computed libc base to build the shortest ret2libc closure first"
          : "verify the leak symbol/offset pair before mutating gadgets or closure family",
      one_variable_probe:
        libcBase !== null
          ? "reuse the same leak path once and confirm the derived base stays stable"
          : "re-check the leak symbol identity against the local libc offsets",
      recommended_next_action:
        libcBase !== null && systemOffset !== null && binshOffset !== null
          ? "patch the exploit with libc base, system, and /bin/sh, then verify the shortest closure path"
          : "use ctf-pwn-libc-resolver or ctf-pwn-libc-fingerprint to confirm the bundled libc before finalizing offsets",
      fallback_action: "if local and remote bases diverge, re-check the libc/ld pair and the exact leaked symbol before changing exploit family",
      stop_if: "the same leak produces inconsistent bases or the bundled libc does not match the runtime; ESCALATE: ctf-expert",
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_LIBC_HINT",
      `libc: ${payload.libc}`,
      `glibc_version: ${payload.glibc_version}`,
      `leak_symbol: ${payload.leak_symbol}`,
      `leak_address: ${payload.leak_address}`,
      `leak_offset: ${payload.leak_offset}`,
      `libc_base: ${payload.libc_base}`,
      `bin_sh_offset: ${payload.bin_sh_offset}`,
      `bin_sh_address: ${payload.bin_sh_address}`,
      `best_fast_path: ${payload.best_fast_path}`,
      `one_variable_probe: ${payload.one_variable_probe}`,
      `recommended_next_action: ${payload.recommended_next_action}`,
      `fallback_action: ${payload.fallback_action}`,
      `stop_if: ${payload.stop_if}`,
      "symbol_offsets:",
      ...Object.entries(payload.symbol_offsets).map(([k, v]) => `- ${k}: ${v}`),
      "symbol_addresses:",
      ...(payload.symbol_addresses
        ? Object.entries(payload.symbol_addresses).map(([k, v]) => `- ${k}: ${v}`)
        : ["- unknown"]),
      "one_gadget_hints:",
      ...(payload.one_gadget_hints.length ? payload.one_gadget_hints.map((x) => `- ${x}`) : ["- unavailable_or_not_parsed"]),
    ].join("\n")
  },
})
