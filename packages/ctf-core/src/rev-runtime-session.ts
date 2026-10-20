import { createHash } from "node:crypto"
export type RevRuntimeFamily =
  "elf" | "pe" | "mach-o" | "dex" | "apk" | "wasm" | "jvm" | "python-bytecode" | "unicorn" | "unknown"

export type RevRuntimeStage =
  "planned" | "prepared" | "running" | "captured" | "replayed" | "oracle_verified" | "closed" | "blocked"

export type RevRuntimeSubstrate = "local" | "docker" | "wsl" | "adb" | "unicorn" | "qiling" | "unknown"

export type RevRuntimeOracleStatus = "unknown" | "pass" | "fail" | "not_available"

export type RevRuntimeObservationContract = "legacy" | "linked" | "strict"

export type RevRuntimeFingerprintStatus = "unrecorded" | "verified" | "mismatch" | "unavailable" | "legacy"

export type RevRuntimeDoctorCheckStatus = "available" | "missing" | "error" | "skipped"
export type RevRuntimeDoctorRequirement = "required" | "optional"

export type RevRuntimeDoctorCheck = {
  id: string
  requirement: RevRuntimeDoctorRequirement
  command: string
  args: string[]
  status: RevRuntimeDoctorCheckStatus
  version?: string | null
  output_sha256?: string | null
  detail?: string | null
}

export type RevRuntimeDoctor = {
  status: "pass" | "partial" | "fail" | "unavailable"
  source: string
  checked_at: string
  checks: RevRuntimeDoctorCheck[]
  capabilities: string[]
  issues: string[]
}

export type RevRuntimeEvidenceAnchorStatus = "pending" | "verified" | "missing" | "mismatch" | "legacy"

export type RevRuntimeEvidenceAnchor = {
  path: string
  status: RevRuntimeEvidenceAnchorStatus
  source: string
  session_sha256?: string | null
  history_head?: string | null
  created_at: string
}

export type RevRuntimeFingerprint = {
  status: RevRuntimeFingerprintStatus
  observed?: RevRuntimeObservationRuntime | null
  source?: string | null
  checked_at?: string | null
  issues: string[]
}

export type RevRuntimeProvenanceIssueCode =
  | "orphan"
  | "unreferenced-planned"
  | "missing-artifact-reference"
  | "provenance-missing"
  | "artifact-integrity"
  | "artifact-replaced"
  | "path-collision"

export type RevRuntimeProvenanceIssue = {
  code: RevRuntimeProvenanceIssueCode
  message: string
  artifact_id?: string
  observation_id?: string
}

export type RevRuntimeArtifact = {
  id: string
  path: string
  kind: string
  source: string
  status: "planned" | "generated" | "available" | "missing" | "stale" | "verified"
  size?: number
  sha256?: string
  generation?: number
  replaces_artifact_id?: string | null
  notes?: string
  created_at: string
}

export type RevRuntimeMarker = {
  id: string
  name: string
  value?: string
  reached: boolean
  evidence?: string
  source?: string
  at: string
}

export type RevRuntimeOracle = {
  status: RevRuntimeOracleStatus
  command?: string | null
  evidence?: string | null
  at?: string | null
  observation_ids?: string[]
}

export type RevRuntimeObservationRuntime = {
  substrate?: RevRuntimeSubstrate | null
  arch?: string | null
  mode?: string | null
  fingerprint?: string | null
  tool?: string | null
  version?: string | null
  image_digest?: string | null
}

export type RevRuntimeObservation = {
  id: string
  kind: "native" | "replay" | "comparison" | "marker" | "manual"
  status: "pass" | "fail" | "unknown"
  command?: string | null
  input_sha256?: string | null
  payload_sha256?: string | null
  stdout_sha256?: string | null
  stderr_sha256?: string | null
  registers_sha256?: string | null
  memory_sha256?: string | null
  trace_sha256?: string | null
  digest_sources?: string[]
  exit_code?: number | null
  marker?: string | null
  stop_pc?: string | null
  registers?: Record<string, string>
  artifact_refs?: string[]
  artifact_generations?: Record<string, number>
  artifact_sha256s?: Record<string, string>
  related_observation_ids?: string[]
  runtime?: RevRuntimeObservationRuntime
  evidence?: string | null
  at: string
}

