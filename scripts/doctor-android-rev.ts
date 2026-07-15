import { spawnSync } from "child_process"

type Check = {
  name: string
  command: string
  args: string[]
  required: boolean
  note: string
}

const checks: Check[] = [
  { name: "java", command: "java", args: ["-version"], required: true, note: "required by jadx/apktool/baksmali" },
  { name: "aapt", command: "aapt", args: ["version"], required: true, note: "fast manifest/package/activity extraction" },
  { name: "aapt2", command: "aapt2", args: ["version"], required: false, note: "modern Android build-tools fallback" },
  { name: "apkanalyzer", command: "apkanalyzer", args: ["--help"], required: true, note: "official manifest/APK analysis" },
  { name: "adb", command: "adb", args: ["version"], required: true, note: "dynamic Android runtime bridge" },
  { name: "jadx", command: "jadx", args: ["--version"], required: true, note: "Java/Kotlin decompiler" },
  { name: "apktool", command: "apktool", args: ["--version"], required: true, note: "resource/smali decode fallback" },
  { name: "baksmali", command: "baksmali", args: ["--version"], required: false, note: "dex/smali focused disassembly" },
  { name: "smali", command: "smali", args: ["--version"], required: false, note: "smali assembly when patching test copies" },
  { name: "apksigner", command: "apksigner", args: ["--version"], required: false, note: "signature/cert inspection" },
  { name: "zipalign", command: "zipalign", args: [], required: false, note: "APK zip structure utility" },
  { name: "apkid", command: "apkid", args: [], required: false, note: "packer/compiler hints" },
  { name: "frida", command: "frida", args: ["--version"], required: false, note: "dynamic instrumentation" },
  { name: "frida-ps", command: "frida-ps", args: ["--version"], required: false, note: "frida device process listing" },
]

function run(check: Check) {
  const res = spawnSync(check.command, check.args, {
    shell: process.platform === "win32",
    encoding: "utf8",
    timeout: 7000,
  })
  const preview = `${res.stdout || ""}${res.stderr || ""}`.split(/\r?\n/).slice(0, 2).join(" | ").trim()
  const ok = res.status === 0
    || (check.name === "zipalign" && /Zip alignment utility|Usage: zipalign/i.test(preview))
    || (check.name === "apkid" && /usage:\s+apkid/i.test(preview))
  return {
    ...check,
    ok,
    status: res.status,
    preview,
  }
}

const results = checks.map(run)
const found = results.filter((r) => r.ok)
const missingRequired = results.filter((r) => !r.ok && r.required)
const missingOptional = results.filter((r) => !r.ok && !r.required)

console.log("# Android REV Doctor")
console.log(`found: ${found.map((r) => r.name).join(", ") || "none"}`)
console.log(`missing_required: ${missingRequired.map((r) => r.name).join(", ") || "none"}`)
console.log(`missing_optional: ${missingOptional.map((r) => r.name).join(", ") || "none"}`)
console.log("\n## details")
for (const r of results) {
  console.log(`- ${r.ok ? "ok" : r.required ? "MISSING" : "optional-missing"}: ${r.name} :: ${r.note}${r.preview ? ` :: ${r.preview}` : ""}`)
}
console.log("\n## recommended_path")
if (missingRequired.length) {
  console.log("Install or PATH-fix missing_required tools before expecting APK fast-path performance. Until then, ctf-apk-triage will fall back to ZIP/dex/native string scanning where possible.")
} else {
  console.log("Android APK fast-path tooling is ready for static triage. Run ctf-android-runtime-check separately for device/frida readiness.")
}
