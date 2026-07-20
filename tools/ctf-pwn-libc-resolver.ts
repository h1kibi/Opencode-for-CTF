import { tool } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { safeExec } from "./lib/exec-utils.ts"
import {
  binshOffsetHex,
  parseMinor,
  parseOneGadgetDetailed,
  parseVersion,
  symbolOffsetHex,
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

export default tool({
  description:
    "CTF pwn libc resolver: summarize glibc version, key symbol offsets, /bin/sh, one_gadget hints, and glibc feature gates from a bundled libc.",
  args: {
    libc: tool.schema.string().describe("Workspace-relative libc path."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per helper command in ms. Default 6000."),
  },
  async execute(args, context) {
    const libc = resolveInsideWorkspace(context.directory, args.libc)
    const cwd = path.dirname(libc)
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 6000, 30000))
    const raw = await readFile(libc)
    const text = raw.toString("latin1")
    const version = parseVersion(text)
    const minor = parseMinor(version)
    const readelfR = await safeExec("readelf", ["-Ws", libc], cwd, timeoutMs)
    const readelfOut = readelfR.output
    const nmR = await safeExec("nm", ["-D", libc], cwd, timeoutMs)
    const nmOut = nmR.output
    const oneGadgetR = await safeExec("one_gadget", [libc], cwd, timeoutMs)
    const oneGadgetOut = oneGadgetR.output
    const lines = `${readelfOut}\n${nmOut}`.split(/\r?\n/)

    const symbols = {
      system: symbolOffsetHex(lines, "system"),
      puts: symbolOffsetHex(lines, "puts"),
      read: symbolOffsetHex(lines, "read"),
      write: symbolOffsetHex(lines, "write"),
      open: symbolOffsetHex(lines, "open"),
      openat: symbolOffsetHex(lines, "openat"),
      environ: symbolOffsetHex(lines, "environ"),
      __libc_start_main: symbolOffsetHex(lines, "__libc_start_main"),
      __free_hook: symbolOffsetHex(lines, "__free_hook"),
      __malloc_hook: symbolOffsetHex(lines, "__malloc_hook"),
      setcontext: symbolOffsetHex(lines, "setcontext"),
      mprotect: symbolOffsetHex(lines, "mprotect"),
      execve: symbolOffsetHex(lines, "execve"),
    }

    const featureHints = [
      minor >= 26 ? "tcache_present" : "pre_tcache",
      minor >= 32 ? "safe_linking_likely" : "safe_linking_unlikely",
      minor >= 34 ? "malloc_free_hooks_removed_or_unreliable" : "hooks_still_expected",
      minor >= 35 ? "modern_glibc_fsop_constraints_higher" : "older_glibc_fsop_more_likely",
      minor >= 34 ? "modern_setcontext_or_orw_routes_may_outrank_hook_routes" : "classic_hook_routes_more_plausible",
    ]

    const routeHints = [
      symbols.system !== "unknown" && binshOffsetHex(raw) !== "unknown" ? "ret2libc_system_binsh_candidate" : "",
      symbols.__free_hook !== "unknown" && minor > -1 && minor < 34
        ? "free_hook_overwrite_candidate_if_write_primitive_exists"
        : "",
      symbols.__malloc_hook !== "unknown" && minor > -1 && minor < 34
        ? "malloc_hook_candidate_if_allocator_route_fits"
        : "",
      symbols.setcontext !== "unknown" ? "setcontext_oriented_route_candidate" : "",
      symbols.mprotect !== "unknown" ? "mprotect_rop_candidate" : "",
      symbols.execve !== "unknown" ? "execve_symbol_available" : "",
      minor >= 32 ? "heap_routes_must_account_for_safe_linking" : "",
      minor >= 34 ? "do_not_default_to_malloc_free_hook_targets" : "",
    ].filter(Boolean)

    const oneGadgets = parseOneGadgetDetailed(oneGadgetOut)

    return [
      "pwn_libc_resolver:",
      `libc: ${libc}`,
      `glibc_version: ${version}`,
      `bin_sh_offset: ${binshOffsetHex(raw)}`,
      "symbol_offsets:",
      ...Object.entries(symbols).map(([k, v]) => `- ${k}: ${v}`),
      "one_gadget_hints:",
      ...(oneGadgets.length ? oneGadgets.map((x) => `- ${x}`) : ["- unavailable_or_not_parsed"]),
      "feature_hints:",
      ...featureHints.map((x) => `- ${x}`),
      "route_hints:",
      ...(routeHints.length ? routeHints.map((x) => `- ${x}`) : ["- none"]),
      "notes:",
      "- Treat one_gadget output as a convenience hint; constraints still need manual confirmation.",
      "- Use these as routing clues, not proof of exploitability.",
      "- Confirm leak/base correctness before using any offset in a final chain.",
      "- If local works but remote fails, recheck libc/ld pair before changing gadgets.",
    ].join("\n")
  },
})
