import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { safeExec, execFile } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

function safeOutPath(contextDir: string, input?: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input || "work/java-decompiled")
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("out must stay inside workspace")
  return target
}

async function exists(cmd: string) {
  try {
    await execFile(cmd, ["--help"], { timeout: 3000, maxBuffer: 200000 })
    return true
  } catch {
    return false
  }
}

export default tool({
  description:
    "CTF Java selective decompile: decompile only selected .class targets from bytecode hints using cfr/jadx/fernflower when available, otherwise javap fallback, and summarize output files/snippets.",
  args: {
    root: tool.schema.string().describe("Extracted class root such as BOOT-INF/classes or WEB-INF/classes"),
    targets: tool.schema
      .string()
      .describe("Newline/comma-separated .class relative paths from ctf-java-bytecode-hints Decompile Targets"),
    out: tool.schema.string().optional().describe("Output directory inside workspace. Default work/java-decompiled."),
  },
  async execute(args, context) {
    const fs = await import("fs/promises")
    const root = resolveInsideWorkspace(context.directory, args.root)
    const out = safeOutPath(context.directory, args.out)
    await fs.mkdir(out, { recursive: true })
    const targets = args.targets
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 40)
    const haveCfr = await exists("cfr")
    const haveJadx = await exists("jadx")
    const results: string[] = []

    for (const t of targets) {
      const clean = t.replace(/^[-*]\s*/, "")
      const abs = resolveInsideWorkspace(root, clean)
      const relNoExt = clean.replace(/\.class$/i, "")
      const dest = path.join(out, relNoExt.replace(/[\\/]/g, "_"))
      await fs.mkdir(dest, { recursive: true })
      let output = ""
      if (haveCfr) {
        output = (await safeExec("cfr", [abs, "--outputdir", dest], root, 15000)).output
      } else if (haveJadx) {
        output = (await safeExec("jadx", ["-d", dest, abs], root, 15000)).output
      } else {
        output = (await safeExec("javap", ["-c", "-p", "-v", abs], root, 15000)).output
        await fs.writeFile(path.join(dest, `${path.basename(clean)}.javap.txt`), output, "utf8")
      }
      results.push(
        `target: ${clean}\nout: ${path.relative(path.resolve(context.directory), dest)}\nmethod: ${haveCfr ? "cfr" : haveJadx ? "jadx" : "javap"}\n${output.split(/\r?\n/).slice(0, 30).join("\n")}`,
      )
    }

    return [
      "# Java Selective Decompile",
      `root: ${root}`,
      `out: ${out}`,
      `targets: ${targets.length}`,
      "",
      "## Results",
      ...(results.length ? results : ["- no targets"]),
      "",
      "## Next Steps",
      "- Run ctf-java-source-slice on the output directory if source-like files were produced.",
      "- Otherwise inspect javap snippets and decompile only adjacent route/sink classes.",
      "- Pair decompiled targets with Java Constraint Equation before payloads.",
    ].join("\n")
  },
})
