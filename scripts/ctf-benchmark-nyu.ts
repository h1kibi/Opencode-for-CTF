import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { existsSync } from "node:fs"
import { cp, mkdir, writeFile } from "node:fs/promises"
import {
  assertNyuChallengeBoundary,
  loadNyuChallenges,
  materializeNyuAgentWorkspace,
  type NyuCategory,
  type NyuSplit,
} from "../packages/ctf-benchmark-core/src/nyu.ts"
import {
  runNyuBenchmark,
  runNyuBenchmarkSuite,
  writeNyuBenchmarkResult,
  writeNyuBenchmarkSuiteResult,
  type NyuCommandSpec,
} from "../packages/ctf-benchmark-core/src/runner.ts"

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function jsonArgs(name: string): string[] | undefined {
  const value = option(name)
  if (!value) return undefined
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be a JSON string array`)
  }
  return parsed
}

function timeoutOption(name: string): number | undefined {
  const value = option(name)
  if (value === undefined) return undefined
  const timeout = Number(value)
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error(`${name} must be a positive finite number`)
  return timeout
}

const OPENCODE_SUBAGENTS = new Set([
  "ctf-web",
  "ctf-pwn",
  "ctf-rev",
  "ctf-crypto",
  "ctf-forensics",
  "ctf-misc",
  "ctf-aisec",
  "ctf-scout",
  "ctf-librarian",
  "ctf-oracle",
  "ctf-verifier",
])

function isOpenCodeCommand(command: string): boolean {
  return ["opencode", "opencode.exe", "opencode.cmd"].includes(basename(command).toLowerCase())
}

function solverArgs(command: string, argsName: string, prompt?: string): string[] | undefined {
  const args = jsonArgs(argsName)
  const opencodeCommand = option("--solver-opencode-command")
  const solverModel = option("--solver-model")

  if ((opencodeCommand || solverModel) && !isOpenCodeCommand(command)) {
    throw new Error("--solver-opencode-command/--solver-model require --solver-command opencode")
  }

  let commandArgs = [...(args ?? [])]
  if (opencodeCommand) {
    if (commandArgs.length === 0) commandArgs = ["run"]
    if (!commandArgs.includes("run")) {
      throw new Error("--solver-opencode-command requires solver args to include the `run` subcommand")
    }
    if (commandArgs.includes("--agent") || commandArgs.includes("--command")) {
      throw new Error("Do not combine --solver-opencode-command with --agent/--command in --solver-args-json")
    }
    commandArgs.push("--command", opencodeCommand)
  }

  if (solverModel) {
    if (commandArgs.includes("--model")) {
      throw new Error("Do not specify --model both in --solver-model and --solver-args-json")
    }
    if (commandArgs.length === 0) commandArgs = ["run"]
    commandArgs.push("--model", solverModel)
  }

  if (isOpenCodeCommand(command)) {
    const agentIndex = commandArgs.indexOf("--agent")
    const requestedAgent = agentIndex >= 0 ? commandArgs[agentIndex + 1] : undefined
    if (requestedAgent && OPENCODE_SUBAGENTS.has(requestedAgent)) {
      throw new Error(
        `OpenCode agent ${requestedAgent} is a subagent and cannot be benchmarked with --agent; use --solver-opencode-command ${requestedAgent} so the command frontmatter selects it`,
      )
    }
  }

  if (prompt) commandArgs.push(prompt)
  return commandArgs.length > 0 ? commandArgs : args
}

function resolveOpenCodeExecutable(command: string): string {
  if (process.platform !== "win32" || !isOpenCodeCommand(command)) return command
  const commandDir = isAbsolute(command)
    ? dirname(command)
    : join(process.env.APPDATA ?? process.env.npm_config_prefix ?? "", "npm")
  const candidate = join(commandDir, "node_modules", "opencode-ai", "bin", "opencode.exe")
  return existsSync(candidate) ? candidate : command.endsWith(".cmd") ? command : `${command}.cmd`
}

function commandFactory(
  commandName: string,
  argsName: string,
  prompt?: string,
  configureOpenCode = false,
  env?: NodeJS.ProcessEnv,
) {
  const command = option(commandName)
  const executable = command ? resolveOpenCodeExecutable(command) : undefined
  const commandArgs = executable
    ? configureOpenCode
      ? solverArgs(command!, argsName, prompt)
      : (() => {
          const args = jsonArgs(argsName)
          return prompt ? [...(args ?? []), prompt] : args
        })()
    : undefined
  return command
    ? (_challenge: unknown, workspaceDir: string): NyuCommandSpec => ({
        command: executable!,
        args: commandArgs,
        cwd: workspaceDir,
        env,
        completionFile: configureOpenCode ? "agent_flag.txt" : undefined,
      })
    : undefined
}

async function stageOpenCodeBenchmarkSkills(skillRoot: string, workspaceDir: string): Promise<NodeJS.ProcessEnv> {
  const root = resolve(skillRoot)
  if (!existsSync(join(root, "ctf-rev", "SKILL.md"))) {
    throw new Error(`--solver-opencode-skill-root must contain ctf-rev/SKILL.md: ${root}`)
  }
  const localSkillRoot = join(workspaceDir, "skills")
  // Keep the benchmark environment deterministic and focused. Copying every
  // optional skill makes OpenCode scan dozens of unrelated references and
  // increases the chance of a specialist lane drifting into the wrong tool.
  await mkdir(localSkillRoot, { recursive: true })
  const stagedEntries = [
    "SKILL_CONTRACT.md",
    "ctf-common",
    "ctf-router",
    "ctf-lead",
    "ctf-expert",
    "ctf-terminal",
    "ctf-artifact-analysis",
    "ctf-decision-engine",
    "ctf-experience-gate",
    "ctf-closure-gate",
    "ctf-ledger-discipline",
    "ctf-rev",
    "ctf-skill-repo-knowledge",
  ]
  for (const entry of stagedEntries) {
    const source = join(root, entry)
    if (existsSync(source)) await cp(source, join(localSkillRoot, entry), { recursive: true, force: true })
  }
  const configDir = join(workspaceDir, ".opencode-benchmark-config")
  await mkdir(configDir, { recursive: true })
  await writeFile(
    join(configDir, "opencode.jsonc"),
    `${JSON.stringify(
      {
        skills: { paths: [localSkillRoot] },
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  return { OPENCODE_CONFIG_DIR: configDir }
}

const action = process.argv[2]
const dataset = option("--dataset")
const datasetRoot = option("--root")
const split = option("--split") as NyuSplit | undefined
const id = option("--id")
const workspace = option("--workspace")
const category = option("--category") as NyuCategory | undefined

if (!action || !dataset || (split !== "development" && split !== "test")) {
  console.error(
    "Usage: npx tsx scripts/ctf-benchmark-nyu.ts <list|prepare|run|run-suite> --dataset <dataset.json> --split <development|test> [--root <dataset-root>] [--id <id>] [--category <family>] [--workspace <dir>] [--workspace-root <dir>] [--report <dir>] [--report-root <dir>] [--solver-prompt <text>] [--solver-model <provider/model>] [--solver-opencode-command <command-name>] [--solver-opencode-skill-root <dir>]",
  )
  process.exit(1)
}

const challenges = await loadNyuChallenges({
  datasetJson: resolve(dataset),
  datasetRoot: datasetRoot ? resolve(datasetRoot) : undefined,
  split,
  ids: id ? [id] : undefined,
  categories: category ? [category] : undefined,
})

for (const challenge of challenges) assertNyuChallengeBoundary(challenge)

if (action === "list") {
  console.log(
    JSON.stringify(
      challenges.map(({ publicChallenge }) => publicChallenge),
      null,
      2,
    ),
  )
  process.exit(0)
}

if (action === "prepare") {
  if (challenges.length !== 1 || !workspace) {
    console.error("prepare requires exactly one --id and a --workspace directory")
    process.exit(1)
  }
  const files = await materializeNyuAgentWorkspace(challenges[0], resolve(workspace))
  console.log(JSON.stringify({ challenge: challenges[0].publicChallenge, copiedFiles: files }, null, 2))
  process.exit(0)
}

const replayRequired = process.argv.includes("--replay-required")
const solverPrompt = option("--solver-prompt")
const solverCommand = option("--solver-command")
const solverSkillRoot = option("--solver-opencode-skill-root")
if (solverSkillRoot && (!solverCommand || !isOpenCodeCommand(solverCommand))) {
  throw new Error("--solver-opencode-skill-root requires --solver-command opencode")
}
const solverFactory = commandFactory("--solver-command", "--solver-args-json", solverPrompt, true)
if (!solverFactory) {
  console.error(
    `${action} requires --solver-command and optional --solver-args-json/--solver-model/--solver-opencode-command`,
  )
  process.exit(1)
}
const preparedSolverFactory = solverSkillRoot
  ? async (_challenge: unknown, workspaceDir: string): Promise<NyuCommandSpec> =>
      commandFactory(
        "--solver-command",
        "--solver-args-json",
        solverPrompt,
        true,
        await stageOpenCodeBenchmarkSkills(solverSkillRoot, workspaceDir),
      )!(_challenge, workspaceDir)
  : solverFactory
const replayFactory = commandFactory("--replay-command", "--replay-args-json")

if (action === "run-suite") {
  const workspaceRoot = option("--workspace-root")
  if (!workspaceRoot || challenges.length === 0) {
    console.error("run-suite requires --workspace-root and at least one selected challenge")
    process.exit(1)
  }
  const reportRoot = resolve(option("--report-root") ?? `${workspaceRoot}.benchmark-reports`)
  const result = await runNyuBenchmarkSuite({
    challenges,
    workspaceRoot: resolve(workspaceRoot),
    reportRoot,
    solver: preparedSolverFactory,
    replay: replayFactory,
    replayRequired,
    solverTimeoutMs: timeoutOption("--solver-timeout-ms"),
    replayTimeoutMs: timeoutOption("--replay-timeout-ms"),
  })
  await writeNyuBenchmarkSuiteResult(reportRoot, result)
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.solved === result.total ? 0 : 1)
}

if (action !== "run" || challenges.length !== 1 || !workspace) {
  console.error("run requires exactly one --id and a --workspace directory")
  process.exit(1)
}

const workspaceDir = resolve(workspace)
const reportDir = resolve(option("--report") ?? `${workspace}.benchmark-report`)
const result = await runNyuBenchmark({
  challenge: challenges[0],
  workspaceDir,
  reportDir,
  solver: async (preparedWorkspaceDir) => preparedSolverFactory(challenges[0], preparedWorkspaceDir),
  replay: replayFactory?.(challenges[0], workspaceDir),
  replayRequired,
  solverTimeoutMs: timeoutOption("--solver-timeout-ms"),
  replayTimeoutMs: timeoutOption("--replay-timeout-ms"),
})
await writeNyuBenchmarkResult(reportDir, result)
console.log(JSON.stringify(result, null, 2))
process.exit(result.status === "solved" ? 0 : 1)
