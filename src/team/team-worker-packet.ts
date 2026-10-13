import type { TeamWorkerPacket } from "./team-types.ts"
const PACKET_PROTOCOL = "ctf.team.worker.v1"

const MAX_PACKET_CHARS = 12_000
const PACKET_HEAD_CHARS = 6_000
const PACKET_TAIL_CHARS = 6_000
const MAX_PACKET_COUNT = 64
const MAX_STATEMENT_CHARS = 2_000
const MAX_EVIDENCE_ITEMS = 16
const MAX_EVIDENCE_VALUE_CHARS = 2_000
const MAX_ARTIFACTS = 32

const FACT_KINDS: Record<string, true> = {
  observation: true,
  measurement: true,
  artifact: true,
  error: true,
  negative: true,
  candidate: true,
}

const CONFIDENCE: Record<string, true> = {
  observed: true,
  probable: true,
  speculative: true,
}

const ROUTES: Record<string, true> = {
  recon: true,
  R1: true,
  R2: true,
  R3: true,
  general: true,
}

const PACKET_TYPES: Record<string, true> = {
  fact: true,
  intent_result: true,
}

const RESULT_STATUSES: Record<string, true> = {
  completed: true,
  blocked: true,
  failed: true,
}

const EVIDENCE_TYPES: Record<string, true> = {
  command: true,
  file: true,
  response: true,
  hash: true,
  trace: true,
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
}

function parsePacket(value: unknown): TeamWorkerPacket | undefined {
  if (!isPlainObject(value) || value.protocol !== PACKET_PROTOCOL || typeof value.type !== "string") return undefined
  if (!PACKET_TYPES[value.type]) return undefined
  if (value.intentId !== undefined && !boundedString(value.intentId, 256)) return undefined
  if (value.routeId !== undefined && (typeof value.routeId !== "string" || !ROUTES[value.routeId])) return undefined

  if (value.type === "fact") {
    if (!boundedString(value.statement, MAX_STATEMENT_CHARS)) return undefined
    if (typeof value.kind !== "string" || !FACT_KINDS[value.kind]) return undefined
    // A worker may not mint a confirmed fact (design §12): coerce rather than
    // discard, so the observation and its evidence still reach the Expert.
    const confidence = value.confidence === "confirmed" ? "observed" : value.confidence
    if (typeof confidence !== "string" || !CONFIDENCE[confidence]) return undefined
    // §4.1 allows an error fact with no evidence when the error itself is the
    // structured diagnostic; every other kind must cite evidence.
    const evidenceRequired = value.kind !== "error"
    if (!Array.isArray(value.evidence) || value.evidence.length > MAX_EVIDENCE_ITEMS) return undefined
    if (evidenceRequired && value.evidence.length === 0) return undefined
    if (
      value.evidence.some(
        (item) =>
          !isPlainObject(item) ||
          typeof item.type !== "string" ||
          !EVIDENCE_TYPES[item.type] ||
          !boundedString(item.value, MAX_EVIDENCE_VALUE_CHARS),
      )
    ) {
      return undefined
    }
    return {
      protocol: PACKET_PROTOCOL,
      type: "fact",
      intentId: value.intentId as string | undefined,
      routeId: value.routeId as TeamWorkerPacket["routeId"],
      statement: value.statement,
      kind: value.kind as TeamWorkerPacket["kind"],
      evidence: value.evidence as TeamWorkerPacket["evidence"],
      confidence: confidence as TeamWorkerPacket["confidence"],
    }
  }

  if (typeof value.status !== "string" || !RESULT_STATUSES[value.status]) return undefined
  if (value.summary !== undefined && !boundedString(value.summary, MAX_STATEMENT_CHARS)) return undefined
  if (value.factIds !== undefined && (!Array.isArray(value.factIds) || value.factIds.some((id) => !boundedString(id, 256)))) {
    return undefined
  }
  if (value.artifacts !== undefined && (!Array.isArray(value.artifacts) || value.artifacts.length > MAX_ARTIFACTS)) {
    return undefined
  }
  if (Array.isArray(value.artifacts) && value.artifacts.some((item) => !boundedString(item, 1_000))) return undefined
  return {
    protocol: PACKET_PROTOCOL,
    type: "intent_result",
    intentId: value.intentId as string | undefined,
    routeId: value.routeId as TeamWorkerPacket["routeId"],
    status: value.status as TeamWorkerPacket["status"],
    summary: value.summary as string | undefined,
    factIds: value.factIds as string[] | undefined,
    artifacts: value.artifacts as string[] | undefined,
  }
}

/** Extract valid worker packets from fenced JSON without trusting arbitrary prose. */
export function parseWorkerPackets(text: string): TeamWorkerPacket[] {
  if (typeof text !== "string" || text.length === 0) return []
  const source = text.length <= MAX_PACKET_CHARS
    ? text
    : `${text.slice(0, PACKET_HEAD_CHARS)}\n${text.slice(-PACKET_TAIL_CHARS)}`
  const packets: TeamWorkerPacket[] = []
  const blockPattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi
  for (const match of source.matchAll(blockPattern)) {
    if (packets.length >= MAX_PACKET_COUNT) break
    try {
      const packet = parsePacket(JSON.parse(match[1]))
      if (packet) packets.push(packet)
    } catch {
      // Worker prose is best-effort; malformed packets must not fail collection.
    }
  }
  return packets
}
