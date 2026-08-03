import { tool } from "@opencode-ai/plugin"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import docRead from "../core/doc-read.ts"
import imageFileInfo from "../core/image-file-info.ts"
import { pickDoctorFacts, runOcrDoctor } from "../lib/media-doctor.ts"

export default tool({
  description:
    "CTF image open helper: unify image metadata, optional OCR attempt, and local OCR capability summary for REV/forensics-style image artifacts.",
  args: {
    target: tool.schema.string().describe("Workspace-relative image path."),
    tryOcr: tool.schema.boolean().optional().describe("Attempt OCR through doc-read. Default true."),
    exif: tool.schema
      .boolean()
      .optional()
      .describe("Run exiftool through image-file-info when available. Default true."),
    maxChars: tool.schema.number().optional().describe("Max chars for OCR/read output. Default 12000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const info = await imageFileInfo.execute(
      {
        target: args.target,
        exif: args.exif !== false,
      },
      { directory, worktree: workspace } as never,
    )
    const doctor = await runOcrDoctor(directory, workspace)
    const doctorFacts = pickDoctorFacts(doctor)
    let ocrResult = "skipped"
    if (args.tryOcr !== false) {
      ocrResult = String(
        await docRead.execute(
          {
            target: args.target,
            includeJson: true,
            ocr: true,
            maxChars: args.maxChars ?? 12000,
          },
          { directory, worktree: workspace } as never,
        ),
      )
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
      String(info)
        .split(/\r?\n/)
        .slice(0, 40)
        .map((line) => `  ${line}`)
        .join("\n"),
      "- ocr_result:",
      String(ocrResult)
        .split(/\r?\n/)
        .slice(0, 60)
        .map((line) => `  ${line}`)
        .join("\n"),
    ].join("\n")
  },
})
