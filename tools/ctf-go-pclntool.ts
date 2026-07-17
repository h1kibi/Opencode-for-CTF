import { tool } from "@opencode-ai/plugin"
import { access, lstat, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExec, safeExecDocker, shellQuote } from "./lib/exec-utils.ts"
import { pwnImage, revImage } from "./lib/docker-config.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`target must stay inside the current workspace: ${input}`)
  return target
}

async function tryHostGo(): Promise<{ available: boolean; version: string }> {
  const { output, ok } = await safeExec("go", ["version"], process.cwd(), 5000)
  return { available: ok && /go version/i.test(output), version: ok ? output.split("\n")[0] : "" }
}

async function tryDockerImage(image: string): Promise<{ available: boolean; reason: string }> {
  const { output, ok } = await safeExec(
    "docker",
    ["image", "inspect", image, "--format", "{{.Id}}"],
    process.cwd(),
    5000,
  )
  if (ok && /sha256:/.test(output)) return { available: true, reason: "" }
  return { available: false, reason: output.split("\n")[0]?.slice(0, 200) || "image_not_present" }
}

type GoSymbol = {
  addr: string
  type: string
  name: string
  category: "main" | "user" | "stdlib" | "runtime" | "init" | "anonymous" | "type" | "other"
}

const RUNTIME_PREFIXES = [
  "runtime.",
  "internal/",
  "sync.",
  "syscall.",
  "type:",
  "type..",
  "go:itab.",
  "go:string.",
  "reflect.",
  "os.",
  "io.",
  "fmt.",
  "encoding/",
  "errors.",
]
const STDLIB_PREFIXES = [
  "encoding/",
  "crypto/",
  "hash/",
  "math/",
  "strings.",
  "strconv.",
  "bytes.",
  "bufio.",
  "io.",
  "os.",
  "sort.",
  "time.",
  "unicode/",
  "regexp.",
  "context.",
  "net/",
  "html/",
  "mime/",
  "text/",
]

function classifyGoSymbol(name: string): GoSymbol["category"] {
  if (!name) return "anonymous"
  if (
    name.startsWith("type:") ||
    name.startsWith("type..") ||
    name.startsWith("go:itab.") ||
    name.startsWith("go:string.")
  )
    return "type"
  if (name.startsWith("main.")) return "main"
  if (name.endsWith(".init") || name === "main.init" || name.includes(".init.")) return "init"
  for (const p of RUNTIME_PREFIXES) if (name.startsWith(p)) return "runtime"
  for (const p of STDLIB_PREFIXES) if (name.startsWith(p)) return "stdlib"
  if (/^[A-Za-z][\w.]+\./.test(name) && !name.startsWith("_")) return "user"
  return "other"
}

function parseGoNm(text: string): GoSymbol[] {
  const out: GoSymbol[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-fA-F]+)\s+([A-Za-z?])\s+(.+)$/)
    if (!m) continue
    const name = m[3].trim()
    out.push({ addr: `0x${m[1]}`, type: m[2], name, category: classifyGoSymbol(name) })
  }
  return out
}

function emitRenameScript(symbols: GoSymbol[], maxRenames = 200, format: "ida" | "reva" | "ghidra" = "ida") {
  const want = symbols.filter((s) => ["main", "user", "init"].includes(s.category)).slice(0, maxRenames)
  if (format === "ida") {
    const lines = ["# IDA Python: rename Go functions from go-pclntool", "import idc, idaapi", "for ea, name in ["]
    for (const s of want) {
      const sanitized = s.name.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 220)
      lines.push(`    (${s.addr}, "${sanitized}"),`)
    }
    lines.push("]:")
    lines.push("    if ea and idc.set_name(ea, name, idc.SN_NOWARN | idc.SN_FORCE):")
    lines.push("        print(f'renamed {ea:#x} -> {name}')")
    return lines.join("\n") + "\n"
  }
  if (format === "reva") {
    const lines = ["# ReVa MCP rename batch (jsonl)"]
    for (const s of want) {
      lines.push(JSON.stringify({ tool: "ReVa_rename-variables", address: s.addr, name: s.name }))
    }
    return lines.join("\n") + "\n"
  }
  // ghidra python
  const lines = [
    "# Ghidra Python: rename Go functions from go-pclntool",
    "from ghidra.program.model.symbol import SourceType",
    "fm = currentProgram.getFunctionManager()",
    "st = currentProgram.getSymbolTable()",
    "for addr_str, name in [",
  ]
  for (const s of want) {
    const sanitized = s.name.replace(/[^A-Za-z0-9_.]/g, "_").slice(0, 220)
    lines.push(`    ("${s.addr}", "${sanitized}"),`)
  }
  lines.push("]:")
  lines.push("    addr = toAddr(addr_str)")
  lines.push("    fn = fm.getFunctionAt(addr)")
  lines.push("    if fn:")
  lines.push("        fn.setName(name, SourceType.USER_DEFINED)")
  lines.push("        print(f'renamed {addr} -> {name}')")
  return lines.join("\n") + "\n"
}

