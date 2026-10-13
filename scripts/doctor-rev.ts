import { runToolChecksDetailed, TOOL_CHECKS } from "./lib/tool-checks.mjs"

/**
 * REV toolchain doctor.
 * Check data lives in scripts/lib/tool-checks.mjs (rev/android groups); this
 * wrapper selects the REV-relevant subset. Run with: npm run doctor:rev
 */

const REV_TOOL_NAMES = [
  "python",
  "file",
  "strings",
  "objdump",
  "readelf",
  "nm",
  "gdb",
  "apktool",
  "adb",
  "aapt",
  "aapt2",
  "apkanalyzer",
  "baksmali",
  "apkid",
  "frida",
  "frida-ps",
  "java",
  "javap",
  "rizin",
  "rz-bin",
  "ghidraRun",
  "analyzeHeadless",
  "mcp-reva",
]

function main() {
  const results = runToolChecksDetailed(TOOL_CHECKS.filter((check) => REV_TOOL_NAMES.includes(check.name)))
  const found = results.filter((r) => r.ok).map((r) => r.name)
  const missing = results.filter((r) => !r.ok).map((r) => r.name)

  console.log("# REV Doctor")
  console.log(`found: ${found.length ? found.join(", ") : "none"}`)
  console.log(`missing: ${missing.length ? missing.join(", ") : "none"}`)

  if (missing.length === 0) {
    console.log("runtime: ready (REV toolchain installed)")
  } else {
    console.log("runtime: incomplete (install/fix missing tools before relying on the full REV lane)")
  }
}

main()
