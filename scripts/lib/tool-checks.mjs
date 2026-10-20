import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

/**
 * Shared CTF tool-check definitions used by both doctors:
 * - scripts/doctor.mjs            (toolchain doctor, `doctor --tooling`)
 * - scripts/doctor-install.mjs    (install doctor)
 *
 * The richer per-tool `localWindows` fallbacks replace the older per-file
 * fallback reimplementations; add new tools here once.
 */

function winTool(...segments) {
  if (process.platform !== "win32") return undefined
  return join("C:\\Tools", ...segments)
}

function localCommand(command, args, shell) {
  if (!command) return undefined
  return { command, args, shell }
}

function localPath(command) {
  if (!command) return undefined
  return { command, pathOnly: true }
}

function pythonScript(script, args) {
  if (!script || !existsSync(script)) return undefined
  return { command: "python", args: [script, ...(args ?? [])] }
}

const defined = (items) => items.filter(Boolean)

export const TOOL_CHECK_GROUPS = ["core", "web", "pwn", "rev", "forensics", "crypto", "android", "ocr"]

export const TOOL_CHECKS = [
  { group: "core", name: "node", command: "node", args: ["--version"] },
  { group: "core", name: "npm", command: "npm", args: ["--version"] },
  {
    group: "core",
    name: "python",
    command: "python",
    args: ["--version"],
    required: true,
    note: "required scripting runtime",
  },
  { group: "core", name: "git", command: "git", args: ["--version"] },
  { group: "web", name: "curl", command: "curl", args: ["--version"] },
  { group: "web", name: "docker", command: "docker", args: ["--version"] },
  {
    group: "web",
    name: "nuclei",
    command: "nuclei",
    args: ["-version"],
    localWindows: defined([localPath(winTool("nuclei", "nuclei.exe"))]),
  },
  {
    group: "web",
    name: "ffuf",
    command: "ffuf",
    args: ["-V"],
    localWindows: defined([localCommand(winTool("ffuf", "ffuf.exe"), ["-V"])]),
  },
  {
    group: "web",
    name: "feroxbuster",
    command: "feroxbuster",
    args: ["--version"],
    localWindows: defined([localCommand(winTool("feroxbuster", "feroxbuster.exe"), ["--version"])]),
  },
  {
    group: "web",
    name: "dirsearch",
    command: "dirsearch",
    args: ["--version"],
    localWindows: defined([pythonScript(winTool("dirsearch", "dirsearch.py"), ["--version"])]),
  },
  {
    group: "web",
    name: "sqlmap",
    // --non-interactive is required: sqlmap pauses on "Press Enter to
    // continue..." after --version otherwise (Windows double-click
    // protection in lib/parse/cmdline.py).
    command: "sqlmap",
    args: ["--version", "--non-interactive"],
    localWindows: defined([pythonScript(winTool("sqlmap", "sqlmap.py"), ["--version", "--non-interactive"])]),
  },
  {
    group: "web",
    name: "nmap",
    command: "nmap",
    args: ["--version"],
    localWindows: defined([localCommand(winTool("nmap", "nmap.exe"), ["--version"])]),
  },
  { group: "pwn", name: "gdb", command: "gdb", args: ["--version"] },
  { group: "pwn", name: "checksec", command: "checksec", args: ["--help"] },
  {
    group: "pwn",
    name: "radare2",
    command: "r2",
    args: ["-v"],
    localWindows: defined([
      localCommand(winTool("radare2", "radare2-6.1.4-w64", "bin", "r2.bat"), ["-v"], true),
      localCommand(winTool("radare2", "radare2-6.1.4-w64", "bin", "radare2.exe"), ["-v"]),
    ]),
  },
  { group: "rev", name: "file", command: "file", args: ["--version"] },
  { group: "forensics", name: "tshark", command: "tshark", args: ["--version"] },
  {
    group: "forensics",
    name: "exiftool",
    command: "exiftool",
    args: ["-ver"],
    localWindows: defined([localCommand(winTool("exiftool", "exiftool.exe"), ["-ver"])]),
  },
  { group: "crypto", name: "openssl", command: "openssl", args: ["version"] },
  { group: "crypto", name: "sage", command: "sage", args: ["--version"] },
  {
    group: "crypto",
    name: "hashcat",
    command: "hashcat",
    args: ["--version"],
    localWindows: defined([localCommand(winTool("hashcat-7.1.2", "hashcat.exe"), ["--version"])]),
  },
  // REV toolchain (beyond file/gdb above)
  { group: "rev", name: "strings", command: "strings", args: ["--version"] },
  { group: "rev", name: "objdump", command: "objdump", args: ["--version"] },
  { group: "rev", name: "readelf", command: "readelf", args: ["--version"] },
  { group: "rev", name: "nm", command: "nm", args: ["--version"] },
  { group: "rev", name: "javap", command: "javap", args: ["-version"] },
  { group: "rev", name: "rizin", command: "rizin", args: ["-v"] },
  { group: "rev", name: "rz-bin", command: "rz-bin", args: ["-v"] },
  { group: "rev", name: "ghidraRun", command: "ghidraRun", args: [] },
  {
    group: "rev",
    name: "analyzeHeadless",
    command: "analyzeHeadless",
    args: ["-h"],
    okWhen: /Headless Analyzer Usage/i,
  },
  { group: "rev", name: "mcp-reva", command: "mcp-reva", args: ["--version"] },
  // Android REV toolchain
  {
    group: "android",
    name: "java",
    command: "java",
    args: ["-version"],
    required: true,
    note: "required by apktool/baksmali",
  },
  {
    group: "android",
    name: "aapt",
    command: "aapt",
    args: ["version"],
    required: true,
    note: "fast manifest/package/activity extraction",
  },
  {
    group: "android",
    name: "aapt2",
    command: "aapt2",
    args: ["version"],
    required: false,
    note: "modern Android build-tools fallback",
  },
  {
    group: "android",
    name: "apkanalyzer",
    command: "apkanalyzer",
    args: ["--help"],
    required: true,
    note: "official manifest/APK analysis",
  },
  {
    group: "android",
    name: "adb",
    command: "adb",
    args: ["version"],
    required: true,
    note: "dynamic Android runtime bridge",
  },
  {
    group: "android",
    name: "apktool",
    command: "apktool",
    args: ["--version"],
    required: true,
    note: "resource/smali decode fallback",
  },
  {
    group: "android",
    name: "baksmali",
    command: "baksmali",
    args: ["--version"],
    required: false,
    note: "dex/smali focused disassembly",
  },
  {
    group: "android",
    name: "smali",
    command: "smali",
    args: ["--version"],
    required: false,
    note: "smali assembly when patching test copies",
  },
  {
    group: "android",
    name: "apksigner",
    command: "apksigner",
    args: ["--version"],
    required: false,
    note: "signature/cert inspection",
  },
  {
    group: "android",
    name: "zipalign",
    command: "zipalign",
    args: [],
    required: false,
    note: "APK zip structure utility",
    okWhen: /Zip alignment utility|Usage: zipalign/i,
  },
  {
    group: "android",
    name: "apkid",
    command: "apkid",
    args: [],
    required: false,
    note: "packer/compiler hints",
    okWhen: /usage:\s+apkid/i,
  },
  {
    group: "android",
    name: "frida",
    command: "frida",
    args: ["--version"],
    required: false,
    note: "dynamic instrumentation",
  },
  {
    group: "android",
    name: "frida-ps",
    command: "frida-ps",
    args: ["--version"],
    required: false,
    note: "frida device process listing",
  },
  // OCR toolchain (doc-read / ctf-image-open / ctf-media-open)
  {
    group: "ocr",
    name: "py",
    command: "py",
    args: ["-3", "--version"],
    required: false,
    note: "Windows Python launcher fallback for inline snippets",
  },
  {
    group: "ocr",
    name: "tesseract",
    command: "tesseract",
    args: ["--version"],
    required: false,
    note: "OCR engine used by pytesseract in doc-read image OCR",
    localWindows: defined([localPath("C:\\Program Files\\Tesseract-OCR\\tesseract.exe")]),
  },
  {
    group: "ocr",
    name: "magick",
    command: "magick",
    args: ["-version"],
    required: false,
    note: "ImageMagick for image preprocessing, resize, threshold, crop",
    localWindows: defined([
      localPath("C:\\Program Files\\ImageMagick-7.1.2-Q16\\magick.exe"),
      localPath("C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe"),
    ]),
  },
  {
    group: "ocr",
    name: "zbarimg",
    command: "zbarimg",
    args: ["--version"],
    required: false,
    note: "barcode/QR detection for CTF image artifacts",
    localWindows: defined([
      localPath("C:\\Program Files\\ZBar\\bin\\zbarimg.exe"),
      localPath("C:\\Tools\\zbar\\zbarimg.exe"),
    ]),
  },
]

