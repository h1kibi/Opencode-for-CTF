import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile, stat } from "node:fs/promises"
import path from "node:path"

type AnyRecord = Record<string, unknown>

type Handoff = {
  version: number
  updatedAt: string
  scope: AnyRecord
  stack: AnyRecord
  entrypoints: AnyRecord[]
  auth_boundaries: AnyRecord[]
  sources: AnyRecord[]
  sinks: AnyRecord[]
  sanitizers: AnyRecord[]
  candidate_findings: AnyRecord[]
  candidate_chains: AnyRecord[]
  verified_facts: AnyRecord[]
  false_positive_checks: AnyRecord[]
  priority_areas: AnyRecord[]
  next_probes: AnyRecord[]
  history: AnyRecord[]
}

function now() {
  return new Date().toISOString()
}

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input || ".ctf-whitebox-handoff.json")
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

function jsonArg<T>(value: string | undefined, fallback: T): T {
  if (!value || !value.trim()) return fallback
  return JSON.parse(value) as T
}

function fresh(scope: AnyRecord = {}, stack: AnyRecord = {}): Handoff {
  return {
    version: 1,
    updatedAt: now(),
    scope,
    stack,
    entrypoints: [],
    auth_boundaries: [],
    sources: [],
    sinks: [],
    sanitizers: [],
    candidate_findings: [],
    candidate_chains: [],
    verified_facts: [],
    false_positive_checks: [],
    priority_areas: [],
    next_probes: [],
    history: [],
  }
}

async function loadState(file: string): Promise<Handoff> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<Handoff>
    return {
      ...fresh(),
      ...parsed,
      scope: parsed.scope ?? {},
      stack: parsed.stack ?? {},
      history: Array.isArray(parsed.history) ? parsed.history : [],
    }
  } catch {
    return fresh()
  }
}

async function saveState(file: string, state: Handoff) {
  state.updatedAt = now()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(state, null, 2), "utf8")
}

function keyFor(item: AnyRecord) {
  return String(
    item.id ??
      item.file ??
      item.file_path ??
      item.route ??
      item.route_or_file ??
      item.name ??
      item.symbol ??
      JSON.stringify(item).slice(0, 80),
  )
}

function upsert(list: AnyRecord[], item: AnyRecord) {
  const key = keyFor(item)
  const idx = list.findIndex((x) => keyFor(x) === key)
  if (idx >= 0) list[idx] = { ...list[idx], ...item }
  else list.push(item)
}

function addHistory(state: Handoff, operation: string, detail: AnyRecord) {
  state.history.push({ at: now(), operation, detail })
  if (state.history.length > 80) state.history = state.history.slice(-80)
}

function firstString(...values: unknown[]) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

async function verifyFileEvidence(contextDir: string, finding: AnyRecord, gate: AnyRecord) {
  const file = firstString(finding.file, finding.file_path, finding.path, gate.file, gate.file_path)
  const lineRaw = finding.line ?? finding.line_start ?? gate.line ?? gate.line_start
  const line = typeof lineRaw === "number" ? lineRaw : Number.parseInt(String(lineRaw ?? "0"), 10)
  const snippet = firstString(finding.code_snippet, finding.snippet, gate.code_snippet, gate.snippet)
  if (!file) return { ok: false, reason: "missing file path", file: "", line: 0, snippetMatches: false }
  try {
    const full = resolveInsideWorkspace(contextDir, file)
    const st = await stat(full)
    if (!st.isFile()) return { ok: false, reason: "path is not a file", file, line, snippetMatches: false }
    const text = await readFile(full, "utf8")
    const lines = text.split(/\r?\n/)
    const lineOk = Number.isFinite(line) && line > 0 ? line <= lines.length : true
    const snippetMatches = snippet ? text.includes(snippet) : true
    return {
      ok: lineOk && snippetMatches,
      reason: lineOk ? (snippetMatches ? "file/line/snippet verified" : "snippet mismatch") : "line outside file",
      file,
      line,
      snippetMatches,
    }
  } catch (err) {
    return {
      ok: false,
      reason: `file read failed: ${err instanceof Error ? err.message : String(err)}`,
      file,
      line,
      snippetMatches: false,
    }
  }
}

async function evidenceGate(contextDir: string, finding: AnyRecord, gate: AnyRecord) {
  const fileEvidence = await verifyFileEvidence(contextDir, finding, gate)
  const controllability = firstString(
    gate.controllability,
    finding.controllability,
    finding.source,
    finding.controlled_input,
    finding.controlledDataShape,
  )
  const sink = firstString(
    gate.sink_or_condition,
    gate.sink,
    finding.sink,
    finding.condition,
    finding.sink_or_condition,
  )
  const oracle = firstString(
    gate.oracle_or_harness,
    gate.oracle,
    finding.oracle,
    finding.verification,
    finding.observed_signal,
  )
  const falseChecks = Array.isArray(gate.false_positive_checks)
    ? gate.false_positive_checks
    : Array.isArray(finding.false_positive_checks)
      ? finding.false_positive_checks
      : []
  let verdict = "uncertain"
  if (!fileEvidence.ok) verdict = "false_positive"
  else if (controllability && sink && oracle) verdict = "confirmed"
  else if (controllability && sink) verdict = "likely"

  return {
    finding_id: String(finding.id ?? finding.title ?? keyFor(finding)),
    file_evidence: fileEvidence,
    controllability: Boolean(controllability),
    sink_or_condition: Boolean(sink),
    oracle_or_harness: Boolean(oracle),
    false_positive_checks: falseChecks,
    verdict,
    reason:
      verdict === "confirmed"
        ? "all evidence gates passed"
        : verdict === "likely"
          ? "missing oracle/harness"
          : verdict === "false_positive"
            ? fileEvidence.reason
            : "missing controllability or sink/condition",
  }
}

