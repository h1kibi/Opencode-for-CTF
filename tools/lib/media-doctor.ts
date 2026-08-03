import { safeExecWithStreams } from "./exec-utils.ts"
import { resolveInsideWorkspace } from "./workspace-path.ts"

/**
 * Shared OCR-capability doctor helpers, used by ctf-image-open and
 * ctf-media-open. Runs the repo's doctor-image-ocr.ts once and parses its
 * facts block so both tools stay in sync with the doctor's output format.
 */

export type OcrDoctorFacts = {
  docReadImageOcr: string
  preprocess: string
  qr: string
  recommendation: string
}

/** Run scripts/doctor-image-ocr.ts near the challenge dir and return its output. */
export async function runOcrDoctor(contextDir: string, workspaceRoot = contextDir): Promise<string> {
  const { stdout, stderr } = await safeExecWithStreams(
    "node",
    [resolveInsideWorkspace(workspaceRoot, "scripts/doctor-image-ocr.ts")],
    {
      cwd: contextDir,
      timeoutMs: 15000,
      maxBuffer: 1024 * 1024,
      shell: process.platform === "win32",
    },
  )
  return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
}

/** Parse the doctor's "- key:" fact lines into a structured summary. */
export function pickDoctorFacts(text: string): OcrDoctorFacts {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const recommendation = (() => {
    const idx = lines.findIndex((line) => line === "## recommended_path")
    return idx >= 0 ? lines[idx + 1] || "" : ""
  })()
  return {
    docReadImageOcr: lines.find((line) => line.startsWith("- doc_read_image_ocr:")) || "",
    preprocess: lines.find((line) => line.startsWith("- image_preprocess_pipeline:")) || "",
    qr: lines.find((line) => line.startsWith("- barcode_qr_detection:")) || "",
    recommendation,
  }
}
