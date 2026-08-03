import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { handleToolExecuteAfter, handleToolExecuteBefore, normalizeToolExecutionMeta } from "../src/hooks/tool-hooks.ts"

function hookArgs(directory: string, meta: Record<string, unknown>, output: Record<string, unknown> = {}) {
  return {
    meta,
    output,
    pluginConfig: { disabled_hooks: [] },
    enabledPacks: new Set<string>(),
    input: { client: {}, worktree: directory, directory },
    isHookEnabled: () => false,
    expertReadinessReport: () => ({ ready: true }),
    expertReadinessFailureText: () => "expert readiness failed",
  }
}

describe("tool hook runtime metadata contract", () => {
  it("normalizes canonical top-level metadata", () => {
    expect(normalizeToolExecutionMeta({ sessionID: "s1", tool: "bash", agent: "ctf-expert" }, {})).toEqual({
      sessionID: "s1",
      toolName: "bash",
      rawAgent: "ctf-expert",
    })
  })

  it("accepts common host aliases", () => {
    expect(normalizeToolExecutionMeta({ sessionId: "s2", toolName: "bash", agentType: "ctf-expert" }, {})).toEqual({
      sessionID: "s2",
      toolName: "bash",
      rawAgent: "ctf-expert",
    })
  })

  it("accepts nested adapter metadata", () => {
    expect(
      normalizeToolExecutionMeta(
        {
          metadata: {
            sessionId: "s3",
            tool: { name: "bash" },
            agent: { name: "ctf-expert" },
          },
        },
        {},
      ),
    ).toEqual({ sessionID: "s3", toolName: "bash", rawAgent: "ctf-expert" })
  })

  it("prefers canonical fields even when aliases occur in an earlier container", () => {
    expect(
      normalizeToolExecutionMeta(
        { sessionId: "alias-session", toolName: "alias-tool", agentType: "ctf-fast" },
        { sessionID: "canonical-session", tool: "bash", agent: "ctf-expert" },
      ),
    ).toEqual({ sessionID: "canonical-session", toolName: "bash", rawAgent: "ctf-expert" })
  })

  it("keeps a missing session identity undefined", () => {
    expect(normalizeToolExecutionMeta({ tool: "read", agent: "ctf-expert" }, {})).toEqual({
      sessionID: undefined,
      toolName: "read",
      rawAgent: "ctf-expert",
    })
  })

  it("routes alias metadata through the real Expert before-hook gate", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-hook-contract-expert-"))
    try {
      await expect(
        handleToolExecuteBefore(
          hookArgs(directory, {
            sessionId: "contract-session",
            agentType: "ctf-expert",
            toolName: "bash",
          }),
        ),
      ).rejects.toThrow("before the first Team Mode wave")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("recognizes alias tool metadata in the after-hook enrichment path", async () => {
    const output: Record<string, unknown> = { output: "one\ntwo" }
    await handleToolExecuteAfter({
      meta: { toolName: "grep" },
      output,
      isHookEnabled: () => false,
    })
    expect(output.metadata).toEqual({ resultCount: 2, enriched: true })
  })
})

describe("tool hook deny-before-execute contract", () => {
  it("does not invoke the executor when Expert pre-Team policy denies", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-hook-deny-expert-"))
    try {
      let executeCalls = 0
      await expect(
        (async () => {
          await handleToolExecuteBefore(
            hookArgs(directory, {
              sessionID: "expert-deny-session",
              agent: "ctf-expert",
              tool: "bash",
            }),
          )
          executeCalls++
        })(),
      ).rejects.toThrow("before the first Team Mode wave")
      expect(executeCalls).toBe(0)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("does not invoke the executor when a worker identity mismatch is denied", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-hook-deny-worker-"))
    try {
      const now = new Date().toISOString()
      await writeFile(
        path.join(directory, ".ctf-team.json"),
        JSON.stringify({
          schemaVersion: 1,
          revision: 1,
          updatedAt: now,
          runs: [
            {
              id: "team-1",
              title: "identity",
              objective: "test",
              parentSessionID: "parent-1",
              status: "running",
              createdAt: now,
              updatedAt: now,
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
                  createdAt: now,
                  updatedAt: now,
                },
              ],
            },
          ],
        }),
        "utf8",
      )

      let executeCalls = 0
      await expect(
        (async () => {
          await handleToolExecuteBefore(
            hookArgs(directory, {
              sessionId: "worker-1",
              agentType: "ctf-rev",
              toolName: "bash",
            }),
          )
          executeCalls++
        })(),
      ).rejects.toThrow("Agent identity mismatch")
      expect(executeCalls).toBe(0)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("does not invoke the executor when Team dispatch arguments fail the gate", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-hook-deny-dispatch-"))
    try {
      let executeCalls = 0
      await expect(
        (async () => {
          await handleToolExecuteBefore(
            hookArgs(directory, {
              sessionID: "dispatch-deny-session",
              agent: "ctf-expert",
              tool: "ctf-team-dispatch",
            }),
          )
          executeCalls++
        })(),
      ).rejects.toThrow("Evidence board is not initialized")
      expect(executeCalls).toBe(0)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
