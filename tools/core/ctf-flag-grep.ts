import { tool } from "@opencode-ai/plugin"
import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { resolveAllowedPath } from "../lib/path-policy.ts"
import { extractFlagCandidates } from "../../packages/ctf-core/src/flag-rules.ts"

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "__pycache__"])

async function collectFiles(root: string, maxFiles: number, out: string[] = []) {
  if (out.length >= maxFiles) return out
  const stat = await lstat(root)
  if (stat.isFile()) {
    out.push(root)
    return out
  }
  if (!stat.isDirectory()) return out
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (out.length >= maxFiles) break
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    await collectFiles(path.join(root, entry.name), maxFiles, out)
  }
  return out
}

export default tool({
  description:
    "CTF flag discovery: recursively scan bounded local files using the strict default flag rules; bare hashes are accepted only with explicit flag-file/readflag context.",
  args: {
    target: tool.schema.string().describe("File or directory path to scan"),
    pattern: tool.schema
      .string()
      .optional()
      .describe("Optional explicit JavaScript regex source for a challenge-specific flag format."),
  },
  async execute(args, context) {
    const target = await resolveAllowedPath(args.target, context)
    let regex: RegExp | undefined
    if (args.pattern) regex = new RegExp(args.pattern, "g")
    const files = await collectFiles(target, 1000)
    const hits: string[] = []

    for (const file of files) {
      const stat = await lstat(file)
      if (stat.size > 5 * 1024 * 1024) continue
      const text = (await readFile(file)).toString("utf8")
      const candidates = regex
        ? Array.from(new Set(text.match(regex) ?? [])).slice(0, 20).map((value) => ({
            value: value.trim(),
            confidence: "high" as const,
            kind: "custom" as const,
            reason: "matched an explicitly supplied challenge-specific pattern",
            source: file,
          }))
        : extractFlagCandidates(text, { source: file, origin: "file", text })

      for (const candidate of candidates) {
        if (!candidate.value) continue
        hits.push(`${file}: [${candidate.confidence}/${candidate.kind}] ${candidate.value} (${candidate.reason})`)
      }
    }

    return hits.length
      ? hits.join("\n")
      : `no accepted flag candidates in ${files.length} scanned files (strict default rules; bare hashes require flag-file/readflag context)`
  },
})
