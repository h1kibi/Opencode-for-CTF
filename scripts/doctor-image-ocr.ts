import { runToolChecksDetailed, TOOL_CHECKS } from "./lib/tool-checks.mjs"

/**
 * Image/OCR capability doctor.
 * Check data (including Windows local fallbacks) lives in
 * scripts/lib/tool-checks.mjs (ocr/android groups); this wrapper formats the
 * capability summary consumed by ctf-image-open / ctf-media-open.
 * Run with: npm run doctor:image-ocr
 */

const OCR_TOOL_NAMES = ["python", "py", "tesseract", "magick", "zbarimg", "apkanalyzer"]

const results = runToolChecksDetailed(TOOL_CHECKS.filter((check) => OCR_TOOL_NAMES.includes(check.name)))

const found = results.filter((r) => r.ok)
const missingRequired = results.filter((r) => !r.ok && r.required)
const missingOptional = results.filter((r) => !r.ok && !r.required)

const hasTesseract = found.some((r) => r.name === "tesseract")
const hasMagick = found.some((r) => r.name === "magick")
const hasZbar = found.some((r) => r.name === "zbarimg")
const hasApkResourceFastPath = found.some((r) => r.name === "apkanalyzer")

console.log("# Image/OCR Doctor")
console.log(`found: ${found.map((r) => r.name).join(", ") || "none"}`)
console.log(`missing_required: ${missingRequired.map((r) => r.name).join(", ") || "none"}`)
console.log(`missing_optional: ${missingOptional.map((r) => r.name).join(", ") || "none"}`)
console.log("\n## details")
for (const r of results) {
  console.log(
    `- ${r.ok ? "ok" : r.required ? "MISSING" : "optional-missing"}: ${r.name} :: ${r.note ?? ""}${r.preview ? ` :: ${r.preview}` : ""}`,
  )
}

console.log("\n## capability_summary")
console.log(`- doc_read_image_metadata: yes`)
console.log(`- doc_read_image_ocr: ${hasTesseract ? "yes" : "no (tesseract missing)"}`)
console.log(`- image_preprocess_pipeline: ${hasMagick ? "yes" : "no (ImageMagick missing)"}`)
console.log(`- barcode_qr_detection: ${hasZbar ? "yes" : "no (zbarimg missing)"}`)
console.log(`- apk_resource_fast_path: ${hasApkResourceFastPath ? "yes" : "no"}`)
console.log(`- windows_python_inline_helper: yes (ctf-python-inline)`)

console.log("\n## recommended_path")
if (missingRequired.length) {
  console.log(
    "Fix missing_required items first. Without Python or apkanalyzer, the image/OCR and APK resource helper paths are incomplete.",
  )
} else if (!hasTesseract) {
  console.log(
    "doc-read image OCR path is wired correctly, but OCR engine is missing. Until tesseract is installed, use image metadata only or supply manually extracted text.",
  )
} else {
  console.log(
    "Image OCR fast-path is available. Use doc-read ocr=true for images and ctf-apk-resource-read for packaged APK resources.",
  )
}

console.log("\n## fallbacks")
console.log(
  "- If OCR engine is missing, use image-file-info for metadata and ask for a textual transcription or install tesseract.",
)
console.log(
  "- If ImageMagick is missing, skip preprocessing and rely on source images or Python/Pillow-only lightweight transforms.",
)
console.log(
  "- If zbarimg is missing, use ctf-stego-probe or external QR tooling later; do not block routine REV progress on it.",
)
