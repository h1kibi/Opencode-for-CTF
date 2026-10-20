import { createHash, randomUUID } from "node:crypto"
import { lstat, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { atomicUpdateJsonFile, loadJsonFile, saveJsonFile } from "../../src/state-store.ts"
import {
  revRuntimeArtifactProvenanceIssues,
  revRuntimeEventHash,
  revRuntimeFingerprintVerification,
  revRuntimeHistoryVerification,
  revRuntimeOracleObservationIssues,
  revRuntimePromotion,
  revRuntimeSessionDigest,
  revRuntimeValueSha256,
  type RevRuntimeArtifact,
  type RevRuntimeDoctor,
  type RevRuntimeEvidenceAnchor,
  type RevRuntimeFamily,
  type RevRuntimeMarker,
  type RevRuntimeObservation,
  type RevRuntimeObservationRuntime,
  type RevRuntimeFingerprint,
  type RevRuntimeObservationContract,
  type RevRuntimeOracleStatus,
  type RevRuntimeSession,
  type RevRuntimeStage,
  type RevRuntimeSubstrate,
  type RevRuntimeEvidenceAnchorStatus,
} from "../../packages/ctf-core/src/rev-runtime-session.ts"
import { resolveInsideWorkspace } from "./workspace-path.ts"

export type RuntimeSessionContext = { workspace: string; directory: string }

const FAMILIES = new Set<RevRuntimeFamily>([
  "elf",
  "pe",
  "mach-o",
  "dex",
  "apk",
  "wasm",
  "jvm",
  "python-bytecode",
  "unicorn",
  "unknown",
])
const SUBSTRATES = new Set<RevRuntimeSubstrate>(["local", "docker", "wsl", "adb", "unicorn", "qiling", "unknown"])
const STAGES = new Set<RevRuntimeStage>([
  "planned",
  "prepared",
  "running",
  "captured",
  "replayed",
  "oracle_verified",
  "closed",
  "blocked",
])
const ORACLE_STATUSES = new Set<RevRuntimeOracleStatus>(["unknown", "pass", "fail", "not_available"])
const OBSERVATION_KINDS = new Set<RevRuntimeObservation["kind"]>(["native", "replay", "comparison", "marker", "manual"])
const OBSERVATION_STATUSES = new Set<RevRuntimeObservation["status"]>(["pass", "fail", "unknown"])
const OBSERVATION_CONTRACTS = new Set<RevRuntimeObservationContract>(["legacy", "linked", "strict"])

function now() {
  return new Date().toISOString()
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => cleanString(item)).filter(Boolean))]
}

function cleanIntegerMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [
        cleanString(key),
        typeof item === "number" && Number.isInteger(item) && item > 0 ? item : null,
      ])
      .filter(([key, item]) => Boolean(key) && item !== null),
  ) as Record<string, number>
}

function cleanStringMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [cleanString(key), cleanString(item)])
      .filter(([key, item]) => Boolean(key) && Boolean(item)),
  ) as Record<string, string>
}

function normalizedRelative(workspace: string, file: string) {
  return path.relative(workspace, file).replace(/\\/g, "/") || path.basename(file)
}

function sessionSlug(target: string) {
  const base =
    path
      .basename(target)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "target"
  const digest = createHash("sha256").update(target).digest("hex").slice(0, 10)
  return `${base.slice(0, 48)}-${digest}`
}

export function defaultRuntimeSessionPath(workspace: string, target = "target") {
  return path.join(workspace, "work", "rev-runtime", `${sessionSlug(target)}.json`)
}

function safeFamily(value: unknown): RevRuntimeFamily {
  const family = cleanString(value).toLowerCase() as RevRuntimeFamily
  return FAMILIES.has(family) ? family : "unknown"
}

function safeSubstrate(value: unknown): RevRuntimeSubstrate {
  const substrate = cleanString(value).toLowerCase() as RevRuntimeSubstrate
  return SUBSTRATES.has(substrate) ? substrate : "unknown"
}

function safeStage(value: unknown): RevRuntimeStage {
  const stage = cleanString(value).toLowerCase() as RevRuntimeStage
  return STAGES.has(stage) ? stage : "planned"
}

function requireStage(value: unknown): RevRuntimeStage {
  const stage = cleanString(value).toLowerCase() as RevRuntimeStage
  if (!STAGES.has(stage)) throw new Error(`unsupported runtime stage: ${cleanString(value)}`)
  return stage
}

function requireOracleStatus(value: unknown): RevRuntimeOracleStatus {
  const status = cleanString(value).toLowerCase() as RevRuntimeOracleStatus
  if (!ORACLE_STATUSES.has(status)) throw new Error(`unsupported oracle status: ${cleanString(value)}`)
  return status
}

function safeOracleStatus(value: unknown): RevRuntimeOracleStatus {
  const status = cleanString(value).toLowerCase() as RevRuntimeOracleStatus
  return ORACLE_STATUSES.has(status) ? status : "unknown"
}