export type RevRuntimeEvent = {
  id: string
  at: string
  operation: string
  summary: string
  previous_hash?: string | null
  event_hash?: string | null
  data?: Record<string, unknown>
}

export type RevRuntimeHistoryVerification = {
  status: "legacy" | "verified" | "invalid"
  issues: string[]
}

export function revRuntimeStableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map((item) => revRuntimeStableSerialize(item)).join(",") + "]"
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return "{" + entries.map(([key, item]) => JSON.stringify(key) + ":" + revRuntimeStableSerialize(item)).join(",") + "}"
}

export function revRuntimeValueSha256(value: unknown): string {
  const serialized = typeof value === "string" ? value : revRuntimeStableSerialize(value)
  return createHash("sha256").update(serialized).digest("hex")
}

export function revRuntimeSessionDigest(session: RevRuntimeSession): string {
  const { promotion: _promotion, evidence_anchor: _anchor, ...digestible } = session
  return revRuntimeValueSha256(digestible)
}

export function revRuntimeEventHash(
  event: Pick<RevRuntimeEvent, "id" | "at" | "operation" | "summary" | "previous_hash" | "data">,
): string {
  const canonical = JSON.stringify({
    id: event.id,
    at: event.at,
    operation: event.operation,
    summary: event.summary,
    previous_hash: event.previous_hash ?? null,
    data: event.data ?? null,
  })
  return createHash("sha256").update(canonical).digest("hex")
}

export function revRuntimeHistoryVerification(history: RevRuntimeEvent[] = []): RevRuntimeHistoryVerification {
  if (history.length === 0) return { status: "legacy", issues: ["runtime history is empty"] }
  const hashedEvents = history.filter((event) => Boolean(event.event_hash))
  if (hashedEvents.length === 0)
    return { status: "legacy", issues: ["runtime history has no event hashes (legacy session)"] }
  const issues: string[] = []
  for (let index = 0; index < history.length; index += 1) {
    const event = history[index]
    const expectedPrevious = index === 0 ? null : (history[index - 1].event_hash ?? null)
    if (!event.event_hash) {
      issues.push(`history event ${event.id || index} is missing event_hash`)
      continue
    }
    if ((event.previous_hash ?? null) !== expectedPrevious) {
      issues.push(`history event ${event.id || index} has an invalid previous_hash`)
    }
    const expectedHash = revRuntimeEventHash(event)
    if (event.event_hash !== expectedHash) {
      issues.push(`history event ${event.id || index} has an invalid event_hash`)
    }
  }
  return issues.length > 0 ? { status: "invalid", issues: [...new Set(issues)] } : { status: "verified", issues: [] }
}

export type RevRuntimeSession = {
  schema_version: "rev_runtime_session.v1"
  session_id: string
  target: string
  family: RevRuntimeFamily
  stage: RevRuntimeStage
  observation_contract: RevRuntimeObservationContract
  substrate: {
    kind: RevRuntimeSubstrate
    arch: string | null
    mode: string | null
    fingerprint?: string | null
    tool?: string | null
    version?: string | null
    image_digest?: string | null
  }
  artifacts: RevRuntimeArtifact[]
  markers: RevRuntimeMarker[]
  observations: RevRuntimeObservation[]
  oracle: RevRuntimeOracle
  evidence_refs: string[]
  next_action: string[]
  blocking: string[]
  promotion: {
    allowed: boolean
    reason: string
  }
  decision_state_path?: string | null
  evidence_board_path?: string | null
  runtime_fingerprint?: RevRuntimeFingerprint | null
  runtime_doctor?: RevRuntimeDoctor | null
  evidence_anchor?: RevRuntimeEvidenceAnchor | null
  history: RevRuntimeEvent[]
  created_at: string
  updated_at: string
}

export const REV_RUNTIME_STAGES: RevRuntimeStage[] = [
  "planned",
  "prepared",
  "running",
  "captured",
  "replayed",
  "oracle_verified",
  "closed",
  "blocked",
]

export type RevRuntimeOracleContractInput = Pick<RevRuntimeSession, "oracle" | "observations" | "artifacts"> & {
  observation_contract?: RevRuntimeObservationContract
  substrate?: RevRuntimeSession["substrate"]
}

