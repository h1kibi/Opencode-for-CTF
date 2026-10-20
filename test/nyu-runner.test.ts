import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execPath } from "node:process"
import { describe, expect, it } from "vitest"
import { loadNyuChallenges } from "../packages/ctf-benchmark-core/src/nyu.ts"
import {
  extractCandidateFlags,
  runNyuBenchmark,
  runNyuBenchmarkSuite,
  writeNyuBenchmarkResult,
  writeNyuBenchmarkSuiteResult,
} from "../packages/ctf-benchmark-core/src/runner.ts"

async function makeChallenge(flag = "flag{runner_pass}") {
  const root = await mkdtemp(join(tmpdir(), "nyu-runner-"))
  const challengeDir = join(root, "2021", "CSAW-Quals", "misc", "runner")
  await mkdir(join(challengeDir, "files"), { recursive: true })
  await writeFile(
    join(root, "development_dataset.json"),
    JSON.stringify({
      "2021q-misc-runner": {
        year: "2021",
        event: "CSAW-Quals",
        category: "misc",
        challenge: "runner",
        path: "2021/CSAW-Quals/misc/runner",
      },
    }),
  )
  await writeFile(
    join(challengeDir, "challenge.json"),
    JSON.stringify({
      name: "runner",
      category: "misc",
      description: "Run the supplied challenge.",
      flag,
      files: ["files/input.txt"],
      compose: true,
    }),
  )
  await writeFile(join(challengeDir, "files", "input.txt"), "input")
  await writeFile(join(challengeDir, "docker-compose.yaml"), "services: {}\n")
  const [challenge] = await loadNyuChallenges({
    datasetJson: join(root, "development_dataset.json"),
    split: "development",
  })
  return { root, challenge }
}

const nodeSolver = (source: string) => ({ command: execPath, args: ["-e", source] })

