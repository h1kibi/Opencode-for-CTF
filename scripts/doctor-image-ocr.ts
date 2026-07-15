import { spawnSync } from "child_process"
import { existsSync } from "fs"

type Check = {
  name: string
  command: string
  args: string[]
  required: boolean
  note: string
}

const checks: Check[] = [
  { name: "python", command: "python", args: ["--version"], required: true, note: "required for doc-read helper and local OCR glue" },
  { name: "py", command: "py", args: ["-3", "--version"], required: false, note: "Windows Python launcher fallback for inline snippets" },
  { name: "tesseract", command: "tesseract", args: ["--version"], required: false, note: "OCR engine used by pytesseract in doc-read image OCR" },
  { name: "magick", command: "magick", args: ["-version"], required: false, note: "ImageMagick for image preprocessing, resize, threshold, crop" },
  { name: "zbarimg", command: "zbarimg", args: ["--version"], required: false, note: "barcode/QR detection for CTF image artifacts" },
  { name: "apkanalyzer", command: "apkanalyzer", args: ["--help"], required: true, note: "fast packaged APK resource/manifest inspection" },
]

function run(check: Check) {
  const directHints: Record<string, string[]> = {
    tesseract: [
      "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
    ],
    magick: [
      "C:\\Program Files\\ImageMagick-7.1.2-Q16\\magick.exe",
      "C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe",
    ],
    zbarimg: [
      "C:\\Program Files\\ZBar\\bin\\zbarimg.exe",
      "C:\\Tools\\zbar\\zbarimg.exe",
    ],
  }

  const res = spawnSync(check.command, check.args, {
    shell: process.platform === "win32",
    encoding: "utf8",
    timeout: 7000,
  })
  const preview = `${res.stdout || ""}${res.stderr || ""}`.split(/\r?\n/).slice(0, 2).join(" | ").trim()
  const hinted = (directHints[check.name] || []).find((candidate) => existsSync(candidate))
  const ok = res.status === 0 || Boolean(hinted)
  return {
    ...check,
    ok,
    preview: hinted && !preview ? `found at ${hinted} (PATH refresh may be pending)` : preview,
  }
}

const results = checks.map(run)
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
  console.log(`- ${r.ok ? "ok" : r.required ? "MISSING" : "optional-missing"}: ${r.name} :: ${r.note}${r.preview ? ` :: ${r.preview}` : ""}`)
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
  console.log("Fix missing_required items first. Without Python or apkanalyzer, the image/OCR and APK resource helper paths are incomplete.")
} else if (!hasTesseract) {
  console.log("doc-read image OCR path is wired correctly, but OCR engine is missing. Until tesseract is installed, use image metadata only or supply manually extracted text.")
} else {
  console.log("Image OCR fast-path is available. Use doc-read ocr=true for images and ctf-apk-resource-read for packaged APK resources.")
}

console.log("\n## fallbacks")
console.log("- If OCR engine is missing, use image-file-info for metadata and ask for a textual transcription or install tesseract.")
console.log("- If ImageMagick is missing, skip preprocessing and rely on source images or Python/Pillow-only lightweight transforms.")
console.log("- If zbarimg is missing, use ctf-stego-probe or external QR tooling later; do not block routine REV progress on it.")
