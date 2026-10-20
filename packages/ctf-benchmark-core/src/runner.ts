import { spawn } from "node:child_process"
import { extractFlagCandidates } from "../../ctf-core/src/flag-rules.ts"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"
import {
  assertNyuChallengeBoundary,
  materializeNyuAgentWorkspace,
  verifyNyuCandidates,
  type NyuPreparedChallenge,
} from "./nyu.ts"

export type NyuCommandSpec = {
  command: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  /**
   * Optional workspace-relative completion artifact. When a solver writes a
   * non-empty, newly-created/updated file here, the runner stops the command
   * and includes the file as an untrusted candidate-output channel.
   */
  completionFile?: string
}

export type NyuSolverSpec = NyuCommandSpec | ((workspaceDir: string) => NyuCommandSpec | Promise<NyuCommandSpec>)

export type NyuCommandResult = {
  exitCode: number | null
  timedOut: boolean
  completionFileDetected: boolean
  stdout: string
  stderr: string
  durationMs: number
}

export type NyuReplayStatus = "passed" | "failed" | "not-run"
export type NyuOracleStatus = "verified" | "rejected" | "not-run"
export type NyuRunStatus = "solved" | "failed" | "timeout" | "blocked" | "infra-error"

export type NyuBenchmarkResult = {
  challengeId: string
  split: "development" | "test"
  category: string
  status: NyuRunStatus
  oracleStatus: NyuOracleStatus
  replayStatus: NyuReplayStatus
  candidateCount: number
  solverExitCode: number | null
  solverTimedOut: boolean
  replayExitCode?: number | null
  durationMs: number
  artifacts: string[]
  error?: string
}

export type NyuServiceLifecycle = {
  start: (challenge: NyuPreparedChallenge, projectName: string) => Promise<void>
  stop: (challenge: NyuPreparedChallenge, projectName: string) => Promise<void>
}

export type RunNyuBenchmarkOptions = {
  challenge: NyuPreparedChallenge
  workspaceDir: string
  reportDir: string
  solver: NyuSolverSpec
  replay?: NyuCommandSpec
  replayRequired?: boolean
  solverTimeoutMs?: number
  replayTimeoutMs?: number
  serviceLifecycle?: NyuServiceLifecycle
  serviceProjectName?: string
  flagPattern?: RegExp
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024

function appendLimited(current: string, chunk: Buffer): string {
  if (Buffer.byteLength(current, "utf8") >= MAX_CAPTURE_BYTES) return current
  const remaining = MAX_CAPTURE_BYTES - Buffer.byteLength(current, "utf8")
  return current + chunk.toString("utf8").slice(0, remaining)
}

function sanitizedEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  for (const name of ["FLAG", "CTF_FLAG", "NYU_FLAG", "EXPECTED_FLAG", "EXPECTED_FLAG_SHA256"]) {
    delete env[name]
  }
  return env
}

const NYU_BRACED_CANDIDATE_REGEX = /\b[A-Za-z0-9]{3,10}\{[^{}\r\n]{1,120}\}/gi

export function extractCandidateFlags(output: string, pattern?: RegExp): string[] {
  if (!pattern) {
    const flags = extractFlagCandidates(output, { origin: "solver-output", text: output }).map(
      (candidate) => candidate.value,
    )
    // NYU challenge flags are not guaranteed to use the conservative default
    // payload alphabet. For example, `key{imgur.com/DsQl4by}` contains both
    // `.` and `/`. Keep the broad fallback bounded and let the independent NYU
    // hash oracle decide whether any such untrusted candidate is real.
    for (const match of output.matchAll(NYU_BRACED_CANDIDATE_REGEX)) {
      const value = match[0]?.trim()
      if (value && !flags.includes(value)) flags.push(value)
    }
    return flags
  }
  const flags: string[] = []
  const safePattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
  for (const match of output.matchAll(safePattern)) {
    const value = match[0]?.trim()
    if (value && !flags.includes(value)) flags.push(value)
  }
  return flags
}

type CompletionSnapshot = {
  content: string
  mtimeMs: number
}

async function readCompletionSnapshot(path: string): Promise<CompletionSnapshot | undefined> {
  try {
    const [metadata, content] = await Promise.all([stat(path), readFile(path, "utf8")])
    return { content, mtimeMs: metadata.mtimeMs }
  } catch {
    return undefined
  }
}