describe("NYU benchmark runner", () => {
  it("runs a solver, verifies an exact flag, replays, and cleans the service", async () => {
    const { root, challenge } = await makeChallenge()
    const calls: string[] = []
    const result = await runNyuBenchmark({
      challenge,
      workspaceDir: join(root, "agent-workspace"),
      reportDir: join(root, "report"),
      solver: nodeSolver("console.log('flag{runner_pass}')"),
      replay: nodeSolver("process.exit(0)"),
      replayRequired: true,
      serviceLifecycle: {
        async start() {
          calls.push("start")
        },
        async stop() {
          calls.push("stop")
        },
      },
    })

    expect(result.status).toBe("solved")
    expect(result.oracleStatus).toBe("verified")
    expect(result.replayStatus).toBe("passed")
    expect(result.candidateCount).toBe(1)
    expect(calls).toEqual(["start", "stop"])
    expect(await readFile(join(root, "agent-workspace", "challenge-info.json"), "utf8")).not.toContain("runner_pass")

    const resultPath = await writeNyuBenchmarkResult(join(root, "report"), result)
    expect(await readFile(resultPath, "utf8")).not.toContain("runner_pass")
  })

  it("extracts NYU flags whose payload contains URL punctuation", () => {
    expect(extractCandidateFlags("decoded key{imgur.com/DsQl4by}")).toContain("key{imgur.com/DsQl4by}")
  })

  it("verifies an NYU exact flag with URL punctuation", async () => {
    const { root, challenge } = await makeChallenge("key{imgur.com/DsQl4by}")
    const result = await runNyuBenchmark({
      challenge,
      workspaceDir: join(root, "agent-workspace"),
      reportDir: join(root, "report"),
      solver: nodeSolver(
        "if (process.env.CTF_WORKSPACE !== process.cwd()) process.exit(2); console.log('key{imgur.com/DsQl4by}')",
      ),
      serviceLifecycle: {
        async start() {},
        async stop() {},
      },
    })
    expect(result.status).toBe("solved")
    expect(result.oracleStatus).toBe("verified")
    expect(result.candidateCount).toBe(1)
  })
  it("does not run replay when the oracle rejects the candidate", async () => {
    const { root, challenge } = await makeChallenge()
    let replayCalled = false
    const result = await runNyuBenchmark({
      challenge,
      workspaceDir: join(root, "agent-workspace"),
      reportDir: join(root, "report"),
      solver: nodeSolver("console.log('flag{wrong_value}')"),
      replay: {
        command: execPath,
        args: ["-e", "replayCalled = true"],
      },
      serviceLifecycle: {
        async start() {},
        async stop() {},
      },
    })
    replayCalled = false
    expect(result.status).toBe("failed")
    expect(result.oracleStatus).toBe("rejected")
    expect(result.replayStatus).toBe("not-run")
    expect(replayCalled).toBe(false)
  })

  it("fails closed when replay is required but not configured", async () => {
    const { root, challenge } = await makeChallenge()
    const result = await runNyuBenchmark({
      challenge,
      workspaceDir: join(root, "agent-workspace"),
      reportDir: join(root, "report"),
      solver: nodeSolver("console.log('flag{runner_pass}')"),
      replayRequired: true,
      serviceLifecycle: {
        async start() {},
        async stop() {},
      },
    })
    expect(result.status).toBe("failed")
    expect(result.oracleStatus).toBe("verified")
    expect(result.replayStatus).toBe("not-run")
    expect(result.error).toContain("replay is required")
  })

  it("cleans up when service startup fails after partial provisioning", async () => {
    const { root, challenge } = await makeChallenge()
    const calls: string[] = []
    const result = await runNyuBenchmark({
      challenge,
      workspaceDir: join(root, "agent-workspace"),
      reportDir: join(root, "report"),
      solver: nodeSolver("console.log('flag{runner_pass}')"),
      serviceLifecycle: {
        async start() {
          calls.push("start")
          throw new Error("partial service startup")
        },
        async stop() {
          calls.push("stop")
        },
      },
    })

    expect(result.status).toBe("blocked")
    expect(result.error).toContain("partial service startup")
    expect(calls).toEqual(["start", "stop"])
  })

  it("downgrades a solved result when service cleanup fails", async () => {
    const { root, challenge } = await makeChallenge()
    const result = await runNyuBenchmark({
      challenge,
      workspaceDir: join(root, "agent-workspace"),
      reportDir: join(root, "report"),
      solver: nodeSolver("console.log('flag{runner_pass}')"),
      serviceLifecycle: {
        async start() {},
        async stop() {
          throw new Error("container cleanup unavailable")
        },
      },
    })

    expect(result.status).toBe("blocked")
    expect(result.oracleStatus).toBe("verified")
    expect(result.error).toContain("service cleanup failed")
    expect(result.error).toContain("container cleanup unavailable")
  })

  it("rejects mixed splits and overlapping suite report roots", async () => {
    const { root, challenge } = await makeChallenge()
    const testChallenge = {
      ...challenge,
      publicChallenge: { ...challenge.publicChallenge, split: "test" as const },
    }
    const solver = () => nodeSolver("console.log('flag{runner_pass}')")

    await expect(
      runNyuBenchmarkSuite({
        challenges: [challenge, testChallenge],
        workspaceRoot: join(root, "suite-workspaces"),
        reportRoot: join(root, "suite-reports"),
        solver,
      }),
    ).rejects.toThrow(/same split/)

    await expect(
      runNyuBenchmarkSuite({
        challenges: [challenge],
        workspaceRoot: join(root, "suite-workspaces"),
        reportRoot: join(root, "suite-workspaces", "reports"),
        solver,
      }),
    ).rejects.toThrow(/reportDir must be outside/)
  })

  it("aggregates a suite without exposing candidate values", async () => {
    const { root, challenge } = await makeChallenge()
    const result = await runNyuBenchmarkSuite({
      challenges: [challenge],
      workspaceRoot: join(root, "suite-workspaces"),
      reportRoot: join(root, "suite-reports"),
      solver: () => nodeSolver("console.log('flag{runner_pass}')"),
      serviceLifecycle: {
        async start() {},
        async stop() {},
      },
    })
    expect(result.total).toBe(1)
    expect(result.solved).toBe(1)
    expect(result.results[0].status).toBe("solved")
    const summaryPath = await writeNyuBenchmarkSuiteResult(join(root, "suite-reports"), result)
    expect(await readFile(summaryPath, "utf8")).not.toContain("runner_pass")
  })

  it("rejects a report directory inside the agent workspace", async () => {
    const { root, challenge } = await makeChallenge()
    await expect(
      runNyuBenchmark({
        challenge,
        workspaceDir: join(root, "agent-workspace"),
        reportDir: join(root, "agent-workspace", "report"),
        solver: nodeSolver("console.log('flag{runner_pass}')"),
      }),
    ).rejects.toThrow(/reportDir must be outside/)
  })
  it("stops a solver after a verified completion artifact is written", async () => {
    const { root, challenge } = await makeChallenge()
    const result = await runNyuBenchmark({
      challenge,
      workspaceDir: join(root, "agent-workspace"),
      reportDir: join(root, "report"),
      solver: {
        ...nodeSolver(
          "require('node:fs').writeFileSync('agent_flag.txt', 'flag{runner_pass}\\n'); setInterval(() => {}, 1000)",
        ),
        completionFile: "agent_flag.txt",
      },
      solverTimeoutMs: 2000,
      serviceLifecycle: {
        async start() {},
        async stop() {},
      },
    })
    expect(result.status).toBe("solved")
    expect(result.oracleStatus).toBe("verified")
    expect(result.solverTimedOut).toBe(false)
    expect(result.candidateCount).toBe(1)
  })

  it("rejects a completion artifact outside the solver workspace", async () => {
    const { root, challenge } = await makeChallenge()
    const result = await runNyuBenchmark({
      challenge,
      workspaceDir: join(root, "agent-workspace"),
      reportDir: join(root, "report"),
      solver: { ...nodeSolver("console.log('flag{runner_pass}')"), completionFile: "../agent_flag.txt" },
      serviceLifecycle: {
        async start() {},
        async stop() {},
      },
    })
    expect(result.status).toBe("blocked")
    expect(result.error).toContain("completionFile must stay inside")
  })

  it("reports a solver timeout instead of treating partial output as solved", async () => {
    const { root, challenge } = await makeChallenge()
    const result = await runNyuBenchmark({
      challenge,
      workspaceDir: join(root, "agent-workspace"),
      reportDir: join(root, "report"),
      solver: nodeSolver("setTimeout(() => console.log('flag{runner_pass}'), 1000)"),
      solverTimeoutMs: 50,
      serviceLifecycle: {
        async start() {},
        async stop() {},
      },
    })
    expect(result.status).toBe("timeout")
    expect(result.solverTimedOut).toBe(true)
  })
})
