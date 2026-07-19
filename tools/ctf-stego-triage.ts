import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExec } from "./lib/exec-utils.ts"

function inside(base: string, input: string): string {
  const root = path.resolve(base)
  const target = path.resolve(root, input)
  const relative = path.relative(root, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("target must stay inside workspace")
  return target
}

function unique(values: string[], max = 100): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, max)
}

export default tool({
  description: "Run a bounded, structured stego triage pipeline on an authorized image or media artifact.",
  args: {
    target: tool.schema.string(),
    caseId: tool.schema.string().optional(),
    backend: tool.schema.string().optional().describe("auto | host"),
  },
  async execute(args, context) {
    const target = inside(context.directory, args.target)
    const stat = await lstat(target)
    if (!stat.isFile()) throw new Error("stego target must be a regular file")
    const commands = [
      ["file", [target]],
      ["exiftool", [target]],
      ["strings", ["-n", "6", target]],
      ["binwalk", ["--run-as=root", "-q", target]],
      ["zsteg", ["-a", target]],
    ] as const
    const results: Record<string, { ok: boolean; output: string }> = {}
    for (const [name, command] of commands) {
      const result = await safeExec(name, [...command], context.directory, 12_000)
      results[name] = { ok: result.ok, output: (result.output ?? "").slice(0, 12_000) }
    }
    const output = {
      target,
      size: stat.size,
      backend: "host",
      tools: results,
      candidates: unique(
        Object.values(results).flatMap((result) =>
          (result.output.match(/[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g) ?? []),
        ),
      ),
      next: [
        "compare metadata with original artifact hash",
        "inspect channel/LSB results before extraction",
        "verify any flag candidate with the independent oracle",
      ],
    }
    if (args.caseId) {
      const directory = path.join(context.directory, "work", "ctf-evidence", args.caseId, "artifacts", "stego")
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, `triage-${Date.now()}.json`), `${JSON.stringify(output, null, 2)}\n`, "utf8")
    }
    return JSON.stringify(output, null, 2)
  },
})
