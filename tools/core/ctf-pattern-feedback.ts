import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { tool } from "@opencode-ai/plugin"
import { feedbackLogFile } from "../../src/asset-paths.ts"

const DEFAULT_LOG = feedbackLogFile()

export default tool({
  description:
    "Record feedback for a CTF pattern card after use: confirmed, falsified, led to flag, wasted time, or misleading. This creates a learning loop for future ranking.",
  args: {
    cardId: tool.schema.string().describe("Pattern card id."),
    challenge: tool.schema.string().describe("Challenge name or short identifier."),
    category: tool.schema.string().optional().describe("web | pwn | crypto | reverse | forensics | misc."),
    result: tool.schema.string().describe("confirmed | falsified | led_to_flag | misleading | weak | skipped"),
    evidence: tool.schema.string().optional().describe("Short evidence or observation."),
    timeCost: tool.schema.string().optional().describe("Optional rough time cost, e.g. 2m, 15m."),
    note: tool.schema.string().optional().describe("Optional lesson or patch suggestion."),
    logPath: tool.schema.string().optional().describe("Optional feedback JSONL path."),
  },
  async execute(args) {
    const logPath = args.logPath || DEFAULT_LOG
    const dir = dirname(logPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const entry = {
      ts: new Date().toISOString(),
      cardId: args.cardId,
      challenge: args.challenge,
      category: args.category || "unknown",
      result: args.result,
      evidence: args.evidence || "",
      timeCost: args.timeCost || "",
      note: args.note || "",
    }
    const previous = existsSync(logPath)
      ? readFileSync(logPath, "utf8").trim().split(/\r?\n/).filter(Boolean).length
      : 0
    writeFileSync(logPath, JSON.stringify(entry) + "\n", { flag: "a" })
    return [
      "verdict: pattern_feedback_recorded",
      `card_id: ${args.cardId}`,
      `result: ${args.result}`,
      `log_path: ${logPath}`,
      `previous_entries: ${previous}`,
      "usage:",
      "- Use led_to_flag/confirmed to promote cards in future curation.",
      "- Use misleading/weak to lower priority or add stricter preconditions.",
      "- During retro, review feedback before expanding curated cards.",
    ].join("\n")
  },
})