function completionPathFor(spec: NyuCommandSpec): string | undefined {
  if (!spec.completionFile) return undefined
  const cwd = resolve(spec.cwd ?? process.cwd())
  const path = resolve(cwd, spec.completionFile)
  if (!isWithinPath(cwd, path)) {
    throw new Error("completionFile must stay inside the solver workspace")
  }
  return path
}

export async function runNyuCommand(spec: NyuCommandSpec, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<NyuCommandResult> {
  const started = Date.now()
  const completionPath = completionPathFor(spec)
  const baseline = completionPath ? await readCompletionSnapshot(completionPath) : undefined

  return new Promise((resolveResult) => {
    const child = spawn(spec.command, spec.args ?? [], {
      cwd: spec.cwd,
      env: sanitizedEnv(spec.env),
      shell: false,
      windowsHide: true,
    })
    // Benchmark solvers are non-interactive. Closing stdin prevents CLI tools
    // from waiting forever for permission/input answers on a pipe.
    child.stdin?.end()
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let completionFileDetected = false
    let settled = false
    let checkingCompletion = false
    const completionPoll = completionPath
      ? setInterval(() => {
          if (checkingCompletion || settled) return
          checkingCompletion = true
          void readCompletionSnapshot(completionPath)
            .then((current) => {
              if (!current || !current.content.trim()) return
              const changed = !baseline || current.content !== baseline.content || current.mtimeMs > baseline.mtimeMs
              if (changed && !completionFileDetected) {
                completionFileDetected = true
                child.kill()
              }
            })
            .finally(() => {
              checkingCompletion = false
            })
        }, 100)
      : undefined
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    const finish = async (exitCode: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (completionPoll) clearInterval(completionPoll)
      if (completionPath && !completionFileDetected) {
        const current = await readCompletionSnapshot(completionPath)
        if (current?.content.trim()) {
          completionFileDetected =
            !baseline || current.content !== baseline.content || current.mtimeMs > baseline.mtimeMs
        }
      }
      resolveResult({
        exitCode,
        timedOut,
        completionFileDetected,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      })
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk)
    })
    child.on("error", (error) => {
      stderr = `${stderr}${error.message}`
      void finish(null)
    })
    child.on("close", (code) => void finish(code))
  })
}

function defaultDockerLifecycle(): NyuServiceLifecycle {
  return {
    async start(challenge, projectName) {
      if (!challenge.composePath) return
      const result = await runNyuCommand({
        command: "docker",
        args: ["compose", "--project-name", projectName, "-f", challenge.composePath, "up", "-d", "--force-recreate"],
        cwd: challenge.sourceDir,
      })
      if (result.exitCode !== 0 || result.timedOut) {
        throw new Error(`docker compose up failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`)
      }
    },
    async stop(challenge, projectName) {
      if (!challenge.composePath) return
      const result = await runNyuCommand({
        command: "docker",
        args: [
          "compose",
          "--project-name",
          projectName,
          "-f",
          challenge.composePath,
          "down",
          "--volumes",
          "--remove-orphans",
        ],
        cwd: challenge.sourceDir,
      })
      if (result.exitCode !== 0 && !result.timedOut) {
        throw new Error(`docker compose down failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`)
      }
    },
  }
}

function projectNameFor(challenge: NyuPreparedChallenge, requested?: string): string {
  const base = (requested ?? `nyu-${challenge.publicChallenge.id}`).toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
  return `${base.slice(0, 48)}-${process.pid}`
}

async function writeArtifact(reportDir: string, name: string, content: string): Promise<string> {
  const path = join(reportDir, name)
  await writeFile(path, content, "utf8")
  return name
}

