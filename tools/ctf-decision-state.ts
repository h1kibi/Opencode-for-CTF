import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input || ".ctf-decision-state.json")
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`state path must stay inside the current workspace: ${input}`)
  }
  return target
}

type AnyRecord = Record<string, unknown>

type ClosureCandidate = {
  name: string
  primitiveFit: number
  stateIndependence: number
  movingParts: number
  replayCost: number
  externalAssumptions: number
  debuggability: number
  closureDistance: number
  score?: number
}

type Hypothesis = {
  id: string
  primitive: string
  evidencePlus?: unknown
  evidenceMinus?: unknown
  value: number
  confidence: number
  infoGain: number
  cost: number
  risk: number
  stateDamage: number
  stability: number
  closureDelta: number
  branchKillValue: number
  nextTest?: string
  expectedOutcomes?: unknown
  killRule?: string
  status?: string
  family?: string
  chainRef?: string
  origin?: "kb" | "model" | "hybrid"
  lessonPenalty?: string
  ownerFlipTrigger?: string
  closureOwnerHint?: string
  whyNow?: string
  whyNotOthers?: string
  owner?: string
  supportingSurface?: string
  closurePathType?: string
  sourceGuided?: boolean
  sourceAvailable?: boolean
  sourceFirstSatisfied?: boolean
  blockerReason?: string
  revisitTrigger?: string
  antiPattern?: string
  parentId?: string
  prerequisiteIds?: string[]
  segmentId?: string
  segmentState?: "UNTESTED" | "CONFIRMED" | "BLOCKED" | "BYPASSED" | "FALSIFIED" | "SKIPPED"
  branchId?: string
  sharedPrefix?: boolean
  terminalBranch?: boolean
  missingPrerequisites?: string[]
  blockedBy?: string
  bypassPlan?: string
  bypassEvidence?: string
  blindOrOob?: boolean
  oracleEvidence?: string
  challengeSpecific?: boolean
  authorIntent?: string
  primitiveCard?: string
  stateIndependence?: "low" | "medium" | "high"
  requiresReentry?: boolean
  closureCandidates?: string[]
  closureCandidatesDetailed?: ClosureCandidate[]
  replayCost?: number
  movingParts?: number
}

type Probe = {
  hypothesisId?: string
  family?: string
  variable?: string
  confirm?: string
  falsify?: string
  distinguish?: string
  expected?: unknown
  oneVariable?: boolean
  risk?: number
  stateChanging?: boolean
  closureProbe?: boolean
  fastPath?: boolean
  owner?: string
}

type State = {
  version: number
  mode: string
  model: AnyRecord
  hypotheses: Hypothesis[]
  history: AnyRecord[]
  createdAt: string
  updatedAt: string
}

type ChainStateChain = {
  id?: string
  chain_id?: string
  status?: string
  state?: string
}

type ChainPenalty = {
  confidenceDelta: number
  valueDelta: number
  forcedStatus?: string
}

function now() {
  return new Date().toISOString()
}

function jsonArg<T>(value: string | undefined, fallback: T): T {
  if (!value || !value.trim()) return fallback
  return JSON.parse(value) as T
}

function clampScore(n: unknown, name: string) {
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`${name} must be a finite number`)
  return Math.max(0, Math.min(5, n))
}

function stateIndependenceNumeric(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.min(5, v))
  const s = String(v ?? "").toLowerCase()
  if (s === "high") return 5
  if (s === "medium") return 3
  if (s === "low") return 1
  return 0
}

function closureCandidateScore(c: ClosureCandidate) {
  return 5 * c.primitiveFit + 4 * c.stateIndependence - 3 * c.movingParts - 4 * c.replayCost - 2 * c.externalAssumptions + 2 * c.debuggability - 3 * c.closureDistance
}

function normalizeClosureCandidate(raw: unknown, primitive: string, idx: number): ClosureCandidate {
  const r = (raw ?? {}) as AnyRecord
  const name = String(r.name ?? r.candidate ?? r.primitive ?? `${primitive}_closure_${idx + 1}`)
  const candidate: ClosureCandidate = {
    name,
    primitiveFit: clampScore(r.primitiveFit ?? r.primitive_fit ?? 0, `${primitive}.${name}.primitiveFit`),
    stateIndependence: stateIndependenceNumeric(r.stateIndependence ?? r.state_independence ?? 0),
    movingParts: clampScore(r.movingParts ?? r.moving_parts ?? 0, `${primitive}.${name}.movingParts`),
    replayCost: clampScore(r.replayCost ?? r.replay_cost ?? 0, `${primitive}.${name}.replayCost`),
    externalAssumptions: clampScore(r.externalAssumptions ?? r.external_assumptions ?? 0, `${primitive}.${name}.externalAssumptions`),
    debuggability: clampScore(r.debuggability ?? 0, `${primitive}.${name}.debuggability`),
    closureDistance: clampScore(r.closureDistance ?? r.closure_distance ?? 0, `${primitive}.${name}.closureDistance`),
  }
  candidate.score = typeof r.score === "number" && Number.isFinite(r.score) ? r.score : closureCandidateScore(candidate)
  return candidate
}

function bestClosureCandidate(h: Hypothesis) {
  const arr = Array.isArray(h.closureCandidatesDetailed) ? h.closureCandidatesDetailed : []
  return [...arr].sort((a, b) => (b.score ?? closureCandidateScore(b)) - (a.score ?? closureCandidateScore(a)))[0]
}

function isBusinessNarrativeProbe(text: string) {
  return /(menu|choice|chapter|part1|part2|continue menu|reenter|add|show|edit|delete|buy|sell|inventory|dialog|story|business flow)/i.test(text)
}

function score(h: Hypothesis) {
  return 2 * h.value + h.confidence + h.infoGain + h.stability + h.closureDelta + h.branchKillValue - (h.cost + h.risk + h.stateDamage)
}

function lessonPenaltyDelta(text: string | undefined) {
  const t = String(text ?? "").toLowerCase()
  if (!t) return 0
  if (/(freeze|kill same-family|kill branch|stop broad|minimal budget|low budget)/.test(t)) return -1.0
  if (/(shrink|downgrade|cap |demote|freeze unrelated discovery)/.test(t)) return -0.75
  return -0.4
}

function lessonActionBias(h: Hypothesis) {
  let bias = 0
  if (h.lessonPenalty) bias += lessonPenaltyDelta(h.lessonPenalty)
  if (h.ownerFlipTrigger) bias -= 0.35
  if (h.closureOwnerHint) bias += 0.35
  if (h.antiPattern) bias -= 0.75
  if (h.challengeSpecific === true) bias += 0.9
  if (h.authorIntent) bias += 0.35
  if (h.sharedPrefix === true && String(h.segmentState ?? "").toUpperCase() === "CONFIRMED") bias += 0.5
  if (h.terminalBranch === true && String(h.segmentState ?? "").toUpperCase() === "UNTESTED") bias += 0.2
  if (h.segmentState === "BLOCKED") bias -= h.bypassPlan || h.bypassEvidence ? 0.8 : 1.8
  if (h.segmentState === "FALSIFIED") bias -= 2.5
  if (h.blindOrOob === true && !h.oracleEvidence) bias -= 1.2
  if (Array.isArray(h.missingPrerequisites) && h.missingPrerequisites.length) bias -= Math.min(1.5, h.missingPrerequisites.length * 0.35)
  if (h.stateIndependence === "high") bias += 1.0
  else if (h.stateIndependence === "medium") bias += 0.3
  else if (h.stateIndependence === "low") bias -= 1.0
  if (h.requiresReentry === true) bias -= 0.9
  if (typeof h.replayCost === "number") bias -= Math.min(2.0, h.replayCost * 0.35)
  if (typeof h.movingParts === "number") bias -= Math.min(1.5, h.movingParts * 0.2)
  const bestClosure = bestClosureCandidate(h)
  if (bestClosure) bias += Math.max(-1.5, Math.min(1.5, (bestClosure.score ?? closureCandidateScore(bestClosure)) / 20))
  bias += sourceFirstPenalty(h)
  return bias
}

function effectiveScore(h: Hypothesis) {
  return score(h) + lessonActionBias(h)
}

function hypothesisOrigin(h: Hypothesis) {
  if (h.origin) return h.origin
  return h.chainRef ? "kb" : "model"
}

function rankingBias(h: Hypothesis, knowledgeMode: string) {
  const origin = hypothesisOrigin(h)
  if (knowledgeMode === "matched") {
    if (origin === "kb") return 1.0
    if (origin === "hybrid") return 0.5
    return -0.25
  }
  if (knowledgeMode === "weak_match") {
    if (origin === "model") return 0.75
    if (origin === "hybrid") return 0.5
    return -0.25
  }
  if (knowledgeMode === "no_match_explained") {
    if (origin === "model") return 1.0
    if (origin === "hybrid") return 0.5
    return -0.5
  }
  return 0
}

