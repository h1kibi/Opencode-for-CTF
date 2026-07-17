import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { safeExec } from "./lib/exec-utils.ts"
import path from "node:path"
import crypto from "node:crypto"
function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`path must stay inside the current workspace: ${input}`)
  return target
}
async function walk(dir: string, out: string[] = [], max = 8000): Promise<string[]> {
  if (out.length >= max) return out
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) await walk(p, out, max)
    else if (/\.(java|kt|smali|xml|txt)$/i.test(ent.name) && !/AndroidManifest\.xml$/i.test(ent.name)) out.push(p)
    if (out.length >= max) break
  }
  return out
}

async function collectCandidateSourceFiles(root: string) {
  const roots = [root, path.join(root, "sources"), path.join(root, "src")]
  const existing: string[] = []
  for (const item of roots) {
    try {
      const st = await lstat(item)
      if (st.isDirectory()) existing.push(item)
    } catch {
      // ignore missing candidate roots
    }
  }
  const seen = new Set<string>()
  const files: string[] = []
  for (const dir of existing) {
    for (const file of await walk(dir)) {
      if (seen.has(file)) continue
      seen.add(file)
      files.push(file)
    }
  }
  return files
}

async function grepApktoolOutput(dir: string, pattern: RegExp, maxHits: number, radius: number) {
  const files = await walk(dir)
  const hits: Array<{ file: string; line: number; snippet: string }> = []
  for (const file of files) {
    const normalized = file.replace(/\\/g, "/")
    if (/AndroidManifest\.xml$/i.test(normalized)) continue
    if (/\/original\//i.test(normalized)) continue
    if (/\/(androidx|android\/support|kotlin|kotlinx|com\/google\/android\/material)\//i.test(normalized)) continue
    const text = await readFile(file, "utf8").catch(() => "")
    if (!text || /\x00/.test(text.slice(0, 512))) continue
    if (!text) continue
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (!pattern.test(lines[i])) continue
      hits.push({ file, line: i + 1, snippet: slice(lines, i, radius) })
      if (hits.length >= maxHits) return hits
    }
  }
  return hits
}

function isFrameworkNoise(file: string) {
  const normalized = file.replace(/\\/g, "/")
  return (
    /AndroidManifest\.xml$/i.test(normalized) ||
    /\/original\//i.test(normalized) ||
    /\/(androidx|android\/support|kotlin|kotlinx|com\/google\/android\/material|com\/google\/errorprone|org\/intellij)\//i.test(
      normalized,
    ) ||
    /\/R\$[^\/]+\.smali$/i.test(normalized)
  )
}

function refineHits(hits: Array<{ file: string; line: number; snippet: string }>, packageHint?: string, maxHits = 20) {
  const filtered = hits.filter((h) => !isFrameworkNoise(h.file))
  if (packageHint) {
    const strong = filtered.filter((h) => h.file.includes(packageHint) || h.snippet.includes(packageHint))
    if (strong.length) return strong.slice(0, maxHits)
  }
  return filtered.slice(0, maxHits)
}
function slice(lines: string[], idx: number, radius: number) {
  const start = Math.max(0, idx - radius),
    end = Math.min(lines.length, idx + radius + 1)
  return lines
    .slice(start, end)
    .map((l, i) => `${start + i + 1}: ${l}`)
    .join("\n")
}