export default tool({
  description:
    "CTF Go pclntool: run go tool nm / go tool objdump (host or revlab docker) for Go-built ELFs, classify symbols (main/user/runtime/stdlib/type), and emit IDA/ReVa/Ghidra rename scripts to stabilize Go function name recovery beyond static pclntab parsing.",
  args: {
    target: tool.schema.string().describe("Workspace-relative Go-built binary path."),
    backend: tool.schema
      .string()
      .optional()
      .describe("auto | host | docker. Default auto (host first, docker fallback)."),
    image: tool.schema
      .string()
      .optional()
      .describe("Docker image override. Default revlab:ubuntu22.04 then pwnlab:general-ubuntu22.04."),
    objdumpFunctions: tool.schema
      .string()
      .optional()
      .describe(
        "Comma-separated function names/regex to dump via 'go tool objdump -s'. Default '^main\\.|encode|decode|check|verify|flag'.",
      ),
    maxObjdumpFunctions: tool.schema.number().optional().describe("Max functions to objdump. Default 6."),
    maxObjdumpLines: tool.schema.number().optional().describe("Max disasm lines per function. Default 200."),
    renameFormat: tool.schema.string().optional().describe("ida | reva | ghidra. Default ida."),
    maxRenames: tool.schema.number().optional().describe("Max symbols in rename script. Default 200."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output dir for rename script. Default work/rev-go-pclntool."),
    timeoutMs: tool.schema.number().optional().describe("Per-command timeout in ms. Default 30000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    await access(target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a Go ELF/PE binary file")

    const backendArg = (args.backend ?? "auto").toLowerCase()
    const image = args.image || revImage("ubuntu22.04")
    const objdumpFiltersRaw = args.objdumpFunctions || "^main\\.|encode|decode|check|verify|flag"
    const objdumpFilters = objdumpFiltersRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const maxObjdumpFunctions = Math.max(1, Math.min(20, args.maxObjdumpFunctions ?? 6))
    const maxObjdumpLines = Math.max(40, Math.min(2000, args.maxObjdumpLines ?? 200))
    const renameFormat = (["ida", "reva", "ghidra"].includes(args.renameFormat || "") ? args.renameFormat : "ida") as
      "ida" | "reva" | "ghidra"
    const maxRenames = Math.max(10, Math.min(2000, args.maxRenames ?? 200))
    const outDir = resolveInsideWorkspace(context.directory, args.outDir || "work/rev-go-pclntool")
    const timeoutMs = Math.max(8000, Math.min(180000, args.timeoutMs ?? 30000))
    await mkdir(outDir, { recursive: true })

    // 閫夋嫨 backend
    const hostGo = await tryHostGo()
    let chosenBackend: "host" | "docker" = "host"
    let chosenImage = ""
    let backendReason = ""
    if (backendArg === "host") {
      if (!hostGo.available) {
        return [
          "go_pclntool: backend=host but host go is missing",
          "advice: install Go locally OR rerun with backend=auto/docker",
          `host_go_probe: ${hostGo.version || "<missing>"}`,
        ].join("\n")
      }
      chosenBackend = "host"
      backendReason = "host_go_available"
    } else if (backendArg === "docker") {
      const probe = await tryDockerImage(image)
      if (!probe.available) {
        const fb = await tryDockerImage(pwnImage("general-ubuntu22.04"))
        if (!fb.available) {
          return [
            "go_pclntool: docker forced but image missing",
            `requested_image: ${image} -> ${probe.reason}`,
            `fallback_image: ${pwnImage("general-ubuntu22.04")} -> ${fb.reason}`,
            "advice: docker compose -f docker/docker-compose.revlab.yml --profile revlab build revlab",
          ].join("\n")
        }
        chosenImage = pwnImage("general-ubuntu22.04")
        backendReason = `requested_image_missing_fallback_${pwnImage("general-ubuntu22.04")}`
      } else {
        chosenImage = image
        backendReason = `image_present_${image}`
      }
      chosenBackend = "docker"
    } else {
      // auto
      if (hostGo.available) {
        chosenBackend = "host"
        backendReason = "host_go_available"
      } else {
        const probe = await tryDockerImage(image)
        if (probe.available) {
          chosenBackend = "docker"
          chosenImage = image
          backendReason = `host_go_missing_using_${image}`
        } else {
          const fb = await tryDockerImage(pwnImage("general-ubuntu22.04"))
          if (fb.available) {
            chosenBackend = "docker"
            chosenImage = pwnImage("general-ubuntu22.04")
            backendReason = `host_go_missing_image_missing_fallback_${pwnImage("general-ubuntu22.04")}`
          } else {
            return [
              "go_pclntool: no host go and no usable docker image",
              `host_go_probe: ${hostGo.version || "<missing>"}`,
              `requested_image: ${image} -> ${probe.reason}`,
              `fallback_image: ${pwnImage("general-ubuntu22.04")} -> ${fb.reason}`,
              "advice: docker compose -f docker/docker-compose.revlab.yml --profile revlab build revlab",
              "  or install Go on host: https://go.dev/dl/",
            ].join("\n")
          }
        }
      }
    }

    // 鎵ц go tool nm
    const runCmd = async (cmd: string) => {
      if (chosenBackend === "host") {
        const tokens = cmd.replace("__TARGET__", target).match(/(?:[^\s"]+|"[^"]*")+/g) || []
        const argv = tokens.map((t) => t.replace(/^"|"$/g, ""))
        const head = argv.shift() || ""
        return await safeExec(head, argv, path.dirname(target), timeoutMs)
      }
      return await safeExecDocker(context.directory, target, chosenImage || image, cmd, timeoutMs)
    }

    const versionRes = await runCmd("go version")
    const nmRes = await runCmd(`go tool nm "__TARGET__"`)
    const symbols = nmRes.ok ? parseGoNm(nmRes.output) : []

    // 鍒嗙被缁熻
    const counts: Record<GoSymbol["category"], number> = {
      main: 0,
      user: 0,
      stdlib: 0,
      runtime: 0,
      init: 0,
      anonymous: 0,
      type: 0,
      other: 0,
    }
    for (const s of symbols) counts[s.category]++

    // 閫夋嫨 objdump 鐩爣
    const filterRes = objdumpFilters.map((f) => new RegExp(f))
    const objdumpTargets: string[] = []
    const seen = new Set<string>()
    for (const s of symbols) {
      if (objdumpTargets.length >= maxObjdumpFunctions) break
      if (s.category === "runtime" || s.category === "type") continue
      if (!filterRes.some((re) => re.test(s.name))) continue
      if (seen.has(s.name)) continue
      seen.add(s.name)
      objdumpTargets.push(s.name)
    }
    if (!objdumpTargets.length) {
      const mains = symbols.filter((s) => s.category === "main").slice(0, maxObjdumpFunctions)
      for (const m of mains) objdumpTargets.push(m.name)
    }

    // 璺?objdump(姣忎釜鍑芥暟)
    const objdumpResults: Array<{ name: string; ok: boolean; head: string; tail: string; lineCount: number }> = []
    for (const fname of objdumpTargets) {
      const escaped = fname.replace(/"/g, '\\"').replace(/\$/g, "\\$")
      const cmd = `go tool objdump -s '^${escaped}$' "__TARGET__"`
      const r = await runCmd(cmd)
      const lines = r.output.split(/\r?\n/)
      objdumpResults.push({
        name: fname,
        ok: r.ok && lines.length > 1,
        head: lines.slice(0, Math.min(maxObjdumpLines, 30)).join("\n"),
        tail: lines.length > maxObjdumpLines ? lines.slice(lines.length - 30).join("\n") : "",
        lineCount: lines.length,
      })
    }

    // 鐢熸垚 rename 鑴氭湰
    const renameScript = emitRenameScript(symbols, maxRenames, renameFormat)
    const renamePath = path.join(outDir, `rename_${renameFormat}.${renameFormat === "reva" ? "jsonl" : "py"}`)
    await writeFile(renamePath, renameScript, "utf8")

    // 涓昏 user-code 鍑芥暟鍦板潃娓呭崟(鐢ㄤ簬 IDA/ReVa pivot)
    const userPriority = symbols
      .filter((s) => ["main", "user", "init"].includes(s.category))
      .slice(0, 60)
      .map((s) => `${s.addr}\t${s.name}`)

    const payload = {
      schema_version: "go_pclntool.v1",
      target,
      size: st.size,
      backend: chosenBackend,
      backend_reason: backendReason,
      docker_image: chosenBackend === "docker" ? chosenImage || image : null,
      go_version: versionRes.output.split("\n")[0] || "",
      total_symbols: symbols.length,
      symbol_counts: counts,
      objdump_targets: objdumpTargets,
      objdump_results: objdumpResults.map((r) => ({ name: r.name, ok: r.ok, lineCount: r.lineCount })),
      user_priority_top60: userPriority,
      rename_script_path: path.relative(context.directory, renamePath).replace(/\\/g, "/"),
      rename_format: renameFormat,
      recommended_next: [] as string[],
    }

    if (!symbols.length)
      payload.recommended_next.push(
        "go tool nm produced no symbols; verify the binary is Go-built or the binary is fully stripped (.gopclntab may still help 鈥?try ctf-go-binary-assist)",
      )
    else {
      payload.recommended_next.push(`apply rename script ${payload.rename_script_path} in your decompiler`)
      payload.recommended_next.push("pivot to top user-code addresses in ReVa or ida-pro_decompile")
    }
    if (objdumpResults.some((r) => r.ok))
      payload.recommended_next.push(
        `inspect objdump output for first user functions: ${objdumpResults
          .filter((r) => r.ok)
          .slice(0, 3)
          .map((r) => r.name)
          .join(", ")}`,
      )
    if (chosenBackend === "docker" && backendReason.includes("fallback_pwn-general"))
      payload.recommended_next.push(
        "revlab image was missing; build it with: docker compose -f docker/docker-compose.revlab.yml --profile revlab build revlab",
      )

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "go_pclntool:",
      `- schema_version: ${payload.schema_version}`,
      `- target: ${target}`,
      `- size: ${st.size}`,
      `- backend: ${chosenBackend}`,
      `- backend_reason: ${backendReason}`,
      `- docker_image: ${payload.docker_image || "n/a"}`,
      `- go_version: ${payload.go_version}`,
      `- total_symbols: ${symbols.length}`,
      "symbol_counts:",
      ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`),
      "objdump_targets:",
      ...(objdumpTargets.length ? objdumpTargets.map((x) => `- ${x}`) : ["- none"]),
      "objdump_results (head):",
      ...(objdumpResults.length
        ? objdumpResults.flatMap((r) => [`--- ${r.name} (ok=${r.ok}, lines=${r.lineCount}) ---`, r.head || "<empty>"])
        : ["- none"]),
      "user_priority_top60:",
      ...(userPriority.length ? userPriority.map((x) => `- ${x}`) : ["- none"]),
      `rename_script_path: ${payload.rename_script_path}`,
      `rename_format: ${renameFormat}`,
      "recommended_next:",
      ...payload.recommended_next.map((x) => `- ${x}`),
    ].join("\n")
  },
})