function normalizeHypothesis(raw: unknown, idx: number): Hypothesis {
  const r = (raw ?? {}) as AnyRecord
  const primitive = String(r.primitive ?? r.name ?? `hypothesis_${idx + 1}`)
  const h: Hypothesis = {
    id: String(r.id ?? `h${idx + 1}`),
    primitive,
    evidencePlus: r.evidencePlus ?? r["evidence+"] ?? [],
    evidenceMinus: r.evidenceMinus ?? r["evidence-"] ?? [],
    value: clampScore(r.value ?? r.Value ?? 0, `${primitive}.value`),
    confidence: clampScore(r.confidence ?? r.Confidence ?? 0, `${primitive}.confidence`),
    infoGain: clampScore(r.infoGain ?? r.InfoGain ?? 0, `${primitive}.infoGain`),
    cost: clampScore(r.cost ?? r.Cost ?? 0, `${primitive}.cost`),
    risk: clampScore(r.risk ?? r.Risk ?? 0, `${primitive}.risk`),
    stateDamage: clampScore(r.stateDamage ?? r.StateDamage ?? 0, `${primitive}.stateDamage`),
    stability: clampScore(r.stability ?? r.Stability ?? 0, `${primitive}.stability`),
    closureDelta: clampScore(r.closureDelta ?? r.closure_delta ?? 0, `${primitive}.closureDelta`),
    branchKillValue: clampScore(r.branchKillValue ?? r.branch_kill_value ?? 0, `${primitive}.branchKillValue`),
    nextTest: String(r.nextTest ?? r.next_one_variable_test ?? r.next ?? ""),
    expectedOutcomes: r.expectedOutcomes ?? r.expected ?? [],
    killRule: String(r.killRule ?? r.kill_pivot_rule ?? ""),
    status: String(r.status ?? "active"),
    family: r.family === undefined ? undefined : String(r.family),
    chainRef: r.chainRef === undefined ? undefined : String(r.chainRef),
    origin: r.origin === undefined ? (r.chainRef === undefined ? "model" : "kb") : String(r.origin) as "kb" | "model" | "hybrid",
    lessonPenalty: r.lessonPenalty === undefined ? undefined : String(r.lessonPenalty),
    ownerFlipTrigger: r.ownerFlipTrigger === undefined ? undefined : String(r.ownerFlipTrigger),
    closureOwnerHint: r.closureOwnerHint === undefined ? undefined : String(r.closureOwnerHint),
    whyNow: r.whyNow === undefined ? undefined : String(r.whyNow),
    whyNotOthers: r.whyNotOthers === undefined ? undefined : String(r.whyNotOthers),
    owner: r.owner === undefined ? undefined : String(r.owner),
    supportingSurface: r.supportingSurface === undefined ? undefined : String(r.supportingSurface),
    closurePathType: r.closurePathType === undefined ? undefined : String(r.closurePathType),
    sourceGuided: r.sourceGuided === undefined ? undefined : Boolean(r.sourceGuided),
    sourceAvailable: r.sourceAvailable === undefined ? undefined : Boolean(r.sourceAvailable),
    sourceFirstSatisfied: r.sourceFirstSatisfied === undefined ? undefined : Boolean(r.sourceFirstSatisfied),
    blockerReason: r.blockerReason === undefined ? undefined : String(r.blockerReason),
    revisitTrigger: r.revisitTrigger === undefined ? undefined : String(r.revisitTrigger),
    antiPattern: r.antiPattern === undefined ? undefined : String(r.antiPattern),
    parentId: r.parentId === undefined ? undefined : String(r.parentId),
    prerequisiteIds: Array.isArray(r.prerequisiteIds) ? r.prerequisiteIds.map(String) : Array.isArray(r.prerequisites) ? r.prerequisites.map(String) : undefined,
    segmentId: r.segmentId === undefined ? undefined : String(r.segmentId),
    segmentState: r.segmentState === undefined ? undefined : String(r.segmentState).toUpperCase() as Hypothesis["segmentState"],
    branchId: r.branchId === undefined ? undefined : String(r.branchId),
    sharedPrefix: r.sharedPrefix === undefined ? undefined : Boolean(r.sharedPrefix),
    terminalBranch: r.terminalBranch === undefined ? undefined : Boolean(r.terminalBranch),
    missingPrerequisites: Array.isArray(r.missingPrerequisites) ? r.missingPrerequisites.map(String) : Array.isArray(r.missing_prerequisites) ? r.missing_prerequisites.map(String) : undefined,
    blockedBy: r.blockedBy === undefined ? undefined : String(r.blockedBy),
    bypassPlan: r.bypassPlan === undefined ? undefined : String(r.bypassPlan),
    bypassEvidence: r.bypassEvidence === undefined ? undefined : String(r.bypassEvidence),
    blindOrOob: r.blindOrOob === undefined ? undefined : Boolean(r.blindOrOob),
    oracleEvidence: r.oracleEvidence === undefined ? undefined : String(r.oracleEvidence),
    challengeSpecific: r.challengeSpecific === undefined ? undefined : Boolean(r.challengeSpecific),
    authorIntent: r.authorIntent === undefined ? undefined : String(r.authorIntent),
    primitiveCard: r.primitiveCard === undefined ? undefined : String(r.primitiveCard),
    stateIndependence: r.stateIndependence === undefined ? undefined : String(r.stateIndependence).toLowerCase() as Hypothesis["stateIndependence"],
    requiresReentry: r.requiresReentry === undefined ? undefined : Boolean(r.requiresReentry),
    closureCandidates: Array.isArray(r.closureCandidates) ? r.closureCandidates.map((x) => typeof x === "string" ? x : String((x as AnyRecord).name ?? JSON.stringify(x))) : undefined,
    closureCandidatesDetailed: Array.isArray(r.closureCandidatesDetailed)
      ? r.closureCandidatesDetailed.map((x, i) => normalizeClosureCandidate(x, primitive, i))
      : Array.isArray(r.closureQueue)
        ? r.closureQueue.map((x, i) => normalizeClosureCandidate(x, primitive, i))
        : Array.isArray(r.closureCandidates) && r.closureCandidates.some((x) => typeof x === "object")
          ? (r.closureCandidates as unknown[]).map((x, i) => normalizeClosureCandidate(x, primitive, i))
          : undefined,
    replayCost: r.replayCost === undefined ? undefined : clampScore(r.replayCost, `${primitive}.replayCost`),
    movingParts: r.movingParts === undefined ? undefined : clampScore(r.movingParts, `${primitive}.movingParts`),
  }
  return h
}

function activeHypotheses(state: State) {
  return state.hypotheses.filter((h) => !["killed", "falsified", "done", "locked", "blocked", "dead"].includes(String(h.status ?? "active").toLowerCase()))
}

function sortRank(hyps: Hypothesis[], knowledgeMode = "") {
  return [...hyps].sort((a, b) => (effectiveScore(b) + rankingBias(b, knowledgeMode)) - (effectiveScore(a) + rankingBias(a, knowledgeMode)))
}

function deriveChainPenalty(status: string): ChainPenalty {
  const normalized = status.trim().toUpperCase()
  if (normalized === "DEAD") {
    return { confidenceDelta: 2, valueDelta: 1, forcedStatus: "killed" }
  }
  if (normalized === "BLOCKED") {
    return { confidenceDelta: 2, valueDelta: 1 }
  }
  if (normalized === "BYPASSED") {
    return { confidenceDelta: -1, valueDelta: 0 }
  }
  return { confidenceDelta: 0, valueDelta: 0 }
}

function applyChainPenalties(hypotheses: Hypothesis[], chains?: ChainStateChain[]) {
  if (!Array.isArray(chains) || !chains.length) return hypotheses.map((h) => ({ ...h }))
  return hypotheses.map((h) => {
    if (!h.chainRef) return { ...h }
    const linkedChain = chains.find((c) => String(c.chain_id ?? c.id ?? "") === h.chainRef)
    const linkedStatus = String(linkedChain?.state ?? linkedChain?.status ?? "")
    const penalty = deriveChainPenalty(linkedStatus)
    const next: Hypothesis = {
      ...h,
      confidence: clampScore(h.confidence - penalty.confidenceDelta, `${h.primitive}.confidence`),
      value: clampScore(h.value - penalty.valueDelta, `${h.primitive}.value`),
    }
    if (penalty.forcedStatus && next.status !== "locked") next.status = penalty.forcedStatus
    return next
  })
}

