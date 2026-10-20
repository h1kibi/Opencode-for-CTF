import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

async function tempRoot(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

async function initSession(root: string) {
  const runtime = await import("../tools/rev/ctf-rev-runtime-session.ts")
  const context = { directory: root, worktree: root } as never
  const result = JSON.parse(
    String(
      await runtime.default.execute(
        { command: "init", target: "challenge.bin", family: "elf", substrate: "docker", jsonOnly: true },
        context,
      ),
    ),
  )
  return { runtime, context, sessionPath: result.session_path as string }
}

describe("Rev runtime tool integration", () => {
  it("links live dump artifacts and advances only to prepared", async () => {
    const root = await tempRoot("ctf-rev-live-session-")
    await writeFile(path.join(root, "challenge.bin"), "fixture")
    const { context, sessionPath } = await initSession(root)
    const live = await import("../tools/rev/ctf-rev-live-memory-dump.ts")

    const result = JSON.parse(
      String(
        await live.default.execute(
          {
            target: "challenge.bin",
            marker: "READY",
            dumpStart: "0x400000",
            dumpSize: "0x1000",
            outDir: "work/live",
            sessionPath,
            jsonOnly: true,
          },
          context,
        ),
      ),
    )
    const session = JSON.parse(await readFile(path.join(root, sessionPath), "utf8"))

    expect(result.runtime_session.linked).toBe(true)
    expect(session.stage).toBe("prepared")
    expect(session.substrate.kind).toBe("docker")
    expect(session.artifacts.map((item: { kind: string }) => item.kind)).toEqual(
      expect.arrayContaining(["payload-dump", "live-dump-helper"]),
    )
    expect(session.artifacts.every((item: { path: string }) => !path.isAbsolute(item.path))).toBe(true)
    expect(session.promotion.allowed).toBe(false)
  })

  it("links replay payload/script with exact Unicorn substrate metadata", async () => {
    const root = await tempRoot("ctf-rev-replay-session-")
    await writeFile(path.join(root, "challenge.bin"), "fixture")
    await writeFile(path.join(root, "payload.bin"), Buffer.from([0xc3]))
    const { context, sessionPath } = await initSession(root)
    const replay = await import("../tools/rev/ctf-rev-unicorn-replay-builder.ts")

    await replay.default.execute(
      {
        payloadFile: "payload.bin",
        arch: "x86_64",
        mode: "64",
        outDir: "work/replay",
        sessionPath,
        jsonOnly: true,
      },
      context,
    )
    const session = JSON.parse(await readFile(path.join(root, sessionPath), "utf8"))

    expect(session.stage).toBe("prepared")
    expect(session.substrate).toMatchObject({ kind: "unicorn", arch: "x86", mode: "64" })
    expect(session.artifacts.map((item: { kind: string }) => item.kind)).toEqual(
      expect.arrayContaining(["payload-input", "unicorn-replay-script"]),
    )
    expect(session.artifacts.map((item: { path: string }) => item.path)).toEqual(
      expect.arrayContaining(["payload.bin", "work/replay/unicorn_replay.py"]),
    )
  })

  it("links closure plan and ledger without falsely promoting the session", async () => {
    const root = await tempRoot("ctf-rev-closure-session-")
    await writeFile(path.join(root, "challenge.bin"), "fixture")
    const { context, sessionPath } = await initSession(root)
    const closure = await import("../tools/rev/ctf-rev-closure-ladder.ts")

    await closure.default.execute(
      {
        evidence: "packed checker compare with xor transform",
        primitive: "xor_table",
        outDir: "work/closure",
        sessionPath,
        syncState: false,
        jsonOnly: true,
      },
      context,
    )
    const session = JSON.parse(await readFile(path.join(root, sessionPath), "utf8"))

    expect(session.evidence_refs).toEqual(
      expect.arrayContaining(["work/closure/closure-plan.json", "work/closure/rev-closure-ledger.md"]),
    )
    expect(session.artifacts.map((item: { kind: string }) => item.kind)).toEqual(
      expect.arrayContaining(["closure-plan", "closure-ledger"]),
    )
    expect(session.stage).toBe("planned")
    expect(session.promotion.allowed).toBe(false)
  })

  it("inspects artifact integrity and marks changed or deleted files", async () => {
    const root = await tempRoot("ctf-rev-artifact-integrity-")
    const artifactPath = path.join(root, "payload.bin")
    await writeFile(path.join(root, "challenge.bin"), "fixture")
    await writeFile(artifactPath, Buffer.from("before"))
    const { runtime, context, sessionPath } = await initSession(root)

    await runtime.default.execute(
      {
        command: "record-artifact",
        sessionPath,
        artifactJson: JSON.stringify({ path: "payload.bin", kind: "payload", source: "test", status: "generated" }),
        jsonOnly: true,
      },
      context,
    )
    const available = JSON.parse(
      String(await runtime.default.execute({ command: "inspect-artifacts", sessionPath, jsonOnly: true }, context)),
    )
    expect(available.session.artifacts[0]).toMatchObject({ status: "available", size: 6 })
    expect(available.session.artifacts[0].sha256).toMatch(/^[a-f0-9]{64}$/)

    await writeFile(artifactPath, Buffer.from("after-change"))
    const stale = JSON.parse(
      String(await runtime.default.execute({ command: "inspect-artifacts", sessionPath, jsonOnly: true }, context)),
    )
    expect(stale.session.artifacts[0].status).toBe("stale")
    const staleAgain = JSON.parse(
      String(await runtime.default.execute({ command: "inspect-artifacts", sessionPath, jsonOnly: true }, context)),
    )
    expect(staleAgain.session.artifacts[0].status).toBe("stale")
    await runtime.default.execute(
      {
        command: "set-oracle",
        sessionPath,
        oracleStatus: "pass",
        oracleEvidence: "oracle captured before artifact changed",
        jsonOnly: true,
      },
      context,
    )
    await expect(
      runtime.default.execute({ command: "set-stage", sessionPath, stage: "closed", jsonOnly: true }, context),
    ).rejects.toThrow("runtime artifact integrity is stale")
    expect(stale.session.history.map((event: { operation: string }) => event.operation)).toEqual(
      expect.arrayContaining(["record_artifact", "inspect_artifacts"]),
    )

    await (await import("node:fs/promises")).unlink(artifactPath)
    const missing = JSON.parse(
      String(await runtime.default.execute({ command: "inspect-artifacts", sessionPath, jsonOnly: true }, context)),
    )
    expect(missing.session.artifacts[0].status).toBe("missing")
    expect(
      missing.session.history.filter((event: { operation: string }) => event.operation === "inspect_artifacts").length,
    ).toBe(4)
  })
})