export default tool({
  description:
    "CTF JADX targeted slice: use existing JADX output or run lightweight JADX, then return grep-like class/method snippets for high-signal Android REV patterns.",
  args: {
    target: tool.schema.string().describe("Workspace-relative APK path or existing JADX output directory"),
    patterns: tool.schema
      .string()
      .optional()
      .describe("Regex patterns. Default flag|check|verify|success|wrong|native|loadLibrary|decrypt|encrypt"),
    packageHint: tool.schema.string().optional().describe("Optional package/class path substring to prioritize"),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative JADX output dir. Default work/jadx-cache/<sha-or-name>"),
    runJadx: tool.schema
      .boolean()
      .optional()
      .describe("Run jadx if target is an APK and output dir is missing. Default true."),
    maxHits: tool.schema.number().optional().describe("Maximum snippets. Default 30."),
    radius: tool.schema.number().optional().describe("Context lines around each hit. Default 4."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    const pattern = new RegExp(
      args.patterns ||
        "flag|check|verify|success|correct|wrong|native|loadLibrary|JNI|decrypt|encrypt|base64|xor|secret|password",
      "i",
    )
    let sourceDir = target
    const artifactNotes: string[] = []
    if (st.isFile()) {
      const data = await readFile(target)
      const sha = crypto.createHash("sha256").update(data).digest("hex").slice(0, 16)
      const outRel =
        args.outDir ||
        path.join("work", "jadx-cache", `${path.basename(target).replace(/[^A-Za-z0-9_.-]/g, "_")}-${sha}`)
      sourceDir = resolveInsideWorkspace(context.directory, outRel)
      try {
        await lstat(sourceDir)
      } catch {
        if (args.runJadx === false) throw new Error(`JADX output not found: ${sourceDir}`)
        await mkdir(sourceDir, { recursive: true })
        const res = await safeExec(
          "jadx",
          ["--show-bad-code", "--no-res", "-ds", sourceDir, target],
          path.dirname(target),
          180000,
        )
        artifactNotes.push(`jadx_run_ok=${res.ok}`)
        await writeFile(path.join(sourceDir, "jadx-run.log"), res.output, "utf8")
      }
    }
    let files = await collectCandidateSourceFiles(sourceDir)
    const prioritized = args.packageHint
      ? files.sort((a, b) => {
          const an = a.replace(/\\/g, "/")
          const bn = b.replace(/\\/g, "/")
          const ahv =
            /(MainActivity|ProxyApplication|JniBridge|Shell|Loader|Application|attachBaseContext|extract|decrypt|check|verify)/i.test(
              path.basename(an),
            )
              ? 4
              : 0
          const bhv =
            /(MainActivity|ProxyApplication|JniBridge|Shell|Loader|Application|attachBaseContext|extract|decrypt|check|verify)/i.test(
              path.basename(bn),
            )
              ? 4
              : 0
          const aScore =
            (an.includes(args.packageHint!.replace(/\\/g, "/")) ? 4 : 0) +
            (/\/(smali|sources)\//i.test(an) ? 1 : 0) +
            ahv -
            (/\/(androidx|android\/support|kotlin|kotlinx|com\/google\/android\/material|com\/google\/errorprone|org\/intellij)\//i.test(
              an,
            )
              ? 3
              : 0) -
            (/\/R\$[^\/]+\.smali$/i.test(an) ? 2 : 0)
          const bScore =
            (bn.includes(args.packageHint!.replace(/\\/g, "/")) ? 4 : 0) +
            (/\/(smali|sources)\//i.test(bn) ? 1 : 0) +
            bhv -
            (/\/(androidx|android\/support|kotlin|kotlinx|com\/google\/android\/material|com\/google\/errorprone|org\/intellij)\//i.test(
              bn,
            )
              ? 3
              : 0) -
            (/\/R\$[^\/]+\.smali$/i.test(bn) ? 2 : 0)
          return bScore - aScore
        })
      : files
    const maxHits = Math.max(5, Math.min(args.maxHits ?? 30, 120))
    const radius = Math.max(1, Math.min(args.radius ?? 4, 20))
    const hits: Array<{ file: string; line: number; snippet: string }> = []
    for (const file of prioritized) {
      const normalized = file.replace(/\\/g, "/")
      if (
        /\/(androidx|android\/support|kotlin|kotlinx|com\/google\/android\/material|com\/google\/errorprone|org\/intellij)\//i.test(
          normalized,
        ) &&
        hits.length > 0
      )
        continue
      if (/\/R\$[^\/]+\.smali$/i.test(normalized) && hits.length > 0) continue
      const text = await readFile(file, "utf8").catch(() => "")
      if (!text || /\x00/.test(text.slice(0, 512))) continue
      if (!text) continue
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (!pattern.test(lines[i])) continue
        hits.push({ file: path.relative(context.directory, file), line: i + 1, snippet: slice(lines, i, radius) })
        if (hits.length >= maxHits) break
      }
      if (hits.length >= maxHits) break
    }
    if (hits.length === 0 && st.isFile()) {
      const apktoolOut = path.join(sourceDir, "apktool-lite")
      await mkdir(apktoolOut, { recursive: true })
      const apktoolRes = await safeExec(
        "apktool",
        ["d", "-f", "--no-res", "-o", apktoolOut, target],
        path.dirname(target),
        180000,
      )
      artifactNotes.push(`apktool_fallback_ok=${apktoolRes.ok}`)
      await writeFile(path.join(sourceDir, "apktool-fallback.log"), apktoolRes.output, "utf8")
      const fallbackHits = await grepApktoolOutput(apktoolOut, pattern, maxHits, radius)
      for (const hit of fallbackHits)
        hits.push({ file: path.relative(context.directory, hit.file), line: hit.line, snippet: hit.snippet })
      files = await collectCandidateSourceFiles(sourceDir)
      artifactNotes.push(`apktool_fallback_hits=${fallbackHits.length}`)
    }
    const refinedHits = refineHits(hits, args.packageHint, maxHits)
    const payload = {
      target,
      sourceDir,
      artifactNotes,
      fileCount: files.length,
      pattern: pattern.source,
      hits: refinedHits,
    }
    await mkdir(path.join(context.directory, "work", "jadx-slices"), { recursive: true })
    await writeFile(
      path.join(context.directory, "work", "jadx-slices", `${path.basename(sourceDir)}.json`),
      JSON.stringify(payload, null, 2),
      "utf8",
    )
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "verdict: jadx_targeted_slice",
      `target: ${target}`,
      `sourceDir: ${sourceDir}`,
      `fileCount: ${files.length}`,
      `hits: ${refinedHits.length}`,
      ...artifactNotes.map((x) => `note: ${x}`),
      "snippets:",
      ...(refinedHits.length ? refinedHits.map((h) => `--- ${h.file}:${h.line}\n${h.snippet}`) : ["- none"]),
    ].join("\n")
  },
})
