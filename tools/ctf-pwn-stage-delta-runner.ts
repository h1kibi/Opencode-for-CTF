import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExecWithStreams, dockerQuote } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

type Stage = {
  name: string
  payloadFile?: string
  payloadText?: string
  payloadHex?: string
  breakpointHitCounts?: string
  breakpoints?: string
  memoryExprs?: string
  memoryLabels?: string
  timeoutMs?: number
}

async function loadRuntimeProfile(contextDir: string, profileId?: string) {
  if (!profileId) return null as any
  const profilePath = resolveInsideWorkspace(contextDir, `work/pwn-runtime-profiles/${profileId}.json`)
  return JSON.parse(await readFile(profilePath, "utf8"))
}

function compact(text: string, max = 6000) {
  if (text.length <= max) return text
  return `${text.slice(0, Math.floor(max * 0.6))}\n...[truncated ${text.length - max} chars]...\n${text.slice(text.length - Math.floor(max * 0.4))}`
}

function diffLineSets(a: string[], b: string[]) {
  const as = new Set(a)
  const bs = new Set(b)
  return {
    added: b.filter((x) => !as.has(x)).slice(0, 12),
    removed: a.filter((x) => !bs.has(x)).slice(0, 12),
  }
}

async function runNodeTool(contextDir: string, toolFile: string, payload: Record<string, unknown>, timeoutMs: number) {
  const target = resolveInsideWorkspace(contextDir, toolFile)
  const script = `import toolMod from ${JSON.stringify(target.replace(/\\/g, "/"))};\nconst context = { directory: ${JSON.stringify(contextDir)} };\nconst args = ${JSON.stringify(payload)};\nconst out = await toolMod.execute(args, context);\nif (typeof out === 'string') process.stdout.write(out); else process.stdout.write(JSON.stringify(out));\n`
  const runner = resolveInsideWorkspace(contextDir, `work/stage-delta-runner-${randomUUID().slice(0, 12)}.mjs`)
  await mkdir(path.dirname(runner), { recursive: true })
  await writeFile(runner, script, "utf8")
  try {
    const { stdout, stderr } = await safeExecWithStreams("node", [runner], {
      cwd: contextDir,
      timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    })
    return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
  } finally {
    try {
      await writeFile(runner, "", "utf8")
    } catch {}
  }
}

async function runSingleSessionGdb(contextDir: string, payload: Record<string, any>, timeoutMs: number) {
  const script = `import toolMod from ${JSON.stringify(resolveInsideWorkspace(contextDir, "tools/ctf-pwn-docker-runner.ts").replace(/\\/g, "/"))};
const context = { directory: ${JSON.stringify(contextDir)} };
const out = await toolMod.execute(${JSON.stringify(payload)}, context);
process.stdout.write(String(out));
`
  const runner = resolveInsideWorkspace(contextDir, `work/stage-delta-single-${randomUUID().slice(0, 12)}.mjs`)
  await mkdir(path.dirname(runner), { recursive: true })
  await writeFile(runner, script, "utf8")
  try {
    const { stdout, stderr } = await safeExecWithStreams("node", [runner], {
      cwd: contextDir,
      timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    })
    return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
  } finally {
    try {
      await writeFile(runner, "", "utf8")
    } catch {}
  }
}

function extractSection(text: string, header: string) {
  const lines = String(text || "").split(/\r?\n/)
  const idx = lines.findIndex((x) => x.trim() === header)
  if (idx < 0) return [] as string[]
  const out: string[] = []
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith("- ") && !line.startsWith("  - ")) break
    out.push(line.replace(/^- /, "").replace(/^  - /, "").trim())
  }
  return out
}

function parseSnapshot(text: string) {
  return {
    registers: extractSection(text, "registers:"),
    stackSample: extractSection(text, "stack_sample:"),
    mappingSample: extractSection(text, "mapping_sample:"),
    memoryViews: extractSection(text, "memory_views:"),
    hintSummary: extractSection(text, "hint_summary:"),
  }
}

