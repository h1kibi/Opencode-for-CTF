// Manual QA utility — not part of CI or npm run check. Run with: npx tsx scripts/check-rev-android-readiness.ts
import { existsSync, readFileSync } from "fs"
import { join } from "path"

type Check = { name: string; ok: boolean; detail: string }

function has(file: string, pattern: RegExp) {
  if (!existsSync(file)) return false
  return pattern.test(readFileSync(file, "utf8"))
}

const root = process.cwd()
const checks: Check[] = []

for (const tool of [
  "ctf-apk-triage.ts",
  "ctf-android-native-triage.ts",
  "ctf-android-runtime-check.ts",
  "ctf-android-runtime-doctor.ts",
  "ctf-android-dynamic-macro.ts",
  "ctf-dex-patch-map.ts",
  "ctf-android-packed-closure-helper.ts",
  "ctf-artifact-page.ts",
]) {
  const file = join(root, "tools", tool)
  checks.push({ name: `tool:${tool}`, ok: existsSync(file) && has(file, /export default tool\(/), detail: file })
}

for (const cmd of [
  "ctf-apk.md",
  "ctf-android-native.md",
  "ctf-adb-check.md",
  "ctf-apk-fast.md",
  "ctf-android-shell.md",
  "ctf-android-runtime-doctor.md",
  "ctf-android-dynamic-macro.md",
  "ctf-dex-patch-map.md",
  "ctf-android-packed-closure.md",
]) {
  const file = join(root, "commands", cmd)
  checks.push({ name: `command:${cmd}`, ok: existsSync(file), detail: file })
}

for (const tmpl of [
  "android_apk_run_log.ps1",
  "android_private_dir_diff.ps1",
  "android_pull_private_file.ps1",
  "frida_android_shell_trace.js",
]) {
  const file = join(root, "templates", tmpl)
  checks.push({ name: `template:${tmpl}`, ok: existsSync(file), detail: file })
}

const ctfRev = join(root, "agents", "ctf-rev.md")
for (const term of ["ctf-apk-triage", "ctf-android-native-triage", "APK Fast Path"]) {
  checks.push({
    name: `ctf-rev references ${term}`,
    ok: has(ctfRev, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
    detail: ctfRev,
  })
}

const ctfFast = join(root, "agents", "ctf-fast.md")
for (const term of ["ctf-apk-triage", "ctf-android-native-triage"]) {
  checks.push({
    name: `ctf-fast references ${term}`,
    ok: has(ctfFast, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
    detail: ctfFast,
  })
}

// Corpus checks were removed with the bundled knowledge trees: REV/Android
// technique notes now live in the external `ctf_rag` index, which this offline
// audit cannot inspect. Only the tool-surface checks below remain.

const failures = checks.filter((c) => !c.ok)
console.log("# REV Android Readiness Audit")
console.log(`checks: ${checks.length}`)
console.log(`failures: ${failures.length}`)
console.log("\n| Check | Status | Detail |")
console.log("|---|---|---|")
for (const c of checks) console.log(`| ${c.name} | ${c.ok ? "PASS" : "FAIL"} | ${c.detail} |`)
if (failures.length) process.exit(1)
