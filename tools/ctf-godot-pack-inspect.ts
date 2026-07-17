import { tool } from "@opencode-ai/plugin"
import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"

type Hit = { file: string; kind: string; size: number; signals: string[] }

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

async function walk(dir: string, out: string[] = [], max = 6000): Promise<string[]> {
  if (out.length >= max) return out
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) await walk(p, out, max)
    else out.push(p)
    if (out.length >= max) break
  }
  return out
}

function fileKind(file: string) {
  const ext = path.extname(file).toLowerCase()
  if (ext === ".gdc") return "gdc_bytecode"
  if (ext === ".gd") return "gd_source"
  if (ext === ".gde") return "gde_encrypted_or_variant"
  if ([".tscn", ".scn"].includes(ext)) return "scene"
  if ([".tres", ".res"].includes(ext)) return "resource"
  if (ext === ".pck") return "godot_pack"
  if ([".import", ".remap"].includes(ext)) return "import_meta"
  return ext.replace(/^\./, "") || "unknown"
}

function printableStrings(buf: Buffer, min = 4, max = 400) {
  const text = buf.toString("latin1")
  const matches = Array.from(text.matchAll(new RegExp(`[ -~]{${min},}`, "g")), (m) => m[0])
  return [...new Set(matches)].slice(0, max)
}

function godotSignals(text: string) {
  const signals: string[] = []
  const rules: Array<[RegExp, string]> = [
    [/flag|ctf|secret|password|token/i, "flag_like"],
    [/game_manager|flag\.|manager|controller|ui|main_menu/i, "game_logic"],
    [/godot|gdscript|bytecode|variant|opcode|function/i, "godot_internal"],
    [/label|button|lineedit|texturebutton|richtextlabel/i, "ui_widget"],
    [/load\(|preload\(|res:\/\//i, "resource_flow"],
    [/sha|md5|base64|xor|encrypt|decrypt/i, "transform_or_crypto"],
  ]
  for (const [re, name] of rules) if (re.test(text)) signals.push(name)
  return [...new Set(signals)]
}

function firstLines(text: string, maxLines = 12) {
  return text.split(/\r?\n/).slice(0, maxLines).join("\n")
}

export default tool({
  description:
    "CTF Godot pack inspect: summarize unpacked Godot project trees, .gdc/.gd/script/resource inventory, high-signal strings, and first focused reverse targets without requiring a full decompiler.",
  args: {
    target: tool.schema.string().describe("Workspace-relative Godot unpack root, .pck, or script directory."),
    maxFiles: tool.schema.number().optional().describe("Maximum files to inspect. Default 400."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    const maxFiles = Math.max(50, Math.min(args.maxFiles ?? 400, 2000))
    const files = st.isDirectory() ? (await walk(target)).slice(0, maxFiles) : [target]

    const hits: Hit[] = []
    const highSignalStrings: Array<{ file: string; strings: string[] }> = []
    const sceneRefs: Array<{ file: string; preview: string }> = []

    for (const file of files) {
      const stat = await lstat(file)
      if (!stat.isFile()) continue
      const kind = fileKind(file)
      const interesting = ["gdc_bytecode", "gd_source", "scene", "resource", "godot_pack", "import_meta"].includes(kind)
      if (!interesting) continue
      const buf = await readFile(file).catch(() => Buffer.alloc(0))
      const strings = printableStrings(buf)
      const joined = strings.join("\n")
      const signals = godotSignals(`${file}\n${joined}`)
      hits.push({ file: path.relative(context.directory, file), kind, size: stat.size, signals })
      if (signals.length || kind === "gdc_bytecode" || kind === "gd_source") {
        highSignalStrings.push({
          file: path.relative(context.directory, file),
          strings: strings.filter((s) => /flag|ctf|secret|manager|button|label|load\(|res:\/\//i.test(s)).slice(0, 30),
        })
      }
      if (kind === "scene" || kind === "resource") {
        const preview = firstLines(buf.toString("utf8", 0, Math.min(buf.length, 4096)).replace(/\0/g, ""), 10)
        if (preview.trim()) sceneRefs.push({ file: path.relative(context.directory, file), preview })
      }
    }

    const topTargets = hits
      .filter((hit) => hit.signals.length || /flag|game_manager|manager|ui/i.test(hit.file))
      .slice(0, 20)

    const payload = {
      target,
      fileCountInspected: files.length,
      summary: {
        gdcCount: hits.filter((h) => h.kind === "gdc_bytecode").length,
        gdCount: hits.filter((h) => h.kind === "gd_source").length,
        sceneCount: hits.filter((h) => h.kind === "scene").length,
        resourceCount: hits.filter((h) => h.kind === "resource").length,
        importMetaCount: hits.filter((h) => h.kind === "import_meta").length,
      },
      topTargets,
      highSignalStrings: highSignalStrings.filter((row) => row.strings.length > 0).slice(0, 20),
      sceneRefs: sceneRefs.slice(0, 12),
      nextSteps: [
        "Prioritize .gdc files whose names or string tables mention flag/game_manager/ui before broad PE/runtime work.",
        "If only .gdc exists, use this inventory as the target list for later Godot bytecode tooling or manual constant-pool analysis.",
        "If .gd source exists alongside .gdc, diff source/bytecode names first to infer the compiled layout.",
      ],
      limitations: [
        "This is an inspection/indexing tool, not a full .gdc decompiler.",
        "For compiled GDScript bytecode, it surfaces strings and likely hot files so fast-lane reversing can narrow scope before building deeper tooling.",
      ],
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_GODOT_PACK_INSPECT:",
      `- target: ${target}`,
      `- file_count_inspected: ${payload.fileCountInspected}`,
      `- gdc_count: ${payload.summary.gdcCount}`,
      `- gd_count: ${payload.summary.gdCount}`,
      `- scene_count: ${payload.summary.sceneCount}`,
      `- resource_count: ${payload.summary.resourceCount}`,
      `- import_meta_count: ${payload.summary.importMetaCount}`,
      "- top_targets:",
      ...payload.topTargets.map((hit) => `  - ${hit.kind} ${hit.file} signals=${hit.signals.join(",") || "none"}`),
      "- high_signal_strings:",
      ...payload.highSignalStrings.flatMap((row) => [
        `  - ${row.file}`,
        ...row.strings.slice(0, 8).map((s) => `    ${s}`),
      ]),
      "- next_steps:",
      ...payload.nextSteps.map((step) => `  - ${step}`),
    ].join("\n")
  },
})
