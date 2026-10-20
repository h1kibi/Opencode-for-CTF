import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  enforceWorkerToolPolicy,
  evaluateUnreadableWorkerStatePolicy,
  evaluateUnboundWorkerPolicy,
  evaluateWorkerToolPolicy,
  isWorkerDeniedTool,
  scanWorkerArguments,
  type WorkerContext,
} from "../src/worker-policy.ts"

const context: WorkerContext = {
  runId: "team-1",
  jobId: "job-1",
  parentSessionID: "parent-1",
  routeId: "R1",
  agent: "ctf-pwn",
  status: "running",
  retryPending: false,
}

describe("worker runtime policy", () => {
  it("rejects missing tool identity and stale worker lifecycle states", () => {
    expect(evaluateWorkerToolPolicy(context, "").allowed).toBe(false)
    expect(evaluateWorkerToolPolicy({ ...context, status: "completed" }, "bash").allowed).toBe(false)
    expect(evaluateWorkerToolPolicy({ ...context, status: "running", retryPending: true }, "bash").allowed).toBe(false)
  })

  it("denies shared-state tools", () => {
    for (const tool of [
      "edit",
      "write",
      "apply_patch",
      "ctf-evidence-board",
      "ctf-team-close",
      "ctf-team-recover",
      "ctf-team-adopt",
      "ctf-team-future-control",
      "ctf-team-mode",
      "ctf-continuation-control",
      "ctf-skill-mcp-lifecycle",
      "ctf-whitebox-handoff",
      "ctf-file-write-matrix",
    ]) {
      const result = evaluateWorkerToolPolicy(context, tool)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("WorkerPolicyError")
    }
  })

  it("denies future Team-prefixed tools without requiring a policy-list edit", () => {
    expect(isWorkerDeniedTool("ctf-team-new-control-plane-action")).toBe(true)
    expect(evaluateWorkerToolPolicy(context, "ctf-team-new-control-plane-action").allowed).toBe(false)
  })

  it("recursively scans nested arrays and JSON-encoded argument objects", () => {
    const scanned = scanWorkerArguments({
      envelope: {
        commands: [{ scriptPath: "runtime/state/worker.py" }],
      },
      encoded: JSON.stringify({ payload: { outputPath: "work/ctf-evidence/demo/Evidence.md" } }),
    })
    expect(scanned.some((entry) => entry.value === "runtime/state/worker.py")).toBe(true)
    expect(scanned.some((entry) => entry.value === "work/ctf-evidence/demo/Evidence.md")).toBe(true)
  })

  it("blocks protected paths hidden in nested and JSON-encoded execution arguments", () => {
    expect(
      evaluateWorkerToolPolicy(context, "ctf-python-inline", {
        envelope: {
          execution: {
            code: 'from pathlib import Path; Path("Evidence.md").write_text("worker finding")',
          },
        },
      }).allowed,
    ).toBe(false)
    expect(
      evaluateWorkerToolPolicy(context, "ctf-python-inline", {
        input: JSON.stringify({ code: 'open("runtime/state/worker.txt", "w").write("x")' }),
      }).allowed,
    ).toBe(false)
    expect(
      evaluateWorkerToolPolicy(context, "ctf-background-job", {
        envelope: [{ options: { scriptPath: "runtime/state/worker.py" } }],
      }).allowed,
    ).toBe(false)
    expect(
      evaluateWorkerToolPolicy(context, "bash", {
        payload: JSON.stringify({ command: "echo finding >> work/ctf-evidence/demo/Evidence.md" }),
      }).allowed,
    ).toBe(false)
  })

  it("denies shell access to protected CTF state", () => {
    const result = evaluateWorkerToolPolicy(context, "bash", {
      command: "echo finding >> work/ctf-evidence/demo/Evidence.md",
    })

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("protected shared state")
  })

  it("blocks protected writes hidden inside executable helper arguments", () => {
    expect(
      evaluateWorkerToolPolicy(context, "ctf-python-inline", {
        code: 'from pathlib import Path; Path("Evidence.md").write_text("worker finding")',
      }).allowed,
    ).toBe(false)
    expect(
      evaluateWorkerToolPolicy(context, "ctf-background-job", {
        operation: "start",
        scriptPath: "runtime/state/worker.py",
      }).allowed,
    ).toBe(false)
    expect(
      evaluateWorkerToolPolicy(context, "ctf-python-inline", {
        code: 'print(open("Evidence.md", encoding="utf8").read())',
      }).allowed,
    ).toBe(true)
  })

  it("allows ordinary temporary analysis commands", () => {
    expect(
      evaluateWorkerToolPolicy(context, "bash", {
        command: "python -c \\\"print('probe')\\\"",
        workdir: "C:/tmp/challenge",
      }).allowed,
    ).toBe(true)
  })

  it("does not block a read-only command that mentions no protected state", () => {
    expect(evaluateWorkerToolPolicy(context, "bash", { command: "strings sample.bin | head" }).allowed).toBe(true)
  })

  it("denies an unspaced redirect into protected state", () => {
    // Regression: `>file` (no space) previously matched neither boundary rule,
    // so the whole protected-path policy was bypassable with the most common
    // redirection spelling.
    for (const command of [
      "echo x>Evidence.md",
      "echo x>.ctf-team.json",
      "echo pwned>agent_flag.txt",
      "(echo x)>Evidence.md",
      "echo x 2>Evidence.md",
      "printf x>notes.md",
    ]) {
      const result = evaluateWorkerToolPolicy(context, "bash", { command })
      expect(result.allowed, command).toBe(false)
      expect(result.reason).toContain("WorkerPolicyError")
    }
  })

  it("still allows ordinary redirects to non-protected challenge artifacts", () => {
    for (const command of [
      "objdump -d chall > disasm.txt",
      "cat chall.bin > copy.bin",
      "strings chall.bin | head",
      "terraform plan",
      "echo forming",
    ]) {
      expect(evaluateWorkerToolPolicy(context, "bash", { command }).allowed, command).toBe(true)
    }
  })

  it("denies shell metacharacters in execution arguments", () => {
    // `argv` is joined into one shell command line by the host, so it is
    // command text and must not carry metacharacters.
    for (const argv of [["&echo x>Evidence.md"], ["a; rm -rf /"], ["$(id)"], ["x|tee Evidence.md"], ["`id`"]]) {
      const result = evaluateWorkerToolPolicy(context, "ctf-python-inline", { code: "print(1)", argv })
      expect(result.allowed, JSON.stringify(argv)).toBe(false)
    }
    expect(
      evaluateWorkerToolPolicy(context, "ctf-python-inline", { code: "print(1)", argv: ["--flag", "./chall"] }).allowed,
    ).toBe(true)
  })

  it("denies obfuscated protected-path construction in execution code", () => {
    // Regression: a literal-only match was defeated by building the filename
    // from fragments, so the check now also matches the distinctive stem.
    for (const code of [
      'pathlib.Path(".ctf-team"+chr(46)+"json").write_text("{}")',
      'p=".ctf-team"+"."+"json"; open(p,"w").write("x")',
      'open("Evidence.md","w").write("x")',
    ]) {
      expect(evaluateWorkerToolPolicy(context, "ctf-python-inline", { code }).allowed, code).toBe(false)
    }
    expect(
      evaluateWorkerToolPolicy(context, "ctf-python-inline", { code: 'open("solve_out.txt","w").write("ok")' }).allowed,
    ).toBe(true)
  })

  it("applies the protected-state rule to pwn runner execution arguments", () => {
    expect(
      evaluateWorkerToolPolicy(context, "ctf-pwn-docker-runner", {
        pythonInline: 'open("Evidence.md","w").write("x")',
      }).allowed,
    ).toBe(false)
    expect(evaluateWorkerToolPolicy(context, "ctf-pwn-runner", { payload: "payload.bin" }).allowed).toBe(true)
  })

  it("fails closed for high-privilege tools when Team state is unreadable", () => {
    expect(evaluateUnreadableWorkerStatePolicy("ctf-continuation-control").allowed).toBe(false)
    expect(evaluateUnreadableWorkerStatePolicy("bash", { command: "echo x >> Evidence.md" }).allowed).toBe(false)
    expect(evaluateUnreadableWorkerStatePolicy("bash", { command: "strings sample.bin | head" }).allowed).toBe(true)
  })

  it("fails closed for unbound CTF subagents instead of allowing a session bypass", () => {
    expect(evaluateUnboundWorkerPolicy("ctf-continuation-control").allowed).toBe(false)
    expect(evaluateUnboundWorkerPolicy("ctf-team-mode").allowed).toBe(false)
    expect(evaluateUnboundWorkerPolicy("bash", { command: "strings sample.bin | head" }).allowed).toBe(true)
    expect(evaluateUnboundWorkerPolicy("ctf-dynamic-mcp-advisor", { action: "request" }).allowed).toBe(true)
  })

  it("enforces the unbound fallback for identified CTF subagents", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-worker-unbound-state-"))
    try {
      await expect(
        enforceWorkerToolPolicy({
          directory,
          sessionID: "missing-worker-session",
          agentName: "ctf-pwn",
          toolName: "",
        }),
      ).rejects.toThrow("tool identity is missing")
      await expect(
        enforceWorkerToolPolicy({
          directory,
          sessionID: "missing-worker-session",
          agentName: "ctf-pwn",
          toolName: "ctf-continuation-control",
        }),
      ).rejects.toThrow("not bound to a persisted Team job")
      await expect(
        enforceWorkerToolPolicy({
          directory,
          sessionID: "missing-worker-session",
          agentName: "ctf-pwn",
          toolName: "bash",
          toolArgs: { command: "strings sample.bin | head" },
        }),
      ).resolves.toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("fails closed when a persisted worker session is presented as another agent", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-worker-identity-"))
    try {
      await writeFile(
        path.join(directory, ".ctf-team.json"),
        JSON.stringify({
          schemaVersion: 1,
          revision: 1,
          updatedAt: new Date().toISOString(),
          runs: [
            {
              id: "team-1",
              title: "identity",
              parentSessionID: "parent-1",
              status: "running",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              notificationPending: false,
              jobs: [
                {
                  id: "job-1",
                  title: "pwn",
                  objective: "test",
                  agent: "ctf-pwn",
                  routeId: "R1",
                  concurrency: "independent",
                  sessionID: "worker-1",
                  status: "running",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            },
          ],
        }),
        "utf8",
      )
      await expect(
        enforceWorkerToolPolicy({
          directory,
          sessionID: "worker-1",
          agentName: "ctf-rev",
          toolName: "bash",
          toolArgs: { command: "strings sample.bin" },
        }),
      ).rejects.toThrow("Agent identity mismatch")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("fails closed when persisted Team state has semantically invalid worker metadata", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-worker-invalid-state-"))
    try {
      await writeFile(
        path.join(directory, ".ctf-team.json"),
        JSON.stringify({
          schemaVersion: 1,
          revision: 1,
          updatedAt: new Date().toISOString(),
          runs: [
            {
              id: "team-1",
              parentSessionID: "parent-1",
              status: "running",
              jobs: [{ id: "job-1", sessionID: "worker-1", agent: "ctf-pwn", status: "not-a-real-status" }],
            },
          ],
        }),
        "utf8",
      )

      await expect(
        enforceWorkerToolPolicy({
          directory,
          sessionID: "worker-1",
          agentName: "ctf-pwn",
          toolName: "ctf-team-mode",
        }),
      ).rejects.toThrow("Team state is unreadable")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("enforces the unreadable-state fallback for identified CTF subagents", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-worker-corrupt-state-"))
    try {
      await writeFile(path.join(directory, ".ctf-team.json"), "{not-json", "utf8")
      await expect(
        enforceWorkerToolPolicy({
          directory,
          sessionID: "worker-session",
          agentName: "ctf-pwn",
          toolName: "ctf-team-mode",
        }),
      ).rejects.toThrow("Team state is unreadable")
      await expect(
        enforceWorkerToolPolicy({
          directory,
          sessionID: "unbound-worker-session",
          agentName: "ctf-pwn",
          toolName: "ctf-continuation-control",
        }),
      ).rejects.toThrow("Team state is unreadable")
      await expect(
        enforceWorkerToolPolicy({
          directory,
          sessionID: "worker-session",
          agentName: "ctf-pwn",
          toolName: "bash",
          toolArgs: { command: "strings sample.bin | head" },
        }),
      ).resolves.toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
