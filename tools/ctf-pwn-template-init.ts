import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path, { resolve as pathResolve } from "node:path"

const __dirname = pathResolve(fileURLToPath(import.meta.url), "..")
const PLUGIN_ROOT = pathResolve(__dirname, "..")
const TEMPLATE_ROOT = path.join(PLUGIN_ROOT, "templates")
const ROUTES: Record<string, { file: string; hints: string[] }> = {
  ret2win: {
    file: "pwn_fast_ret2win.py",
    hints: ["set OFFSET", "verify win/backdoor symbol", "sync prompt if needed"],
  },
  ret2libc: {
    file: "pwn_fast_ret2libc.py",
    hints: ["set OFFSET", "choose LEAK_SYM", "parse leaked bytes", "compute libc base"],
  },
  fmt: {
    file: "pwn_fast_fmt.py",
    hints: ["run leak-first", "feed result to ctf-pwn-format-map", "do not use %n before write target is proven"],
  },
  orw: {
    file: "pwn_fast_orw.py",
    hints: ["set OFFSET", "verify syscall gadgets", "confirm flag path and seccomp allowlist"],
  },
  shellcode: {
    file: "pwn_fast_shellcode.py",
    hints: [
      "set OFFSET or jmp-rsp landing",
      "verify exec stack or RWX path",
      "if seccomp blocks execve, switch to ORW shellcode",
    ],
  },
  menu: {
    file: "pwn_fast_menu.py",
    hints: ["fix menu prompts", "prove exactly one primitive", "handoff if allocator reasoning dominates"],
  },
  blind: {
    file: "pwn_blind_remote_probe.py",
    hints: [
      "set SUCCESS_REGEX or FAIL_REGEX",
      "set PROBE_REPEATS and VERDICT_MODE/MAJORITY_THRESHOLD",
      "for batch comparison set CANDIDATES plus optional RANK_BY/LATENCY_DIRECTION",
      "for automatic byte enumeration set BYTE_MODE=1 and tune BYTE_START/BYTE_END or ASCII_SET",
      "for position-driven extraction set PREFIX/SUFFIX plus optional KNOWN_PREFIX/KNOWN_SUFFIX/CURRENT_INDEX",
      "use SEND or SEND_HEX with {rendered_candidate}/{candidate}/{known_prefix}/{known_suffix} placeholders",
      "tune TOP_K, STOP_ON_DECISION, and EXPORT_BEST_ONLY when using this as a single-position recovery helper",
      "use CONNECT_RETRIES/CONNECT_COOLDOWN/CONNECT_JITTER and optional JSON_OUT before hand-written reconnect or vote code",
    ],
  },
  raw: {
    file: "pwn_fast_raw.py",
    hints: [
      "replace canary payload",
      "set RECVUNTIL/SEND/SENDLINE env if useful",
      "upgrade to a specific route template once known",
    ],
  },
}

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

async function exists(file: string) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

function pyString(value: string) {
  return JSON.stringify(value.replace(/\\/g, "/"))
}

function patchDefaults(content: string, args: { binary?: string; libc?: string; host?: string; port?: string }) {
  let out = content
  if (args.binary)
    out = out.replace(/BIN = os\.getenv\("BIN", "\.\/chall"\)/, `BIN = os.getenv("BIN", ${pyString(args.binary)})`)
  if (args.libc)
    out = out.replace(
      /LIBC = os\.getenv\("LIBC", "\.\/libc\.so\.6"\)/,
      `LIBC = os.getenv("LIBC", ${pyString(args.libc)})`,
    )
  if (args.host)
    out = out.replace(/HOST = os\.getenv\("HOST", ""\)/, `HOST = os.getenv("HOST", ${pyString(args.host)})`)
  if (args.port)
    out = out.replace(
      /PORT = int\(os\.getenv\("PORT", "0"\)\)/,
      `PORT = int(os.getenv("PORT", ${JSON.stringify(args.port)}))`,
    )
  return out
}

export default tool({
  description:
    "CTF PWN fast template init: copy a route-specific exploit template to exploit.py with optional binary/libc/remote defaults.",
  args: {
    route: tool.schema.string().describe("ret2win | ret2libc | fmt | orw | shellcode | menu | blind | raw"),
    output: tool.schema.string().optional().describe("Workspace-relative output file. Default exploit.py."),
    binary: tool.schema.string().optional().describe("Workspace-relative binary default to embed, e.g. ./chall."),
    libc: tool.schema.string().optional().describe("Workspace-relative libc default to embed, e.g. ./libc.so.6."),
    host: tool.schema.string().optional().describe("Remote host default to embed."),
    port: tool.schema.string().optional().describe("Remote port default to embed."),
    overwrite: tool.schema.boolean().optional().describe("Overwrite existing output. Default false."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const routeKey = args.route.toLowerCase().replace(/[-_ ]+/g, "")
    const route =
      routeKey === "heap" || routeKey === "menuheap"
        ? "menu"
        : routeKey === "shell" || routeKey === "shcode"
          ? "shellcode"
          : routeKey === "blindprobe" || routeKey === "blindremote" || routeKey === "sidechannel"
            ? "blind"
            : routeKey
    const selected = ROUTES[route]
    if (!selected) return `BLOCK: unsupported route '${args.route}'. Use ${Object.keys(ROUTES).join(", ")}`

    const outRel = args.output || "exploit.py"
    const outPath = resolveInsideWorkspace(context.directory, outRel)
    if ((await exists(outPath)) && !args.overwrite) {
      return `BLOCK: ${outRel} already exists. Pass overwrite=true or choose output.`
    }

    const templatePath = path.join(TEMPLATE_ROOT, selected.file)
    let content = await readFile(templatePath, "utf8")
    content = patchDefaults(content, args)
    const header = `# Generated from ${selected.file} by ctf-pwn-template-init.\n# Route: ${route}. Keep exploit.py as fast-mode working memory.\n`
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, `${header}${content}`, "utf8")

    const payload = {
      operation: "ctf-pwn-template-init",
      route,
      template: selected.file,
      output: outRel,
      output_path: outPath,
      next_edit_points: selected.hints,
      run_local: `python ${outRel}`,
      run_remote:
        args.host && args.port
          ? `$env:REMOTE=1; python ${outRel}`
          : "set HOST/PORT/REMOTE=1 then run python exploit.py",
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_TEMPLATE_INIT",
      `route: ${payload.route}`,
      `template: ${payload.template}`,
      `output: ${payload.output}`,
      `output_path: ${payload.output_path}`,
      "next_edit_points:",
      ...payload.next_edit_points.map((item) => `- ${item}`),
      `run_local: ${payload.run_local}`,
      `run_remote: ${payload.run_remote}`,
    ].join("\n")
  },
})
