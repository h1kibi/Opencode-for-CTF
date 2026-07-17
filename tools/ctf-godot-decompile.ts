import { tool } from "@opencode-ai/plugin"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExecWithStreams } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function findGdre() {
  const configured = process.env.GDRE_TOOLS_PATH
  const home = process.env.USERPROFILE || process.env.HOME || ""
  const candidates = [
    configured,
    path.join(home, "tools", "godot", "gdsdecomp", "v2.5.0", "gdre_tools.exe"),
    path.join(home, "tools", "godot", "gdsdecomp", "gdre_tools.exe"),
    "C:\\Tools\\godot\\gdsdecomp\\gdre_tools.exe",
  ].filter((value): value is string => Boolean(value))
  return candidates.find((p) => existsSync(p)) || ""
}

function safeSlug(input: string) {
  return input.replace(/[^A-Za-z0-9_.-]+/g, "_")
}

async function inferBytecodeHint(target: string) {
  const base = path.basename(target).toLowerCase()
  if (base === "project.binary") return "4.3.0"
  if (base.endsWith(".gdc") || base.endsWith(".gde")) return "4.3.0"
  if (base.endsWith(".pck") || base.endsWith(".apk") || base.endsWith(".exe")) return "4.3.0"
  return ""
}

export default tool({
  description:
    "CTF Godot decompile wrapper: call local gdre_tools for list-files, extract, recover, or decompile workflows without manual CLI assembly.",
  args: {
    target: tool.schema.string().describe("Workspace-relative Godot .pck/.exe/.apk/.gdc/.dir target."),
    mode: tool.schema.string().describe("list-files | extract | recover | decompile | list-bytecode-versions"),
    outputDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output dir. Default work/godot/<target-slug>/<mode>."),
    key: tool.schema.string().optional().describe("Optional encryption key for encrypted PCKs/projects."),
    forceBytecodeVersion: tool.schema
      .string()
      .optional()
      .describe("Optional force bytecode version/commit for decompile/recover."),
    customBytecodeJson: tool.schema
      .string()
      .optional()
      .describe("Optional workspace-relative custom bytecode JSON file."),
    scriptsOnly: tool.schema.boolean().optional().describe("For extract/recover: scripts-only mode."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const gdre = findGdre()
    if (!gdre) throw new Error("gdre_tools.exe not found. Run doctor-godot-rev first.")

    const mode = args.mode
    const validModes = ["list-files", "extract", "recover", "decompile", "list-bytecode-versions"]
    if (!validModes.includes(mode)) throw new Error(`unsupported mode: ${mode}`)

    const target = mode === "list-bytecode-versions" ? "" : resolveInsideWorkspace(context.directory, args.target)
    const outDir = resolveInsideWorkspace(
      context.directory,
      args.outputDir || path.join("work", "godot", safeSlug(path.basename(args.target || "godot")), mode),
    )
    await mkdir(outDir, { recursive: true })

    const cli: string[] = ["--headless"]
    if (mode === "list-bytecode-versions") {
      cli.push("--list-bytecode-versions")
    } else if (mode === "list-files") {
      cli.push(`--list-files=${target}`)
    } else if (mode === "extract") {
      cli.push(`--extract=${target}`, `--output=${outDir}`)
    } else if (mode === "recover") {
      cli.push(`--recover=${target}`, `--output=${outDir}`)
    } else if (mode === "decompile") {
      cli.push(`--decompile=${target}`, `--output=${outDir}`)
    }

    if (args.key) cli.push(`--key=${args.key}`)
    const inferredBytecodeVersion = await inferBytecodeHint(target || args.target)
    if (args.forceBytecodeVersion) cli.push(`--force-bytecode-version=${args.forceBytecodeVersion}`)
    if (mode === "decompile") {
      const bytecode = args.forceBytecodeVersion || inferredBytecodeVersion || ""
      if (!bytecode) {
        throw new Error(
          "decompile mode requires a bytecode hint. Provide forceBytecodeVersion (e.g. 4.3.0 or f3f05dc), or run mode=list-bytecode-versions first.",
        )
      }
      cli.push(`--bytecode=${bytecode}`)
    }
    if (args.customBytecodeJson)
      cli.push(`--load-custom-bytecode=${resolveInsideWorkspace(context.directory, args.customBytecodeJson)}`)
    if (args.scriptsOnly && (mode === "extract" || mode === "recover")) cli.push("--scripts-only")

    let output = ""
    const { stdout, stderr, ok } = await safeExecWithStreams(gdre, cli, {
      cwd: context.directory,
      timeoutMs: 180000,
      maxBuffer: 8 * 1024 * 1024,
    })
    if (!ok) {
      output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
      await writeFile(path.join(outDir, "gdre-run.log"), output, "utf8")
      throw new Error(output || "gdre_tools execution failed")
    }
    output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
    await writeFile(path.join(outDir, "gdre-run.log"), output, "utf8")

    const payload = {
      target: target || "<none>",
      mode,
      gdrePath: gdre,
      outputDir: outDir,
      inferredBytecodeVersion: inferredBytecodeVersion || "",
      cli,
      logPath: path.join(outDir, "gdre-run.log"),
      outputPreview: output.slice(0, 12000),
      nextProbe:
        mode === "recover"
          ? "Inspect recovered scripts/resources, then use ctf-godot-pack-inspect or grep on restored .gd/.tscn files."
          : mode === "decompile"
            ? "Inspect decompiled .gd output and compare with scene/resource hints from ctf-godot-pack-inspect."
            : mode === "extract"
              ? "Run ctf-godot-pack-inspect on the extracted directory to shrink scope before broader reading."
              : mode === "list-files"
                ? "Use listed files to choose extract/recover scope or identify hot .gdc/.tscn targets."
                : "Use the listed bytecode versions to choose force-bytecode-version or custom bytecode JSON when decompile fails.",
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_GODOT_DECOMPILE:",
      `- target: ${payload.target}`,
      `- mode: ${payload.mode}`,
      `- gdre_path: ${payload.gdrePath}`,
      `- output_dir: ${payload.outputDir}`,
      `- inferred_bytecode_version: ${payload.inferredBytecodeVersion || "none"}`,
      `- log: ${payload.logPath}`,
      `- next_probe: ${payload.nextProbe}`,
      "- output_preview:",
      payload.outputPreview,
    ].join("\n")
  },
})
