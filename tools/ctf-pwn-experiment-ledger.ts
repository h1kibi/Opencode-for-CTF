import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

type Entry = {
  ts: string
  stage: string
  probe: string
  oracle: string
  outcome: string
  stateDelta: string
  nextAction: string
  owner: string
}

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside the current workspace: ${input}`)
  return target
}

export default tool({
  description: "CTF pwn experiment ledger: append or summarize structured hard-pwn probe/oracle/delta packets for low-overhead experiment memory.",
  args: {
    operation: tool.schema.string().describe("append | summarize"),
    ledgerFile: tool.schema.string().optional().describe("Workspace-relative JSONL ledger path. Default work/pwn_experiment_ledger.jsonl"),
    stage: tool.schema.string().optional().describe("Solve stage or bottleneck label."),
    probe: tool.schema.string().optional().describe("The exact one-variable experiment or probe."),
    oracle: tool.schema.string().optional().describe("Expected observation / oracle."),
    outcome: tool.schema.string().optional().describe("Actual result."),
    stateDelta: tool.schema.string().optional().describe("What changed in understanding or state."),
    nextAction: tool.schema.string().optional().describe("Next experiment or closure action."),
    owner: tool.schema.string().optional().describe("Current route owner, e.g. pwn, heap, remote-adapt, closure."),
    maxEntries: tool.schema.number().optional().describe("For summarize: max recent entries to include. Default 8."),
  },
  async execute(args, context) {
    const ledgerRel = args.ledgerFile || "work/pwn_experiment_ledger.jsonl"
    const ledger = resolveInsideWorkspace(context.directory, ledgerRel)
    const op = String(args.operation || "").toLowerCase()
    if (op !== "append" && op !== "summarize") return "BLOCK: operation must be append or summarize"

    if (op === "append") {
      if (!args.probe || !args.oracle || !args.outcome || !args.stateDelta || !args.nextAction) {
        return "BLOCK: append requires probe, oracle, outcome, stateDelta, and nextAction"
      }
      await mkdir(path.dirname(ledger), { recursive: true })
      const entry: Entry = {
        ts: new Date().toISOString(),
        stage: String(args.stage || "unknown"),
        probe: String(args.probe),
        oracle: String(args.oracle),
        outcome: String(args.outcome),
        stateDelta: String(args.stateDelta),
        nextAction: String(args.nextAction),
        owner: String(args.owner || "pwn"),
      }
      let previous = ""
      try { previous = await readFile(ledger, "utf8") } catch {}
      const content = previous + JSON.stringify(entry) + "\n"
      await writeFile(ledger, content, "utf8")
      return [
        "pwn_experiment_ledger:",
        "operation: append",
        `ledger_file: ${ledgerRel}`,
        `stage: ${entry.stage}`,
        `owner: ${entry.owner}`,
        `probe: ${entry.probe}`,
        `oracle: ${entry.oracle}`,
        `outcome: ${entry.outcome}`,
        `state_delta: ${entry.stateDelta}`,
        `next_action: ${entry.nextAction}`,
      ].join("\n")
    }

    let raw = ""
    try { raw = await readFile(ledger, "utf8") } catch { return `BLOCK: ledger file not found: ${ledgerRel}` }
    const lines = raw.split(/\r?\n/).filter(Boolean)
    const entries = lines.map((line) => {
      try { return JSON.parse(line) as Entry } catch { return null }
    }).filter(Boolean) as Entry[]
    if (!entries.length) return ["pwn_experiment_ledger:", "operation: summarize", `ledger_file: ${ledgerRel}`, "entries: 0"].join("\n")
    const maxEntries = Math.max(1, Math.min(args.maxEntries ?? 8, 20))
    const recent = entries.slice(-maxEntries)
    return [
      "pwn_experiment_ledger:",
      "operation: summarize",
      `ledger_file: ${ledgerRel}`,
      `entries_total: ${entries.length}`,
      `entries_shown: ${recent.length}`,
      "recent_packets:",
      ...recent.flatMap((e, i) => [
        `- #${i + 1} ts=${e.ts} stage=${e.stage} owner=${e.owner}`,
        `  probe: ${e.probe}`,
        `  oracle: ${e.oracle}`,
        `  outcome: ${e.outcome}`,
        `  state_delta: ${e.stateDelta}`,
        `  next_action: ${e.nextAction}`,
      ]),
      "recommended_use:",
      "- Keep one packet per meaningful hard-pwn experiment instead of refreshing long prose notes after every probe.",
    ].join("\n")
  },
})