function safeObservationContract(value: unknown): RevRuntimeObservationContract {
  const contract = cleanString(value).toLowerCase() as RevRuntimeObservationContract
  return OBSERVATION_CONTRACTS.has(contract) ? contract : "legacy"
}

function requireObservationContract(value: unknown): RevRuntimeObservationContract {
  const contract = cleanString(value).toLowerCase() as RevRuntimeObservationContract
  if (!OBSERVATION_CONTRACTS.has(contract)) throw new Error(`unsupported observation contract: ${cleanString(value)}`)
  return contract
}

function normalizeArtifact(raw: unknown, workspace: string, at = now()): RevRuntimeArtifact {
  const value = (raw ?? {}) as Record<string, unknown>
  const artifactPath = cleanString(value.path)
  if (!artifactPath) throw new Error("artifact.path is required")
  const absolute = resolveInsideWorkspace(workspace, artifactPath)
  const status = cleanString(value.status, "generated") as RevRuntimeArtifact["status"]
  if (!["planned", "generated", "available", "missing", "stale", "verified"].includes(status)) {
    throw new Error(`unsupported artifact.status: ${status}`)
  }
  const artifact: RevRuntimeArtifact = {
    id: cleanString(value.id, `artifact-${randomUUID()}`),
    path: normalizedRelative(workspace, absolute),
    kind: cleanString(value.kind, "runtime-artifact"),
    source: cleanString(value.source, "manual"),
    status,
    created_at: cleanString(value.created_at, at),
  }
  if (typeof value.size === "number" && Number.isFinite(value.size)) artifact.size = value.size
  if (cleanString(value.sha256)) artifact.sha256 = cleanString(value.sha256)
  if (typeof value.generation === "number" && Number.isInteger(value.generation) && value.generation > 0)
    artifact.generation = value.generation
  if (cleanString(value.replaces_artifact_id ?? value.replacesArtifactId))
    artifact.replaces_artifact_id = cleanString(value.replaces_artifact_id ?? value.replacesArtifactId)
  if (cleanString(value.notes)) artifact.notes = cleanString(value.notes)
  return artifact
}

function normalizeMarker(raw: unknown, at = now()): RevRuntimeMarker {
  const value = (raw ?? {}) as Record<string, unknown>
  const name = cleanString(value.name)
  if (!name) throw new Error("marker.name is required")
  const marker: RevRuntimeMarker = {
    id: cleanString(value.id, `marker-${randomUUID()}`),
    name,
    reached: Boolean(value.reached),
    at: cleanString(value.at, at),
  }
  if (cleanString(value.value)) marker.value = cleanString(value.value)
  if (cleanString(value.evidence)) marker.evidence = cleanString(value.evidence)
  if (cleanString(value.source)) marker.source = cleanString(value.source)
  return marker
}

function normalizeRuntimeMetadata(raw: unknown): RevRuntimeObservationRuntime | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const runtime = raw as Record<string, unknown>
  const normalized: RevRuntimeObservationRuntime = {
    substrate: runtime.substrate ? safeSubstrate(runtime.substrate) : null,
    arch: cleanString(runtime.arch) || null,
    mode: cleanString(runtime.mode) || null,
    fingerprint: cleanString(runtime.fingerprint ?? runtime.substrateFingerprint) || null,
    tool: cleanString(runtime.tool ?? runtime.runtimeTool) || null,
    version: cleanString(runtime.version ?? runtime.runtimeVersion) || null,
    image_digest: cleanString(runtime.image_digest ?? runtime.imageDigest) || null,
  }
  return Object.values(normalized).some((item) => item !== null && item !== undefined) ? normalized : null
}

function normalizeFingerprint(raw: unknown, at = now(), preserveStatus = false): RevRuntimeFingerprint {
  const value = (raw ?? {}) as Record<string, unknown>
  const observed = normalizeRuntimeMetadata(value.observed ?? value.runtime ?? value)
  const requestedStatus = cleanString(value.status).toLowerCase()
  const status =
    preserveStatus && ["unrecorded", "verified", "mismatch", "unavailable", "legacy"].includes(requestedStatus)
      ? (requestedStatus as RevRuntimeFingerprint["status"])
      : requestedStatus === "unavailable"
        ? "unavailable"
        : "unrecorded"
  return {
    status,
    observed,
    source: cleanString(value.source) || null,
    checked_at: cleanString(value.checked_at ?? value.checkedAt, at) || at,
    issues: cleanList(value.issues),
  }
}

