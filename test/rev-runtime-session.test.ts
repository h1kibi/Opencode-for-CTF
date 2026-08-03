import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { packForTool } from "../src/tool-packs.ts"

async function tempRoot(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

describe("Rev runtime session", () => {
  it("registers a session, artifacts, markers, and blocks promotion without an oracle", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-")
    await writeFile(path.join(root, "challenge.bin"), "fixture")
    const context = { directory: root, worktree: root } as never

    const init = JSON.parse(
      String(await mod.default.execute({ command: "init", target: "challenge.bin", family: "elf", substrate: "docker", jsonOnly: true }, context)),
    )
    expect(init.session.schema_version).toBe("rev_runtime_session.v1")
    expect(init.session.stage).toBe("planned")
    const sessionPath = init.session_path

    const artifact = JSON.parse(
      String(await mod.default.execute({
        command: "record-artifact",
        sessionPath,
        artifactJson: JSON.stringify({ path: "challenge.bin", kind: "input", source: "test", status: "available" }),
        jsonOnly: true,
      }, context)),
    )
    expect(artifact.session.artifacts).toHaveLength(1)

    const marker = JSON.parse(
      String(await mod.default.execute({
        command: "record-marker",
        sessionPath,
        markerJson: JSON.stringify({ name: "post-unpack", reached: true, evidence: "marker observed" }),
        jsonOnly: true,
      }, context)),
    )
    expect(marker.session.markers[0].reached).toBe(true)

    await expect(mod.default.execute({ command: "set-stage", sessionPath, stage: "oracle_verified", jsonOnly: true }, context)).rejects.toThrow(
      "oracle",
    )
  })

  it("requires a passing oracle before oracle_verified and preserves append-only history", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-oracle-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path

    await mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleCommand: "./sample known-input",
      oracleEvidence: "native and replay outputs match for known input",
      jsonOnly: true,
    }, context)
    const closed = JSON.parse(String(await mod.default.execute({ command: "set-stage", sessionPath, stage: "closed", jsonOnly: true }, context)))
    expect(closed.session.promotion.allowed).toBe(true)
    expect(closed.session.oracle.status).toBe("pass")
    expect(closed.session.history.map((event: { operation: string }) => event.operation)).toEqual(
      expect.arrayContaining(["init", "set-oracle", "set-stage", "stage_transition"]),
    )

    const stored = JSON.parse(await readFile(path.join(root, sessionPath), "utf8"))
    expect(stored.schema_version).toBe("rev_runtime_session.v1")
    expect(stored.history.length).toBeGreaterThanOrEqual(4)
    expect(stored.history.every((event: { event_hash?: string }) => /^[a-f0-9]{64}$/.test(event.event_hash ?? ""))).toBe(true)
    expect(stored.history[0].previous_hash).toBeNull()
    for (let index = 1; index < stored.history.length; index += 1) {
      expect(stored.history[index].previous_hash).toBe(stored.history[index - 1].event_hash)
    }

    const verified = JSON.parse(String(await mod.default.execute({ command: "verify-history", sessionPath, jsonOnly: true }, context)))
    expect(verified.history_verification).toEqual({ status: "verified", issues: [] })
  })

  it("records and verifies imported runtime fingerprints without executing a target", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-fingerprint-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({
      command: "init",
      target: "sample",
      observationContract: "strict",
      substrate: "unicorn",
      arch: "x86",
      mode: "64",
      substrateFingerprint: "unicorn-fp-1",
      runtimeTool: "unicorn",
      runtimeVersion: "2.0",
      jsonOnly: true,
    }, context)))
    const sessionPath = init.session_path
    const matching = JSON.parse(String(await mod.default.execute({
      command: "record-runtime-fingerprint",
      sessionPath,
      runtimeFingerprintJson: JSON.stringify({
        source: "external-doctor",
        substrate: "unicorn",
        arch: "x86",
        mode: "64",
        fingerprint: "unicorn-fp-1",
        tool: "unicorn",
        version: "2.0",
      }),
      jsonOnly: true,
    }, context)))
    expect(matching.session.runtime_fingerprint.status).toBe("verified")
    expect(matching.session.history.at(-1).operation).toBe("record_runtime_fingerprint")

    const verified = JSON.parse(String(await mod.default.execute({ command: "verify-runtime-fingerprint", sessionPath, jsonOnly: true }, context)))
    expect(verified.fingerprint_verification).toEqual({ status: "verified", issues: [], compared_fields: ["substrate", "arch", "mode", "fingerprint", "tool", "version"] })
    expect(verified.session.history).toHaveLength(matching.session.history.length)

    const mismatch = JSON.parse(String(await mod.default.execute({
      command: "verify-runtime-fingerprint",
      sessionPath,
      runtimeFingerprintJson: JSON.stringify({ substrate: "unicorn", arch: "x86", mode: "64", fingerprint: "unicorn-fp-1", tool: "unicorn", version: "1.0" }),
      jsonOnly: true,
    }, context)))
    expect(mismatch.fingerprint_verification.status).toBe("mismatch")
    expect(mismatch.fingerprint_verification.issues.join("; ")).toContain("version differs")
    const unchanged = JSON.parse(String(await mod.default.execute({ command: "read", sessionPath, jsonOnly: true }, context)))
    expect(unchanged.session.runtime_fingerprint.status).toBe("verified")
  })

  it("audits artifact provenance in both directions without treating planned artifacts as fatal", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-provenance-")
    await writeFile(path.join(root, "payload.bin"), "payload")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path
    await mod.default.execute({
      command: "record-artifact",
      sessionPath,
      artifactJson: JSON.stringify({ id: "payload-artifact", path: "payload.bin", kind: "payload", source: "test", status: "generated" }),
      jsonOnly: true,
    }, context)
    const plannedAudit = JSON.parse(String(await mod.default.execute({ command: "inspect-provenance", sessionPath, jsonOnly: true }, context)))
    expect(plannedAudit.provenance_issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "orphan" })]))

    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({ id: "obs-payload", kind: "native", status: "pass", artifact_refs: ["payload-artifact"] }),
      jsonOnly: true,
    }, context)
    const uninspected = JSON.parse(String(await mod.default.execute({ command: "inspect-provenance", sessionPath, jsonOnly: true }, context)))
    expect(uninspected.provenance_issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "provenance-missing" })]))

    await mod.default.execute({ command: "inspect-artifacts", sessionPath, jsonOnly: true }, context)
    const linked = JSON.parse(String(await mod.default.execute({ command: "inspect-provenance", sessionPath, jsonOnly: true }, context)))
    expect(linked.provenance_issues).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "provenance-missing" })]))

    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({ id: "obs-missing", kind: "replay", status: "pass", artifact_refs: ["does-not-exist"] }),
      jsonOnly: true,
    }, context)
    const missing = JSON.parse(String(await mod.default.execute({ command: "inspect-provenance", sessionPath, jsonOnly: true }, context)))
    expect(missing.provenance_issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing-artifact-reference", observation_id: "obs-missing" })]))
  })

  it("tracks artifact generations and detects observations that point at replaced files", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-artifact-generation-")
    const artifactPath = path.join(root, "payload.bin")
    await writeFile(artifactPath, "version-one")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path
    await mod.default.execute({
      command: "record-artifact",
      sessionPath,
      artifactJson: JSON.stringify({ id: "payload-v1", path: "payload.bin", kind: "payload", source: "test", status: "available" }),
      jsonOnly: true,
    }, context)
    const inspected = JSON.parse(String(await mod.default.execute({ command: "inspect-artifacts", sessionPath, jsonOnly: true }, context)))
    const firstArtifact = inspected.session.artifacts[0]
    expect(firstArtifact.generation).toBe(1)

    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-v1",
        kind: "native",
        status: "pass",
        artifact_refs: ["payload-v1"],
        artifact_generations: { "payload-v1": 1 },
        artifact_sha256s: { "payload-v1": firstArtifact.sha256 },
      }),
      jsonOnly: true,
    }, context)

    await writeFile(artifactPath, "version-two")
    const replacement = JSON.parse(String(await mod.default.execute({
      command: "record-artifact",
      sessionPath,
      artifactJson: JSON.stringify({ id: "payload-v2", path: "payload.bin", kind: "payload", source: "replacement", status: "available" }),
      jsonOnly: true,
    }, context)))
    expect(replacement.session.artifacts[0]).toMatchObject({ id: "payload-v2", generation: 2, replaces_artifact_id: "payload-v1" })

    const audit = JSON.parse(String(await mod.default.execute({ command: "inspect-provenance", sessionPath, jsonOnly: true }, context)))
    expect(audit.provenance_issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing-artifact-reference", observation_id: "obs-v1" })]))
  })

  it("compares register, memory, and trace digests as machine-checkable runtime semantics", async () => {
    const { revRuntimeOracleObservationIssues } = await import("../packages/ctf-core/src/rev-runtime-session.ts")
    const issues = revRuntimeOracleObservationIssues({
      observation_contract: "strict",
      artifacts: [],
      oracle: { status: "pass", evidence: "digest comparison", observation_ids: ["native", "replay", "comparison"] },
      observations: [
        { id: "native", kind: "native", status: "pass", registers_sha256: "regs", memory_sha256: "mem", trace_sha256: "trace", at: "2026-01-01T00:00:00.000Z" },
        { id: "replay", kind: "replay", status: "pass", registers_sha256: "regs", memory_sha256: "mem", trace_sha256: "trace", at: "2026-01-01T00:00:01.000Z" },
        { id: "comparison", kind: "comparison", status: "pass", registers_sha256: "regs", memory_sha256: "mem", trace_sha256: "trace", related_observation_ids: ["native", "replay"], at: "2026-01-01T00:00:02.000Z" },
      ],
    })
    expect(issues).toEqual([])
  })

  it("keeps the session tool in the light Rev pack and metadata contract", () => {
    expect(packForTool("ctf-rev-runtime-session")).toBe("rev")
  })

  it("records observations, links them to the oracle, and projects them", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-observation-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path

    const recorded = JSON.parse(String(await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-native-1",
        kind: "native",
        status: "pass",
        command: "./sample known-input",
        exit_code: 0,
        evidence: "native output captured",
      }),
      jsonOnly: true,
    }, context)))
    expect(recorded.session.observations).toHaveLength(1)
    expect(recorded.session.observations[0]).toMatchObject({ id: "obs-native-1", kind: "native", status: "pass" })

    const oracle = JSON.parse(String(await mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleCommand: "./sample known-input",
      oracleEvidence: "independent native observation accepted",
      observationIdsJson: JSON.stringify(["obs-native-1"]),
      jsonOnly: true,
    }, context)))
    expect(oracle.session.oracle.observation_ids).toEqual(["obs-native-1"])
    expect(oracle.session.history.map((event: { operation: string }) => event.operation)).toEqual(
      expect.arrayContaining(["record_observation", "set-oracle"]),
    )
  })

  it("enforces the runtime stage ladder instead of allowing arbitrary jumps", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-stages-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path

    await expect(mod.default.execute({ command: "set-stage", sessionPath, stage: "captured", jsonOnly: true }, context)).rejects.toThrow(
      "invalid runtime stage transition: planned -> captured",
    )
    await mod.default.execute({ command: "set-stage", sessionPath, stage: "prepared", jsonOnly: true }, context)
    await expect(mod.default.execute({ command: "set-stage", sessionPath, stage: "replayed", jsonOnly: true }, context)).rejects.toThrow(
      "invalid runtime stage transition: prepared -> replayed",
    )
    await mod.default.execute({ command: "set-stage", sessionPath, stage: "running", jsonOnly: true }, context)
    await mod.default.execute({ command: "set-stage", sessionPath, stage: "captured", jsonOnly: true }, context)
    await mod.default.execute({ command: "set-stage", sessionPath, stage: "replayed", jsonOnly: true }, context)
  })

  it("normalizes legacy sessions without an observations field", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-legacy-")
    const context = { directory: root, worktree: root } as never
    const sessionPath = "work/legacy.json"
    const legacy = {
      schema_version: "rev_runtime_session.v1",
      session_id: "legacy",
      target: "sample",
      family: "elf",
      stage: "planned",
      substrate: { kind: "local", arch: null, mode: null },
      artifacts: [],
      markers: [],
      oracle: { status: "unknown" },
      evidence_refs: [],
      next_action: [],
      blocking: [],
      history: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await (await import("node:fs/promises")).mkdir(path.join(root, "work"), { recursive: true })
    await writeFile(path.join(root, sessionPath), JSON.stringify(legacy))
    const result = JSON.parse(String(await mod.default.execute({ command: "read", sessionPath, jsonOnly: true }, context)))
    expect(result.session.observations).toEqual([])
    expect(result.session.oracle.observation_ids).toEqual([])
  })

  it("supports an atomic oracle-plus-stage update and rejects unknown values", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-atomic-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path

    const promoted = JSON.parse(String(await mod.default.execute({
      command: "update",
      sessionPath,
      patchJson: JSON.stringify({
        stage: "oracle_verified",
        oracle: { status: "pass", evidence: "atomic independent oracle result" },
      }),
      jsonOnly: true,
    }, context)))
    expect(promoted.session.stage).toBe("oracle_verified")
    expect(promoted.session.promotion.allowed).toBe(true)

    await expect(mod.default.execute({ command: "set-stage", sessionPath, stage: "not-a-stage", jsonOnly: true }, context)).rejects.toThrow(
      "unsupported runtime stage",
    )
    await expect(mod.default.execute({ command: "set-oracle", sessionPath, oracleStatus: "maybe", jsonOnly: true }, context)).rejects.toThrow(
      "unsupported oracle status",
    )
  })
  it("rejects invalid oracle observation references while keeping legacy oracles compatible", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-observation-contract-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path

    await expect(mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "claimed without a resolvable observation",
      observationIdsJson: JSON.stringify(["does-not-exist"]),
      jsonOnly: true,
    }, context)).rejects.toThrow("unknown observation")

    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({ id: "obs-fail", kind: "native", status: "fail", evidence: "native rejected input" }),
      jsonOnly: true,
    }, context)
    await expect(mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "must not accept a failed observation",
      observationIdsJson: JSON.stringify(["obs-fail"]),
      jsonOnly: true,
    }, context)).rejects.toThrow("failed observation")

    const legacy = JSON.parse(String(await mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "legacy external oracle evidence",
      jsonOnly: true,
    }, context)))
    expect(legacy.session.promotion.allowed).toBe(false)
    expect(legacy.session.oracle.observation_ids).toEqual([])
  })

  it("deduplicates valid observation references and allows promotion", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-observation-pass-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path

    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({ id: "obs-pass", kind: "comparison", status: "pass", evidence: "native and replay outputs match" }),
      jsonOnly: true,
    }, context)
    const oracle = JSON.parse(String(await mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "comparison accepted",
      observationIdsJson: JSON.stringify(["obs-pass", "obs-pass"]),
      jsonOnly: true,
    }, context)))
    expect(oracle.session.oracle.observation_ids).toEqual(["obs-pass"])

    const promoted = JSON.parse(String(await mod.default.execute({
      command: "set-stage",
      sessionPath,
      stage: "oracle_verified",
      jsonOnly: true,
    }, context)))
    expect(promoted.session.promotion).toMatchObject({ allowed: true })
  })

  it("checks observation artifact references before oracle promotion", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-observation-artifacts-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path

    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-payload",
        kind: "replay",
        status: "pass",
        artifact_refs: ["payload.bin"],
        evidence: "replay payload captured",
      }),
      jsonOnly: true,
    }, context)
    await expect(mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "payload reference must resolve",
      observationIdsJson: JSON.stringify(["obs-payload"]),
      jsonOnly: true,
    }, context)).rejects.toThrow("unknown artifact")

    await mod.default.execute({
      command: "record-artifact",
      sessionPath,
      artifactJson: JSON.stringify({ id: "payload.bin", path: "payload.bin", kind: "payload", status: "missing" }),
      jsonOnly: true,
    }, context)
    await expect(mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "missing payload must not verify",
      observationIdsJson: JSON.stringify(["obs-payload"]),
      jsonOnly: true,
    }, context)).rejects.toThrow("missing artifact")
  })

  it("validates native/replay comparison links and runtime metadata", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-comparison-contract-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({
      command: "init",
      target: "sample",
      family: "elf",
      substrate: "unicorn",
      arch: "x86_64",
      mode: "64",
      jsonOnly: true,
    }, context)))
    const sessionPath = init.session_path

    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-native",
        kind: "native",
        status: "pass",
        input_sha256: "input-1",
        runtime: { substrate: "local", arch: "x86_64", mode: "64", fingerprint: "native-fp" },
      }),
      jsonOnly: true,
    }, context)
    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-replay",
        kind: "replay",
        status: "pass",
        input_sha256: "input-1",
        runtime: { substrate: "unicorn", arch: "x86_64", mode: "64", fingerprint: "replay-fp" },
      }),
      jsonOnly: true,
    }, context)
    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-comparison",
        kind: "comparison",
        status: "pass",
        input_sha256: "input-1",
        related_observation_ids: ["obs-native", "obs-replay"],
        evidence: "native and replay outputs agree",
      }),
      jsonOnly: true,
    }, context)

    const oracle = JSON.parse(String(await mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "comparison is linked to passing native and replay observations",
      observationIdsJson: JSON.stringify(["obs-comparison"]),
      jsonOnly: true,
    }, context)))
    expect(oracle.session.observations[2].related_observation_ids).toEqual(["obs-native", "obs-replay"])

    const promoted = JSON.parse(String(await mod.default.execute({
      command: "set-stage",
      sessionPath,
      stage: "oracle_verified",
      jsonOnly: true,
    }, context)))
    expect(promoted.session.promotion.allowed).toBe(true)
  })

  it("blocks strict promotion after an observed artifact is replaced", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-artifact-replacement-")
    const payloadPath = path.join(root, "payload.bin")
    await writeFile(payloadPath, "payload-v1")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({
      command: "init",
      target: "sample",
      observationContract: "strict",
      jsonOnly: true,
    }, context)))
    const sessionPath = init.session_path

    await mod.default.execute({
      command: "record-artifact",
      sessionPath,
      artifactJson: JSON.stringify({
        id: "payload-v1",
        path: "payload.bin",
        kind: "payload",
        source: "test",
        status: "generated",
      }),
      jsonOnly: true,
    }, context)
    const inspected = JSON.parse(String(await mod.default.execute({
      command: "inspect-artifacts",
      sessionPath,
      jsonOnly: true,
    }, context)))
    const artifact = inspected.session.artifacts[0]
    expect(artifact).toMatchObject({ id: "payload-v1", status: "available", generation: 1 })

    const snapshot = {
      artifact_refs: ["payload-v1"],
      artifact_generations: { "payload-v1": artifact.generation },
      artifact_sha256s: { "payload-v1": artifact.sha256 },
      input_sha256: "input-1",
      payload_sha256: "payload-1",
      stdout_sha256: "stdout-1",
      stderr_sha256: "stderr-1",
      registers_sha256: "registers-1",
      memory_sha256: "memory-1",
      trace_sha256: "trace-1",
      exit_code: 0,
      stop_pc: "0x401000",
      evidence: "strict artifact-bound observation",
    }
    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({ id: "obs-native", kind: "native", status: "pass", ...snapshot }),
      jsonOnly: true,
    }, context)
    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({ id: "obs-replay", kind: "replay", status: "pass", ...snapshot }),
      jsonOnly: true,
    }, context)
    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-comparison",
        kind: "comparison",
        status: "pass",
        related_observation_ids: ["obs-native", "obs-replay"],
        ...snapshot,
      }),
      jsonOnly: true,
    }, context)
    await mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "native, replay, and comparison observations agree",
      observationIdsJson: JSON.stringify(["obs-native", "obs-replay", "obs-comparison"]),
      jsonOnly: true,
    }, context)

    const promoted = JSON.parse(String(await mod.default.execute({
      command: "set-stage",
      sessionPath,
      stage: "oracle_verified",
      jsonOnly: true,
    }, context)))
    expect(promoted.session.promotion).toMatchObject({ allowed: true })

    await writeFile(payloadPath, "payload-v2")
    const replaced = JSON.parse(String(await mod.default.execute({
      command: "inspect-artifacts",
      sessionPath,
      jsonOnly: true,
    }, context)))
    expect(replaced.session.artifacts[0]).toMatchObject({ status: "stale", generation: 2 })

    await expect(mod.default.execute({
      command: "set-stage",
      sessionPath,
      stage: "closed",
      jsonOnly: true,
    }, context)).rejects.toThrow(/runtime artifact provenance failed|artifact-replaced|artifact-integrity/)
    const readable = JSON.parse(String(await mod.default.execute({ command: "read", sessionPath, jsonOnly: true }, context)))
    expect(readable.session.stage).toBe("oracle_verified")
    expect(readable.session.promotion.allowed).toBe(false)
  })

  it("rejects incomplete comparison links and observation architecture drift", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-comparison-invalid-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({
      command: "init",
      target: "sample",
      substrate: "unicorn",
      arch: "x86_64",
      mode: "64",
      jsonOnly: true,
    }, context)))
    const sessionPath = init.session_path

    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-native",
        kind: "native",
        status: "pass",
        runtime: { arch: "x86_64", mode: "64" },
      }),
      jsonOnly: true,
    }, context)
    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-comparison",
        kind: "comparison",
        status: "pass",
        related_observation_ids: ["obs-native"],
      }),
      jsonOnly: true,
    }, context)
    await expect(mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "comparison is missing replay evidence",
      observationIdsJson: JSON.stringify(["obs-comparison"]),
      jsonOnly: true,
    }, context)).rejects.toThrow("lacks a replay input")

    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-replay",
        kind: "replay",
        status: "pass",
        runtime: { arch: "arm64", mode: "64" },
      }),
      jsonOnly: true,
    }, context)
    await mod.default.execute({
      command: "record-observation",
      sessionPath,
      observationJson: JSON.stringify({
        id: "obs-comparison-drift",
        kind: "comparison",
        status: "pass",
        related_observation_ids: ["obs-native", "obs-replay"],
      }),
      jsonOnly: true,
    }, context)
    await expect(mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "comparison must reject architecture drift",
      observationIdsJson: JSON.stringify(["obs-comparison-drift"]),
      jsonOnly: true,
    }, context)).rejects.toThrow("runtime architectures differ")
  })

  it("rejects comparison output digest drift", async () => {
    const core = await import("../packages/ctf-core/src/rev-runtime-session.ts")
    const issues = core.revRuntimeOracleObservationIssues({
      observation_contract: "strict",
      oracle: { status: "pass", evidence: "comparison output mismatch", observation_ids: ["obs-comparison"] },
      observations: [
        { id: "obs-native", kind: "native", status: "pass", stdout_sha256: "native-output", at: "2026-01-01T00:00:00.000Z" },
        { id: "obs-replay", kind: "replay", status: "pass", stdout_sha256: "replay-output", at: "2026-01-01T00:00:01.000Z" },
        {
          id: "obs-comparison",
          kind: "comparison",
          status: "pass",
          stdout_sha256: "comparison-output",
          related_observation_ids: ["obs-native", "obs-replay"],
          at: "2026-01-01T00:00:02.000Z",
        },
      ],
      artifacts: [],
    })
    expect(issues).toEqual(expect.arrayContaining([expect.stringContaining("comparison stdout digests differ")]))
  })

  it("enforces strict native/replay/comparison evidence while preserving legacy sessions", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-strict-contract-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({
      command: "init",
      target: "sample",
      observationContract: "strict",
      jsonOnly: true,
    }, context)))
    const sessionPath = init.session_path
    expect(init.session.observation_contract).toBe("strict")

    await expect(mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "missing linked runtime observations",
      jsonOnly: true,
    }, context)).rejects.toThrow("strict observation contract requires oracle.observation_ids")

    for (const observation of [
      { id: "obs-native", kind: "native", status: "pass" },
      { id: "obs-replay", kind: "replay", status: "pass" },
      {
        id: "obs-comparison",
        exit_code: 0,
        kind: "comparison",
        status: "pass",
        related_observation_ids: ["obs-native", "obs-replay"],
      },
    ]) {
      await mod.default.execute({
        command: "record-observation",
        sessionPath,
        observationJson: JSON.stringify(observation),
        jsonOnly: true,
      }, context)
    }

    const oracle = JSON.parse(String(await mod.default.execute({
      command: "set-oracle",
      sessionPath,
      oracleStatus: "pass",
      oracleEvidence: "strict native/replay comparison accepted",
      observationIdsJson: JSON.stringify(["obs-native", "obs-replay", "obs-comparison"]),
      jsonOnly: true,
    }, context)))
    expect(oracle.session.promotion.allowed).toBe(false)

    const promoted = JSON.parse(String(await mod.default.execute({
      command: "set-stage",
      sessionPath,
      stage: "oracle_verified",
      jsonOnly: true,
    }, context)))
    expect(promoted.session.promotion.allowed).toBe(true)
  })

  it("detects tampered and legacy runtime histories without rewriting them", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-history-integrity-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)))
    const sessionPath = init.session_path
    await mod.default.execute({
      command: "update",
      sessionPath,
      patchJson: JSON.stringify({ summary: "record a follow-up event", next_action: ["verify"] }),
      jsonOnly: true,
    }, context)

    const storedPath = path.join(root, sessionPath)
    const stored = JSON.parse(await readFile(storedPath, "utf8"))
    stored.history[1].summary = "tampered after capture"
    await writeFile(storedPath, JSON.stringify(stored, null, 2))
    const invalid = JSON.parse(String(await mod.default.execute({ command: "verify-history", sessionPath, jsonOnly: true }, context)))
    expect(invalid.history_verification.status).toBe("invalid")
    expect(invalid.history_verification.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("invalid event_hash"),
    ]))

    const previousInit = JSON.parse(String(await mod.default.execute({ command: "init", target: "previous-hash-sample", jsonOnly: true }, context)))
    const previousPath = path.join(root, previousInit.session_path)
    const previousStored = JSON.parse(await readFile(previousPath, "utf8"))
    previousStored.history[0].previous_hash = "bad-previous-hash"
    await writeFile(previousPath, JSON.stringify(previousStored, null, 2))
    const previousInvalid = JSON.parse(String(await mod.default.execute({ command: "verify-history", sessionPath: previousInit.session_path, jsonOnly: true }, context)))
    expect(previousInvalid.history_verification.status).toBe("invalid")
    expect(previousInvalid.history_verification.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("invalid previous_hash"),
    ]))
    const legacy = JSON.parse(await readFile(storedPath, "utf8"))
    legacy.history = legacy.history.map((event: Record<string, unknown>) => {
      const { event_hash: _eventHash, previous_hash: _previousHash, ...withoutHashes } = event
      return withoutHashes
    })
    await writeFile(storedPath, JSON.stringify(legacy, null, 2))
    const legacyResult = JSON.parse(String(await mod.default.execute({ command: "verify-history", sessionPath, jsonOnly: true }, context)))
    expect(legacyResult.history_verification.status).toBe("legacy")
    expect(legacyResult.history_verification.issues[0]).toContain("legacy session")
    const readable = JSON.parse(String(await mod.default.execute({ command: "read", sessionPath, jsonOnly: true }, context)))
    expect(readable.session.schema_version).toBe("rev_runtime_session.v1")
  })

  it("blocks strict promotion when a hashed history is tampered", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-strict-history-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(String(await mod.default.execute({
      command: "init",
      target: "sample",
      observationContract: "strict",
      jsonOnly: true,
    }, context)))
    const sessionPath = init.session_path
    const storedPath = path.join(root, sessionPath)
    const stored = JSON.parse(await readFile(storedPath, "utf8"))
    stored.history[0].summary = "tampered strict init event"
    await writeFile(storedPath, JSON.stringify(stored, null, 2))

    const invalid = JSON.parse(String(await mod.default.execute({ command: "verify-history", sessionPath, jsonOnly: true }, context)))
    expect(invalid.history_verification.status).toBe("invalid")
    await expect(mod.default.execute({
      command: "set-stage",
      sessionPath,
      stage: "oracle_verified",
      jsonOnly: true,
    }, context)).rejects.toThrow("runtime history integrity is invalid")
  })
  it("rejects an unsupported observation contract", async () => {
    const mod = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-session-contract-invalid-")
    const context = { directory: root, worktree: root } as never
    await expect(mod.default.execute({
      command: "init",
      target: "sample",
      observationContract: "unsafe",
      jsonOnly: true,
    }, context)).rejects.toThrow("unsupported observation contract")
  })
})
