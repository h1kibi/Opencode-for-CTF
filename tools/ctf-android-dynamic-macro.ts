import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import { safeExec } from "./lib/exec-utils.ts"
import path from "node:path"
import type { SafeExecResult } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function firstDevice(adbDevices: string) {
  return (
    adbDevices
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /\bdevice$/.test(line) && !/^List of devices/i.test(line))
      ?.split(/\s+/)[0] || ""
  )
}

function parseAaptBadging(text: string) {
  return {
    packageName: text.match(/package:\s+name='([^']+)'/)?.[1] || "",
    launchActivity: text.match(/launchable-activity:\s+name='([^']+)'/)?.[1] || "",
  }
}

function compact(text: string, maxLines = 80) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  return lines.slice(0, maxLines).join("\n")
}

function summarizeKeywords(text: string, keywords: string[]) {
  const lines = text.split(/\r?\n/)
  const hits: { keyword: string; count: number; sample: string[] }[] = []
  for (const keyword of keywords) {
    const re = new RegExp(keyword, "i")
    const matched = lines.filter((line) => re.test(line))
    if (!matched.length) continue
    hits.push({ keyword, count: matched.length, sample: matched.slice(0, 5) })
  }
  return hits
}

export default tool({
  description:
    "CTF Android dynamic macro: safe adb sequence for install/start/logcat/run-as private-dir listing/tombstone capture/frida attach suggestion.",
  args: {
    apk: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative APK path. Used for package discovery and optional install."),
    serial: tool.schema.string().optional().describe("Optional adb device serial."),
    packageName: tool.schema.string().optional().describe("Package name override."),
    launchActivity: tool.schema.string().optional().describe("Launch activity override."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory. Default work/android-dynamic/<package>."),
    allowInstall: tool.schema
      .boolean()
      .optional()
      .describe("Actually run adb install -r when apk is provided. Default false."),
    allowStart: tool.schema.boolean().optional().describe("Actually start the app activity/package. Default true."),
    allowPullPrivateFiles: tool.schema
      .boolean()
      .optional()
      .describe("Allow explicit run-as cat of selected challenge-owned private files. Default false."),
    privatePaths: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe(
        "Private app-relative paths to cat via run-as after listing, e.g. files/config.json, shared_prefs/x.xml.",
      ),
    pullLatestTombstone: tool.schema
      .boolean()
      .optional()
      .describe("Try to pull the newest tombstone if adb access allows it. Default false."),
    logcatKeywords: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe(
        "Optional keyword regexes to summarize from logcat. Defaults cover linker/JNI/classloader/crash signals.",
      ),
    logcatMs: tool.schema.number().optional().describe("Post-start logcat capture window in ms. Default 3500."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const apkPath = args.apk ? resolveInsideWorkspace(context.directory, args.apk) : ""
    const adb = await safeExec("adb", ["devices"], undefined, 6000)
    const serial = args.serial || firstDevice(adb.output)
    const adbArgs = serial ? ["-s", serial] : []

    const badging = apkPath
      ? await safeExec("aapt", ["dump", "badging", apkPath], undefined, 12000)
      : { ok: false, output: "", exitCode: null }
    const parsed = parseAaptBadging(badging.output)
    const packageName = args.packageName || parsed.packageName
    const launchActivity = args.launchActivity || parsed.launchActivity
    const safeName = (packageName || "unknown-package").replace(/[^A-Za-z0-9_.-]+/g, "_")
    const outDir = resolveInsideWorkspace(
      context.directory,
      args.outDir || path.join("work", "android-dynamic", safeName),
    )
    await mkdir(outDir, { recursive: true })

    const results: Record<string, SafeExecResult | string> = {}
    results.adbDevices = adb
    results.aaptBadging = badging.ok ? { ok: true, output: compact(badging.output, 40), exitCode: 0 } : badging

    if (!serial) {
      const payload = { verdict: "NO_DEVICE", outDir, packageName, launchActivity, results }
      await writeFile(path.join(outDir, "summary.json"), JSON.stringify(payload, null, 2), "utf8")
      return args.jsonOnly
        ? JSON.stringify(payload, null, 2)
        : `ANDROID_DYNAMIC_MACRO:\n- verdict: NO_DEVICE\n- out_dir: ${outDir}\n- next: connect adb target and rerun`
    }

    results.deviceProps = await safeExec(
      "adb",
      [...adbArgs, "shell", "getprop", "ro.build.version.release"],
      undefined,
      5000,
    )
    results.deviceAbi = await safeExec(
      "adb",
      [...adbArgs, "shell", "getprop", "ro.product.cpu.abilist"],
      undefined,
      5000,
    )

    if (apkPath && args.allowInstall) {
      results.install = await safeExec("adb", [...adbArgs, "install", "-r", apkPath], undefined, 90000)
    } else if (apkPath) {
      results.install = "skipped: allowInstall=false"
    }

    if (packageName) await safeExec("adb", [...adbArgs, "logcat", "-c"], undefined, 6000)

    if (packageName && args.allowStart !== false) {
      const startArgs = launchActivity
        ? ["am", "start", "-n", `${packageName}/${launchActivity}`]
        : ["monkey", "-p", packageName, "1"]
      results.start = await safeExec("adb", [...adbArgs, "shell", ...startArgs], undefined, 12000)
      await new Promise((resolve) => setTimeout(resolve, Math.max(500, args.logcatMs || 3500)))
    } else if (packageName) {
      results.start = "skipped: allowStart=false"
    }

    const logcat = packageName
      ? await safeExec("adb", [...adbArgs, "logcat", "-d", "-v", "time"], undefined, 12000)
      : { ok: false, output: "missing packageName", exitCode: null }
    const logcatFile = path.join(outDir, "logcat.txt")
    await writeFile(logcatFile, logcat.output, "utf8")
    results.logcat = { ok: logcat.ok, output: `saved:${logcatFile}\n${compact(logcat.output, 80)}`, exitCode: 0 }
    const keywordSummary = summarizeKeywords(
      logcat.output,
      args.logcatKeywords && args.logcatKeywords.length
        ? args.logcatKeywords
        : [
            "libndk_translation",
            "UnsatisfiedLinkError",
            "ClassNotFoundException",
            "VerifyError",
            "JNI",
            "RegisterNatives",
            "DexClassLoader|PathClassLoader|InMemoryDexClassLoader",
            "Fatal signal",
            "tombstone",
            "linker",
            "dlopen failed",
            "No implementation found",
          ],
    )
    results.logcatKeywordSummary = JSON.stringify(keywordSummary, null, 2)
    await writeFile(path.join(outDir, "logcat-keyword-summary.json"), JSON.stringify(keywordSummary, null, 2), "utf8")

    if (packageName) {
      results.pmPath = await safeExec("adb", [...adbArgs, "shell", "pm", "path", packageName], undefined, 7000)
      results.runAsId = await safeExec("adb", [...adbArgs, "shell", "run-as", packageName, "id"], undefined, 6000)
      results.privateDirListing = await safeExec(
        "adb",
        [
          ...adbArgs,
          "shell",
          "run-as",
          packageName,
          "sh",
          "-c",
          'pwd; for p in . files cache code_cache databases shared_prefs app_webview; do [ -e "$p" ] && echo "## $p" && ls -la "$p"; done',
        ],
        undefined,
        12000,
      )
      const privateFile = path.join(outDir, "run-as-listing.txt")
      await writeFile(privateFile, String((results.privateDirListing as SafeExecResult).output || ""), "utf8")
      results.tombstones = await safeExec(
        "adb",
        [...adbArgs, "shell", "sh", "-c", "ls -lt /data/tombstones 2>/dev/null | head -20"],
        undefined,
        7000,
      )
      results.ps = await safeExec("adb", [...adbArgs, "shell", "pidof", packageName], undefined, 5000)
      if (args.allowPullPrivateFiles && args.privatePaths?.length) {
        const pulled: Record<string, string> = {}
        for (const relPath of args.privatePaths.slice(0, 8)) {
          const safe = relPath.replace(/[^A-Za-z0-9_.\/-]+/g, "_")
          const out = await safeExec(
            "adb",
            [...adbArgs, "shell", "run-as", packageName, "sh", "-c", `cat \"${relPath.replace(/"/g, '\\"')}\"`],
            undefined,
            10000,
          )
          const file = path.join(outDir, `private-${safe.replace(/[\\/]+/g, "_")}.txt`)
          await writeFile(file, out.output, "utf8")
          pulled[relPath] = `${out.ok ? "saved" : "failed"}:${file}`
        }
        results.privateFilePulls = JSON.stringify(pulled, null, 2)
      }
      if (args.pullLatestTombstone) {
        const latestName = await safeExec(
          "adb",
          [...adbArgs, "shell", "sh", "-c", "ls -t /data/tombstones 2>/dev/null | head -1"],
          undefined,
          6000,
        )
        const latest =
          latestName.output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean) || ""
        if (latest) {
          const pull = await safeExec(
            "adb",
            [...adbArgs, "pull", `/data/tombstones/${latest}`, path.join(outDir, latest)],
            undefined,
            20000,
          )
          results.latestTombstonePull = pull
        }
      }
    }

    const fridaPs = await safeExec("frida-ps", serial ? ["-D", serial] : ["-U"], undefined, 8000)
    results.fridaPs = { ok: fridaPs.ok, output: compact(fridaPs.output, 60), exitCode: fridaPs.exitCode }
    const fridaSuggestion = packageName
      ? `frida -D ${serial} -f ${packageName} -l hook.js --no-pause`
      : "Need packageName before Frida attach suggestion."

    const pid =
      typeof results.ps === "object" && results.ps && "output" in results.ps
        ? String((results.ps as SafeExecResult).output).split(/\s+/)[0]
        : ""
    if (packageName && pid) {
      const pidFiltered = await safeExec(
        "adb",
        [...adbArgs, "logcat", "--pid", pid, "-d", "-v", "time"],
        undefined,
        12000,
      )
      if (pidFiltered.ok && pidFiltered.output.trim()) {
        const pidFile = path.join(outDir, "logcat.pid.txt")
        await writeFile(pidFile, pidFiltered.output, "utf8")
        results.logcatPidFiltered = {
          ok: true,
          output: `saved:${pidFile}\n${compact(pidFiltered.output, 80)}`,
          exitCode: 0,
        }
      }
    }

    const payload = {
      verdict: "ANDROID_DYNAMIC_MACRO_DONE",
      selectedSerial: serial,
      apk: apkPath || "none",
      packageName: packageName || "unknown",
      launchActivity: launchActivity || "unknown",
      outDir,
      logcatFile,
      logcatKeywordSummaryFile: path.join(outDir, "logcat-keyword-summary.json"),
      fridaSuggestion,
      results,
      limitations: [
        "run-as works only for debuggable apps or permissive challenge builds.",
        "Private directory access remains listing-first unless explicit paths are supplied with allowPullPrivateFiles=true.",
        "For arm64-only native APKs, pair this with ctf-android-runtime-doctor before trusting dynamic results.",
      ],
    }
    await writeFile(path.join(outDir, "summary.json"), JSON.stringify(payload, null, 2), "utf8")

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "ANDROID_DYNAMIC_MACRO:",
      `- verdict: ${payload.verdict}`,
      `- selected_serial: ${payload.selectedSerial}`,
      `- package: ${payload.packageName}`,
      `- launch_activity: ${payload.launchActivity}`,
      `- out_dir: ${payload.outDir}`,
      `- logcat: ${payload.logcatFile}`,
      `- logcat_keyword_summary: ${payload.logcatKeywordSummaryFile}`,
      `- run_as: ${(results.runAsId as SafeExecResult | undefined)?.ok ? "ok" : "unavailable_or_denied"}`,
      `- frida_suggestion: ${payload.fridaSuggestion}`,
      "- next: inspect summary.json/logcat.txt, then choose one explicit file/memory/JNI hook target",
    ].join("\n")
  },
})