function normalizeDoctor(raw: unknown, at = now()): RevRuntimeDoctor | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const status = cleanString(value.status, "unavailable").toLowerCase() as RevRuntimeDoctor["status"]
  const safeStatus = ["pass", "partial", "fail", "unavailable"].includes(status) ? status : "unavailable"
  const checks = Array.isArray(value.checks)
    ? value.checks
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const check = item as Record<string, unknown>
          const checkStatus = cleanString(
            check.status,
            "skipped",
          ).toLowerCase() as RevRuntimeDoctor["checks"][number]["status"]
          const requirement = cleanString(
            check.requirement,
            "optional",
          ).toLowerCase() as RevRuntimeDoctor["checks"][number]["requirement"]
          return {
            id: cleanString(check.id, "unknown-check"),
            requirement: requirement === "required" ? ("required" as const) : ("optional" as const),
            command: cleanString(check.command),
            args: Array.isArray(check.args) ? check.args.map((arg) => cleanString(arg)).filter(Boolean) : [],
            status: ["available", "missing", "error", "skipped"].includes(checkStatus)
              ? checkStatus
              : ("skipped" as const),
            version: cleanString(check.version) || null,
            output_sha256: cleanString(check.output_sha256 ?? check.outputSha256) || null,
            detail: cleanString(check.detail) || null,
          }
        })
    : []
  return {
    status: safeStatus,
    source: cleanString(value.source, "unknown"),
    checked_at: cleanString(value.checked_at ?? value.checkedAt, at),
    checks,
    capabilities: cleanList(value.capabilities),
    issues: cleanList(value.issues),
  }
}

function normalizeEvidenceAnchor(raw: unknown, at = now()): RevRuntimeEvidenceAnchor | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const requested = cleanString(value.status, "legacy").toLowerCase() as RevRuntimeEvidenceAnchorStatus
  const status: RevRuntimeEvidenceAnchorStatus = ["pending", "verified", "missing", "mismatch", "legacy"].includes(
    requested,
  )
    ? requested
    : "legacy"
  const anchorPath = cleanString(value.path)
  if (!anchorPath) return null
  return {
    path: anchorPath,
    status,
    source: cleanString(value.source, "manual"),
    session_sha256: cleanString(value.session_sha256 ?? value.sessionSha256) || null,
    history_head: cleanString(value.history_head ?? value.historyHead) || null,
    created_at: cleanString(value.created_at ?? value.createdAt, at),
  }
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined && value[key] !== null
}

function digestRawObservationField(
  value: Record<string, unknown>,
  explicitKeys: string[],
  rawKey: string,
  digestSources: Set<string>,
) {
  const explicit = explicitKeys.map((key) => cleanString(value[key])).find(Boolean)
  if (explicit) return explicit
  if (!hasOwn(value, rawKey)) return null
  digestSources.add(rawKey)
  return revRuntimeValueSha256(value[rawKey])
}