function report(state: Handoff) {
  const rows = (items: AnyRecord[], fields: string[]) => {
    if (!items.length) return "none"
    return [
      fields.join(" | "),
      fields.map(() => "---").join(" | "),
      ...items.map((it) =>
        fields
          .map((f) =>
            String(it[f] ?? it[f.replace(/ /g, "_")] ?? "")
              .replace(/\r?\n/g, " ")
              .slice(0, 160),
          )
          .join(" | "),
      ),
    ].join("\n")
  }
  return [
    "# CTF White-box Handoff",
    `updatedAt: ${state.updatedAt}`,
    "",
    "## Scope",
    JSON.stringify(state.scope, null, 2),
    "",
    "## Stack",
    JSON.stringify(state.stack, null, 2),
    "",
    "## Entry/Auth/Source/Sink Map",
    "### Entrypoints",
    rows(state.entrypoints, ["route", "file", "handler", "line"]),
    "",
    "### Auth Boundaries",
    rows(state.auth_boundaries, ["route_or_file", "guard", "role_condition", "bypass_suspicion"]),
    "",
    "### Sources",
    rows(state.sources, ["name", "kind", "file", "line"]),
    "",
    "### Sinks",
    rows(state.sinks, ["kind", "api", "file", "line"]),
    "",
    "## Candidate Findings",
    rows(state.candidate_findings, ["id", "title", "file", "line", "verdict", "chain_implication"]),
    "",
    "## Verified Facts",
    rows(state.verified_facts, ["id", "fact", "evidence", "chain_implication"]),
    "",
    "## Next Probes",
    rows(state.next_probes, ["id", "probe", "confirm", "falsify", "distinguish"]),
  ].join("\n")
}

export default tool({
  description:
    "CTF white-box handoff manager: maintain a DeepAudit-style source audit state with entrypoints, sources, sinks, evidence gates, verified facts, and next probes inside the workspace.",
  args: {
    operation: tool.schema
      .string()
      .describe(
        "init | add_entrypoint | add_auth | add_source | add_sink | add_sanitizer | add_finding | add_chain | add_fact | add_probe | gate | report",
      ),
    statePath: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative state path. Default .ctf-whitebox-handoff.json"),
    scopeJson: tool.schema.string().optional().describe("JSON object for init/update scope"),
    stackJson: tool.schema.string().optional().describe("JSON object for init/update stack"),
    itemJson: tool.schema.string().optional().describe("JSON object for add_* operations"),
    findingJson: tool.schema.string().optional().describe("JSON object for add_finding or gate"),
    gateJson: tool.schema.string().optional().describe("JSON evidence-gate object for gate operation"),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const file = resolveInsideWorkspace(context.directory, args.statePath || ".ctf-whitebox-handoff.json")
    const operation = String(args.operation || "report").toLowerCase()
    let state = await loadState(file)

    if (operation === "init") {
      state = fresh(jsonArg(args.scopeJson, {}), jsonArg(args.stackJson, {}))
      addHistory(state, operation, { scope: state.scope, stack: state.stack })
      await saveState(file, state)
      return args.jsonOnly
        ? JSON.stringify(state, null, 2)
        : `whitebox handoff initialized: ${path.relative(context.directory, file)}`
    }

    const item = jsonArg<AnyRecord>(args.itemJson, {})
    const finding = jsonArg<AnyRecord>(args.findingJson, {})
    const gate = jsonArg<AnyRecord>(args.gateJson, {})

    const map: Record<string, keyof Handoff> = {
      add_entrypoint: "entrypoints",
      add_auth: "auth_boundaries",
      add_source: "sources",
      add_sink: "sinks",
      add_sanitizer: "sanitizers",
      add_chain: "candidate_chains",
      add_fact: "verified_facts",
      add_probe: "next_probes",
    }

    if (operation === "add_finding") {
      upsert(state.candidate_findings, finding)
      addHistory(state, operation, finding)
      await saveState(file, state)
      return args.jsonOnly ? JSON.stringify(state, null, 2) : `finding recorded: ${keyFor(finding)}`
    }

    if (operation === "gate") {
      const result = await evidenceGate(context.directory, finding, gate)
      const enriched = { ...finding, evidence_gate: result, verdict: result.verdict }
      upsert(state.candidate_findings, enriched)
      if (result.verdict === "confirmed") {
        upsert(state.verified_facts, {
          id: result.finding_id,
          fact: firstString(finding.title, finding.vulnerability_type, "confirmed finding"),
          evidence: result.reason,
          chain_implication: firstString(finding.chain_implication, gate.chain_implication),
        })
      }
      addHistory(state, operation, result)
      await saveState(file, state)
      return JSON.stringify(result, null, 2)
    }

    if (operation in map) {
      const key = map[operation]
      const list = state[key]
      if (!Array.isArray(list)) throw new Error(`internal state field is not a list: ${String(key)}`)
      upsert(list as AnyRecord[], item)
      addHistory(state, operation, item)
      await saveState(file, state)
      return args.jsonOnly ? JSON.stringify(state, null, 2) : `${operation} recorded: ${keyFor(item)}`
    }

    if (operation === "report") {
      return args.jsonOnly ? JSON.stringify(state, null, 2) : report(state)
    }

    throw new Error(`unknown operation: ${operation}`)
  },
})
