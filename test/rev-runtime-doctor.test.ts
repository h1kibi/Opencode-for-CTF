import { createHash } from "node:crypto"
import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { revRuntimeValueSha256 } from "../packages/ctf-core/src/rev-runtime-session.ts"
import { revRuntimeDoctorSpecs, runRevRuntimeDoctor } from "../tools/lib/rev-runtime-doctor.ts"

async function tempRoot(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

describe("Rev runtime doctor, observation digests, and evidence anchors", () => {
  it("uses a fixed read-only probe matrix without accepting a challenge path", () => {
    expect(revRuntimeDoctorSpecs.length).toBeGreaterThan(5)
    for (const spec of revRuntimeDoctorSpecs) {
      expect(spec.args.join(" ")).not.toMatch(/challenge|target|payload\.bin/i)
      expect(spec.command).not.toMatch(/sh|cmd|powershell/i)
    }
  })

  // This test launches the complete fixed probe matrix; process startup on Windows can exceed Vitest's 5s unit default.
  it("returns a classified capability snapshot from fixed probes", async () => {
    const doctor = await runRevRuntimeDoctor({ cwd: await tempRoot("ctf-rev-doctor-"), timeoutMs: 1000 })
    expect(["pass", "partial", "fail", "unavailable"]).toContain(doctor.status)
    expect(doctor.source).toBe("ctf-rev-runtime-doctor")
    expect(doctor.checks.every((check) => /^[a-z0-9_-]+$/.test(check.id))).toBe(true)
    expect(
      doctor.checks.every((check) => check.output_sha256 == null || /^[a-f0-9]{64}$/.test(check.output_sha256)),
    ).toBe(true)
  }, 15000)

  it("summarizes raw observation fields and never stores the raw payload", async () => {
    const runtime = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-observation-digest-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(
      String(await runtime.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)),
    )
    const sessionPath = init.session_path as string
    const rawRegisters = { rbx: "0x2", rax: "0x1" }
    const rawMemory = { bytes: [1, 2, 3], base: "0x400000" }
    const rawTrace = ["0x401000", "0x401004"]
    const result = JSON.parse(
      String(
        await runtime.default.execute(
          {
            command: "record-observation",
            sessionPath,
            observationJson: JSON.stringify({
              id: "obs-auto-digest",
              kind: "native",
              status: "pass",
              input: { secret: "not persisted" },
              payload: "payload bytes",
              stdout: "flag-like output",
              stderr: "warning",
              registers: rawRegisters,
              memory: rawMemory,
              trace: rawTrace,
            }),
            jsonOnly: true,
          },
          context,
        ),
      ),
    )
    const observation = result.session.observations[0]
    expect(observation.input_sha256).toBe(revRuntimeValueSha256({ secret: "not persisted" }))
    expect(observation.payload_sha256).toBe(revRuntimeValueSha256("payload bytes"))
    expect(observation.stdout_sha256).toBe(createHash("sha256").update("flag-like output").digest("hex"))
    expect(observation.registers_sha256).toBe(revRuntimeValueSha256(rawRegisters))
    expect(observation.memory_sha256).toBe(revRuntimeValueSha256(rawMemory))
    expect(observation.trace_sha256).toBe(revRuntimeValueSha256(rawTrace))
    expect(observation.digest_sources).toEqual(["input", "memory", "payload", "registers", "stderr", "stdout", "trace"])
    expect(observation).not.toHaveProperty("input")
    expect(observation).not.toHaveProperty("payload")
    expect(observation).not.toHaveProperty("stdout")
    expect(observation).not.toHaveProperty("registers")
    const stored = JSON.parse(await readFile(path.join(root, sessionPath), "utf8"))
    expect(stored.observations[0]).not.toHaveProperty("memory")
  })

  it("creates a verifiable external anchor and detects later session mutation", async () => {
    const runtime = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-anchor-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(
      String(await runtime.default.execute({ command: "init", target: "sample", jsonOnly: true }, context)),
    )
    const sessionPath = init.session_path as string
    await expect(
      runtime.default.execute(
        {
          command: "anchor-evidence",
          sessionPath,
          anchorPath: sessionPath,
          jsonOnly: true,
        },
        context,
      ),
    ).rejects.toThrow("external evidence anchor path must differ from the runtime session path")
    const anchored = JSON.parse(
      String(await runtime.default.execute({ command: "anchor-evidence", sessionPath, jsonOnly: true }, context)),
    )
    expect(anchored.session.evidence_anchor.status).toBe("verified")
    expect(anchored.evidence_anchor_verification.status).toBe("verified")
    const sidecarPath = path.join(root, `${sessionPath}.anchor.json`)
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"))
    expect(sidecar.schema_version).toBe("rev_runtime_anchor.v1")
    expect(sidecar.session_sha256).toMatch(/^[a-f0-9]{64}$/)

    await runtime.default.execute(
      {
        command: "update",
        sessionPath,
        patchJson: JSON.stringify({ blocking: ["changed after anchor"] }),
        jsonOnly: true,
      },
      context,
    )
    const checked = JSON.parse(
      String(
        await runtime.default.execute({ command: "verify-evidence-anchor", sessionPath, jsonOnly: true }, context),
      ),
    )
    expect(checked.evidence_anchor_verification.status).toBe("mismatch")
    expect(checked.session.evidence_anchor.status).toBe("mismatch")
  })
  it("rejects strict promotion during stage preflight when an external anchor disappears", async () => {
    const runtime = await import("../tools/rev/ctf-rev-runtime-session.ts")
    const root = await tempRoot("ctf-rev-anchor-preflight-")
    const context = { directory: root, worktree: root } as never
    const init = JSON.parse(
      String(
        await runtime.default.execute(
          {
            command: "init",
            target: "sample",
            observationContract: "strict",
            substrate: "local",
            arch: "x86",
            mode: "64",
            jsonOnly: true,
          },
          context,
        ),
      ),
    )
    const sessionPath = init.session_path as string

    for (const observation of [
      { id: "native-1", kind: "native", status: "pass", stdout_sha256: "same-output" },
      { id: "replay-1", kind: "replay", status: "pass", stdout_sha256: "same-output" },
      {
        id: "comparison-1",
        kind: "comparison",
        status: "pass",
        stdout_sha256: "same-output",
        related_observation_ids: ["native-1", "replay-1"],
      },
    ]) {
      await runtime.default.execute(
        {
          command: "record-observation",
          sessionPath,
          observationJson: JSON.stringify(observation),
          jsonOnly: true,
        },
        context,
      )
    }
    await runtime.default.execute(
      {
        command: "set-oracle",
        sessionPath,
        oracleStatus: "pass",
        oracleEvidence: "native and replay agree",
        observationIdsJson: JSON.stringify(["native-1", "replay-1", "comparison-1"]),
        jsonOnly: true,
      },
      context,
    )

    const anchored = JSON.parse(
      String(await runtime.default.execute({ command: "anchor-evidence", sessionPath, jsonOnly: true }, context)),
    )
    expect(anchored.evidence_anchor_verification.status).toBe("verified")
    await unlink(path.join(root, `${sessionPath}.anchor.json`))

    await expect(
      runtime.default.execute({ command: "set-stage", sessionPath, stage: "closed", jsonOnly: true }, context),
    ).rejects.toThrow("external evidence anchor is missing")
    const checked = JSON.parse(
      String(
        await runtime.default.execute({ command: "verify-evidence-anchor", sessionPath, jsonOnly: true }, context),
      ),
    )
    expect(checked.evidence_anchor_verification.status).toBe("missing")
    expect(checked.session.promotion.allowed).toBe(false)
  })
})