async function loadState(file: string): Promise<State> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as State
    parsed.hypotheses = Array.isArray(parsed.hypotheses) ? parsed.hypotheses.map(normalizeHypothesis) : []
    parsed.history = Array.isArray(parsed.history) ? parsed.history : []
    parsed.model = parsed.model && typeof parsed.model === "object" ? parsed.model : {}
    parsed.version = parsed.version || 1
    parsed.mode = parsed.mode || "medium"
    parsed.updatedAt = parsed.updatedAt || now()
    parsed.createdAt = parsed.createdAt || parsed.updatedAt
    return parsed
  } catch {
    const t = now()
    return { version: 1, mode: "medium", model: {}, hypotheses: [], history: [], createdAt: t, updatedAt: t }
  }
}

async function saveState(file: string, state: State) {
  state.updatedAt = now()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

function topThreeCompositionWarnings(state: State, knowledgeMode: string) {
  const warnings: string[] = []
  const top = sortRank(activeHypotheses(state), knowledgeMode).slice(0, 3)
  if (!top.length || !knowledgeMode) return warnings
  const hasKb = top.some((h) => hypothesisOrigin(h) === "kb")
  const hasModelOrHybrid = top.some((h) => ["model", "hybrid"].includes(hypothesisOrigin(h)))
  if (knowledgeMode === "matched" && !hasKb) {
    warnings.push("top3_admission: knowledgeMode=matched but top-3 has no KB-supported hypothesis; keep at least one KB chain unless all are falsified or unsafe")
  }
  if (knowledgeMode === "weak_match" && !hasModelOrHybrid) {
    warnings.push("top3_admission: knowledgeMode=weak_match but top-3 has no model/hybrid hypothesis; admit one evidence-aligned non-KB branch")
  }
  if (knowledgeMode === "no_match_explained" && hasKb && !hasModelOrHybrid) {
    warnings.push("top3_admission: knowledgeMode=no_match_explained but top-3 is still KB-only; prefer model/hybrid hypotheses after documented zero-hit")
  }
  const owners = new Set(top.map((h) => String(h.owner ?? "")).filter(Boolean))
  if (owners.size > 1) warnings.push(`mixed_owner_conflict: top-3 currently spans ${owners.size} owners; choose one primary owner and at most one supporting surface`)
  const closureOwners = new Set(top.map((h) => String(h.closureOwnerHint ?? "")).filter(Boolean))
  if (closureOwners.size > 1) warnings.push("closure_owner_conflict: competing closure owners detected; resolve handoff before deepening probes")
  return warnings
}

function prerequisiteWarnings(h: Hypothesis, state: State) {
  const warnings: string[] = []
  const prereqs = h.prerequisiteIds ?? []
  for (const id of prereqs) {
    const dep = state.hypotheses.find((x) => x.id === id || x.segmentId === id)
    const depStatus = String(dep?.status ?? "").toLowerCase()
    const depSegment = String(dep?.segmentState ?? "").toUpperCase()
    if (!dep) warnings.push(`missing_prerequisite_ref: ${h.id} depends on unknown ${id}`)
    else if (!(depStatus === "locked" || depSegment === "CONFIRMED" || depSegment === "BYPASSED")) warnings.push(`prerequisite_not_confirmed: ${h.id} depends on ${id} status=${dep.status ?? ""} segment=${dep.segmentState ?? ""}`)
  }
  return warnings
}

function nearestConfirmedAncestor(h: Hypothesis, state: State) {
  let cur: Hypothesis | undefined = h
  const seen = new Set<string>()
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId)
    const parent = state.hypotheses.find((x) => x.id === cur?.parentId || x.segmentId === cur?.parentId)
    if (!parent) break
    const status = String(parent.status ?? "").toLowerCase()
    const segment = String(parent.segmentState ?? "").toUpperCase()
    if (status === "locked" || segment === "CONFIRMED" || segment === "BYPASSED") return parent
    cur = parent
  }
  return undefined
}

function siblingTerminalBranches(h: Hypothesis, state: State) {
  if (!h.parentId) return []
  return state.hypotheses.filter((x) => x.parentId === h.parentId && x.id !== h.id && x.terminalBranch === true)
}

function dagWarnings(state: State) {
  const warnings: string[] = []
  for (const h of activeHypotheses(state)) {
    warnings.push(...prerequisiteWarnings(h, state))
    if (h.parentId) {
      const parent = state.hypotheses.find((x) => x.id === h.parentId || x.segmentId === h.parentId)
      if (!parent) warnings.push(`missing_parent_ref: ${h.id} parentId=${h.parentId}`)
    }
    if (h.segmentState === "BLOCKED" && !h.bypassPlan && !h.bypassEvidence) warnings.push(`blocked_without_bypass_plan: ${h.id}; run bypass planner or backtrack to nearest confirmed segment`)
    if (h.segmentState === "BYPASSED" && !h.bypassEvidence) warnings.push(`bypassed_without_evidence: ${h.id}; record bypassEvidence before treating path as open`)
    if (h.blindOrOob === true && !h.oracleEvidence) warnings.push(`blind_oob_without_oracle: ${h.id}; cannot confirm blind segment without timing/OOB/writeback oracle evidence`)
  }
  for (const h of state.hypotheses) {
    const isFailed = h.segmentState === "FALSIFIED" || ["killed", "dead"].includes(String(h.status ?? "").toLowerCase())
    const isBlocked = h.segmentState === "BLOCKED" || String(h.status ?? "").toLowerCase() === "blocked"
    if (isFailed) {
      const ancestor = nearestConfirmedAncestor(h, state)
      const siblings = siblingTerminalBranches(h, state).filter((x) => !["killed", "dead"].includes(String(x.status ?? "").toLowerCase()) && x.segmentState !== "FALSIFIED")
      if (ancestor && siblings.length) warnings.push(`backtrack_hint: ${h.id} failed; resume from ${ancestor.id} and try sibling branch(es): ${siblings.map((x) => x.id).join(",")}`)
    }
    if (isBlocked) {
      const ancestor = nearestConfirmedAncestor(h, state)
      const siblings = siblingTerminalBranches(h, state).filter((x) => x.segmentState !== "FALSIFIED" && !["killed", "dead"].includes(String(x.status ?? "").toLowerCase()))
      if (h.bypassPlan || h.bypassEvidence) warnings.push(`blocked_bypass_candidate: ${h.id}; bypass info exists, consider explicit bypass probe before abandoning`)
      else if (ancestor && siblings.length) warnings.push(`blocked_backtrack_hint: ${h.id} blocked; backtrack to ${ancestor.id} or try sibling branch(es): ${siblings.map((x) => x.id).join(",")}`)
    }
  }
  return warnings
}