function isWithinPath(parent: string, target: string): boolean {
  const relativePath = relative(parent, target)
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

function assertReportOutsideWorkspace(workspaceDir: string, reportDir: string): void {
  if (isWithinPath(workspaceDir, reportDir) || isWithinPath(reportDir, workspaceDir)) {
    throw new Error("reportDir must be outside the agent workspace so replay cannot read solver artifacts")
  }
}

export async function runNyuBenchmark(options: RunNyuBenchmarkOptions): Promise<NyuBenchmarkResult> {
  const started = Date.now()
  const challenge = options.challenge
  assertNyuChallengeBoundary(challenge)
  const workspaceDir = resolve(options.workspaceDir)
  const reportDir = resolve(options.reportDir)
  assertReportOutsideWorkspace(workspaceDir, reportDir)
  await mkdir(reportDir, { recursive: true })

  const artifacts: string[] = []
  let solverResult: NyuCommandResult = {
    exitCode: null,
    timedOut: false,
    completionFileDetected: false,
    stdout: "",
    stderr: "",
    durationMs: 0,
  }
  let replayResult: NyuCommandResult | undefined
  let serviceStarted = false
  const lifecycle = options.serviceLifecycle ?? defaultDockerLifecycle()
  const projectName = projectNameFor(challenge, options.serviceProjectName)
  let result: NyuBenchmarkResult | undefined

  try {
    await materializeNyuAgentWorkspace(challenge, workspaceDir)
    const solver = typeof options.solver === "function" ? await options.solver(workspaceDir) : options.solver
    if (challenge.composePath) {
      // Mark the lifecycle as active before starting: a partial `docker compose up`
      // can create containers and still fail, so cleanup must be attempted.
      serviceStarted = true
      await lifecycle.start(challenge, projectName)
    }

    const solverResultEnv = {
      ...solver.env,
      CTF_NYU_CHALLENGE_ID: challenge.publicChallenge.id,
      CTF_NYU_SPLIT: challenge.publicChallenge.split,
      CTF_NYU_WORKSPACE: workspaceDir,
      // Agent frontmatter uses this variable to allow the isolated benchmark workspace.
      CTF_WORKSPACE: workspaceDir,
    }
    solverResult = await runNyuCommand(
      { ...solver, cwd: solver.cwd ?? workspaceDir, env: solverResultEnv },
      options.solverTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
    artifacts.push(await writeArtifact(reportDir, "solver.stdout.txt", solverResult.stdout))
    artifacts.push(await writeArtifact(reportDir, "solver.stderr.txt", solverResult.stderr))

    const solverCompletionPath = solver.completionFile
      ? completionPathFor({ ...solver, cwd: solver.cwd ?? workspaceDir })
      : undefined
    const completionOutput =
      solverCompletionPath && solverResult.completionFileDetected
        ? ((await readCompletionSnapshot(solverCompletionPath))?.content ?? "")
        : ""
    const candidates = [
      ...new Set(
        extractCandidateFlags(
          `${solverResult.stdout}\n${solverResult.stderr}\n${completionOutput}`,
          options.flagPattern,
        ),
      ),
    ]
    const oracle = verifyNyuCandidates(challenge, candidates)
    const oracleStatus: NyuOracleStatus = oracle.solved ? "verified" : "rejected"

    if (oracle.solved && options.replay) {
      const replayEnv = {
        ...options.replay.env,
        CTF_NYU_CHALLENGE_ID: challenge.publicChallenge.id,
        CTF_NYU_SPLIT: challenge.publicChallenge.split,
        CTF_NYU_WORKSPACE: workspaceDir,
        CTF_WORKSPACE: workspaceDir,
      }
      replayResult = await runNyuCommand(
        { ...options.replay, cwd: options.replay.cwd ?? workspaceDir, env: replayEnv },
        options.replayTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      )
      artifacts.push(await writeArtifact(reportDir, "replay.stdout.txt", replayResult.stdout))
      artifacts.push(await writeArtifact(reportDir, "replay.stderr.txt", replayResult.stderr))
    }

    const replayStatus: NyuReplayStatus = replayResult
      ? replayResult.exitCode === 0 && !replayResult.timedOut
        ? "passed"
        : "failed"
      : "not-run"
    const replayOk = !options.replayRequired || replayStatus === "passed"
    result = {
      challengeId: challenge.publicChallenge.id,
      split: challenge.publicChallenge.split,
      category: challenge.publicChallenge.category,
      status: solverResult.timedOut ? "timeout" : oracle.solved && replayOk ? "solved" : "failed",
      oracleStatus,
      replayStatus,
      candidateCount: candidates.length,
      solverExitCode: solverResult.exitCode,
      solverTimedOut: solverResult.timedOut,
      replayExitCode: replayResult?.exitCode,
      durationMs: Date.now() - started,
      artifacts,
      error:
        oracle.solved && options.replayRequired && replayStatus === "not-run"
          ? "replay is required but no replay command was provided"
          : undefined,
    }
  } catch (caught) {
    result = {
      challengeId: challenge.publicChallenge.id,
      split: challenge.publicChallenge.split,
      category: challenge.publicChallenge.category,
      status: serviceStarted ? "blocked" : "infra-error",
      oracleStatus: "not-run",
      replayStatus: "not-run",
      candidateCount: 0,
      solverExitCode: solverResult.exitCode,
      solverTimedOut: solverResult.timedOut,
      durationMs: Date.now() - started,
      artifacts,
      error: caught instanceof Error ? caught.message : String(caught),
    }
  } finally {
    if (serviceStarted) {
      try {
        await lifecycle.stop(challenge, projectName)
      } catch (caught) {
        if (result) {
          result = {
            ...result,
            status: "blocked",
            error: `service cleanup failed: ${caught instanceof Error ? caught.message : String(caught)}`,
          }
        }
      }
    }
  }
  if (!result) throw new Error("NYU benchmark runner did not produce a result")
  return result
}

export type NyuBenchmarkSuiteResult = {
  split: "development" | "test"
  total: number
  solved: number
  failed: number
  timeout: number
  blocked: number
  infraError: number
  results: NyuBenchmarkResult[]
}

export type RunNyuBenchmarkSuiteOptions = {
  challenges: NyuPreparedChallenge[]
  workspaceRoot: string
  reportRoot: string
  solver: (challenge: NyuPreparedChallenge, workspaceDir: string) => NyuCommandSpec | Promise<NyuCommandSpec>
  replay?: (
    challenge: NyuPreparedChallenge,
    workspaceDir: string,
  ) => NyuCommandSpec | Promise<NyuCommandSpec> | undefined
  replayRequired?: boolean
  solverTimeoutMs?: number
  replayTimeoutMs?: number
  serviceLifecycle?: NyuServiceLifecycle
  flagPattern?: RegExp
}

function safeDirectoryName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "challenge"
  )
}