function normalizeObservation(raw: unknown, at = now()): RevRuntimeObservation {
  const value = (raw ?? {}) as Record<string, unknown>
  const kind = cleanString(value.kind, "manual").toLowerCase() as RevRuntimeObservation["kind"]
  const status = cleanString(value.status, "unknown").toLowerCase() as RevRuntimeObservation["status"]
  if (!OBSERVATION_KINDS.has(kind)) throw new Error(`unsupported observation.kind: ${kind}`)
  if (!OBSERVATION_STATUSES.has(status)) throw new Error(`unsupported observation.status: ${status}`)
  const digestSources = new Set(cleanList(value.digest_sources ?? value.digestSources))
  const observation: RevRuntimeObservation = {
    id: cleanString(value.id, `observation-${randomUUID()}`),
    kind,
    status,
    command: cleanString(value.command) || null,
    input_sha256: digestRawObservationField(value, ["input_sha256", "inputSha256"], "input", digestSources),
    payload_sha256: digestRawObservationField(value, ["payload_sha256", "payloadSha256"], "payload", digestSources),
    stdout_sha256: digestRawObservationField(value, ["stdout_sha256", "stdoutSha256"], "stdout", digestSources),
    stderr_sha256: digestRawObservationField(value, ["stderr_sha256", "stderrSha256"], "stderr", digestSources),
    registers_sha256: digestRawObservationField(
      value,
      ["registers_sha256", "registersSha256"],
      "registers",
      digestSources,
    ),
    memory_sha256: digestRawObservationField(value, ["memory_sha256", "memorySha256"], "memory", digestSources),
    trace_sha256: digestRawObservationField(value, ["trace_sha256", "traceSha256"], "trace", digestSources),
    exit_code: typeof value.exit_code === "number" && Number.isInteger(value.exit_code) ? value.exit_code : null,
    marker: cleanString(value.marker) || null,
    stop_pc: cleanString(value.stop_pc ?? value.stopPc) || null,
    artifact_refs: cleanList(value.artifact_refs ?? value.artifactRefs),
    artifact_generations: cleanIntegerMap(value.artifact_generations ?? value.artifactGenerations),
    artifact_sha256s: cleanStringMap(value.artifact_sha256s ?? value.artifactSha256s),
    related_observation_ids: cleanList(value.related_observation_ids ?? value.relatedObservationIds),
    evidence: cleanString(value.evidence) || null,
    at: cleanString(value.at, at),
  }
  if (digestSources.size > 0) observation.digest_sources = [...digestSources].sort()
  const runtime = normalizeRuntimeMetadata(value.runtime)
  if (runtime) observation.runtime = runtime
  return observation
}
function allowedStageTransition(from: RevRuntimeStage, to: RevRuntimeStage, promotionAllowed: boolean) {
  if (from === to) return true
  if (to === "blocked") return true
  if (from === "blocked") return to === "planned" || to === "prepared"
  if (promotionAllowed && (to === "oracle_verified" || to === "closed")) return true
  const transitions: Record<RevRuntimeStage, RevRuntimeStage[]> = {
    planned: ["prepared"],
    prepared: ["running"],
    running: ["captured"],
    captured: ["replayed"],
    replayed: ["oracle_verified"],
    oracle_verified: ["closed"],
    closed: [],
    blocked: ["planned", "prepared"],
  }
  return transitions[from].includes(to)
}
export function normalizeRuntimeSession(raw: unknown, workspace = process.cwd()): RevRuntimeSession {
  const value = (raw ?? {}) as Record<string, unknown>
  const nowValue = now()
  const substrateValue = (value.substrate ?? {}) as Record<string, unknown>
  const oracleValue = (value.oracle ?? {}) as Record<string, unknown>
  const session: RevRuntimeSession = {
    schema_version: "rev_runtime_session.v1",
    session_id: cleanString(value.session_id, randomUUID()),
    target: cleanString(value.target, "unknown target"),
    family: safeFamily(value.family),
    stage: safeStage(value.stage),
    observation_contract: safeObservationContract(value.observation_contract ?? value.observationContract),
    substrate: {
      kind: safeSubstrate(substrateValue.kind),
      arch: cleanString(substrateValue.arch) || null,
      mode: cleanString(substrateValue.mode) || null,
      fingerprint: cleanString(substrateValue.fingerprint) || null,
      tool: cleanString(substrateValue.tool) || null,
      version: cleanString(substrateValue.version) || null,
      image_digest: cleanString(substrateValue.image_digest ?? substrateValue.imageDigest) || null,
    },
    artifacts: Array.isArray(value.artifacts) ? value.artifacts.map((item) => normalizeArtifact(item, workspace)) : [],
    markers: Array.isArray(value.markers) ? value.markers.map((item) => normalizeMarker(item, nowValue)) : [],
    observations: Array.isArray(value.observations)
      ? value.observations.map((item) => normalizeObservation(item, nowValue))
      : [],
    oracle: {
      status: safeOracleStatus(oracleValue.status),
      command: cleanString(oracleValue.command) || null,
      evidence: cleanString(oracleValue.evidence) || null,
      at: cleanString(oracleValue.at) || null,
      observation_ids: cleanList(oracleValue.observation_ids ?? oracleValue.observationIds),
    },
    evidence_refs: cleanList(value.evidence_refs),
    next_action: cleanList(value.next_action),
    blocking: cleanList(value.blocking),
    promotion: { allowed: false, reason: "" },
    decision_state_path: cleanString(value.decision_state_path) || null,
    evidence_board_path: cleanString(value.evidence_board_path) || null,
    runtime_fingerprint:
      value.runtime_fingerprint && typeof value.runtime_fingerprint === "object"
        ? normalizeFingerprint(value.runtime_fingerprint, nowValue, true)
        : null,
    runtime_doctor:
      value.runtime_doctor && typeof value.runtime_doctor === "object"
        ? normalizeDoctor(value.runtime_doctor, nowValue)
        : null,
    evidence_anchor:
      value.evidence_anchor && typeof value.evidence_anchor === "object"
        ? normalizeEvidenceAnchor(value.evidence_anchor, nowValue)
        : null,
    history: Array.isArray(value.history)
      ? value.history.filter((item): item is RevRuntimeSession["history"][number] =>
          Boolean(item && typeof item === "object"),
        )
      : [],
    created_at: cleanString(value.created_at, nowValue),
    updated_at: cleanString(value.updated_at, nowValue),
  }
  session.promotion = revRuntimePromotion(session)
  return session
}

export async function readRuntimeSession(file: string, workspace: string) {
  const raw = await loadJsonFile<unknown>(file, null)
  if (!raw) throw new Error(`runtime session not found: ${normalizedRelative(workspace, file)}`)
  const session = normalizeRuntimeSession(raw, workspace)
  const verification = await checkRuntimeEvidenceAnchor(session, file, workspace)
  if (session.evidence_anchor) session.evidence_anchor.status = verification.status
  session.promotion = revRuntimePromotion(session)
  return session
}

