import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import docRead from "../core/doc-read.ts"
import imageOpen from "./ctf-image-open.ts"
import { pickDoctorFacts, runOcrDoctor } from "../lib/media-doctor.ts"

function mediaKindBySuffix(target: string) {
  const ext = path.extname(target).toLowerCase()
  if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff"].includes(ext)) return "image"
  if ([".pdf"].includes(ext)) return "pdf"
  if (
    [
      ".docx",
      ".xlsx",
      ".pptx",
      ".csv",
      ".tsv",
      ".html",
      ".htm",
      ".epub",
      ".txt",
      ".md",
      ".json",
      ".xml",
      ".yaml",
      ".yml",
      ".log",
    ].includes(ext)
  )
    return "document"
  return "unknown"
}

export default tool({
  description:
    "CTF media open helper: unify image, PDF, and document opening with OCR capability summary and the shortest local extraction path.",
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
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const kind = mediaKindBySuffix(target)
    const doctor = await runOcrDoctor(directory, workspace)
    const doctorFacts = pickDoctorFacts(doctor)

    let primaryResult: unknown
    let route = ""

    if (kind === "image") {
      route = "ctf-image-open"
      primaryResult = await imageOpen.execute(
        {
          target: args.target,
          tryOcr: args.tryOcr !== false,
          exif: args.exif !== false,
          maxChars: args.maxChars ?? 12000,
          jsonOnly: true,
        },
        { directory, worktree: workspace } as never,
      )
    } else {
      route = "doc-read"
      primaryResult = await docRead.execute(
        {
          target: args.target,
          includeJson: true,
          ocr: args.tryOcr !== false,
          maxChars: args.maxChars ?? 12000,
          pageStart: args.pageStart,
          pageEnd: args.pageEnd,
        },
        { directory, worktree: workspace } as never,
      )
    }

    const payload = {
      target,
      mediaKind: kind,
      route,
      doctorFacts,
      primaryResult,
      recommendation:
        kind === "image"
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
      String(primaryResult)
        .split(/\r?\n/)
        .slice(0, 80)
        .map((line) => `  ${line}`)
        .join("\n"),
    ].join("\n")
  },
})
