import { readFile, rm } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

const HYPOTHESES = [
  {
    id: "H1",
    primitive: "fmt leak",
    value: 4,
    confidence: 0.6,
    infoGain: 0.8,
    cost: 2,
    risk: 1,
    stateDamage: 1,
    stability: 0.7,
    closureDelta: 0.5,
    branchKillValue: 0.6,
  },
  {
    id: "H2",
    primitive: "heap overlap",
    value: 3,
    confidence: 0.4,
    infoGain: 0.6,
    cost: 3,
    risk: 2,
    stateDamage: 2,
    stability: 0.5,
    closureDelta: 0.3,
    branchKillValue: 0.4,
  },
]

function field(text: string, label: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${label}:`))
    ?.slice(label.length + 1)
    .trim()
}

function rankedOrder(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => /^- H\d+ score=/.test(line.trim()))
    .map((line) => line.trim().split(" ")[1])
}

async function withWorkspace(name: string, run: (workspace: string) => Promise<void>) {
  const workspace = await makeTestWorkspaceAsync(name)
  try {
    await run(workspace)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

describe("ctf-decision-state", () => {
  it("ranks hypotheses by score and names the contract each one lacks", async () => {
    await withWorkspace("ctf-decision-init", async (workspace) => {
      const module = await import("../tools/core/ctf-decision-state.ts")
      const execute = module.default.execute as Execute

      const text = await execute(
        { operation: "init", mode: "medium", hypothesesJson: JSON.stringify(HYPOTHESES) },
        { directory: workspace, worktree: workspace },
      )

      expect(text).toContain("operation: init")
      expect(field(text, "mode")).toBe("medium")
      expect(field(text, "active_hypotheses")).toBe("2")
      expect(field(text, "primitive_locked")).toBe("no")
      expect(rankedOrder(text)).toEqual(["H1", "H2"])
      expect(text).toContain("missing_next_test: H1")
    })
  })

  it("blocks a probe that does not state its confirm and falsify conditions", async () => {
    await withWorkspace("ctf-decision-probe", async (workspace) => {
      const module = await import("../tools/core/ctf-decision-state.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }
      await execute({ operation: "init", hypothesesJson: JSON.stringify(HYPOTHESES) }, context)

      const text = await execute({ operation: "probe", probeJson: JSON.stringify({ hypothesisId: "H1" }) }, context)

      expect(text).toContain("BLOCK: invalid_probe_contract")
      expect(text).toContain("missing family, variable, confirm, falsify, distinguish")
    })
  })

  it("refuses to mark a hypothesis that is not in the ledger", async () => {
    await withWorkspace("ctf-decision-unknown", async (workspace) => {
      const module = await import("../tools/core/ctf-decision-state.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }
      await execute({ operation: "init", hypothesesJson: JSON.stringify(HYPOTHESES) }, context)

      const text = await execute(
        { operation: "mark_falsified", actionJson: JSON.stringify({ hypothesisId: "H9" }) },
        context,
      )

      expect(text).toContain("BLOCK: unknown hypothesisId 'H9'")
      expect(field(text, "active_hypotheses")).toBe("2")
    })
  })

  it("drops a falsified hypothesis out of the active set", async () => {
    await withWorkspace("ctf-decision-falsify", async (workspace) => {
      const module = await import("../tools/core/ctf-decision-state.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }
      await execute({ operation: "init", hypothesesJson: JSON.stringify(HYPOTHESES) }, context)

      const text = await execute(
        { operation: "mark_falsified", actionJson: JSON.stringify({ hypothesisId: "H2" }) },
        context,
      )

      expect(field(text, "active_hypotheses")).toBe("1")
      expect(rankedOrder(text)).toEqual(["H1"])

      const state = JSON.parse(await readFile(path.join(workspace, ".ctf-decision-state.json"), "utf8"))
      const h2 = state.hypotheses.find((entry: { id: string }) => entry.id === "H2")
      expect(h2.status).toBe("killed")
    })
  })

  it("inserts a new hypothesis and re-ranks the ledger", async () => {
    await withWorkspace("ctf-decision-insert", async (workspace) => {
      const module = await import("../tools/core/ctf-decision-state.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }
      await execute({ operation: "init", hypothesesJson: JSON.stringify(HYPOTHESES) }, context)

      const text = await execute(
        {
          operation: "add_hypothesis",
          actionJson: JSON.stringify({
            id: "H3",
            primitive: "ret2csu",
            value: 2,
            confidence: 0.3,
            infoGain: 0.4,
            cost: 1,
            risk: 1,
            stateDamage: 1,
            stability: 0.8,
            closureDelta: 0.2,
            branchKillValue: 0.2,
          }),
        },
        context,
      )

      expect(rankedOrder(text)).toEqual(["H1", "H3", "H2"])
      expect(field(text, "active_hypotheses")).toBe("3")
    })
  })

  it("persists every operation into the state file", async () => {
    await withWorkspace("ctf-decision-persist", async (workspace) => {
      const module = await import("../tools/core/ctf-decision-state.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }
      await execute({ operation: "init", hypothesesJson: JSON.stringify(HYPOTHESES) }, context)
      await execute({ operation: "snapshot", actionJson: JSON.stringify({ note: "checkpoint" }) }, context)

      const state = JSON.parse(await readFile(path.join(workspace, ".ctf-decision-state.json"), "utf8"))

      expect(state.version).toBeGreaterThanOrEqual(1)
      expect(state.hypotheses).toHaveLength(2)
      expect(state.history.map((entry: { kind: string }) => entry.kind)).toEqual(
        expect.arrayContaining(["init", "action_result"]),
      )
      expect(typeof state.createdAt).toBe("string")
      expect(typeof state.updatedAt).toBe("string")
    })
  })

  it("refuses a closure gate that names no primitive or probe", async () => {
    await withWorkspace("ctf-decision-closure-gate", async (workspace) => {
      const module = await import("../tools/core/ctf-decision-state.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }
      await execute({ operation: "init", hypothesesJson: JSON.stringify(HYPOTHESES) }, context)

      const text = await execute({ operation: "gate", gate: "closure", gateJson: JSON.stringify({}) }, context)

      expect(text).toContain("BLOCK: closure gate")
      expect(text).toContain("missing primitive")
      expect(text).toContain("missing closureOwner")
      expect(text).toContain("closure gate requires at least one ordered closure probe")
      expect(field(text, "closure_gate_passed")).toBe("no")
    })
  })

  it("refuses a zero-hit knowledge gate that was never queried", async () => {
    await withWorkspace("ctf-decision-knowledge-gate", async (workspace) => {
      const module = await import("../tools/core/ctf-decision-state.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }
      await execute({ operation: "init", hypothesesJson: JSON.stringify(HYPOTHESES) }, context)

      const text = await execute(
        {
          operation: "gate",
          gate: "knowledge",
          gateJson: JSON.stringify({
            knowledgeMode: "no_match",
            matchedSegments: 0,
            noMatchReason: "corpus has no match",
          }),
        },
        context,
      )

      expect(text).toContain("BLOCK: knowledge gate")
      expect(text).toContain("queryRun must be true")
      expect(text).toContain("zero-hit knowledge gate requires nextModelHypothesis")
    })
  })
})