function validationWarnings(state: State, knowledgeMode = "") {
  const warnings: string[] = []
  const active = activeHypotheses(state)
  if (active.length > 3) warnings.push(`BLOCK: active_hypotheses=${active.length}; keep at most top 3 before probing`)
  const knowledgeAge = historyDistanceFromLastGate(state, "knowledge")
  if (knowledgeAge !== null && knowledgeAge > 8) warnings.push(`knowledge_context_stale: last knowledge gate is ${knowledgeAge} history event(s) old; consider re-running knowledge gate after major new evidence`)
  const bypassNoDiff = bypassNoDiffCount(state)
  if (bypassNoDiff >= 3) warnings.push(`bypass_no_diff_limit: ${bypassNoDiff} bypass-family observation(s) without differential; mark branch BLOCKED/backtrack unless a new oracle exists`)
  if (primitiveLockedActive(state) && !closureGateSatisfied(state)) warnings.push("closure_required: a primitive is confirmed/locked but closure gate has not been satisfied; write Flag Location Model and Closure Queue before new discovery")
  if (hasSourcePressure(state) && !hasSatisfiedSourceFirst(state)) warnings.push("source_first_required: source/source-guided evidence exists but source-first gate is not satisfied; demote blind black-box branches until source audit is done")
  if (recentOwnerConflict(state)) warnings.push("owner_conflict: more than one active owner remains; choose one primary owner and at most one supporting surface")
  const blockedRefs = blockedChainRefs(state)
  for (const h of active) {
    const modelOrigin = !h.chainRef
    if (h.confidence > 3) warnings.push(`cap_check: ${h.id} confidence=${h.confidence}; only valid with source reachability or repeatable behavioral evidence`)
    if (h.value > 3) warnings.push(`cap_check: ${h.id} value=${h.value}; only valid with a plausible direct flag path or composable primitive chain`)
    if (!h.nextTest) warnings.push(`missing_next_test: ${h.id}`)
    if (!h.killRule) warnings.push(`missing_kill_or_pivot_rule: ${h.id}`)
    if (!h.whyNow) warnings.push(`missing_why_now: ${h.id}`)
    if (!h.whyNotOthers) warnings.push(`missing_why_not_others: ${h.id}`)
    if (h.owner && !h.closureOwnerHint && primitiveLockedActive(state)) warnings.push(`missing_closure_owner_hint: ${h.id}; closure branches should declare closure owner once a primitive exists`)
    if (primitiveLockedActive(state) && !h.primitiveCard) warnings.push(`primitive_abstraction_missing: ${h.id}; endgame-ready branches should declare primitiveCard after primitive lock`)
    if (primitiveLockedActive(state) && h.stateIndependence === undefined) warnings.push(`state_independence_missing: ${h.id}; closure branches should score state independence after primitive lock`)
    if (primitiveLockedActive(state) && h.requiresReentry === true && (!Array.isArray(h.closureCandidates) || h.closureCandidates.length === 0)) warnings.push(`closure_candidates_missing: ${h.id}; replay/reentry-heavy branches must justify why closure templates are not shorter`)
    if (primitiveLockedActive(state) && h.nextTest && isBusinessNarrativeProbe(h.nextTest) && (h.requiresReentry === true || h.stateIndependence === "low")) warnings.push(`business_narrative_drift: ${h.id}; replay-heavy business-flow nextTest should not outrank canonical closure after primitive lock`)
    if (h.chainRef && blockedRefs.has(h.chainRef)) warnings.push(`blocked_chain_ref_active: ${h.id} references blocked/dead chain ${h.chainRef}; require revisitTrigger or rerank away from it`)
    if (h.sourceAvailable === true && h.sourceFirstSatisfied !== true && h.sourceGuided !== true) warnings.push(`source_first_penalty: ${h.id}; source is available but this branch is not source-guided and source-first is unsatisfied`)
    if (modelOrigin && !h.nextTest) warnings.push(`model_hypothesis_missing_probe: ${h.id}; non-KB hypotheses must define one next test`)
    if (modelOrigin && !h.killRule) warnings.push(`model_hypothesis_missing_kill_rule: ${h.id}; non-KB hypotheses must define a falsify or pivot rule`)
    if (modelOrigin && h.confidence > 2 && h.infoGain < 2) warnings.push(`model_hypothesis_confidence_check: ${h.id}; non-KB hypothesis has elevated confidence without matching information gain`)
    if (h.lessonPenalty) warnings.push(`lesson_penalty_active: ${h.id} -> ${h.lessonPenalty}`)
    if (h.ownerFlipTrigger) warnings.push(`owner_flip_trigger_present: ${h.id} -> ${h.ownerFlipTrigger}`)
    if (h.closureOwnerHint) warnings.push(`closure_owner_hint_present: ${h.id} -> ${h.closureOwnerHint}`)
    if (h.revisitTrigger) warnings.push(`revisit_trigger_recorded: ${h.id} -> ${h.revisitTrigger}`)
    if (h.antiPattern) warnings.push(`anti_pattern_penalty: ${h.id} -> ${h.antiPattern}`)
    const delta = lessonActionBias(h)
    if (delta !== 0) warnings.push(`lesson_action_bias: ${h.id} -> ${delta > 0 ? "+" : ""}${delta}`)
  }
  warnings.push(...topThreeCompositionWarnings(state, knowledgeMode))
  warnings.push(...dagWarnings(state))
  return warnings
}

function sameFamilyNoDiffCount(state: State, family: string) {
  return state.history.filter((x) => x.kind === "observation" && x.family === family && x.newDifferential === false).length
}

function bypassNoDiffCount(state: State) {
  return state.history.filter((x) => x.kind === "observation" && (x.bypassContext === true || String(x.family ?? "").toLowerCase().includes("bypass")) && x.newDifferential === false).length
}

