import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"

const execFile = promisify(execFileCb)

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`target must stay inside current workspace: ${input}`)
  return target
}

async function tryExec(cmd: string, args: string[], cwd: string, timeout = 15000) {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024, shell: process.platform === "win32" })
    return { ok: true, output: `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`.trim() }
  }
}

function filterLines(text: string, query: string) {
  const q = query.trim()
  if (!q) return text.split(/\r?\n/)
  const isId = /^0x[0-9a-fA-F]+$/.test(q)
  const re = isId ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
  return text.split(/\r?\n/).filter((line) => re.test(line))
}

export default tool({
  description: "CTF APK resource direct reader: list custom resources and return matching value lines for a resource id or name using aapt/apkanalyzer output.",
  args: {
    apk: tool.schema.string().describe("Workspace-relative APK path"),
    query: tool.schema.string().optional().describe("Resource id like 0x7f0a0001 or resource name like app_name, main_title, layout/main."),
    maxLines: tool.schema.number().optional().describe("Maximum output lines. Default 120."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const apk = resolveInsideWorkspace(context.directory, args.apk)
    const cwd = path.dirname(apk)
    const aapt = await tryExec("aapt", ["dump", "--values", "resources", apk], cwd, 20000)
    const apkanalyzer = await tryExec("apkanalyzer", ["resources", "print", apk], cwd, 20000)
    const merged = [aapt.output, apkanalyzer.output].filter(Boolean).join("\n\n")
    const query = args.query || ""
    const lines = filterLines(merged, query)
    const maxLines = Math.max(20, Math.min(args.maxLines ?? 120, 400))
    const payload = {
      apk,
      query,
      tools: { aapt: aapt.ok, apkanalyzer: apkanalyzer.ok },
      lineCount: lines.length,
      matches: lines.slice(0, maxLines),
      note: query
        ? "Filtered by exact id/name substring across aapt --values resources and apkanalyzer resources print output."
        : "No query provided; returning the first lines of combined resource output.",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "APK_RESOURCE_READ:",
      `- apk: ${apk}`,
      `- query: ${query || "<none>"}`,
      `- tools: aapt=${aapt.ok} apkanalyzer=${apkanalyzer.ok}`,
      `- line_count: ${lines.length}`,
      "- matches:",
      ...payload.matches.map((line) => `  ${line}`),
    ].join("\n")
  },
})