function appendEvent(session: RevRuntimeSession, operation: string, summary: string, data?: Record<string, unknown>) {
  if (session.evidence_anchor) session.evidence_anchor.status = "pending"
  const event = {
    id: randomUUID(),
    at: now(),
    operation,
    summary,
    previous_hash: session.history.at(-1)?.event_hash ?? null,
    ...(data ? { data } : {}),
  }
  session.history.push({ ...event, event_hash: revRuntimeEventHash(event) })
}

function refresh(session: RevRuntimeSession) {
  session.updated_at = now()
  session.promotion = revRuntimePromotion(session)
}

export async function recordRuntimeDoctor(file: string, workspace: string, doctorInput: Record<string, unknown>) {
  const doctor = normalizeDoctor(doctorInput) ?? {
    status: "unavailable" as const,
    source: "manual",
    checked_at: now(),
    checks: [],
    capabilities: [],
    issues: ["runtime doctor input was invalid"],
  }
  const updated = await atomicUpdateJsonFile<unknown>(file, null, async (raw) => {
    if (!raw) throw new Error(`runtime session not found: ${normalizedRelative(workspace, file)}`)
    const session = normalizeRuntimeSession(raw, workspace)
    session.runtime_doctor = doctor
    appendEvent(
      session,
      "record_runtime_doctor",
      `runtime doctor recorded: ${doctor.status}`,
      doctor as unknown as Record<string, unknown>,
    )
    refresh(session)
    return session
  })
  return normalizeRuntimeSession(updated, workspace)
}

function defaultEvidenceAnchorPath(file: string, workspace: string) {
  return `${normalizedRelative(workspace, file)}.anchor.json`
}

async function checkRuntimeEvidenceAnchor(session: RevRuntimeSession, file: string, workspace: string) {
  const anchor = session.evidence_anchor
  if (!anchor) return { status: "legacy" as const, issues: ["external evidence anchor is not configured"] }
  const anchorFile = resolveInsideWorkspace(workspace, anchor.path)
  const sidecar = await loadJsonFile<Record<string, unknown> | null>(anchorFile, null)
  if (!sidecar) return { status: "missing" as const, issues: [`external evidence anchor is missing: ${anchor.path}`] }
  const issues: string[] = []
  const digest = revRuntimeSessionDigest(session)
  const historyHead = session.history.at(-1)?.event_hash ?? null
  if (cleanString(sidecar.session_sha256 ?? sidecar.sessionSha256) !== digest)
    issues.push("anchored session digest differs from current session")
  if ((cleanString(sidecar.history_head ?? sidecar.historyHead) || null) !== historyHead)
    issues.push("anchored history head differs from current session")
  if (
    cleanString(sidecar.session_id ?? sidecar.sessionId) &&
    cleanString(sidecar.session_id ?? sidecar.sessionId) !== session.session_id
  )
    issues.push("anchor session_id differs from current session")
  return issues.length > 0 ? { status: "mismatch" as const, issues } : { status: "verified" as const, issues: [] }
}

export async function verifyRuntimeEvidenceAnchor(file: string, workspace: string) {
  const session = await readRuntimeSession(file, workspace)
  const verification = await checkRuntimeEvidenceAnchor(session, file, workspace)
  if (session.evidence_anchor) session.evidence_anchor.status = verification.status
  session.promotion = revRuntimePromotion(session)
  return { session, verification }
}

export async function anchorRuntimeEvidence(file: string, workspace: string, input: Record<string, unknown> = {}) {
  const requestedPath = cleanString(input.path) || defaultEvidenceAnchorPath(file, workspace)
  const anchorFile = resolveInsideWorkspace(workspace, requestedPath)
  if (path.resolve(anchorFile) === path.resolve(file)) {
    throw new Error("external evidence anchor path must differ from the runtime session path")
  }
  const anchorPath = normalizedRelative(workspace, anchorFile)
  const source = cleanString(input.source, "ctf-rev-runtime-session")
  const stagingFile = `${anchorFile}.tmp-${randomUUID()}`
  let sidecar: Record<string, unknown> | null = null
  try {
    const updated = await atomicUpdateJsonFile<unknown>(file, null, async (raw) => {
      if (!raw) throw new Error(`runtime session not found: ${normalizedRelative(workspace, file)}`)
      const session = normalizeRuntimeSession(raw, workspace)
      appendEvent(session, "anchor_evidence", `external evidence anchor created: ${anchorPath}`, {
        path: anchorPath,
        source,
      })
      refresh(session)
      const createdAt = now()
      const digest = revRuntimeSessionDigest(session)
      const historyHead = session.history.at(-1)?.event_hash ?? null
      sidecar = {
        schema_version: "rev_runtime_anchor.v1",
        session_id: session.session_id,
        session_path: normalizedRelative(workspace, file),
        session_sha256: digest,
        history_head: historyHead,
        source,
        created_at: createdAt,
      }
      await saveJsonFile(stagingFile, sidecar)
      session.evidence_anchor = {
        path: anchorPath,
        status: "verified",
        source,
        session_sha256: digest,
        history_head: historyHead,
        created_at: createdAt,
      }
      return session
    })
    if (!sidecar) throw new Error("external evidence anchor metadata was not prepared")
    await saveJsonFile(anchorFile, sidecar)
    const session = normalizeRuntimeSession(updated, workspace)
    const checked = await verifyRuntimeEvidenceAnchor(file, workspace)
    return { session, verification: checked.verification }
  } finally {
    await rm(stagingFile, { force: true }).catch(() => undefined)
  }
}

