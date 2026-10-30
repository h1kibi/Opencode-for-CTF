import { MAX_JOB_RESULT } from "./team-types.ts"
import type { ProbeObservationKind, ProbeResult, TeamEvidenceRef } from "./team-types.ts"

const PACKET_PROTOCOL = "ctf.team.probe.v1"
const MAX_PACKET_CHARS = 12_000
const MAX_OBSERVATIONS = 64
const MAX_STATEMENT_CHARS = 2_000
const MAX_EVIDENCE_ITEMS = 16
const MAX_EVIDENCE_VALUE_CHARS = 2_000
const MAX_ARTIFACTS = 32

const OBSERVATION_KINDS: Record<string, true> = {
  observation: true,
  measurement: true,
  artifact: true,
  error: true,
  negative: true,
  candidate: true,
}

const RESULT_STATUSES: Record<string, true> = { completed: true, blocked: true, failed: true }
const EVIDENCE_TYPES: Record<string, true> = { command: true, file: true, response: true, hash: true, trace: true }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
}

function parseObservation(value: unknown) {
  if (!isPlainObject(value) || typeof value.kind !== "string" || !OBSERVATION_KINDS[value.kind]) return undefined
  if (!boundedString(value.statement, MAX_STATEMENT_CHARS)) return undefined
  if (!Array.isArray(value.evidence) || value.evidence.length > MAX_EVIDENCE_ITEMS) return undefined
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
    kind: value.kind as ProbeObservationKind,
    statement: value.statement,
    evidence: value.evidence as TeamEvidenceRef[],
  }
}

function parsePacket(value: unknown): ProbeResult | undefined {
  if (
    !isPlainObject(value) ||
    value.protocol !== PACKET_PROTOCOL ||
    value.type !== "probe_result" ||
    typeof value.status !== "string" ||
    !RESULT_STATUSES[value.status] ||
    !boundedString(value.summary, MAX_STATEMENT_CHARS)
  ) {
    return undefined
  }
  if (!Array.isArray(value.observations) || value.observations.length > MAX_OBSERVATIONS) return undefined
  const observations = value.observations.map(parseObservation)
  if (observations.some((item) => item === undefined)) return undefined
  if (
    !Array.isArray(value.artifacts) ||
    value.artifacts.length > MAX_ARTIFACTS ||
    value.artifacts.some((item) => !boundedString(item, 1_000))
  ) {
    return undefined
  }
  if (value.next !== undefined && !boundedString(value.next, MAX_STATEMENT_CHARS)) return undefined
  return {
    protocol: PACKET_PROTOCOL,
    type: "probe_result",
    status: value.status as ProbeResult["status"],
    summary: value.summary,
    observations: observations as NonNullable<(typeof observations)[number]>[],
    artifacts: value.artifacts as string[],
    ...(value.next === undefined ? {} : { next: value.next as string }),
  }
}

/** Parse the newest worker result; collection must reject malformed output. */
export function parseProbeResult(text: string): ProbeResult {
  if (typeof text !== "string" || text.length === 0) throw new Error("Worker output is empty.")
  const source = text.length <= MAX_PACKET_CHARS ? text : text.slice(-MAX_PACKET_CHARS)
  const blockPattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi
  let latest: ProbeResult | undefined
  let count = 0
  let sawBlock = false
  for (const match of source.matchAll(blockPattern)) {
    sawBlock = true
    if (count++ >= 32) break
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1])
    } catch (error) {
      throw new Error(`Malformed worker packet JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    const packet = parsePacket(parsed)
    if (!packet) throw new Error("Worker packet failed protocol validation.")
    latest = packet
  }
  if (!sawBlock || !latest) throw new Error("Worker output contained no valid result packet.")
  return latest
}
export type WorkerMessage = {
  info: { role: string; error?: unknown; id?: string; messageID?: string }
  parts: Array<{ type: string; text?: string }>
}

export type CollectedWorkerResult = {
  result: string
  error?: unknown
  serializationError?: unknown
  packet?: ProbeResult
  lastMessageID?: string
}

export function workerMessageCursor(message: WorkerMessage): string {
  const stable = message.info.id ?? message.info.messageID
  if (stable) return stable
  const text = message.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
  let hash = 2166136261
  for (const char of text.slice(0, 4_000)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `digest-${(hash >>> 0).toString(16)}`
}

export function collectWorkerResult(messages: WorkerMessage[], afterCursor?: string): CollectedWorkerResult {
  const assistants = messages.filter((message) => message.info.role === "assistant" && !message.info.error)
  const cursorIndex = afterCursor ? assistants.findIndex((message) => workerMessageCursor(message) === afterCursor) : -1
  const newAssistants = cursorIndex >= 0 ? assistants.slice(cursorIndex + 1) : assistants
  const assistant = assistants.at(-1)
  if (!assistant) {
    const failed = [...messages].reverse().find((message) => message.info.role === "assistant" && message.info.error)
    return {
      result: "",
      error: failed?.info.error ?? "Worker reached idle without an assistant result.",
    }
  }
  const text = assistant.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim()
  const packetText = newAssistants
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
  const lastMessage = [...newAssistants]
    .reverse()
    .find((message) => message.info.id || message.info.messageID || message.parts.length > 0)
  const lastMessageID = lastMessage ? workerMessageCursor(lastMessage) : undefined
  try {
    return {
      result: (text || "Worker completed without a textual result.").slice(0, MAX_JOB_RESULT),
      packet: parseProbeResult(packetText || text),
      lastMessageID,
    }
  } catch (error) {
    return {
      result: (text || "Worker completed without a textual result.").slice(0, MAX_JOB_RESULT),
      serializationError: error,
      lastMessageID,
    }
  }
}
