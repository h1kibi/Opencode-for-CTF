import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { makeTestWorkspace } from "./support/test-workspace.ts"

function setupWorkspace(prefix: string) {
  const workspace = makeTestWorkspace(`${prefix}-workspace`)
  const challenge = join(workspace, "challenge")
  const other = makeTestWorkspace(`${prefix}-other`)
  mkdirSync(join(workspace, "bin"), { recursive: true })
  mkdirSync(challenge, { recursive: true })
  return { workspace, challenge, other }
}

describe("additional context-aware CTF tools", () => {
  it("ctf-rev live dump and unicorn replay helpers keep generated artifacts under worktree", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-live-unicorn")
    const target = join(workspace, "bin", "runner")
    const payloadFile = join(workspace, "bin", "payload.bin")
    writeFileSync(target, "#!/bin/sh\necho READY\n", "utf8")
    writeFileSync(payloadFile, "payload", "utf8")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const live = await import("../tools/rev/ctf-rev-live-memory-dump.ts")
      const liveOut = await live.default.execute({ target: "../bin/runner", workdir: "../bin", jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      const livePayload = JSON.parse(String(liveOut))
      expect(livePayload.target).toBe(target)
      expect(livePayload.workdir).toBe(join(workspace, "bin"))
      expect(livePayload.helper_script.replace(/\\/g, "/")).toBe("../work/rev-live-dump/rev_live_dump.sh")
      expect(existsSync(join(workspace, "work", "rev-live-dump", "rev_live_dump.sh"))).toBe(true)

      const replay = await import("../tools/rev/ctf-rev-unicorn-replay-builder.ts")
      const replayOut = await replay.default.execute(
        { payloadFile: "../bin/payload.bin", arch: "x86", mode: "64", jsonOnly: true },
        { directory: challenge, worktree: workspace } as never,
      )
      const replayPayload = JSON.parse(String(replayOut))
      expect(replayPayload.payload_file.replace(/\\/g, "/")).toBe("../bin/payload.bin")
      expect(replayPayload.replay_script.replace(/\\/g, "/")).toBe("../work/rev-unicorn-replay/unicorn_replay.py")
      expect(existsSync(join(workspace, "work", "rev-unicorn-replay", "unicorn_replay.py"))).toBe(true)
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-one-shot-triage resolves target relative to context.directory while allowing sibling challenge assets", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-one-shot")
    const target = join(workspace, "bin", "notes.txt")
    writeFileSync(target, "this bundle mentions flag{oneshot_ctx} and app.py", "utf8")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-one-shot-triage.ts")
      const out = await mod.default.execute({ target: "../bin/notes.txt", maxFiles: 5 }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(String(out)).toContain(`target: ${target}`)
      expect(String(out)).toContain("flag_candidate")
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-rev-closure-ladder writes plans under worktree when context.directory is a challenge subdir", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-closure")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/rev/ctf-rev-closure-ladder.ts")
      const out = await mod.default.execute(
        { evidence: "checker uses xor transform and z3 constraints", outDir: "work/custom-closure" },
        { directory: challenge, worktree: workspace } as never,
      )
      expect(existsSync(join(workspace, "work", "custom-closure", "closure-plan.json"))).toBe(true)
      expect(String(out).replace(/\\/g, "/")).toContain("closure_plan_path: ../work/custom-closure/closure-plan.json")
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-local-harness-verifier writes generated harnesses under worktree, not challenge subdir", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-harness-write")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-local-harness-verifier.ts")
      const out = await mod.default.execute(
        {
          operation: "write",
          language: "python",
          outDir: "work/harness-out",
          findingJson: JSON.stringify({ id: "ctx" }),
        },
        { directory: challenge, worktree: workspace } as never,
      )
      expect(String(out).replace(/\\/g, "/")).toContain("harness written: work/harness-out/")
      expect(existsSync(join(workspace, "work", "harness-out"))).toBe(true)
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-java-source-slice resolves source roots from context.directory inside worktree", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-java-slice")
    const src = join(workspace, "src", "main", "java", "ctf")
    mkdirSync(src, { recursive: true })
    writeFileSync(
      join(src, "DemoController.java"),
      'import org.springframework.web.bind.annotation.*; class DemoController { @GetMapping("/flag") String f(@RequestParam String q){ return q; } }',
      "utf8",
    )

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/java/ctf-java-source-slice.ts")
      const out = await mod.default.execute({ target: "../src" }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(String(out)).toContain("route-file:")
      expect(String(out)).toContain("DemoController.java")
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-decision-state defaults to worktree-root state and keeps chain state adjacent", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-decision-ctx")
    writeFileSync(join(workspace, ".ctf-chain-state.json"), JSON.stringify({ chains: [] }), "utf8")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-decision-state.ts")
      const out = await mod.default.execute({ operation: "init" }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(existsSync(join(workspace, ".ctf-decision-state.json"))).toBe(true)
      expect(existsSync(join(challenge, ".ctf-decision-state.json"))).toBe(false)
      expect(String(out)).toContain("mode: medium")
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-whitebox-handoff stores state under worktree and verifies sibling source evidence", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-whitebox-ctx")
    const source = join(workspace, "src", "Demo.java")
    mkdirSync(join(workspace, "src"), { recursive: true })
    writeFileSync(source, "class Demo { void sink() {} }\n", "utf8")

    const prev = process.cwd()
    process.chdir(other)
    try {
      // Dynamic import: module resolution depends on the cwd set above.
      const mod = await import("../tools/web/ctf-whitebox-handoff.ts")
      await mod.default.execute({ operation: "init", jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(existsSync(join(workspace, ".ctf-whitebox-handoff.json"))).toBe(true)
      expect(existsSync(join(challenge, ".ctf-whitebox-handoff.json"))).toBe(false)

      const gate = await mod.default.execute(
        {
          operation: "gate",
          findingJson: JSON.stringify({ id: "f1", file: "../src/Demo.java", line: 1, snippet: "void sink()" }),
          gateJson: JSON.stringify({ controllability: "user", sink_or_condition: "sink", oracle_or_harness: "mock" }),
        },
        { directory: challenge, worktree: workspace } as never,
      )
      const gateResult = JSON.parse(String(gate))
      expect(gateResult.verdict).toBe("confirmed")
    } finally {
      process.chdir(prev)
    }
  })
})