export async function verifyRuntimeSessionHistory(file: string, workspace: string) {
  const session = await readRuntimeSession(file, workspace)
  return { session, verification: revRuntimeHistoryVerification(session.history) }
}

export async function recordRuntimeFingerprint(
  file: string,
  workspace: string,
  fingerprintInput: Record<string, unknown>,
) {
  const requested = normalizeFingerprint(fingerprintInput)
  const updated = await atomicUpdateJsonFile<unknown>(file, null, async (raw) => {
    if (!raw) throw new Error(`runtime session not found: ${normalizedRelative(workspace, file)}`)
    const session = normalizeRuntimeSession(raw, workspace)
    const candidate = { ...session, runtime_fingerprint: requested }
    const verification = revRuntimeFingerprintVerification(candidate)
    const fingerprint: RevRuntimeFingerprint = {
      ...requested,
      status: requested.status === "unavailable" ? "unavailable" : verification.status,
      issues: verification.issues,
    }
    session.runtime_fingerprint = fingerprint
    appendEvent(
      session,
      "record_runtime_fingerprint",
      `runtime fingerprint recorded: ${fingerprint.status}`,
      fingerprint as unknown as Record<string, unknown>,
    )
    refresh(session)
    return session
  })
  return normalizeRuntimeSession(updated, workspace)
}

export async function verifyRuntimeFingerprint(
  file: string,
  workspace: string,
  fingerprintInput?: Record<string, unknown>,
) {
  const session = await readRuntimeSession(file, workspace)
  const candidate = fingerprintInput
    ? { ...session, runtime_fingerprint: normalizeFingerprint(fingerprintInput) }
    : session
  return { session, verification: revRuntimeFingerprintVerification(candidate) }
}

export async function inspectRuntimeProvenance(file: string, workspace: string) {
  const session = await readRuntimeSession(file, workspace)
  return { session, issues: revRuntimeArtifactProvenanceIssues(session) }
}

export async function initRuntimeSession(
  file: string,
  input: {
    target: string
    family?: string
    observationContract?: string
    substrate?: string
    arch?: string
    mode?: string
    fingerprint?: string
    tool?: string
    version?: string
    imageDigest?: string
    nextAction?: string[]
    blocking?: string[]
    decisionStatePath?: string | null
    evidenceBoardPath?: string | null
  },
  workspace: string,
) {
  const existing = await loadJsonFile<unknown>(file, null)
  if (existing) return { session: normalizeRuntimeSession(existing, workspace), created: false }
  const createdAt = now()
  const session: RevRuntimeSession = {
    schema_version: "rev_runtime_session.v1",
    session_id: randomUUID(),
    target: input.target,
    family: safeFamily(input.family),
    stage: "planned",
    observation_contract: requireObservationContract(input.observationContract ?? "legacy"),
    substrate: {
      kind: safeSubstrate(input.substrate),
      arch: cleanString(input.arch) || null,
      mode: cleanString(input.mode) || null,
      fingerprint: cleanString(input.fingerprint) || null,
      tool: cleanString(input.tool) || null,
      version: cleanString(input.version) || null,
      image_digest: cleanString(input.imageDigest) || null,
    },
    artifacts: [],
    markers: [],
    observations: [],
    oracle: { status: "unknown", command: null, evidence: null, at: null, observation_ids: [] },
    evidence_refs: [],
    next_action: cleanList(input.nextAction),
    blocking: cleanList(input.blocking),
    promotion: { allowed: false, reason: "no independent passing oracle recorded" },
    decision_state_path: input.decisionStatePath ?? null,
    evidence_board_path: input.evidenceBoardPath ?? null,
    runtime_fingerprint: null,
    history: [],
    created_at: createdAt,
    updated_at: createdAt,
  }
  appendEvent(session, "init", "runtime session created", { target: input.target, family: session.family })
  await saveJsonFile(file, session)
  return { session, created: true }
}

