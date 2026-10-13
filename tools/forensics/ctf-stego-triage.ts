import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExec } from "../lib/exec-utils.ts"
import { resolveAllowedPath } from "../lib/path-policy.ts"
import { directoryFromContext, workspaceRootFromContext } from "../lib/workspace-path.ts"
import { extractFlagCandidates } from "../../packages/ctf-core/src/flag-rules.ts"

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
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = await resolveAllowedPath(args.target, { directory, worktree: workspace })
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
      const result = await safeExec(name, [...command], path.dirname(target), 12_000)
      results[name] = { ok: result.ok, output: (result.output ?? "").slice(0, 12_000) }
    }
    const flagCandidates = unique(
      Object.entries(results).flatMap(([toolName, result]) =>
        extractFlagCandidates(result.output, {
          source: `${target}:${toolName}`,
          origin: `stego-triage:${toolName}`,
          text: result.output,
        }).map((candidate) => JSON.stringify({
          ...candidate,
          source: `${target}:${toolName}`,
          origin: `stego-triage:${toolName}`,
          context: result.output.slice(0, 240),
        })),
      ),
    ).map((value) => JSON.parse(value) as Record<string, unknown>)
    const candidateValues = unique(flagCandidates.map((candidate) => String(candidate.value ?? "")))
    const output = {
      schema_version: "stego_triage.v2",
      target,
      size: stat.size,
      backend: "host",
      tools: results,
      verdict: candidateValues.length ? "flag_candidate" : "stego_media",
      direct_solve: "no",
      candidate_status: candidateValues.length ? "pending_oracle" : "none",
      oracle_verified: false,
      next_tool: candidateValues.length ? "ctf-evidence-board (command=flag-verify)" : "ctf-stego-probe",
      // Compatibility field: values only, never a success claim.
      candidates: candidateValues,
      flag_candidates: flagCandidates,
      next: [
        "compare metadata with original artifact hash",
        "inspect channel/LSB results before extraction",
        "verify any flag candidate with the independent oracle",
      ],
    }
    if (args.caseId) {
      const evidenceDir = path.join(workspace, "work", "ctf-evidence", args.caseId, "artifacts", "stego")
      await mkdir(evidenceDir, { recursive: true })
      await writeFile(
        path.join(evidenceDir, `triage-${Date.now()}.json`),
        `${JSON.stringify(output, null, 2)}\n`,
        "utf8",
      )
    }
    return JSON.stringify(output, null, 2)
  },
})