export async function runNyuBenchmarkSuite(options: RunNyuBenchmarkSuiteOptions): Promise<NyuBenchmarkSuiteResult> {
  const split = options.challenges[0]?.publicChallenge.split ?? "development"
  if (options.challenges.some((challenge) => challenge.publicChallenge.split !== split)) {
    throw new Error("all challenges in an NYU benchmark suite must use the same split")
  }
  const workspaceRoot = resolve(options.workspaceRoot)
  const reportRoot = resolve(options.reportRoot)
  assertReportOutsideWorkspace(workspaceRoot, reportRoot)
  const results: NyuBenchmarkResult[] = []
  for (const challenge of options.challenges) {
    const name = safeDirectoryName(challenge.publicChallenge.id)
    const workspaceDir = join(workspaceRoot, name)
    const reportDir = join(reportRoot, name)
    const replay = options.replay ? await options.replay(challenge, workspaceDir) : undefined
    results.push(
      await runNyuBenchmark({
        challenge,
        workspaceDir,
        reportDir,
        solver: (preparedWorkspaceDir) => options.solver(challenge, preparedWorkspaceDir),
        replay,
        replayRequired: options.replayRequired,
        solverTimeoutMs: options.solverTimeoutMs,
        replayTimeoutMs: options.replayTimeoutMs,
        serviceLifecycle: options.serviceLifecycle,
        flagPattern: options.flagPattern,
      }),
    )
  }
  return {
    split,
    total: results.length,
    solved: results.filter((result) => result.status === "solved").length,
    failed: results.filter((result) => result.status === "failed").length,
    timeout: results.filter((result) => result.status === "timeout").length,
    blocked: results.filter((result) => result.status === "blocked").length,
    infraError: results.filter((result) => result.status === "infra-error").length,
    results,
  }
}

export async function writeNyuBenchmarkSuiteResult(
  reportRoot: string,
  result: NyuBenchmarkSuiteResult,
): Promise<string> {
  await mkdir(reportRoot, { recursive: true })
  const path = join(resolve(reportRoot), "summary.json")
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return path
}
export async function writeNyuBenchmarkResult(reportDir: string, result: NyuBenchmarkResult): Promise<string> {
  await mkdir(reportDir, { recursive: true })
  const path = join(resolve(reportDir), "result.json")
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return path
}