export async function updateRuntimeSession(
  file: string,
  workspace: string,
  operation: string,
  patch: Record<string, unknown> = {},
) {
  const result = await atomicUpdateJsonFile<unknown>(file, null, async (raw) => {
    if (!raw) throw new Error(`runtime session not found: ${normalizedRelative(workspace, file)}`)
    const session = normalizeRuntimeSession(raw, workspace)
    const anchorVerification = await checkRuntimeEvidenceAnchor(session, file, workspace)
    if (session.evidence_anchor) session.evidence_anchor.status = anchorVerification.status
    const beforeStage = session.stage
    if (patch.family !== undefined) session.family = safeFamily(patch.family)
    if (patch.observation_contract !== undefined || patch.observationContract !== undefined) {
      session.observation_contract = requireObservationContract(patch.observation_contract ?? patch.observationContract)
    }
    if (patch.substrate && typeof patch.substrate === "object") {
      const substrate = patch.substrate as Record<string, unknown>
      session.substrate = {
        kind: safeSubstrate(substrate.kind ?? session.substrate.kind),
        arch: cleanString(substrate.arch ?? session.substrate.arch) || null,
        mode: cleanString(substrate.mode ?? session.substrate.mode) || null,
        fingerprint: cleanString(substrate.fingerprint ?? session.substrate.fingerprint) || null,
        tool: cleanString(substrate.tool ?? session.substrate.tool) || null,
        version: cleanString(substrate.version ?? session.substrate.version) || null,
        image_digest:
          cleanString(substrate.image_digest ?? substrate.imageDigest ?? session.substrate.image_digest) || null,
      }
    }
    if (patch.next_action !== undefined || patch.nextAction !== undefined) {
      session.next_action = cleanList(patch.next_action ?? patch.nextAction)
    }
    if (patch.blocking !== undefined) session.blocking = cleanList(patch.blocking)
    if (patch.oracle && typeof patch.oracle === "object") {
      const oracle = patch.oracle as Record<string, unknown>
      const observationIdsValue = oracle.observation_ids ?? oracle.observationIds
      if (
        observationIdsValue !== undefined &&
        (!Array.isArray(observationIdsValue) || observationIdsValue.some((item) => typeof item !== "string"))
      ) {
        throw new Error("oracle.observation_ids must be an array of strings")
      }
      session.oracle = {
        status: oracle.status === undefined ? session.oracle.status : requireOracleStatus(oracle.status),
        command: cleanString(oracle.command ?? session.oracle.command) || null,
        evidence: cleanString(oracle.evidence ?? session.oracle.evidence) || null,
        at: cleanString(oracle.at, now()) || now(),
        observation_ids:
          observationIdsValue === undefined ? session.oracle.observation_ids : cleanList(observationIdsValue),
      }
      const observationIssues = revRuntimeOracleObservationIssues(session)
      if (observationIssues.length > 0) {
        throw new Error(`runtime oracle observation contract failed: ${observationIssues.join("; ")}`)
      }
    }
    if (patch.stage !== undefined) {
      const nextStage = requireStage(patch.stage)
      const candidate = { ...session, stage: nextStage }
      const promotion = revRuntimePromotion(candidate)
      if (nextStage === "oracle_verified" || nextStage === "closed") {
        if (!promotion.allowed) throw new Error(promotion.reason)
      }
      if (!allowedStageTransition(session.stage, nextStage, promotion.allowed)) {
        throw new Error(`invalid runtime stage transition: ${session.stage} -> ${nextStage}`)
      }
      session.stage = nextStage
    }
    if (patch.evidence_refs !== undefined || patch.evidenceRefs !== undefined) {
      session.evidence_refs = cleanList([
        ...(session.evidence_refs || []),
        ...(Array.isArray(patch.evidence_refs ?? patch.evidenceRefs)
          ? ((patch.evidence_refs ?? patch.evidenceRefs) as unknown[])
          : []),
      ])
    }
    if (patch.decision_state_path !== undefined)
      session.decision_state_path = cleanString(patch.decision_state_path) || null
    if (patch.evidence_board_path !== undefined)
      session.evidence_board_path = cleanString(patch.evidence_board_path) || null
    refresh(session)
    appendEvent(session, operation, cleanString(patch.summary, `session updated: ${operation}`), patch)
    if (beforeStage !== session.stage) appendEvent(session, "stage_transition", `${beforeStage} -> ${session.stage}`)
    return session
  })
  return normalizeRuntimeSession(result, workspace)
}