export function revRuntimeFingerprintVerification(session: {
  substrate?: RevRuntimeSession["substrate"]
  runtime_fingerprint?: RevRuntimeFingerprint | null
}): { status: RevRuntimeFingerprintStatus; issues: string[]; compared_fields: string[] } {
  const record = session.runtime_fingerprint
  if (!record)
    return { status: "legacy", issues: ["runtime fingerprint record is absent (legacy session)"], compared_fields: [] }
  if (record.status === "unavailable")
    return {
      status: "unavailable",
      issues: [...new Set(record.issues.length ? record.issues : ["runtime fingerprint is unavailable"])],
      compared_fields: [],
    }
  const observed = record.observed
  if (!observed)
    return { status: "unrecorded", issues: ["runtime fingerprint observation is missing"], compared_fields: [] }
  const expected = session.substrate
  if (!expected) return { status: "mismatch", issues: ["session substrate metadata is missing"], compared_fields: [] }
  const comparisons: Array<[string, unknown, unknown]> = [
    ["substrate", expected.kind, observed.substrate],
    ["arch", expected.arch, observed.arch],
    ["mode", expected.mode, observed.mode],
    ["fingerprint", expected.fingerprint, observed.fingerprint],
    ["tool", expected.tool, observed.tool],
    ["version", expected.version, observed.version],
    ["image_digest", expected.image_digest, observed.image_digest],
  ]
  const compared_fields: string[] = []
  const issues = [...(record.issues ?? [])]
  for (const [field, expectedValue, observedValue] of comparisons) {
    const expectedText = expectedValue === null || expectedValue === undefined ? "" : String(expectedValue).trim()
    const observedText = observedValue === null || observedValue === undefined ? "" : String(observedValue).trim()
    if (!expectedText || expectedText === "unknown") continue
    compared_fields.push(field)
    if (!observedText) issues.push(`runtime fingerprint observation is missing ${field}`)
    else if (expectedText !== observedText)
      issues.push(`runtime fingerprint ${field} differs: expected ${expectedText}, observed ${observedText}`)
  }
  if (compared_fields.length === 0) issues.push("runtime fingerprint has no expected substrate metadata to compare")
  return issues.length > 0
    ? { status: "mismatch", issues: [...new Set(issues)], compared_fields }
    : { status: "verified", issues: [], compared_fields }
}

