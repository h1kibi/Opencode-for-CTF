import { access } from "node:fs/promises"
import path from "node:path"
import { tool } from "@opencode-ai/plugin"
import decisionState from "../core/ctf-decision-state.ts"
import evidenceBoard from "../core/ctf-evidence-board.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import {
  initRuntimeSession,
  readRuntimeSession,
  verifyRuntimeSessionHistory,
  recordRuntimeArtifact,
  recordRuntimeMarker,
  recordRuntimeObservation,
  inspectRuntimeArtifacts,
  inspectRuntimeProvenance,
  recordRuntimeFingerprint,
  resolveRuntimeSessionFile,
  verifyRuntimeFingerprint,
  updateRuntimeSession,
  anchorRuntimeEvidence,
  verifyRuntimeEvidenceAnchor,
} from "../lib/rev-runtime-session-store.ts"

function rel(from: string, file: string) {
  return path.relative(from, file).replace(/\\/g, "/")
}

function jsonObject(name: string, value?: string) {
  if (!value?.trim()) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${name} must be a JSON object`)
  return parsed as Record<string, unknown>
}

async function exists(file: string) {
  return access(file)
    .then(() => true)
    .catch(() => false)
}

export default tool({
  description:
    "CTF rev runtime session: create and update one append-only rev_runtime_session.v1 state across live dumps, Unicorn replay, closure evidence, decision state, and evidence board projections. This tool never executes the target.",
  args: {
    command: tool.schema
      .string()
      .describe(
        "init | read | update | record-artifact | record-marker | record-observation | inspect-artifacts | verify-history | anchor-evidence | verify-evidence-anchor | set-oracle | set-stage | link-evidence | sync",
      ),
    sessionPath: tool.schema
      .string()
      .optional()
      .describe(
        "Workspace-relative session JSON path. Defaults to work/rev-runtime/<target-hash>.json when target is supplied.",
      ),
    target: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative target path; required for init unless sessionPath already exists."),
    family: tool.schema
      .string()
      .optional()
      .describe("elf | pe | mach-o | dex | apk | wasm | jvm | python-bytecode | unicorn | unknown"),
    substrate: tool.schema.string().optional().describe("local | docker | wsl | adb | unicorn | qiling | unknown"),
    observationContract: tool.schema
      .string()
      .optional()
      .describe("legacy | linked | strict; init defaults to legacy for backward compatibility"),
    arch: tool.schema.string().optional(),
    mode: tool.schema.string().optional(),
    substrateFingerprint: tool.schema
      .string()
      .optional()
      .describe("Stable runtime/environment fingerprint for the selected substrate."),
    runtimeTool: tool.schema.string().optional().describe("Runtime/emulator tool name, e.g. unicorn or qiling."),
    runtimeVersion: tool.schema.string().optional().describe("Runtime/emulator version."),
    imageDigest: tool.schema
      .string()
      .optional()
      .describe("Container/image digest when the substrate is containerized."),
    runtimeFingerprintJson: tool.schema
      .string()
      .optional()
      .describe("JSON runtime metadata imported from an external doctor/runner; never executes the target."),
    stage: tool.schema
      .string()
      .optional()
      .describe("planned | prepared | running | captured | replayed | oracle_verified | closed | blocked"),
    patchJson: tool.schema
      .string()
      .optional()
      .describe(
        "JSON object for update; supports stage, family, substrate, next_action, blocking, oracle, and evidence_refs.",
      ),
    artifactJson: tool.schema
      .string()
      .optional()
      .describe(
        'JSON artifact, e.g. {"path":"work/rev-live-dump/payload.dump.bin","kind":"payload-dump","source":"ctf-rev-live-memory-dump"}.',
      ),
    markerJson: tool.schema
      .string()
      .optional()
      .describe('JSON marker, e.g. {"name":"post-unpack","reached":true,"evidence":"stdout marker observed"}.'),
    observationJson: tool.schema
      .string()
      .optional()
      .describe(
        'JSON runtime observation, e.g. {"kind":"comparison","status":"pass","evidence":"native and replay agree"}.',
      ),
    observationIdsJson: tool.schema
      .string()
      .optional()
      .describe("JSON string array of observation IDs linked to the oracle."),
    oracleStatus: tool.schema.string().optional().describe("unknown | pass | fail | not_available"),
    oracleCommand: tool.schema.string().optional(),
    oracleEvidence: tool.schema.string().optional(),
    evidenceRef: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative artifact, ledger, or evidence path to link."),
    decisionStatePath: tool.schema
      .string()
      .optional()
      .describe("Optional workspace-relative .ctf-decision-state.json path."),
    evidenceBoardPath: tool.schema
      .string()
      .optional()
      .describe("Optional workspace-relative .ctf-evidence-board.json path."),
    anchorPath: tool.schema
      .string()
      .optional()
      .describe("Optional external evidence anchor sidecar path; defaults to <session>.json.anchor.json."),
    anchorSource: tool.schema
      .string()
      .optional()
      .describe("Provenance source recorded in the external evidence anchor."),
    syncDecisionState: tool.schema
      .boolean()
      .optional()
      .describe("Project the session event into an existing decision state. Default true for sync."),
    syncEvidenceBoard: tool.schema
      .boolean()
      .optional()
      .describe("Project the session event into an existing evidence board. Default true for sync."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const requestedTarget = args.target
      ? resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
      : undefined
    const file = resolveRuntimeSessionFile(
      workspace,
      args.sessionPath,
      requestedTarget ? rel(workspace, requestedTarget) : undefined,
    )
    const command = args.command.trim().toLowerCase()
    let session
    let action = command
    let historyVerification: { status: "legacy" | "verified" | "invalid"; issues: string[] } | undefined
    let fingerprintVerification: { status: string; issues: string[]; compared_fields: string[] } | undefined
    let provenanceIssues:
      Array<{ code: string; message: string; artifact_id?: string; observation_id?: string }> | undefined
    let anchorVerification: { status: string; issues: string[] } | undefined

    if (command === "init") {
      if (!requestedTarget) throw new Error("init requires target")
      const target = rel(workspace, requestedTarget)
      const result = await initRuntimeSession(
        file,
        {
          target,
          family: args.family,
          observationContract: args.observationContract,
          substrate: args.substrate,
          arch: args.arch,
          mode: args.mode,
          fingerprint: args.substrateFingerprint,
          tool: args.runtimeTool,
          version: args.runtimeVersion,
          imageDigest: args.imageDigest,
          nextAction: args.patchJson
            ? (jsonObject("patchJson", args.patchJson).next_action as string[] | undefined)
            : undefined,
          decisionStatePath: args.decisionStatePath
            ? rel(workspace, resolveFromDirectoryInsideWorkspace(directory, workspace, args.decisionStatePath))
            : null,
          evidenceBoardPath: args.evidenceBoardPath
            ? rel(workspace, resolveFromDirectoryInsideWorkspace(directory, workspace, args.evidenceBoardPath))
            : null,
        },
        workspace,
      )
      session = result.session
      action = result.created ? "init" : "read"
    } else if (command === "read") {
      session = await readRuntimeSession(file, workspace)
    } else if (command === "record-artifact") {
      session = await recordRuntimeArtifact(file, workspace, jsonObject("artifactJson", args.artifactJson))
    } else if (command === "record-marker") {
      session = await recordRuntimeMarker(file, workspace, jsonObject("markerJson", args.markerJson))
    } else if (command === "record-observation") {
      session = await recordRuntimeObservation(file, workspace, jsonObject("observationJson", args.observationJson))
    } else if (command === "inspect-artifacts") {
      session = await inspectRuntimeArtifacts(file, workspace)
    } else if (command === "inspect-provenance") {
      const result = await inspectRuntimeProvenance(file, workspace)
      session = result.session
      provenanceIssues = result.issues
    } else if (command === "record-runtime-fingerprint") {
      session = await recordRuntimeFingerprint(
        file,
        workspace,
        jsonObject("runtimeFingerprintJson", args.runtimeFingerprintJson),
      )
    } else if (command === "verify-runtime-fingerprint") {
      const result = await verifyRuntimeFingerprint(
        file,
        workspace,
        args.runtimeFingerprintJson ? jsonObject("runtimeFingerprintJson", args.runtimeFingerprintJson) : undefined,
      )
      session = result.session
      fingerprintVerification = result.verification
    } else if (command === "anchor-evidence") {
      const result = await anchorRuntimeEvidence(file, workspace, { path: args.anchorPath, source: args.anchorSource })
      session = result.session
      anchorVerification = result.verification
    } else if (command === "verify-evidence-anchor") {
      const result = await verifyRuntimeEvidenceAnchor(file, workspace)
      session = result.session
      anchorVerification = result.verification
    } else if (command === "verify-history") {
      const result = await verifyRuntimeSessionHistory(file, workspace)
      session = result.session
      historyVerification = result.verification
    } else if (command === "set-oracle") {
      if (!args.oracleStatus) throw new Error("set-oracle requires oracleStatus")
      session = await updateRuntimeSession(file, workspace, command, {
        summary: "oracle updated",
        oracle: {
          status: args.oracleStatus,
          command: args.oracleCommand,
          evidence: args.oracleEvidence,
          observation_ids: args.observationIdsJson ? JSON.parse(args.observationIdsJson) : undefined,
        },
      })
    } else if (command === "set-stage") {
      if (!args.stage) throw new Error("set-stage requires stage")
      session = await updateRuntimeSession(file, workspace, command, {
        summary: `stage set to ${args.stage}`,
        stage: args.stage,
      })
    } else if (command === "link-evidence") {
      if (!args.evidenceRef) throw new Error("link-evidence requires evidenceRef")
      const evidenceFile = resolveFromDirectoryInsideWorkspace(directory, workspace, args.evidenceRef)
      session = await updateRuntimeSession(file, workspace, command, {
        summary: `evidence linked: ${rel(workspace, evidenceFile)}`,
        evidence_refs: [rel(workspace, evidenceFile)],
      })
    } else if (command === "update") {
      const patch = jsonObject("patchJson", args.patchJson)
      if (args.stage) patch.stage = args.stage
      if (args.family) patch.family = args.family
      if (
        args.observationContract ||
        args.substrate ||
        args.arch ||
        args.mode ||
        args.substrateFingerprint ||
        args.runtimeTool ||
        args.runtimeVersion ||
        args.imageDigest
      ) {
        if (args.observationContract) patch.observation_contract = args.observationContract
        patch.substrate = {
          kind: args.substrate,
          arch: args.arch,
          mode: args.mode,
          fingerprint: args.substrateFingerprint,
          tool: args.runtimeTool,
          version: args.runtimeVersion,
          image_digest: args.imageDigest,
        }
      }
      session = await updateRuntimeSession(file, workspace, command, patch)
    } else if (command === "sync") {
      session = await readRuntimeSession(file, workspace)
    } else {
      throw new Error(`unknown command: ${args.command}`)
    }

    const projection =
      command === "sync" || Boolean(args.syncDecisionState) || Boolean(args.syncEvidenceBoard)
        ? await syncProjections(session, args, workspace, directory, context)
        : { decision_state: { attempted: false, synced: false }, evidence_board: { attempted: false, synced: false } }
    const payload = {
      schema_version: session.schema_version,
      command: action,
      session_path: rel(workspace, file),
      session,
      projection,
      ...(historyVerification ? { history_verification: historyVerification } : {}),
      ...(fingerprintVerification ? { fingerprint_verification: fingerprintVerification } : {}),
      ...(provenanceIssues ? { provenance_issues: provenanceIssues } : {}),
      ...(anchorVerification ? { evidence_anchor_verification: anchorVerification } : {}),
      next_tool_hint: session.promotion.allowed
        ? "oracle_verified/closed is permitted; record the accepted result in the evidence board"
        : session.stage === "blocked"
          ? "remove or document the blocker, then update the session with an orthogonal next action"
          : "record the next artifact/marker or run a real oracle before promoting the session",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "ctf-rev-runtime-session:",
      `- command: ${payload.command}`,
      `- schema_version: ${session.schema_version}`,
      `- session_id: ${session.session_id}`,
      `- session_path: ${payload.session_path}`,
      `- target: ${session.target}`,
      `- family: ${session.family}`,
      `- stage: ${session.stage}`,
      `- observation_contract: ${session.observation_contract}`,
      `- substrate: ${session.substrate.kind}${session.substrate.arch ? `/${session.substrate.arch}` : ""}${session.substrate.mode ? `/${session.substrate.mode}` : ""}`,
      `- artifacts: ${session.artifacts.length}`,
      `- markers: ${session.markers.length}`,
      `- observations: ${session.observations.length}`,
      `- oracle: ${session.oracle.status}`,
      `- promotion_allowed: ${session.promotion.allowed}`,
      `- promotion_reason: ${session.promotion.reason}`,
      `- history_events: ${session.history.length}`,
      ...(session.evidence_anchor
        ? [`- evidence_anchor: ${session.evidence_anchor.status} (${session.evidence_anchor.path})`]
        : []),
      ...(historyVerification
        ? [
            `- history_verification: ${historyVerification.status}${historyVerification.issues.length ? ` (${historyVerification.issues.join("; ")})` : ""}`,
          ]
        : []),
      ...(fingerprintVerification
        ? [
            `- fingerprint_verification: ${fingerprintVerification.status}${fingerprintVerification.issues.length ? ` (${fingerprintVerification.issues.join("; ")})` : ""}`,
          ]
        : []),
      ...(provenanceIssues ? [`- provenance_issues: ${provenanceIssues.length}`] : []),
      `- next_tool_hint: ${payload.next_tool_hint}`,
    ].join("\n")
  },
})

async function syncProjections(
  session: Awaited<ReturnType<typeof readRuntimeSession>>,
  args: Record<string, unknown>,
  workspace: string,
  directory: string,
  context: unknown,
) {
  const decisionPathInput = (args.decisionStatePath as string | undefined) || session.decision_state_path || undefined
  const boardPathInput = (args.evidenceBoardPath as string | undefined) || session.evidence_board_path || undefined
  const decisionResult: Record<string, unknown> = { attempted: false, synced: false }
  const boardResult: Record<string, unknown> = { attempted: false, synced: false }
  if (decisionPathInput && args.syncDecisionState !== false) {
    const decisionPath = args.decisionStatePath
      ? resolveFromDirectoryInsideWorkspace(directory, workspace, decisionPathInput)
      : resolveInsideWorkspace(workspace, decisionPathInput)
    decisionResult.attempted = true
    decisionResult.path = rel(directory, decisionPath)
    if (await exists(decisionPath)) {
      try {
        await decisionState.execute(
          {
            operation: "add_asset",
            statePath: rel(workspace, decisionPath),
            actionJson: JSON.stringify({
              source: "ctf-rev-runtime-session",
              sessionId: session.session_id,
              sessionPath: rel(
                workspace,
                resolveRuntimeSessionFile(workspace, args.sessionPath as string | undefined, session.target),
              ),
              stage: session.stage,
              observationContract: session.observation_contract,
              promotion: session.promotion,
              artifacts: session.artifacts,
              markers: session.markers,
              observations: session.observations,
              oracle: session.oracle,
              evidenceRefs: session.evidence_refs,
            }),
          },
          context as never,
        )
        decisionResult.synced = true
      } catch (error) {
        decisionResult.detail = error instanceof Error ? error.message : String(error)
      }
    } else decisionResult.detail = "decision state does not exist"
  }
  if (boardPathInput && args.syncEvidenceBoard !== false) {
    const boardPath = args.evidenceBoardPath
      ? resolveFromDirectoryInsideWorkspace(directory, workspace, boardPathInput)
      : resolveInsideWorkspace(workspace, boardPathInput)
    boardResult.attempted = true
    boardResult.path = rel(directory, boardPath)
    if (await exists(boardPath)) {
      try {
        await evidenceBoard.execute(
          {
            board: rel(workspace, boardPath),
            command: "add",
            agent: "ctf-rev-runtime-session",
            finding: `Rev runtime session ${session.session_id} at ${session.stage}`,
            type: "technique",
            category: "rev",
            confidence: session.promotion.allowed ? "high" : "medium",
            status: session.promotion.allowed ? "confirmed" : "in_progress",
            flagPathDistance: session.promotion.allowed ? 1 : 3,
            evidence: JSON.stringify({
              sessionId: session.session_id,
              stage: session.stage,
              observationContract: session.observation_contract,
              artifacts: session.artifacts,
              markers: session.markers,
              observations: session.observations,
              oracle: session.oracle,
            }).slice(0, 4000),
            followUp: session.promotion.allowed
              ? "Record the accepted flag with flag-verify."
              : session.next_action.join("; ") || "Record the next runtime artifact or oracle.",
          },
          context as never,
        )
        boardResult.synced = true
      } catch (error) {
        boardResult.detail = error instanceof Error ? error.message : String(error)
      }
    } else boardResult.detail = "evidence board does not exist"
  }
  return { decision_state: decisionResult, evidence_board: boardResult }
}