export async function recordRuntimeArtifact(file: string, workspace: string, artifactInput: Record<string, unknown>) {
  const requested = normalizeArtifact(artifactInput, workspace)
  const updated = await atomicUpdateJsonFile<unknown>(file, null, async (raw) => {
    if (!raw) throw new Error(`runtime session not found: ${normalizedRelative(workspace, file)}`)
    const session = normalizeRuntimeSession(raw, workspace)
    const previous = session.artifacts.find((item) => item.path === requested.path)
    const explicitGeneration =
      typeof artifactInput.generation === "number" &&
      Number.isInteger(artifactInput.generation) &&
      artifactInput.generation > 0
    const generation = explicitGeneration
      ? (artifactInput.generation as number)
      : previous && previous.id === requested.id
        ? (previous.generation ?? 1)
        : previous
          ? (previous.generation ?? 1) + 1
          : (requested.generation ?? 1)
    const artifact: RevRuntimeArtifact = {
      ...requested,
      generation,
      ...(previous && previous.id !== requested.id ? { replaces_artifact_id: previous.id } : {}),
    }
    session.artifacts = [
      ...session.artifacts.filter((item) => item.id !== artifact.id && item.path !== artifact.path),
      artifact,
    ]
    appendEvent(
      session,
      "record_artifact",
      `artifact recorded: ${artifact.path}${artifact.replaces_artifact_id ? ` (replaces ${artifact.replaces_artifact_id})` : ""}`,
      artifact as unknown as Record<string, unknown>,
    )
    refresh(session)
    return session
  })
  return normalizeRuntimeSession(updated, workspace)
}
export async function recordRuntimeMarker(file: string, workspace: string, markerInput: Record<string, unknown>) {
  const marker = normalizeMarker(markerInput)
  const updated = await atomicUpdateJsonFile<unknown>(file, null, async (raw) => {
    if (!raw) throw new Error(`runtime session not found: ${normalizedRelative(workspace, file)}`)
    const session = normalizeRuntimeSession(raw, workspace)
    session.markers = [...session.markers.filter((item) => item.id !== marker.id && item.name !== marker.name), marker]
    appendEvent(
      session,
      "record_marker",
      `marker recorded: ${marker.name}`,
      marker as unknown as Record<string, unknown>,
    )
    refresh(session)
    return session
  })
  return normalizeRuntimeSession(updated, workspace)
}

export async function recordRuntimeObservation(
  file: string,
  workspace: string,
  observationInput: Record<string, unknown>,
) {
  const observation = normalizeObservation(observationInput)
  const updated = await atomicUpdateJsonFile<unknown>(file, null, async (raw) => {
    if (!raw) throw new Error(`runtime session not found: ${normalizedRelative(workspace, file)}`)
    const session = normalizeRuntimeSession(raw, workspace)
    session.observations = [...session.observations.filter((item) => item.id !== observation.id), observation]
    appendEvent(
      session,
      "record_observation",
      `observation recorded: ${observation.kind}/${observation.status}`,
      observation as unknown as Record<string, unknown>,
    )
    refresh(session)
    return session
  })
  return normalizeRuntimeSession(updated, workspace)
}

export async function inspectRuntimeArtifacts(file: string, workspace: string) {
  const updated = await atomicUpdateJsonFile<unknown>(file, null, async (raw) => {
    if (!raw) throw new Error(`runtime session not found: ${normalizedRelative(workspace, file)}`)
    const session = normalizeRuntimeSession(raw, workspace)
    const changes: Record<string, unknown>[] = []
    const artifacts: RevRuntimeArtifact[] = []
    for (const artifact of session.artifacts) {
      const absolute = resolveInsideWorkspace(workspace, artifact.path)
      try {
        const bytes = await readFile(absolute)
        const sha256 = createHash("sha256").update(bytes).digest("hex")
        const contentChanged = Boolean(artifact.sha256 && artifact.sha256 !== sha256)
        const nextStatus: RevRuntimeArtifact["status"] =
          artifact.status === "stale"
            ? "stale"
            : contentChanged
              ? "stale"
              : artifact.status === "verified" && artifact.sha256 === sha256
                ? "verified"
                : "available"
        const nextGeneration = contentChanged ? (artifact.generation ?? 1) + 1 : (artifact.generation ?? 1)
        const next = { ...artifact, generation: nextGeneration, size: bytes.byteLength, sha256, status: nextStatus }
        artifacts.push(next)
        if (artifact.status !== next.status || artifact.sha256 !== sha256 || artifact.size !== bytes.byteLength) {
          changes.push({
            path: artifact.path,
            status: next.status,
            generation: nextGeneration,
            size: bytes.byteLength,
            sha256,
          })
        }
      } catch {
        const next = { ...artifact, status: "missing" as const }
        artifacts.push(next)
        if (artifact.status !== "missing") changes.push({ path: artifact.path, status: "missing" })
      }
    }
    session.artifacts = artifacts
    appendEvent(session, "inspect_artifacts", `runtime artifacts inspected: ${changes.length} change(s)`, { changes })
    refresh(session)
    return session
  })
  return normalizeRuntimeSession(updated, workspace)
}
export function resolveRuntimeSessionFile(workspace: string, input?: string, target?: string) {
  return input ? resolveInsideWorkspace(workspace, input) : defaultRuntimeSessionPath(workspace, target)
}

export async function artifactExists(artifactPath: string) {
  try {
    const st = await lstat(artifactPath)
    return st.isFile()
  } catch {
    return false
  }
}
