import { tool } from "@opencode-ai/plugin"
import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"

const DEFAULT_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g
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
  description: "CTF flag grep: recursively scan files for configurable flag-like patterns with size and file count caps.",
  args: {
    target: tool.schema.string().describe("File or directory path to scan"),
    pattern: tool.schema.string().optional().describe("Optional JavaScript regex source. Defaults to a broad flag{...}-style regex."),
  },
  async execute(args, context) {
    const target = path.resolve(context.directory, args.target)
    const regex = args.pattern ? new RegExp(args.pattern, "g") : DEFAULT_RE
    const files = await collectFiles(target, 1000)
    const hits: string[] = []

    for (const file of files) {
      const stat = await lstat(file)
      if (stat.size > 5 * 1024 * 1024) continue
      const text = (await readFile(file)).toString("utf8")
      const matches = Array.from(new Set(text.match(regex) ?? [])).slice(0, 20)
      for (const match of matches) hits.push(`${file}: ${match}`)
    }

    return hits.length ? hits.join("\n") : `no matches in ${files.length} scanned files`
  },
})
