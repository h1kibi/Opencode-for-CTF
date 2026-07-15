import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"

const execFile = promisify(execFileCb)

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function pathToFileUrl(p: string) {
  const normalized = p.replace(/\\/g, "/")
  return `file:///${normalized.replace(/^([A-Za-z]):/, "$1:")}`
}

async function loadPluginTool<TArgs extends Record<string, unknown>, TResult = unknown>(contextDir: string, toolFile: string, args: TArgs): Promise<TResult> {
  const mod = await import(pathToFileUrl(resolveInsideWorkspace(contextDir, toolFile)))
  const pluginTool = mod.default as { execute?: (args: TArgs, context: { directory: string; worktree?: string }) => Promise<TResult> }
  if (!pluginTool?.execute) throw new Error(`tool missing execute(): ${toolFile}`)
  return pluginTool.execute(args, { directory: contextDir, worktree: contextDir })
}

async function runDoctor(contextDir: string) {
  try {
    const { stdout, stderr } = await execFile("node", [resolveInsideWorkspace(contextDir, "scripts/doctor-image-ocr.ts")], {
      cwd: contextDir,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      shell: process.platform === "win32",
    })
    return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`.trim()
  }
}

function pickDoctorFacts(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return {
    docReadImageOcr: lines.find((line) => line.startsWith("- doc_read_image_ocr:")) || "",
    preprocess: lines.find((line) => line.startsWith("- image_preprocess_pipeline:")) || "",
    qr: lines.find((line) => line.startsWith("- barcode_qr_detection:")) || "",
    recommendation: (() => {
      const idx = lines.findIndex((line) => line === "## recommended_path")
      return idx >= 0 ? (lines[idx + 1] || "") : ""
    })(),
  }
}

function mediaKindBySuffix(target: string) {
  const ext = path.extname(target).toLowerCase()
  if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff"].includes(ext)) return "image"
  if ([".pdf"].includes(ext)) return "pdf"
  if ([".docx", ".xlsx", ".pptx", ".csv", ".tsv", ".html", ".htm", ".epub", ".txt", ".md", ".json", ".xml", ".yaml", ".yml", ".log"].includes(ext)) return "document"
  return "unknown"
}

export default tool({
  description: "CTF media open helper: unify image, PDF, and document opening with OCR capability summary and the shortest local extraction path.",
  args: {
    target: tool.schema.string().describe("Workspace-relative media/document path."),
    tryOcr: tool.schema.boolean().optional().describe("Attempt OCR where relevant. Default true."),
    exif: tool.schema.boolean().optional().describe("For images, run exiftool when available. Default true."),
    maxChars: tool.schema.number().optional().describe("Max chars for extracted content. Default 12000."),
    pageStart: tool.schema.number().optional().describe("Optional PDF page start."),
    pageEnd: tool.schema.number().optional().describe("Optional PDF page end."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const kind = mediaKindBySuffix(target)
    const doctor = await runDoctor(context.directory)
    const doctorFacts = pickDoctorFacts(doctor)

    let primaryResult: unknown
    let route = ""

    if (kind === "image") {
      route = "ctf-image-open"
      primaryResult = await loadPluginTool(context.directory, "tools/ctf-image-open.ts", {
        target: args.target,
        tryOcr: args.tryOcr !== false,
        exif: args.exif !== false,
        maxChars: args.maxChars ?? 12000,
        jsonOnly: true,
      })
    } else {
      route = "doc-read"
      primaryResult = await loadPluginTool(context.directory, "tools/doc-read.ts", {
        target: args.target,
        includeJson: true,
        ocr: args.tryOcr !== false,
        maxChars: args.maxChars ?? 12000,
        pageStart: args.pageStart,
        pageEnd: args.pageEnd,
      })
    }

    const payload = {
      target,
      mediaKind: kind,
      route,
      doctorFacts,
      primaryResult,
      recommendation: kind === "image"
        ? "Use ctf-image-open result as the primary image summary; if QR/barcode detection is still needed, note that zbarimg is not currently available."
        : kind === "pdf"
          ? "Use doc-read result first; if OCR output is thin on scanned pages, retry with a smaller page range or inspect image-heavy pages separately."
          : "Use doc-read result as the main structured extraction; only widen to richer tooling if layout or embedded media becomes the blocker.",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_MEDIA_OPEN:",
      `- target: ${target}`,
      `- media_kind: ${kind}`,
      `- route: ${route}`,
      `- ${doctorFacts.docReadImageOcr || "doc_read_image_ocr: unknown"}`,
      `- ${doctorFacts.preprocess || "image_preprocess_pipeline: unknown"}`,
      `- ${doctorFacts.qr || "barcode_qr_detection: unknown"}`,
      `- recommendation: ${payload.recommendation}`,
      "- result:",
      String(primaryResult).split(/\r?\n/).slice(0, 80).map((line) => `  ${line}`).join("\n"),
    ].join("\n")
  },
})