function familyNoDiffSummary(state: State) {
  const counts = new Map<string, number>()
  for (const item of state.history) {
    if (item.kind !== "observation" || item.newDifferential !== false) continue
    const family = String(item.family ?? "<unknown>")
    counts.set(family, (counts.get(family) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
}

function historyDistanceFromLastGate(state: State, gate: string) {
  for (let idx = state.history.length - 1; idx >= 0; idx--) {
    const item = state.history[idx]
    if (item.kind === "gate" && item.gate === gate) return state.history.length - 1 - idx
  }
  return null
}

function lastHistoryItem(state: State, kind: string, family = "") {
  return [...state.history].reverse().find((x) => x.kind === kind && (!family || String(x.family ?? "") === family)) as AnyRecord | undefined
}

function hasSourcePressure(state: State) {
  return state.hypotheses.some((h) => h.sourceAvailable === true || h.sourceGuided === true) || state.history.some((x) => x.kind === "gate" && x.gate === "source_first" && x.pass === true)
}

function hasSatisfiedSourceFirst(state: State) {
  return state.hypotheses.some((h) => h.sourceFirstSatisfied === true) || state.history.some((x) => x.kind === "gate" && x.gate === "source_first" && x.pass === true)
}

function currentPrimaryOwner(state: State) {
  const active = sortRank(activeHypotheses(state))
  return active[0]?.owner || String(state.model?.primary_owner ?? "") || ""
}

function currentSupportingSurface(state: State) {
  const active = sortRank(activeHypotheses(state))
  return active[0]?.supportingSurface || String(state.model?.supporting_surface ?? "") || ""
}

function primitiveLockedActive(state: State) {
  return state.hypotheses.some((h) => String(h.status ?? "").toLowerCase() === "locked")
    || state.history.some((x) => x.kind === "primitive")
    || state.history.some((x) => x.kind === "observation" && x.confirmed === true)
}

function closureGateSatisfied(state: State) {
  return state.history.some((x) => x.kind === "gate" && x.gate === "closure" && x.pass === true)
}

function lastProbeForFamily(state: State, family: string) {
  return [...state.history].reverse().find((x) => x.kind === "probe" && String(x.family ?? "") === family) as AnyRecord | undefined
}

function observationExistsAfter(state: State, family: string, probeAt: string) {
  const probeTime = Date.parse(probeAt)
  if (!Number.isFinite(probeTime)) return false
  return state.history.some((x) => x.kind === "observation" && String(x.family ?? "") === family && Number.isFinite(Date.parse(String(x.at ?? ""))) && Date.parse(String(x.at ?? "")) >= probeTime)
}

function blockedChainRefs(state: State) {
  const blocked = new Set<string>()
  for (const item of state.history) {
    if (item.kind === "chain_state" && ["BLOCKED", "DEAD"].includes(String(item.state ?? item.status ?? "").toUpperCase())) {
      const ref = String(item.chainRef ?? item.chain_id ?? item.id ?? "")
      if (ref) blocked.add(ref)
    }
  }
  for (const h of state.hypotheses) {
    if (h.chainRef && ["blocked", "dead", "killed"].includes(String(h.status ?? "").toLowerCase())) blocked.add(h.chainRef)
  }
  return blocked
}

function recentOwnerConflict(state: State) {
  const active = activeHypotheses(state)
  const owners = new Set(active.map((h) => String(h.owner ?? "")).filter(Boolean))
  return owners.size > 1
}

function sourceFirstPenalty(h: Hypothesis) {
  if (h.sourceAvailable === true && h.sourceFirstSatisfied !== true && h.sourceGuided !== true) return -1.5
  return 0
}

function lastObservation(state: State) {
  return [...state.history].reverse().find((x) => x.kind === "observation") as AnyRecord | undefined
}

function requiredKeys(obj: AnyRecord, keys: string[]) {
  return keys.filter((k) => obj[k] === undefined || obj[k] === null || String(obj[k]).trim?.() === "")
}

function gateCheck(state: State, gate: string, gateJson: AnyRecord) {
  const g = gate.toLowerCase()
  const failures: string[] = []
  const notes: string[] = []
  if (g === "route") {
    failures.push(...requiredKeys(gateJson, ["categoryEvidence", "cheapestDirectSolve", "whyNotPrimary", "firstSubagentTask"]).map((k) => `missing ${k}`))
    if (gateJson.ownerFlipPending === true && !String(gateJson.ownerFlipResolution ?? "").trim()) {
      failures.push("ownerFlipPending requires ownerFlipResolution before route continues")
    }
  } else if (g === "depth") {
    failures.push(...requiredKeys(gateJson, ["inputReachability", "oracle", "oneVariable", "queueImpact", "budget"]).map((k) => `missing ${k}`))
    if (gateJson.oneVariable === false) failures.push("probe changes more than one variable")
    const hadKnowledgeGate = state.history.some((x) => x.kind === "gate" && x.gate === "knowledge" && x.pass === true)
    if (gateJson.knowledgeChecked !== true && !hadKnowledgeGate) {
      failures.push("knowledge gate not satisfied; run SecKB segment/chain matching and pass gate=knowledge before depth")
    }
    if (primitiveLockedActive(state) && gateJson.closureJustification !== true) {
      failures.push("depth gate denied while a primitive is locked; satisfy closure gate or justify why closure is not yet active")
    }
    if (hasSourcePressure(state) && !hasSatisfiedSourceFirst(state) && gateJson.sourceOverride !== true) {
      failures.push("source-first gate unsatisfied; satisfy source_first gate or provide sourceOverride=true with explicit reason")
    }
  } else if (g === "knowledge") {
    failures.push(...requiredKeys(gateJson, ["queryRun", "matchedSegments"]).map((k) => `missing ${k}`))
    if (gateJson.queryRun !== true) failures.push("queryRun must be true after actual SecKB retrieval/segment matching")
    const knowledgeMode = String(gateJson.knowledgeMode ?? "").toLowerCase()
    const matched = Array.isArray(gateJson.matchedSegments) ? gateJson.matchedSegments.length : Number(gateJson.matchedSegments ?? 0)
    if (!Number.isFinite(matched)) {
      failures.push("matchedSegments must be an array or finite count")
    } else if (matched > 0) {
      if (knowledgeMode && knowledgeMode !== "matched" && knowledgeMode !== "weak_match") {
        failures.push(`knowledgeMode '${knowledgeMode}' is inconsistent with matchedSegments > 0`)
      }
      if (knowledgeMode === "weak_match") {
        if (!String(gateJson.whyNotPrimary ?? "").trim()) failures.push("weak_match requires whyNotPrimary")
        if (!String(gateJson.nextModelHypothesis ?? "").trim()) failures.push("weak_match requires nextModelHypothesis")
        else notes.push("knowledge_weak_match_recorded: KB result kept as prior but not primary")
      } else {
        notes.push("knowledge_matched: KB provided one or more candidate segments")
      }
    } else {
      const category = String(gateJson.category ?? state.model?.category ?? "").toLowerCase()
      const unfamiliar = gateJson.unfamiliarType === true || gateJson.novelType === true
      const externalChecked = gateJson.gapSearchPlanned === true || gateJson.externalKnowledgeChecked === true || gateJson.blockerDocumented === true
      const nonWeb = category.length > 0 && !category.includes("web")
      const noMatchReason = String(gateJson.noMatchReason ?? "").trim()
      const nextModelHypothesis = String(gateJson.nextModelHypothesis ?? "").trim()
      const modeAllowsZeroHit = knowledgeMode === "no_match_explained" || knowledgeMode === "weak_match" || knowledgeMode === ""
      if (!modeAllowsZeroHit) failures.push(`knowledgeMode '${knowledgeMode}' is inconsistent with matchedSegments = 0`)
      if (!(nonWeb && (unfamiliar || externalChecked))) {
        failures.push("must have queried SecKB and found at least one matching segment before entering depth phase, unless this is a non-Web unfamiliar/novel type with zero-hit evidence recorded")
      }
      if (!noMatchReason) failures.push("zero-hit knowledge gate requires noMatchReason")
      if (!nextModelHypothesis) failures.push("zero-hit knowledge gate requires nextModelHypothesis")
      if (!failures.length) notes.push("knowledge_zero_hit_allowed: non-Web unfamiliar/novel branch with documented zero-hit retrieval")
    }
  } else if (g === "chain_dag") {
    failures.push(...requiredKeys(gateJson, ["segments", "sharedPrefixes", "terminalBranches", "routeStates", "nextSegment", "backtrackRule"]).map((k) => `missing ${k}`))
    const segments = Array.isArray(gateJson.segments) ? gateJson.segments : []
    const terminalBranches = Array.isArray(gateJson.terminalBranches) ? gateJson.terminalBranches : []
    if (segments.length < 1) failures.push("chain_dag gate requires at least one segment")
    if (terminalBranches.length > 0 && !Array.isArray(gateJson.sharedPrefixes)) failures.push("terminal branches require sharedPrefixes array, even if empty")
    if (gateJson.hasBlocked === true && !String(gateJson.blockedHandling ?? "").trim()) failures.push("blocked chain/segment requires blockedHandling: bypass_plan or backtrack target")
    if (gateJson.hasBlindOrOob === true && !String(gateJson.oracleEvidencePolicy ?? "").trim()) failures.push("blind/OOB segment requires oracleEvidencePolicy")
    if (gateJson.hasMissingPrerequisites === true && !String(gateJson.missingPrereqRecon ?? "").trim()) failures.push("missing prerequisites require missingPrereqRecon targeted task")
    if (!failures.length) notes.push("chain_dag_gate_passed: segmented chain state may drive ranking/probing")
  } else if (g === "source_first") {
    failures.push(...requiredKeys(gateJson, ["sourceAvailable", "sourceMapDone", "sinkMapDone", "whyNotBlackBox"]).map((k) => `missing ${k}`))
    if (gateJson.sourceAvailable !== true) failures.push("source_first gate requires sourceAvailable=true")
    if (gateJson.sourceMapDone !== true) failures.push("source_first gate requires sourceMapDone=true")
    if (gateJson.sinkMapDone !== true) failures.push("source_first gate requires sinkMapDone=true")
    if (!failures.length) notes.push("source_first_passed: source-guided branch may outrank blind black-box exploration")
  } else if (g === "closure") {
    failures.push(...requiredKeys(gateJson, ["primitive", "primitiveCard", "currentBoundary", "flagLocationType", "storageCandidates", "topClosureProbes", "closureOwner", "whyNow", "whyNotOtherFamilies"]).map((k) => `missing ${k}`))
    if (!Array.isArray(gateJson.topClosureProbes) || gateJson.topClosureProbes.length < 1) failures.push("closure gate requires at least one ordered closure probe")
    if (Array.isArray(gateJson.topClosureProbes) && gateJson.topClosureProbes.length > 5) failures.push("closure gate allows at most five closure probes")
    if (Array.isArray(gateJson.closureCandidates) && gateJson.closureCandidates.length < 1) failures.push("closure gate requires at least one closure candidate when provided")
    if (gateJson.requiresReentry === true && !String(gateJson.replayJustification ?? "").trim()) failures.push("replay-heavy closure requires replayJustification")
    if (gateJson.stateIndependence === undefined) failures.push("closure gate requires stateIndependence")
    if (!failures.length) notes.push("closure_gate_passed: closure-first discipline is active")
  } else if (g === "owner") {
    failures.push(...requiredKeys(gateJson, ["primaryOwner", "supportingSurface", "handoffTrigger", "returnTrigger", "closureOwner", "whyPrimary"]).map((k) => `missing ${k}`))
    if (String(gateJson.primaryOwner ?? "") === String(gateJson.supportingSurface ?? "")) failures.push("supportingSurface must differ from primaryOwner")
    if (!failures.length) notes.push("owner_gate_passed: owner/surface split is explicit")
  } else if (g === "pivot") {
    failures.push(...requiredKeys(gateJson, ["differentialType", "promote", "demote", "nextQueue"]).map((k) => `missing ${k}`))
  } else if (g === "final") {
    failures.push(...requiredKeys(gateJson, ["confirmedPrimitives", "oracles", "controlPlane", "cleanStatePlan"]).map((k) => `missing ${k}`))
    const confirmed = Array.isArray(gateJson.confirmedPrimitives) ? gateJson.confirmedPrimitives.length : Number(gateJson.confirmedPrimitives ?? 0)
    if (!Number.isFinite(confirmed) || confirmed < 1) failures.push("need one confirmed critical primitive or two composable high-value primitives")
    if (gateJson.closureOwnerHint && gateJson.closureOwnerHintUsed === false) failures.push("final gate has closureOwnerHint but closureOwnerHintUsed=false")
  } else if (g === "stuck") {
    failures.push(...requiredKeys(gateJson, ["likelyWrongAssumption", "strongestAlternativeModel", "ignoredUnfamiliarBranch", "orthogonalTest", "evidenceSource"]).map((k) => `missing ${k}`))
    const src = String(gateJson.evidenceSource ?? "").toLowerCase()
    if (src && !/(source|runtime|protocol|state|environment|config|math|file|dependency|version|browser)/.test(src)) {
      failures.push(`orthogonal evidenceSource is not recognized: ${src}`)
    }
  } else {
    failures.push(`unknown gate ${gate}; use route, depth, pivot, final, stuck, knowledge, chain_dag, source_first, closure, or owner`)
  }
  if (!failures.length) notes.push(`PASS: ${g} gate`)
  else notes.push(`BLOCK: ${g} gate`)
  return { pass: failures.length === 0, failures, notes }
}


function nextAction(state: State) {
  const warnings = validationWarnings(state)
  const active = sortRank(activeHypotheses(state)).slice(0, 3)
  if (warnings.some((w) => w.startsWith("BLOCK") || w.includes("active_hypotheses="))) return { action: "RERANK_OR_REDUCE_QUEUE", reason: warnings[0] }
  if (primitiveLockedActive(state) && !closureGateSatisfied(state)) return { action: "BUILD_CLOSURE_GATE", reason: "primitive locked without closure gate" }
  const lastClosureGate = [...state.history].reverse().find((x) => x.kind === "gate" && x.gate === "closure" && x.pass === true) as AnyRecord | undefined
  const topClosureProbes = Array.isArray(lastClosureGate?.topClosureProbes) ? lastClosureGate.topClosureProbes : []
  if (primitiveLockedActive(state) && topClosureProbes.length) {
    return { action: "RUN_CLOSURE_PROBE", probe: topClosureProbes[0], reason: "primitive locked and closure queue exists" }
  }
  if (hasSourcePressure(state) && !hasSatisfiedSourceFirst(state)) return { action: "RUN_SOURCE_FIRST", reason: "source evidence exists and source-first gate is unsatisfied" }
  const top = active[0]
  if (!top) return { action: "ADD_HYPOTHESIS", reason: "no active hypotheses" }
  if (primitiveLockedActive(state) && top.nextTest && isBusinessNarrativeProbe(top.nextTest) && (top.requiresReentry === true || top.stateIndependence === "low")) {
    return { action: "RERANK_CLOSURE_CANDIDATES", hypothesisId: top.id, reason: "primitive locked and top branch is replay-heavy/business-narrative driven" }
  }
  if (top.segmentState === "BLOCKED" && (top.bypassPlan || top.bypassEvidence)) return { action: "TRY_BYPASS_OR_BACKTRACK", hypothesisId: top.id, reason: "top segment blocked with bypass info" }
  if (top.segmentState === "BLOCKED") return { action: "BACKTRACK_OR_MARK_BLOCKED", hypothesisId: top.id, reason: "top segment blocked" }
  if (top.nextTest) return { action: "RUN_PROBE", hypothesisId: top.id, family: top.family ?? "", probe: top.nextTest, reason: "highest ranked executable hypothesis" }
  return { action: "COMPLETE_PROBE_CONTRACT", hypothesisId: top.id, reason: "top hypothesis lacks nextTest" }
}

function mergeModel(state: State, patch: AnyRecord) {
  state.model = { ...state.model, ...patch }
}

function actionRecord(action: string, payload: AnyRecord) {
  return { kind: "action", at: now(), action, ...payload }
}

export default tool({
  description: "CTF decision-state controller: executable top-3 hypothesis queue, probe contract, same-family attempt limiter, and route/depth/pivot/final/stuck gate checker.",
  args: {
    operation: tool.schema.string().describe("init | rank | probe | observe | gate | report | init_challenge | set_route | add_asset | add_signal | add_hypothesis | add_observation | mark_confirmed | mark_falsified | mark_blocked | add_primitive | closure_promote | add_closure_probe | next_action | snapshot | resume_summary | final_candidate"),
    statePath: tool.schema.string().optional().describe("Workspace-relative state JSON path. Default .ctf-decision-state.json"),
    mode: tool.schema.string().optional().describe("direct | medium | hard"),
    modelJson: tool.schema.string().optional().describe("Challenge Model JSON object"),
    hypothesesJson: tool.schema.string().optional().describe("JSON array of hypotheses with value/confidence/infoGain/cost/risk/stateDamage/stability"),
    probeJson: tool.schema.string().optional().describe("Probe Contract JSON with hypothesisId,family,variable,confirm,falsify,distinguish,oneVariable"),
    observationJson: tool.schema.string().optional().describe("Observation JSON with hypothesisId,family,result,newDifferential,confirmed,falsified,evidence"),
    gate: tool.schema.string().optional().describe("route | depth | pivot | final | stuck | knowledge | chain_dag | source_first | closure | owner"),

    gateJson: tool.schema.string().optional().describe("Gate evidence JSON; required for operation=gate"),
    actionJson: tool.schema.string().optional().describe("Action-style operation payload JSON for action-style operations"),
  },
  async execute(args, context) {
    const file = resolveInsideWorkspace(context.directory, args.statePath ?? ".ctf-decision-state.json")
    const operation = args.operation.trim().toLowerCase()
    const state = await loadState(file)
    const out: string[] = []

    if (operation === "init") {
      state.mode = args.mode ?? state.mode ?? "medium"
      state.model = jsonArg<AnyRecord>(args.modelJson, state.model)
      const parsedHyps = jsonArg<unknown[]>(args.hypothesesJson, state.hypotheses)
      state.hypotheses = parsedHyps.map(normalizeHypothesis)
      state.history.push({ kind: "init", at: now(), mode: state.mode, active: activeHypotheses(state).length })
      await saveState(file, state)
      out.push("operation: init")
    } else if (operation === "rank") {
      if (args.modelJson) state.model = jsonArg<AnyRecord>(args.modelJson, state.model)
      if (args.hypothesesJson) state.hypotheses = jsonArg<unknown[]>(args.hypothesesJson, state.hypotheses).map(normalizeHypothesis)

      let rankedSource = state.hypotheses
      try {
        const chainStateFile = path.resolve(context.directory, ".ctf-chain-state.json")
        const chainState = JSON.parse(await readFile(chainStateFile, "utf8")) as { chains?: ChainStateChain[] }
        rankedSource = applyChainPenalties(state.hypotheses, chainState.chains)
      } catch {
        // Chain state doesn't exist or is invalid; rank without chain-linked penalties.
      }

      const lastKnowledgeGate = [...state.history].reverse().find((x) => x.kind === "gate" && x.gate === "knowledge") as AnyRecord | undefined
      const currentKnowledgeMode = String(lastKnowledgeGate?.knowledgeMode ?? "")
      state.hypotheses = sortRank(rankedSource, currentKnowledgeMode)
      state.history.push({ kind: "rank", at: now(), active: activeHypotheses(state).length })
      await saveState(file, state)
      out.push("operation: rank")
    } else if (operation === "probe") {
      const probe = jsonArg<Probe>(args.probeJson, {})
      const missing = requiredKeys(probe as AnyRecord, ["hypothesisId", "family", "variable", "confirm", "falsify", "distinguish"])
      if (missing.length) out.push(`BLOCK: invalid_probe_contract missing ${missing.join(", ")}`)
      if (probe.oneVariable === false) out.push("BLOCK: probe must change one variable at a time")
      const family = String(probe.family ?? "")
      if (family && sameFamilyNoDiffCount(state, family) >= 3) out.push(`BLOCK: same-family branch '${family}' already has 3 no-differential observations; rerank or run an orthogonal test`)
      if (family) {
        const previousProbe = lastProbeForFamily(state, family)
        if (previousProbe?.at && !observationExistsAfter(state, family, String(previousProbe.at))) {
          out.push(`BLOCK: family '${family}' has a previous probe without a later observation; call observe before another same-family probe`)
        }
      }
      if ((probe as AnyRecord).bypassContext === true && bypassNoDiffCount(state) >= 3) out.push("BLOCK: bypass context already has 3 no-differential observations; mark branch BLOCKED/backtrack or define a new oracle")
      if (primitiveLockedActive(state) && probe.closureProbe !== true && probe.fastPath !== true) out.push("BLOCK: a primitive is locked; only closure probes or explicit fast-path probes are allowed until closure is downgraded")
      if (hasSourcePressure(state) && !hasSatisfiedSourceFirst(state) && probe.fastPath !== true) out.push("BLOCK: source-first gate is unsatisfied while source-guided evidence exists; finish source-first audit before blind probing")
      const hypothesisId = String(probe.hypothesisId ?? "")
      const targetHypothesis = state.hypotheses.find((x) => x.id === hypothesisId)
      if (!targetHypothesis) out.push(`BLOCK: unknown hypothesisId '${hypothesisId}'`)
      if (targetHypothesis) {
        const terminalStatus = String(targetHypothesis.status ?? "").toLowerCase()
        if (["killed", "dead"].includes(terminalStatus) || targetHypothesis.segmentState === "FALSIFIED") out.push(`BLOCK: hypothesis '${hypothesisId}' is already ${targetHypothesis.status ?? targetHypothesis.segmentState}; use revisitTrigger/new evidence before probing`)
        for (const w of prerequisiteWarnings(targetHypothesis, state)) out.push(`BLOCK: ${w}`)
        if (targetHypothesis.segmentState === "BLOCKED" && !targetHypothesis.bypassPlan && !targetHypothesis.bypassEvidence && (probe as AnyRecord).bypassContext !== true) out.push(`BLOCK: hypothesis '${hypothesisId}' is BLOCKED without bypassPlan/bypassEvidence; run bypass planning or backtrack`)
        if (targetHypothesis.blindOrOob === true && !targetHypothesis.oracleEvidence && probe.closureProbe === true) out.push(`BLOCK: blind/OOB closure for '${hypothesisId}' needs oracleEvidence before primitive/closure confirmation`)
      }
      if (targetHypothesis?.chainRef && blockedChainRefs(state).has(targetHypothesis.chainRef) && !targetHypothesis.revisitTrigger) {
        out.push(`BLOCK: hypothesis '${hypothesisId}' references blocked/dead chain ${targetHypothesis.chainRef} without a revisitTrigger`)
      }
      if (!out.some((x) => x.startsWith("BLOCK"))) out.push("PASS: probe contract accepted")
      state.history.push({ kind: "probe", at: now(), ...probe, pass: !out.some((x) => x.startsWith("BLOCK")) })
      await saveState(file, state)
      out.unshift("operation: probe")
    } else if (operation === "observe") {
      const obs = jsonArg<AnyRecord>(args.observationJson, {})
      state.history.push({ kind: "observation", at: now(), ...obs })
      const id = String(obs.hypothesisId ?? "")
      const h = state.hypotheses.find((x) => x.id === id)
      if (h) {
        const blindConfirmWithoutOracle = obs.confirmed === true && h.blindOrOob === true && !h.oracleEvidence && !obs.oracleEvidence
        if (blindConfirmWithoutOracle) {
          h.status = "active"
          out.push(`BLOCK: blind/OOB hypothesis '${id}' cannot be locked without oracleEvidence`)
        } else if (obs.confirmed === true) h.status = "locked"
        else if (obs.falsified === true) h.status = "killed"
        else if (obs.blocked === true) h.status = "blocked"
        else if (obs.dead === true) h.status = "dead"
        else if (obs.newDifferential === true) h.status = "active"
        if (obs.revisitTrigger) h.revisitTrigger = String(obs.revisitTrigger)
        if (obs.blockerReason) h.blockerReason = String(obs.blockerReason)
        if (obs.segmentState) h.segmentState = String(obs.segmentState).toUpperCase() as Hypothesis["segmentState"]
        if (obs.bypassPlan) h.bypassPlan = String(obs.bypassPlan)
        if (obs.bypassEvidence) h.bypassEvidence = String(obs.bypassEvidence)
        if (obs.oracleEvidence) h.oracleEvidence = String(obs.oracleEvidence)
        if (obs.missingPrerequisites && Array.isArray(obs.missingPrerequisites)) h.missingPrerequisites = obs.missingPrerequisites.map(String)
        if (obs.challengeSpecific !== undefined) h.challengeSpecific = Boolean(obs.challengeSpecific)
        if (obs.authorIntent) h.authorIntent = String(obs.authorIntent)
      }
      await saveState(file, state)
      out.push("operation: observe")
    } else if (operation === "gate") {
      const gate = args.gate ?? ""
      const gatePayload = jsonArg<AnyRecord>(args.gateJson, {})
      const checked = gateCheck(state, gate, gatePayload)
      const gateRecord: AnyRecord = { kind: "gate", at: now(), gate: gate.toLowerCase(), pass: checked.pass, failures: checked.failures }
      if (gate.toLowerCase() === "knowledge") {
        gateRecord.knowledgeMode = String(gatePayload.knowledgeMode ?? "") || undefined
        gateRecord.matchedSegmentsCount = Array.isArray(gatePayload.matchedSegments) ? gatePayload.matchedSegments.length : Number(gatePayload.matchedSegments ?? 0)
        gateRecord.category = gatePayload.category ?? state.model?.category
        gateRecord.noMatchReason = gatePayload.noMatchReason
        gateRecord.whyNotPrimary = gatePayload.whyNotPrimary
        gateRecord.nextModelHypothesis = gatePayload.nextModelHypothesis
      }
      if (gate.toLowerCase() === "chain_dag") {
          gateRecord.segmentCount = Array.isArray(gatePayload.segments) ? gatePayload.segments.length : Number(gatePayload.segments ?? 0)
          gateRecord.sharedPrefixes = gatePayload.sharedPrefixes
          gateRecord.terminalBranches = gatePayload.terminalBranches
          gateRecord.routeStates = gatePayload.routeStates
          gateRecord.nextSegment = gatePayload.nextSegment
          gateRecord.backtrackRule = gatePayload.backtrackRule
        }
        if (gate.toLowerCase() === "source_first") {
        gateRecord.sourceAvailable = gatePayload.sourceAvailable
        gateRecord.sourceMapDone = gatePayload.sourceMapDone
        gateRecord.sinkMapDone = gatePayload.sinkMapDone
      }
      if (gate.toLowerCase() === "closure") {
        gateRecord.primitive = gatePayload.primitive
        gateRecord.primitiveCard = gatePayload.primitiveCard
        gateRecord.flagLocationType = gatePayload.flagLocationType
        gateRecord.closureOwner = gatePayload.closureOwner
        gateRecord.topClosureProbes = gatePayload.topClosureProbes
        gateRecord.closureCandidates = gatePayload.closureCandidates
      }
      if (gate.toLowerCase() === "owner") {
        gateRecord.primaryOwner = gatePayload.primaryOwner
        gateRecord.supportingSurface = gatePayload.supportingSurface
        gateRecord.closureOwner = gatePayload.closureOwner
      }
      state.history.push(gateRecord)
      await saveState(file, state)
      out.push("operation: gate", ...checked.notes, ...checked.failures.map((x) => `- ${x}`))
    } else if (operation === "report") {
      out.push("operation: report")
    } else if (["init_challenge", "set_route", "add_asset", "add_signal", "add_hypothesis", "add_observation", "mark_confirmed", "mark_falsified", "mark_blocked", "add_primitive", "closure_promote", "add_closure_probe", "next_action", "snapshot", "resume_summary", "final_candidate"].includes(operation)) {
      const payload = jsonArg<AnyRecord>(args.actionJson, {})
      if (operation === "init_challenge") {
        state.mode = String(payload.mode ?? args.mode ?? state.mode ?? "medium")
        mergeModel(state, payload.model && typeof payload.model === "object" ? payload.model as AnyRecord : payload)
      } else if (operation === "set_route") {
        mergeModel(state, { category: payload.category, target: payload.target, primary_owner: payload.primaryOwner ?? payload.primary_owner, support_surface: payload.supportingSurface ?? payload.supporting_surface, constraints: payload.constraints })
      } else if (operation === "add_hypothesis") {
        const h = normalizeHypothesis(payload, state.hypotheses.length)
        state.hypotheses = [...state.hypotheses.filter((x) => x.id !== h.id), h]
      } else if (operation === "add_observation") {
        state.history.push({ kind: "observation", at: now(), ...payload })
      } else if (["mark_confirmed", "mark_falsified", "mark_blocked"].includes(operation)) {
        const id = String(payload.hypothesisId ?? payload.id ?? "")
        const h = state.hypotheses.find((x) => x.id === id)
        if (!h) out.push(`BLOCK: unknown hypothesisId '${id}'`)
        else {
          h.status = operation === "mark_confirmed" ? "locked" : operation === "mark_falsified" ? "killed" : "blocked"
          if (payload.revisitTrigger) h.revisitTrigger = String(payload.revisitTrigger)
          if (payload.blockerReason) h.blockerReason = String(payload.blockerReason)
        }
      } else if (operation === "add_primitive") {
        state.history.push({ kind: "primitive", at: now(), ...payload })
        const hinted = String(payload.hypothesisId ?? payload.id ?? "")
        const h = state.hypotheses.find((x) => x.id === hinted)
        if (h && !h.primitiveCard && payload.primitiveCard) h.primitiveCard = String(payload.primitiveCard)
      } else if (operation === "closure_promote") {
        state.history.push({ kind: "gate", gate: "closure", at: now(), pass: true, ...payload })
      } else if (operation === "add_closure_probe") {
        state.history.push({ kind: "closure_probe", at: now(), ...payload })
      } else if (["add_asset", "add_signal", "snapshot", "final_candidate"].includes(operation)) {
        state.history.push(actionRecord(operation, payload))
      }
      const suggested = nextAction(state)
      state.history.push({ kind: "action_result", at: now(), operation, suggested })
      await saveState(file, state)
      out.push(`operation: ${operation}`)
      out.push(`suggested_action: ${JSON.stringify(suggested)}`)
    } else {
      out.push(`BLOCK: unknown operation '${args.operation}'`)
    }

    const lastKnowledgeGate = [...state.history].reverse().find((x) => x.kind === "gate" && x.gate === "knowledge") as AnyRecord | undefined
    const currentKnowledgeMode = String(lastKnowledgeGate?.knowledgeMode ?? "")
    const warnings = validationWarnings(state, currentKnowledgeMode)
    const ranked = sortRank(activeHypotheses(state), currentKnowledgeMode).slice(0, 5)
    out.push(`state_path: ${path.relative(context.directory, file) || file}`)
    out.push(`mode: ${state.mode}`)
    out.push(`active_hypotheses: ${activeHypotheses(state).length}`)
    const primaryOwner = currentPrimaryOwner(state)
    const supportingSurface = currentSupportingSurface(state)
    if (primaryOwner) out.push(`primary_owner: ${primaryOwner}`)
    if (supportingSurface) out.push(`supporting_surface: ${supportingSurface}`)
    out.push(`primitive_locked: ${primitiveLockedActive(state) ? "yes" : "no"}`)
    out.push(`closure_gate_passed: ${closureGateSatisfied(state) ? "yes" : "no"}`)
    out.push("ranked_hypotheses:")
    if (ranked.length) {
      for (const h of ranked) {
        const origin = hypothesisOrigin(h)
        const chain = h.chainRef ? ` chainRef=${h.chainRef}` : ""
        const owner = h.owner ? ` owner=${h.owner}` : ""
        const support = h.supportingSurface ? ` support=${h.supportingSurface}` : ""
        const closure = h.closureOwnerHint ? ` closureOwner=${h.closureOwnerHint}` : ""
        const primitiveCard = h.primitiveCard ? ` primitiveCard=${h.primitiveCard}` : ""
        const stateInd = h.stateIndependence ? ` stateIndependence=${h.stateIndependence}` : ""
        const replay = h.replayCost !== undefined ? ` replayCost=${h.replayCost}` : ""
        const moving = h.movingParts !== undefined ? ` movingParts=${h.movingParts}` : ""
        const reentry = h.requiresReentry === true ? " requiresReentry=yes" : ""
        const source = h.sourceAvailable === true ? ` sourceAvailable=${h.sourceAvailable} sourceFirst=${h.sourceFirstSatisfied === true ? "yes" : "no"}` : ""
        const dag = `${h.segmentId ? ` segment=${h.segmentId}` : ""}${h.parentId ? ` parent=${h.parentId}` : ""}${h.prerequisiteIds?.length ? ` prereq=${h.prerequisiteIds.join("|")}` : ""}${h.segmentState ? ` segmentState=${h.segmentState}` : ""}${h.branchId ? ` branch=${h.branchId}` : ""}${h.sharedPrefix ? " sharedPrefix=yes" : ""}${h.terminalBranch ? " terminalBranch=yes" : ""}`
        const blockers = `${h.blockedBy ? ` blockedBy=${h.blockedBy}` : ""}${h.bypassPlan ? " bypassPlan=yes" : ""}${h.bypassEvidence ? " bypassEvidence=yes" : ""}${h.blindOrOob ? " blindOrOob=yes" : ""}${h.oracleEvidence ? " oracleEvidence=yes" : ""}${h.challengeSpecific ? " challengeSpecific=yes" : ""}`
        out.push(`- ${h.id} score=${score(h)} lesson_bias=${lessonActionBias(h)} effective=${effectiveScore(h)} kb_bias=${rankingBias(h, currentKnowledgeMode)} origin=${origin} status=${h.status ?? "active"}${chain}${owner}${support}${closure}${primitiveCard}${stateInd}${replay}${moving}${reentry}${source}${dag}${blockers} primitive=${h.primitive} closure_delta=${h.closureDelta} branch_kill_value=${h.branchKillValue} next=${h.nextTest || "<missing>"}`)
      }
    } else out.push("- none")
    if (lastKnowledgeGate) {
      out.push("knowledge_context:")
      out.push(`- mode=${String(lastKnowledgeGate.knowledgeMode ?? "") || "implicit"}`)
      out.push(`- matchedSegments=${String(lastKnowledgeGate.matchedSegmentsCount ?? "unknown")}`)
      const knowledgeAge = historyDistanceFromLastGate(state, "knowledge")
      if (knowledgeAge !== null) out.push(`- age=${knowledgeAge} history_event(s)`)
      if (lastKnowledgeGate.category) out.push(`- category=${String(lastKnowledgeGate.category)}`)
      if (lastKnowledgeGate.noMatchReason) out.push(`- noMatchReason=${String(lastKnowledgeGate.noMatchReason)}`)
      if (lastKnowledgeGate.whyNotPrimary) out.push(`- whyNotPrimary=${String(lastKnowledgeGate.whyNotPrimary)}`)
      if (lastKnowledgeGate.nextModelHypothesis) out.push(`- nextModelHypothesis=${String(lastKnowledgeGate.nextModelHypothesis)}`)
    }
    const lastChainDagGate = [...state.history].reverse().find((x) => x.kind === "gate" && x.gate === "chain_dag" && x.pass === true) as AnyRecord | undefined
    if (lastChainDagGate) {
      out.push("chain_dag_context:")
      out.push(`- segmentCount=${String(lastChainDagGate.segmentCount ?? "unknown")}`)
      if (lastChainDagGate.nextSegment) out.push(`- nextSegment=${String(lastChainDagGate.nextSegment)}`)
      if (lastChainDagGate.backtrackRule) out.push(`- backtrackRule=${String(lastChainDagGate.backtrackRule)}`)
    }
    const lastSourceGate = [...state.history].reverse().find((x) => x.kind === "gate" && x.gate === "source_first" && x.pass === true) as AnyRecord | undefined
    if (lastSourceGate) {
      out.push("source_first_context:")
      out.push(`- sourceAvailable=${String(lastSourceGate.sourceAvailable ?? "unknown")}`)
      out.push(`- sourceMapDone=${String(lastSourceGate.sourceMapDone ?? "unknown")}`)
      out.push(`- sinkMapDone=${String(lastSourceGate.sinkMapDone ?? "unknown")}`)
    }
    const lastClosureGate = [...state.history].reverse().find((x) => x.kind === "gate" && x.gate === "closure" && x.pass === true) as AnyRecord | undefined
    if (lastClosureGate) {
      out.push("closure_context:")
      if (lastClosureGate.primitive) out.push(`- primitive=${String(lastClosureGate.primitive)}`)
      if (lastClosureGate.flagLocationType) out.push(`- flagLocationType=${String(lastClosureGate.flagLocationType)}`)
      if (lastClosureGate.closureOwner) out.push(`- closureOwner=${String(lastClosureGate.closureOwner)}`)
    }
    const lastOwnerGate = [...state.history].reverse().find((x) => x.kind === "gate" && x.gate === "owner" && x.pass === true) as AnyRecord | undefined
    if (lastOwnerGate) {
      out.push("owner_context:")
      if (lastOwnerGate.primaryOwner) out.push(`- primaryOwner=${String(lastOwnerGate.primaryOwner)}`)
      if (lastOwnerGate.supportingSurface) out.push(`- supportingSurface=${String(lastOwnerGate.supportingSurface)}`)
      if (lastOwnerGate.closureOwner) out.push(`- closureOwner=${String(lastOwnerGate.closureOwner)}`)
    }
    const lastObs = lastObservation(state)
    if (lastObs) {
      out.push("last_observation:")
      out.push(`- hypothesisId=${String(lastObs.hypothesisId ?? "")}`)
      out.push(`- family=${String(lastObs.family ?? "")}`)
      out.push(`- newDifferential=${String(lastObs.newDifferential ?? "unknown")}`)
      if (lastObs.result) out.push(`- result=${String(lastObs.result)}`)
    }
    const familySummary = familyNoDiffSummary(state)
    if (familySummary.length) {
      out.push("family_no_diff_summary:")
      for (const [family, count] of familySummary) out.push(`- ${family}: ${count}`)
    }
    if (warnings.length) out.push("warnings:", ...warnings.map((x) => `- ${x}`))
    out.push("next_required:")
    if (out.some((x) => x.startsWith("BLOCK"))) out.push("- do not continue that action; fix the contract, reduce active hypotheses, rerank, or choose an orthogonal test")
    else if (operation === "probe") out.push("- run exactly this probe, then call observe with the result before another same-family probe")
    else if (operation === "rank" || operation === "init") out.push("- choose the top safe one-variable test or call gate before depth/high-risk/final/stuck actions")
    else if (operation === "next_action") out.push("- follow suggested_action unless new evidence contradicts it")
    else out.push("- continue with the highest-scoring valid branch")
    return out.join("\n")
  },
})
