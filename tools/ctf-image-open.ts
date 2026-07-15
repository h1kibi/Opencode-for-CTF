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
  const facts = {
    docReadImageOcr: lines.find((line) => line.startsWith("- doc_read_image_ocr:")) || "",
    preprocess: lines.find((line) => line.startsWith("- image_preprocess_pipeline:")) || "",
    qr: lines.find((line) => line.startsWith("- barcode_qr_detection:")) || "",
    apkFast: lines.find((line) => line.startsWith("- apk_resource_fast_path:")) || "",
    recommendation: (() => {
      const idx = lines.findIndex((line) => line === "## recommended_path")
      return idx >= 0 ? (lines[idx + 1] || "") : ""
    })(),
  }
  return facts
}

export default tool({
  description: "CTF image open helper: unify image metadata, optional OCR attempt, and local OCR capability summary for REV/forensics-style image artifacts.",
  args: {
    target: tool.schema.string().describe("Workspace-relative image path."),
    tryOcr: tool.schema.boolean().optional().describe("Attempt OCR through doc-read. Default true."),
    exif: tool.schema.boolean().optional().describe("Run exiftool through image-file-info when available. Default true."),
    maxChars: tool.schema.number().optional().describe("Max chars for OCR/read output. Default 12000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const info = await loadPluginTool(context.directory, "tools/image-file-info.ts", { target: args.target, exif: args.exif !== false })
    const doctor = await runDoctor(context.directory)
    const doctorFacts = pickDoctorFacts(doctor)
    let ocrResult = "skipped"
    if (args.tryOcr !== false) {
      ocrResult = await loadPluginTool(context.directory, "tools/doc-read.ts", {
        target: args.target,
        includeJson: true,
        ocr: true,
        maxChars: args.maxChars ?? 12000,
      })
    }

    const payload = {
      target,
      info,
      doctorFacts,
      ocrAttempted: args.tryOcr !== false,
      ocrResult,
      recommendation: doctorFacts.docReadImageOcr.includes("no")
        ? "OCR engine is not currently available. Use image metadata/fallbacks, or install tesseract for local OCR."
        : "OCR path appears available; inspect OCR result and metadata together.",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_IMAGE_OPEN:",
      `- target: ${target}`,
      `- ocr_attempted: ${payload.ocrAttempted}`,
      `- ${doctorFacts.docReadImageOcr || "doc_read_image_ocr: unknown"}`,
      `- ${doctorFacts.preprocess || "image_preprocess_pipeline: unknown"}`,
      `- ${doctorFacts.qr || "barcode_qr_detection: unknown"}`,
      `- recommendation: ${payload.recommendation}`,
      "- image_info:",
      String(info).split(/\r?\n/).slice(0, 40).map((line) => `  ${line}`).join("\n"),
      "- ocr_result:",
      String(ocrResult).split(/\r?\n/).slice(0, 60).map((line) => `  ${line}`).join("\n"),
    ].join("\n")
  },
})
