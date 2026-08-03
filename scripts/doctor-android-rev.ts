import { runToolChecksDetailed, TOOL_CHECKS } from "./lib/tool-checks.mjs"

/**
 * Android REV toolchain doctor.
 * Check data (required/optional + notes) lives in scripts/lib/tool-checks.mjs
 * (android group); this wrapper formats the required/optional breakdown.
 * Run with: npm run doctor:android-rev
 */

const ANDROID_TOOL_NAMES = [
  "java",
  "aapt",
  "aapt2",
  "apkanalyzer",
  "adb",
  "jadx",
  "apktool",
  "baksmali",
  "smali",
  "apksigner",
  "zipalign",
  "apkid",
  "frida",
  "frida-ps",
]

const results = runToolChecksDetailed(TOOL_CHECKS.filter((check) => ANDROID_TOOL_NAMES.includes(check.name)))

const found = results.filter((r) => r.ok)
const missingRequired = results.filter((r) => !r.ok && r.required)
const missingOptional = results.filter((r) => !r.ok && !r.required)

console.log("# Android REV Doctor")
console.log(`found: ${found.map((r) => r.name).join(", ") || "none"}`)
console.log(`missing_required: ${missingRequired.map((r) => r.name).join(", ") || "none"}`)
console.log(`missing_optional: ${missingOptional.map((r) => r.name).join(", ") || "none"}`)
console.log("\n## details")
for (const r of results) {
  console.log(
    `- ${r.ok ? "ok" : r.required ? "MISSING" : "optional-missing"}: ${r.name} :: ${r.note ?? ""}${r.preview ? ` :: ${r.preview}` : ""}`,
  )
}

console.log("\n## recommended_path")
if (missingRequired.length) {
  console.log(
    "Install or PATH-fix missing_required tools before expecting APK fast-path performance. Until then, ctf-apk-triage will fall back to ZIP/dex/native string scanning where possible.",
  )
} else {
  console.log(
    "Android APK fast-path tooling is ready for static triage. Run ctf-android-runtime-check separately for device/frida readiness.",
  )
}
