import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExecWithStreams } from "../lib/exec-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"

function normalizeRel(input: string) {
  return input.replace(/\\/g, "/")
}

function compact(text: string, max = 12000) {
  if (text.length <= max) return text
  const head = text.slice(0, Math.floor(max * 0.6))
  const tail = text.slice(text.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${text.length - max} chars]...\n${tail}`
}

function stripAnsi(text: string) {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
}

function extractJsonBlock(text: string) {
  const first = text.indexOf("{")
  if (first < 0) return ""
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = first; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") depth++
    if (ch === "}") {
      depth--
      if (depth === 0) return text.slice(first, i + 1)
    }
  }
  return ""
}

export function expectRunnerScript() {
  return String.raw`
param(
  [string]$Target,
  [string]$Args,
  [string]$StdinFile,
  [int]$TimeoutMs
)
$ErrorActionPreference = "Stop"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $Target
$psi.Arguments = $Args
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$p = [System.Diagnostics.Process]::Start($psi)
$outTask = $p.StandardOutput.ReadToEndAsync()
$errTask = $p.StandardError.ReadToEndAsync()
if ($StdinFile -and (Test-Path -LiteralPath $StdinFile)) {
  $bytes = [System.IO.File]::ReadAllBytes($StdinFile)
  $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $p.StandardInput.BaseStream.Flush()
}
$p.StandardInput.Close()
$timedOut = -not $p.WaitForExit($TimeoutMs)
if ($timedOut) {
  try { $p.Kill() } catch {}
  $p.WaitForExit()
}
$stdout = $outTask.GetAwaiter().GetResult()
$stderr = $errTask.GetAwaiter().GetResult()
[pscustomobject]@{
  ok = $true
  exit_code = $p.ExitCode
  timed_out = $timedOut
  stdout = $stdout
  stderr = $stderr
} | ConvertTo-Json -Depth 5
`
}

export default tool({
  description:
    "CTF Windows expect-style runner: execute a Windows console checker with text/file stdin, timeout kill, stdout/stderr capture, and optional ANSI stripping for stable interactive checker automation.",
  args: {
    target: tool.schema.string().describe("Workspace-relative Windows PE path to execute."),
    stdinText: tool.schema
      .string()
      .optional()
      .describe("Text to send to the process stdin. Mutually exclusive with stdinFile."),
    stdinFile: tool.schema.string().optional().describe("Workspace-relative file to send to process stdin."),
    targetArgs: tool.schema.string().optional().describe("Command-line arguments passed to the target."),
    timeoutMs: tool.schema.number().optional().describe("Timeout in milliseconds. Default 15000, hard cap 120000."),
    stripAnsi: tool.schema.boolean().optional().describe("Strip ANSI color escape sequences. Default true."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory. Default work/rev-windows-expect."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    if (process.platform !== "win32") throw new Error("ctf-windows-expect-runner is Windows-only")
    if (args.stdinText !== undefined && args.stdinFile !== undefined) {
      throw new Error("provide only one of stdinText or stdinFile")
    }

    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const outDir = resolveInsideWorkspace(workspace, args.outDir || "work/rev-windows-expect")
    await mkdir(outDir, { recursive: true })
    const stdinFile = args.stdinFile
      ? resolveFromDirectoryInsideWorkspace(directory, workspace, args.stdinFile)
      : path.join(outDir, "stdin.txt")
    if (args.stdinText !== undefined) await writeFile(stdinFile, args.stdinText, "utf8")

    const scriptPath = path.join(outDir, "expect_runner.ps1")
    await writeFile(scriptPath, expectRunnerScript(), "utf8")
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 15000, 120000))
    const { stdout, stderr, ok } = await safeExecWithStreams(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-Target",
        target,
        "-Args",
        args.targetArgs || "",
        "-StdinFile",
        args.stdinText !== undefined || args.stdinFile ? stdinFile : "",
        "-TimeoutMs",
        String(timeoutMs),
      ],
      {
        timeoutMs: timeoutMs + 10000,
        cwd: outDir,
        maxBuffer: 16 * 1024 * 1024,
      },
    )
    const raw = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`.trim()
    const jsonText = extractJsonBlock(raw)
    if (!jsonText) {
      const detail = compact(raw, 4000)
      if (args.jsonOnly) return JSON.stringify({ ok: false, error: detail }, null, 2)
      return `CTF_WINDOWS_EXPECT_RUNNER:\n- error: ${detail}`
    }
    const summary = JSON.parse(jsonText) as {
      ok?: boolean
      exit_code?: number
      timed_out?: boolean
      stdout?: string
      stderr?: string
    }
    if (!ok || summary.ok === false) {
      const detail = compact(raw, 4000)
      if (args.jsonOnly) return JSON.stringify({ ok: false, error: detail, summary }, null, 2)
      return `CTF_WINDOWS_EXPECT_RUNNER:\n- error: ${detail}`
    }

    const strip = args.stripAnsi !== false
    const payload = {
      schema_version: "ctf_windows_expect_runner.v1",
      target,
      stdin_file:
        args.stdinText !== undefined || args.stdinFile ? normalizeRel(path.relative(directory, stdinFile)) : null,
      exit_code: summary.exit_code ?? null,
      timed_out: summary.timed_out ?? false,
      stdout: strip ? stripAnsi(summary.stdout ?? "") : (summary.stdout ?? ""),
      stderr: strip ? stripAnsi(summary.stderr ?? "") : (summary.stderr ?? ""),
      next_actions: [
        "Use this wrapper instead of Python subprocess for unstable Windows console checkers.",
        "For breakpoint/register/memory automation, pair it with ctf-windows-debug-helper debugger=cdb.",
        "For differential probes, vary stdinText across one program instance at a time and compare exit_code/stdout.",
      ],
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return compact(
      [
        "CTF_WINDOWS_EXPECT_RUNNER:",
        `- target: ${target}`,
        `- exit_code: ${payload.exit_code}`,
        `- timed_out: ${payload.timed_out}`,
        `- stdin_file: ${payload.stdin_file || "none"}`,
        `- stdout_bytes: ${Buffer.byteLength(payload.stdout, "utf8")}`,
        `- stderr_bytes: ${Buffer.byteLength(payload.stderr, "utf8")}`,
        "stdout:",
        compact(payload.stdout, 8000) || "(empty)",
        "stderr:",
        compact(payload.stderr, 2000) || "(empty)",
        "next_actions:",
        ...payload.next_actions.map((line) => `- ${line}`),
      ].join("\n"),
    )
  },
})