export function revRuntimeArtifactProvenanceIssues(
  session: Pick<RevRuntimeSession, "artifacts" | "observations"> & {
    evidence_refs?: string[]
    observation_contract?: RevRuntimeObservationContract
  },
): RevRuntimeProvenanceIssue[] {
  const contract = session.observation_contract ?? "legacy"
  const issues: RevRuntimeProvenanceIssue[] = []
  const byId = new Map<string, RevRuntimeArtifact[]>()
  const byPath = new Map<string, RevRuntimeArtifact[]>()
  const referenced = new Map<string, Set<string>>()
  const evidenceRefs = new Set(
    (session.evidence_refs ?? []).map((item) => String(item).trim().replace(/\\/g, "/").replace(/^\.\//, "")),
  )
  const add = (issue: RevRuntimeProvenanceIssue) => issues.push(issue)
  for (const artifact of session.artifacts ?? []) {
    const idItems = byId.get(artifact.id) ?? []
    idItems.push(artifact)
    byId.set(artifact.id, idItems)
    const normalizedPath = artifact.path.trim().replace(/\\/g, "/").replace(/^\.\//, "")
    const pathItems = byPath.get(normalizedPath) ?? []
    pathItems.push(artifact)
    byPath.set(normalizedPath, pathItems)
    referenced.set(artifact.id, new Set())
  }
  for (const [id, artifacts] of byId) {
    if (artifacts.length > 1) add({ code: "path-collision", artifact_id: id, message: `duplicate artifact id: ${id}` })
  }
  for (const [artifactPath, artifacts] of byPath) {
    const ids = new Set(artifacts.map((item) => item.id))
    if (ids.size > 1) add({ code: "path-collision", message: `artifact path maps to multiple IDs: ${artifactPath}` })
  }
  for (const observation of session.observations ?? []) {
    for (const ref of observation.artifact_refs ?? []) {
      const direct = byId.get(ref) ?? []
      const pathMatch = byPath.get(ref.trim().replace(/\\/g, "/").replace(/^\.\//, "")) ?? []
      const matches = [...new Map([...direct, ...pathMatch].map((item) => [item.id, item])).values()]
      if (matches.length === 0) {
        add({
          code: "missing-artifact-reference",
          observation_id: observation.id,
          message: `observation ${observation.id} references unknown artifact: ${ref}`,
        })
        continue
      }
      if (matches.length > 1) {
        add({
          code: "path-collision",
          observation_id: observation.id,
          message: `observation ${observation.id} references ambiguous artifact: ${ref}`,
        })
        continue
      }
      const artifact = matches[0]
      referenced.get(artifact.id)?.add(observation.id)
      if (artifact.status === "missing" || artifact.status === "stale") {
        add({
          code: "artifact-integrity",
          artifact_id: artifact.id,
          observation_id: observation.id,
          message: `observation ${observation.id} references ${artifact.status} artifact: ${artifact.id}`,
        })
      }
      if (!artifact.sha256 && artifact.status !== "planned") {
        add({
          code: "provenance-missing",
          artifact_id: artifact.id,
          observation_id: observation.id,
          message: `artifact ${artifact.id} lacks a recorded sha256 provenance`,
        })
      }
      const currentGeneration = artifact.generation ?? 1
      const generation = observation.artifact_generations?.[ref] ?? observation.artifact_generations?.[artifact.id]
      if (generation !== undefined && generation !== currentGeneration) {
        add({
          code: "artifact-replaced",
          artifact_id: artifact.id,
          observation_id: observation.id,
          message: `observation ${observation.id} captured artifact ${artifact.id} at generation ${generation}, current generation is ${currentGeneration}`,
        })
      }
      const capturedSha256 = observation.artifact_sha256s?.[ref] ?? observation.artifact_sha256s?.[artifact.id]
      if (capturedSha256 && artifact.sha256 && capturedSha256 !== artifact.sha256) {
        add({
          code: "artifact-integrity",
          artifact_id: artifact.id,
          observation_id: observation.id,
          message: `observation ${observation.id} captured artifact ${artifact.id} with a different sha256`,
        })
      }
      if (contract === "strict" && observation.status === "pass" && (!generation || !capturedSha256)) {
        add({
          code: "provenance-missing",
          artifact_id: artifact.id,
          observation_id: observation.id,
          message: `strict observation ${observation.id} lacks an artifact generation and sha256 snapshot for ${artifact.id}`,
        })
      }
    }
  }
  for (const artifact of session.artifacts ?? []) {
    const used = (referenced.get(artifact.id)?.size ?? 0) > 0
    const linkedEvidence = evidenceRefs.has(artifact.path.trim().replace(/\\/g, "/").replace(/^\.\//, ""))
    if (used || linkedEvidence) continue
    if (artifact.status === "planned")
      add({
        code: "unreferenced-planned",
        artifact_id: artifact.id,
        message: `planned artifact is not yet referenced: ${artifact.id}`,
      })
    else
      add({
        code: "orphan",
        artifact_id: artifact.id,
        message: `artifact has no observation or evidence provenance: ${artifact.id}`,
      })
  }
  return issues
}

/**
 * Validate the observations explicitly attached to an oracle.
 *
 * An oracle without observation_ids is intentionally treated as a legacy
 * oracle so old sessions remain readable and promotable. Once a session
 * opts into observation references, however, those references must resolve
 * to successful observations and intact artifacts.
 */
export function revRuntimeOracleObservationIssues(session: RevRuntimeOracleContractInput): string[] {
  const observationIds = session.oracle.observation_ids ?? []
  const contract = session.observation_contract ?? "legacy"
  if (contract === "strict" && session.oracle.status === "pass" && observationIds.length === 0) {
    return ["strict observation contract requires oracle.observation_ids for a passing oracle"]
  }
  if (observationIds.length === 0) return []

  const observations = new Map(session.observations.map((observation) => [observation.id, observation]))
  const artifacts = new Map<string, RevRuntimeArtifact>()
  for (const artifact of session.artifacts ?? []) {
    artifacts.set(artifact.id, artifact)
    artifacts.set(artifact.path, artifact)
  }

  const issues: string[] = []
  const seen = new Set<string>()
  let passingObservations = 0
  const sessionArch = session.substrate?.arch?.trim() || null
  const sessionMode = session.substrate?.mode?.trim() || null

  const comparisonFields: Array<{
    key:
      | "input_sha256"
      | "payload_sha256"
      | "stdout_sha256"
      | "stderr_sha256"
      | "registers_sha256"
      | "memory_sha256"
      | "trace_sha256"
      | "exit_code"
      | "stop_pc"
    label: string
  }> = [
    { key: "input_sha256", label: "input hashes" },
    { key: "payload_sha256", label: "payload hashes" },
    { key: "stdout_sha256", label: "stdout digests" },
    { key: "stderr_sha256", label: "stderr digests" },
    { key: "registers_sha256", label: "register digests" },
    { key: "memory_sha256", label: "memory digests" },
    { key: "trace_sha256", label: "trace digests" },
    { key: "exit_code", label: "exit codes" },
    { key: "stop_pc", label: "stop PCs" },
  ]

  const addObservationRelationIssues = (observation: RevRuntimeObservation) => {
    const relatedIds = observation.related_observation_ids ?? []
    if (relatedIds.length === 0) return
    const related = relatedIds.map((id) => observations.get(id))
    for (const id of relatedIds) {
      if (id === observation.id) issues.push(`observation references itself: ${id}`)
      if (!observations.has(id))
        issues.push(`observation ${observation.id} references unknown related observation: ${id}`)
    }
    if (observation.kind === "comparison") {
      const relatedKinds = new Set(related.filter(Boolean).map((item) => item!.kind))
      if (!relatedKinds.has("native")) issues.push(`comparison observation lacks a native input: ${observation.id}`)
      if (!relatedKinds.has("replay")) issues.push(`comparison observation lacks a replay input: ${observation.id}`)
      if (observation.status === "pass" && related.some((item) => item && item.status !== "pass")) {
        issues.push(`passing comparison references a non-passing observation: ${observation.id}`)
      }
      const comparable = [observation, ...related.filter((item): item is RevRuntimeObservation => Boolean(item))]
      if (contract === "strict" && observation.status === "pass") {
        const hasSemanticResult = comparisonFields.some(({ key }) => {
          const value = observation[key]
          return value !== null && value !== undefined && String(value).trim() !== ""
        })
        if (!hasSemanticResult) issues.push(`strict comparison lacks a semantic result: ${observation.id}`)
      }
      const inputHashes = new Set(related.map((item) => item?.input_sha256).filter(Boolean))
      if (inputHashes.size > 1) issues.push(`comparison input hashes differ: ${observation.id}`)
      const archs = new Set(related.map((item) => item?.runtime?.arch).filter(Boolean))
      const modes = new Set(related.map((item) => item?.runtime?.mode).filter(Boolean))
      if (archs.size > 1) issues.push(`comparison runtime architectures differ: ${observation.id}`)
      if (modes.size > 1) issues.push(`comparison runtime modes differ: ${observation.id}`)
      for (const { key, label } of comparisonFields) {
        const values = comparable
          .map((item) => item[key])
          .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
          .map(String)
        if (new Set(values).size > 1) issues.push(`comparison ${label} differ: ${observation.id}`)
      }
    }
  }
  for (const id of observationIds) {
    if (seen.has(id)) {
      issues.push(`oracle references duplicate observation: ${id}`)
      continue
    }
    seen.add(id)
    const observation = observations.get(id)
    if (!observation) {
      issues.push(`oracle references unknown observation: ${id}`)
      continue
    }
    if (observation.status === "fail") {
      issues.push(`oracle references failed observation: ${id}`)
    } else if (observation.status === "unknown") {
      issues.push(`oracle references unresolved observation: ${id}`)
    } else {
      passingObservations += 1
    }
    addObservationRelationIssues(observation)
    if (sessionArch && observation.runtime?.arch && observation.runtime.arch !== sessionArch) {
      issues.push(`observation runtime architecture differs from session: ${id}`)
    }
    if (sessionMode && observation.runtime?.mode && observation.runtime.mode !== sessionMode) {
      issues.push(`observation runtime mode differs from session: ${id}`)
    }
    for (const artifactRef of observation.artifact_refs ?? []) {
      const artifact = artifacts.get(artifactRef)
      if (!artifact) {
        issues.push(`observation ${id} references unknown artifact: ${artifactRef}`)
      } else if (artifact.status === "missing" || artifact.status === "stale") {
        issues.push(`observation ${id} references ${artifact.status} artifact: ${artifactRef}`)
      }
    }
  }
  if (session.oracle.status === "pass" && passingObservations === 0) {
    issues.push("passing oracle requires at least one passing observation")
  }
  if (contract === "strict" && session.oracle.status === "pass") {
    const linkedKinds = new Set(observationIds.map((id) => observations.get(id)?.kind).filter(Boolean))
    for (const requiredKind of ["native", "replay", "comparison"] as const) {
      if (!linkedKinds.has(requiredKind))
        issues.push(`strict observation contract requires a passing ${requiredKind} observation`)
    }
  }
  return [...new Set(issues)]
}

export type RevRuntimePromotionInput = Pick<RevRuntimeSession, "stage" | "oracle"> &
  Partial<
    Pick<
      RevRuntimeSession,
      | "observation_contract"
      | "history"
      | "artifacts"
      | "observations"
      | "substrate"
      | "evidence_refs"
      | "runtime_fingerprint"
      | "evidence_anchor"
    >
  >

export function revRuntimePromotion(session: RevRuntimePromotionInput) {
  const hasOracle = session.oracle.status === "pass" && Boolean(session.oracle.evidence?.trim())
  if (session.evidence_anchor && session.evidence_anchor.status !== "verified") {
    return {
      allowed: false,
      reason: `external evidence anchor is ${session.evidence_anchor.status}; verify or recreate the anchor before promotion`,
    }
  }
  if (session.observation_contract === "strict") {
    const historyVerification = revRuntimeHistoryVerification(session.history ?? [])
    if (historyVerification.status !== "verified") {
      return {
        allowed: false,
        reason: `runtime history integrity is ${historyVerification.status}: ${historyVerification.issues.join("; ")}`,
      }
    }
  }
  const substrate = session.substrate
  const fingerprint = substrate
    ? revRuntimeFingerprintVerification({ substrate, runtime_fingerprint: session.runtime_fingerprint })
    : { status: "legacy" as const, issues: ["runtime substrate is absent (legacy session)"], compared_fields: [] }
  const fingerprintExpected = Boolean(
    session.substrate?.fingerprint ||
    session.substrate?.tool ||
    session.substrate?.version ||
    session.substrate?.image_digest ||
    session.runtime_fingerprint,
  )
  if (session.observation_contract === "strict" && fingerprintExpected && fingerprint.status !== "verified") {
    return {
      allowed: false,
      reason: `runtime fingerprint verification is ${fingerprint.status}: ${fingerprint.issues.join("; ")}`,
    }
  }
  const provenanceIssues = revRuntimeArtifactProvenanceIssues({
    artifacts: session.artifacts ?? [],
    observations: session.observations ?? [],
    evidence_refs: session.evidence_refs ?? [],
    observation_contract: session.observation_contract,
  }).filter((issue) =>
    [
      "missing-artifact-reference",
      "provenance-missing",
      "artifact-integrity",
      "artifact-replaced",
      "path-collision",
    ].includes(issue.code),
  )
  if (session.observation_contract === "strict" && provenanceIssues.length > 0) {
    return {
      allowed: false,
      reason: `runtime artifact provenance failed: ${provenanceIssues.map((issue) => issue.message).join("; ")}`,
    }
  }
  const integrityIssue = session.artifacts?.find(
    (artifact) => artifact.status === "missing" || artifact.status === "stale",
  )
  const observationIssues = session.observations
    ? revRuntimeOracleObservationIssues({
        oracle: session.oracle,
        observations: session.observations,
        artifacts: (session.artifacts ?? []) as RevRuntimeArtifact[],
        substrate: session.substrate,
        observation_contract: session.observation_contract,
      })
    : []
  if (observationIssues.length > 0) {
    return { allowed: false, reason: `runtime oracle observation contract failed: ${observationIssues.join("; ")}` }
  }
  if (integrityIssue && (session.stage === "oracle_verified" || session.stage === "closed")) {
    return {
      allowed: false,
      reason: `runtime artifact integrity is ${integrityIssue.status}; re-record or restore the artifact before promotion`,
    }
  }
  if (session.stage === "closed" && !hasOracle) {
    return { allowed: false, reason: "closed requires an independent passing oracle with evidence" }
  }
  if (session.stage === "oracle_verified" && !hasOracle) {
    return { allowed: false, reason: "oracle_verified requires oracle.status=pass and non-empty evidence" }
  }
  if (hasOracle && (session.stage === "oracle_verified" || session.stage === "closed")) {
    return { allowed: true, reason: "independent passing oracle recorded and runtime artifacts are intact" }
  }
  return { allowed: false, reason: "no independent passing oracle recorded" }
}