/** Run one tool check, trying PATH first then Windows local fallbacks. */
export function toolCheckExists(check) {
  const result = spawnSync(check.command, check.args, {
    stdio: "ignore",
    shell: process.platform === "win32",
  })
  if (result.status === 0) return true
  for (const candidate of check.localWindows ?? []) {
    if (candidate.pathOnly) {
      if (existsSync(candidate.command)) return true
      continue
    }
    const local = spawnSync(candidate.command, candidate.args ?? [], {
      stdio: "ignore",
      shell: candidate.shell ?? (process.platform === "win32" && /\.(bat|cmd)$/i.test(candidate.command)),
    })
    if (local.status === 0) return true
  }
  return false
}

/** Group check results into { group -> { found, missing } } preserving group order. */
export function runToolChecks(checks = TOOL_CHECKS) {
  const grouped = new Map()
  for (const check of checks) {
    const bucket = grouped.get(check.group) ?? { found: [], missing: [] }
    if (toolCheckExists(check)) bucket.found.push(check.name)
    else bucket.missing.push(check.name)
    grouped.set(check.group, bucket)
  }
  return grouped
}

/**
 * Run checks with per-check detail (ok/status/preview + required/note).
 * Tries PATH first, then Windows local fallbacks; `okWhen` lets a check pass
 * on a usage-style preview even when the command exits non-zero.
 */
export function runToolChecksDetailed(checks = TOOL_CHECKS) {
  const spawn = (command, args, shell) =>
    spawnSync(command, args ?? [], {
      shell: shell ?? process.platform === "win32",
      encoding: "utf8",
      timeout: 7000,
    })
  return checks.map((check) => {
    const previewOf = (res) => `${res.stdout || ""}${res.stderr || ""}`.split(/\r?\n/).slice(0, 2).join(" | ").trim()
    let res = spawn(check.command, check.args, check.shell)
    let preview = previewOf(res)
    let ok = res.status === 0
    let hintPath = ""
    if (!ok) {
      for (const candidate of check.localWindows ?? []) {
        if (candidate.pathOnly) {
          if (existsSync(candidate.command)) {
            ok = true
            hintPath = candidate.command
            break
          }
          continue
        }
        res = spawn(candidate.command, candidate.args, candidate.shell)
        preview = previewOf(res)
        if (res.status === 0) {
          ok = true
          break
        }
      }
    }
    if (!ok && check.okWhen) ok = check.okWhen.test(preview)
    if (ok && hintPath && !preview) preview = `found at ${hintPath} (PATH refresh may be pending)`
    return { ...check, ok, status: res.status, preview }
  })
}
