import { tool } from "@opencode-ai/plugin"
import { lstat } from "node:fs/promises"
import { safeExec } from "../lib/exec-utils.ts"
import { extractFlagCandidates } from "../../packages/ctf-core/src/flag-rules.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"

type Decode = { backend: string; symbology: string; value: string }

function pythonScript(): string {
  return [
    "import json, sys",
    "try:",
    " import cv2",
    "except Exception as e:",
    " print(json.dumps({'error': 'opencv unavailable: ' + str(e)})); raise SystemExit(3)",
    "image = cv2.imread(sys.argv[1])",
    "if image is None: print(json.dumps({'error': 'image unreadable'})); raise SystemExit(4)",
    "detector = cv2.QRCodeDetector(); rows = []",
    "try:",
    " ok, values, points, _ = detector.detectAndDecodeMulti(image)",
    " if ok:",
    "  rows.extend({'symbology': 'QR', 'value': str(value)} for value in values if value)",
    "except Exception:",
    " value, _, _ = detector.detectAndDecode(image)",
    " if value: rows.append({'symbology': 'QR', 'value': str(value)})",
    "print(json.dumps({'decodes': rows}, ensure_ascii=False))",
  ].join("\n")
}

export default tool({
  description:
    "Bounded QR/barcode probe for authorized CTF image artifacts. Tries zbarimg, then OpenCV QR decoding, records decoder provenance, and reports decoded strings as untrusted evidence rather than verified flags.",
  args: {
    target: tool.schema.string().describe("Workspace-relative image path."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const directory = directoryFromContext(context)
    const workspace = workspaceRootFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const stat = await lstat(target)
    if (!stat.isFile()) throw new Error("QR probe target must be a file")

    const decodes: Decode[] = []
    const zbar = await safeExec("zbarimg", ["--quiet", "--raw", target], directory, 5000, 128 * 1024)
    if (zbar.ok) {
      for (const value of zbar.output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 32)) {
        decodes.push({ backend: "zbarimg", symbology: "barcode_or_qr", value })
      }
    }

    if (!decodes.length) {
      const cv = await safeExec("python", ["-c", pythonScript(), target], directory, 7000, 128 * 1024)
      if (cv.ok) {
        try {
          const parsed = JSON.parse(cv.output)
          for (const row of Array.isArray(parsed.decodes) ? parsed.decodes.slice(0, 32) : []) {
            if (row?.value)
              decodes.push({ backend: "opencv", symbology: row.symbology || "QR", value: String(row.value) })
          }
        } catch {
          // Keep the backend failure in the status below; never infer a decode from logs.
        }
      }
    }

    const candidates = decodes.flatMap((decode) =>
      extractFlagCandidates(decode.value, {
        source: target,
        origin: decode.backend,
        text: `${decode.symbology} decoded payload`,
      }),
    )
    const payload = {
      schemaVersion: "misc_qr.v1",
      target,
      status: decodes.length ? "ready" : "degraded",
      decodes,
      flagCandidates: candidates,
      verification:
        "Decoded payloads and flag-shaped strings remain untrusted_hint/flag_candidate until an independent oracle verifies them.",
      next: decodes.length
        ? "Inspect provenance and rerun ctf-encoding-chain only when the payload is independently identified as encoded."
        : "Install zbarimg or OpenCV/pyzbar, then retry; preserve the raw image.",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_QR_PROBE:",
      `- schema: ${payload.schemaVersion}`,
      `- target: ${target}`,
      `- status: ${payload.status}`,
      "- decodes:",
      ...(decodes.length
        ? decodes.map((decode) => `  - backend=${decode.backend} symbology=${decode.symbology} value=${decode.value}`)
        : ["  - none"]),
      "- flag_candidates:",
      ...(candidates.length
        ? candidates.map(
            (candidate) =>
              `  - ${candidate.value} confidence=${candidate.confidence} reason=${candidate.reason} source=${candidate.source ?? target}`,
          )
        : ["  - none"]),
      `- next: ${payload.next}`,
      `- verification: ${payload.verification}`,
    ].join("\n")
  },
})