export default tool({
  description:
    "CTF pwn stage delta runner: execute staged payload packets, snapshot each stage, and summarize register/mapping/memory deltas for pwntools + gdb workflows.",
  args: {
    binary: tool.schema.string().describe("Workspace-relative ELF binary path."),
    runtimeProfileId: tool.schema
      .string()
      .optional()
      .describe("Runtime profile id emitted by ctf-pwn-libc-runtime-doctor. Passed to each snapshot."),
    stagesJson: tool.schema
      .string()
      .describe(
        "JSON array of stages. Each stage may include name,payloadFile,payloadText,payloadHex,breakpoints,breakpointHitCounts,memoryExprs,memoryLabels,timeoutMs.",
      ),
    containerName: tool.schema.string().optional().describe("Explicit container name used by ctf-pwn-gdb-snapshot."),
    composeService: tool.schema.string().optional().describe("Compose service used by ctf-pwn-gdb-snapshot."),
    image: tool.schema.string().optional().describe("Docker image used by ctf-pwn-gdb-snapshot."),
    useComposeRun: tool.schema.boolean().optional().describe("Use compose run mode for ctf-pwn-gdb-snapshot."),
    containerWorkdir: tool.schema.string().optional().describe("In-container working directory."),
    containerMountRoot: tool.schema.string().optional().describe("Container mount root. Default /work."),
    runArgs: tool.schema.string().optional().describe("Extra run args passed through to containerized gdb snapshots."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory. Default work/stage-delta-harness."),
    timeoutMs: tool.schema.number().optional().describe("Per-stage timeout in ms. Default 15000."),
    singleSession: tool.schema
      .boolean()
      .optional()
      .describe(
        "Use one FIFO + one gdb process for sequential stage input instead of independent snapshots. Default false.",
      ),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const runtimeProfile = await loadRuntimeProfile(context.directory, args.runtimeProfileId)
    const profileDefaults = runtimeProfile?.docker_runner_defaults || {}
    const binary = resolveInsideWorkspace(context.directory, args.binary)
    const stages = JSON.parse(String(args.stagesJson || "[]")) as Stage[]
    if (!Array.isArray(stages) || !stages.length) return "BLOCK: stagesJson must be a non-empty JSON array"
    const outDir = resolveInsideWorkspace(context.directory, args.outDir || "work/stage-delta-harness")
    await mkdir(outDir, { recursive: true })
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 15000, 120000))

    if (args.singleSession) {
      const payloadFiles: string[] = []
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i]
        const name = String(stage.name || `stage${i + 1}`)
        let payloadFile = stage.payloadFile ? resolveInsideWorkspace(context.directory, stage.payloadFile) : ""
        if (!payloadFile && (stage.payloadText || stage.payloadHex)) {
          payloadFile = resolveInsideWorkspace(
            context.directory,
            path.join(
              path.relative(context.directory, outDir),
              `${i + 1}-${name}${stage.payloadHex ? ".bin" : ".txt"}`,
            ),
          )
          if (stage.payloadHex)
            await writeFile(payloadFile, Buffer.from(String(stage.payloadHex).replace(/[^0-9a-fA-F]/g, ""), "hex"))
          else await writeFile(payloadFile, String(stage.payloadText || ""), "utf8")
        }
        if (payloadFile) payloadFiles.push(path.relative(context.directory, payloadFile).replace(/\\/g, "/"))
      }
      const relBinary = path.relative(context.directory, binary).replace(/\\/g, "/")
      const containerMountRoot = args.containerMountRoot || profileDefaults.containerMountRoot || "/work"
      const allBreakpoints = stages.flatMap((s) =>
        String(s.breakpoints || "")
          .split(/[\r\n,]+/)
          .map((x) => x.trim())
          .filter(Boolean),
      )
      const gdbCmds = [
        "set pagination off",
        "set confirm off",
        ...allBreakpoints.map((bp) => `break ${bp}`),
        "run < /tmp/opencode_stage_fifo",
        'printf \\"register snapshot:\\\\n\\"',
        "info registers",
        'printf \\"stack snapshot:\\\\n\\"',
        "x/24gx $rsp",
        "bt",
      ].join("\\n")
      const feed = payloadFiles
        .map((p) => `cat ${dockerQuote(path.posix.join(containerMountRoot, p))} >> /tmp/opencode_stage_fifo`)
        .join("; sleep 0.15; ")
      const script = [
        "rm -f /tmp/opencode_stage_fifo",
        "mkfifo /tmp/opencode_stage_fifo",
        `( sleep 0.2; ${feed}; sleep 0.2 ) &`,
        `cat > /tmp/opencode_stage.gdb <<'GDB'\n${gdbCmds}\nGDB`,
        `gdb -nx -q -batch -x /tmp/opencode_stage.gdb ${path.posix.join(containerMountRoot, relBinary)}`,
      ].join("\n")
      const dockerOut = await runSingleSessionGdb(
        context.directory,
        {
          script,
          runtimeProfileId: args.runtimeProfileId || "",
          composeService: args.composeService || profileDefaults.composeService || "",
          containerName: args.containerName || "",
          image: args.image || "",
          useComposeRun: args.useComposeRun || false,
          containerWorkdir: args.containerWorkdir || profileDefaults.containerWorkdir || "/work",
          containerMountRoot,
          runArgs: args.runArgs || profileDefaults.runArgs || "",
          timeoutMs,
          saveOutput: true,
          outputPath: path.join(path.relative(context.directory, outDir), "single-session-gdb.log").replace(/\\/g, "/"),
        },
        timeoutMs + 10000,
      )
      const payload = {
        schema_version: "pwn_stage_delta_runner.v2",
        mode: "single_session_fifo",
        binary: relBinary,
        payload_files: payloadFiles,
        output: dockerOut,
      }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return [
        "pwn_stage_delta_runner:",
        "mode: single_session_fifo",
        `binary: ${relBinary}`,
        `payload_files: ${payloadFiles.join(" | ") || "none"}`,
        "output_compact:",
        compact(dockerOut),
      ].join("\n")
    }

    const results: Array<Record<string, unknown>> = []
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i]
      const name = String(stage.name || `stage${i + 1}`)
      let payloadFile = stage.payloadFile ? resolveInsideWorkspace(context.directory, stage.payloadFile) : ""
      if (!payloadFile && (stage.payloadText || stage.payloadHex)) {
        payloadFile = resolveInsideWorkspace(
          context.directory,
          path.join(path.relative(context.directory, outDir), `${i + 1}-${name}${stage.payloadHex ? ".bin" : ".txt"}`),
        )
        if (stage.payloadHex)
          await writeFile(payloadFile, Buffer.from(String(stage.payloadHex).replace(/[^0-9a-fA-F]/g, ""), "hex"))
        else await writeFile(payloadFile, String(stage.payloadText || ""), "utf8")
      }

      const snapshotOutput = await runNodeTool(
        context.directory,
        "tools/ctf-pwn-gdb-snapshot.ts",
        {
          binary: path.relative(context.directory, binary).replace(/\\/g, "/"),
          payloadFile: payloadFile ? path.relative(context.directory, payloadFile).replace(/\\/g, "/") : "",
          breakpoints: stage.breakpoints || "",
          breakpointHitCounts: stage.breakpointHitCounts || "",
          memoryExprs: stage.memoryExprs || "$rsp,$rbp,$rip",
          memoryLabels: stage.memoryLabels || "rsp,rbp,rip",
          timeoutMs: stage.timeoutMs || timeoutMs,
          containerName: args.containerName || "",
          composeService: args.composeService || profileDefaults.composeService || "",
          image: args.image || "",
          useComposeRun: args.useComposeRun || false,
          containerWorkdir: args.containerWorkdir || profileDefaults.containerWorkdir || "",
          containerMountRoot: args.containerMountRoot || profileDefaults.containerMountRoot || "/work",
          runArgs: args.runArgs || profileDefaults.runArgs || "",
          runtimeProfileId: args.runtimeProfileId || "",
        },
        timeoutMs + 5000,
      )

      const parsed = parseSnapshot(snapshotOutput)
      const stageResult = {
        index: i + 1,
        name,
        payload_file: payloadFile ? path.relative(context.directory, payloadFile).replace(/\\/g, "/") : "",
        snapshot_file: path
          .relative(
            context.directory,
            resolveInsideWorkspace(
              context.directory,
              path.join(path.relative(context.directory, outDir), `${i + 1}-${name}.snapshot.txt`),
            ),
          )
          .replace(/\\/g, "/"),
        snapshot_summary: parsed,
      }
      await writeFile(resolveInsideWorkspace(context.directory, stageResult.snapshot_file), snapshotOutput, "utf8")
      results.push(stageResult)
    }

    const deltas: Array<Record<string, unknown>> = []
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1] as any
      const cur = results[i] as any
      deltas.push({
        from: prev.name,
        to: cur.name,
        registers: diffLineSets(prev.snapshot_summary.registers, cur.snapshot_summary.registers),
        mappings: diffLineSets(prev.snapshot_summary.mappingSample, cur.snapshot_summary.mappingSample),
        memoryViews: diffLineSets(prev.snapshot_summary.memoryViews, cur.snapshot_summary.memoryViews),
        hints: diffLineSets(prev.snapshot_summary.hintSummary, cur.snapshot_summary.hintSummary),
      })
    }

    const payload = {
      schema_version: "pwn_stage_delta_runner.v1",
      binary: path.relative(context.directory, binary).replace(/\\/g, "/"),
      out_dir: path.relative(context.directory, outDir).replace(/\\/g, "/"),
      stages: results,
      deltas,
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_stage_delta_runner:",
      `binary: ${payload.binary}`,
      `out_dir: ${payload.out_dir}`,
      "stages:",
      ...results.map(
        (stage: any) =>
          `- #${stage.index} ${stage.name} payload_file=${stage.payload_file || "none"} snapshot_file=${stage.snapshot_file}`,
      ),
      "deltas:",
      ...(deltas.length
        ? deltas.flatMap((delta: any) => [
            `- ${delta.from} -> ${delta.to}`,
            `  registers_added: ${(delta.registers.added || []).join(" | ") || "none"}`,
            `  registers_removed: ${(delta.registers.removed || []).join(" | ") || "none"}`,
            `  mappings_added: ${(delta.mappings.added || []).join(" | ") || "none"}`,
            `  memory_added: ${(delta.memoryViews.added || []).join(" | ") || "none"}`,
            `  hints_added: ${(delta.hints.added || []).join(" | ") || "none"}`,
          ])
        : ["- none"]),
      "recommended_use:",
      "- Use this when a multi-stage payload changes state in non-obvious ways and you need structured deltas instead of rereading raw gdb output.",
      `- Raw snapshot logs are saved under ${payload.out_dir}.`,
    ].join("\n")
  },
})
