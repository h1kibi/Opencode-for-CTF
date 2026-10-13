import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExecWithStreams } from "../lib/exec-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import { extractFlagCandidates } from "../../packages/ctf-core/src/flag-rules.ts"
function collectFlagCandidates(text: string, customPattern?: string) {
  if (customPattern) {
    const regex = new RegExp(customPattern, "g")
    return Array.from(text.matchAll(regex), (match) => match[0]?.trim())
      .filter((value): value is string => Boolean(value))
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 20)
      .map((value) => ({
        value,
        confidence: "medium" as const,
        kind: "custom" as const,
        reason: "matched an explicitly supplied challenge-specific pattern; oracle verification is still required",
        source: "pwn-post-shell-runner",
      }))
  }
  return extractFlagCandidates(text, {
    origin: "pwn-post-shell-runner",
    source: "post-shell-transcript",
    text,
  }).slice(0, 20)
}

function compact(text: string, max = 10000) {
  const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (clean.length <= max) return clean
  return `${clean.slice(0, Math.floor(max * 0.6))}\n...[truncated ${clean.length - max} chars]...\n${clean.slice(clean.length - Math.floor(max * 0.4))}`
}

async function loadRuntimeProfile(contextDir: string, profileId?: string) {
  if (!profileId) return null as any
  const profilePath = resolveInsideWorkspace(contextDir, `work/pwn-runtime-profiles/${profileId}.json`)
  return JSON.parse(await readFile(profilePath, "utf8"))
}

export default tool({
  description:
    "CTF pwn post-shell runner: run a short deterministic pwd/ls/cat-flag closure sequence through an exploit script or docker substrate.",
  args: {
    exploitScript: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative pwntools exploit script that should leave an interactive shell/tube."),
    binary: tool.schema.string().optional().describe("Optional binary path for context only."),
    commandSequence: tool.schema
      .string()
      .optional()
      .describe(
        "Newline-separated post-shell commands. Defaults to pwd/ls/cat flag paths with minimal shell assumptions.",
      ),
    runtimeProfileId: tool.schema
      .string()
      .optional()
      .describe("Runtime profile id emitted by ctf-pwn-libc-runtime-doctor."),
    composeService: tool.schema.string().optional().describe("Compose service for docker exec/run."),
    containerName: tool.schema.string().optional().describe("Explicit container name for docker exec."),
    image: tool.schema.string().optional().describe("Docker image for docker run."),
    useComposeRun: tool.schema.boolean().optional().describe("Use compose run --rm instead of exec."),
    containerMountRoot: tool.schema.string().optional().describe("Container mount root. Default /work."),
    containerWorkdir: tool.schema.string().optional().describe("Container working dir."),
    timeoutMs: tool.schema.number().optional().describe("Timeout in ms. Default 20000."),
    flagPattern: tool.schema.string().optional().describe("Optional regex source for flag."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 20000, 120000))
    const profile = await loadRuntimeProfile(workspace, args.runtimeProfileId)
    const defaults = profile?.docker_runner_defaults || {}
    const cmds = String(
      args.commandSequence ||
        "pwd\nls -la .\nls -la /\ncat /flag 2>/dev/null || true\ncat /flag.txt 2>/dev/null || true\ncat flag 2>/dev/null || true\ncat flag.txt 2>/dev/null || true",
    )
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
    const tmpDir = resolveInsideWorkspace(workspace, `work/pwn-post-shell/${randomUUID().slice(0, 12)}`)
    await mkdir(tmpDir, { recursive: true })
    const driver = path.join(tmpDir, "post_shell_driver.py")
    const exploit = args.exploitScript
      ? resolveFromDirectoryInsideWorkspace(directory, workspace, args.exploitScript)
      : ""
    const relExploit = exploit ? path.relative(workspace, exploit).replace(/\\/g, "/") : ""
    const containerMountRoot = args.containerMountRoot || defaults.containerMountRoot || "/work"
    const script = `#!/usr/bin/env python3
from pwn import *
import os, re, runpy, sys, time
context.log_level='error'
cmds = ${JSON.stringify(cmds)}
exploit = ${JSON.stringify(exploit)}
in_container_exploit = ${JSON.stringify(path.posix.join(containerMountRoot, relExploit))}
if os.path.exists(in_container_exploit):
    exploit = in_container_exploit
out = ''
if not exploit:
    print('BLOCK: exploitScript required for tube takeover mode')
    raise SystemExit(2)
# Contract: exploit.py may expose io, p, r, tube, or get_io().
ns = runpy.run_path(exploit, run_name='__pwn_post_shell__')
io = ns.get('io') or ns.get('p') or ns.get('r') or ns.get('tube')
if io is None and callable(ns.get('get_io')):
    io = ns['get_io']()
if io is None:
    print('BLOCK: exploit script did not expose io/p/r/tube/get_io() for post-shell takeover')
    raise SystemExit(3)
for c in cmds:
    try:
        io.sendline(c.encode())
        time.sleep(0.15)
        chunk = io.recvrepeat(0.7).decode('utf-8', errors='replace')
        out += '$ ' + c + '\n' + chunk + '\n'
    except Exception as e:
        out += '$ ' + c + '\nERROR: ' + type(e).__name__ + ': ' + str(e) + '\n'
        break
print(out)
`
    await writeFile(driver, script, "utf8")
    const relDriver = path.relative(workspace, driver).replace(/\\/g, "/")
    const inContainerDriver = path.posix.join(containerMountRoot, relDriver)
    const containerWorkdir = args.containerWorkdir || defaults.containerWorkdir || "/work"
    const composeService = args.composeService || defaults.composeService || ""
    let command = "python"
    let argv = [driver]
    let cwd = tmpDir
    if (args.containerName)
      ((argv = ["exec", "-w", containerWorkdir, args.containerName, "python3", inContainerDriver]),
        (command = "docker"),
        (cwd = workspace))
    else if (composeService && !args.useComposeRun)
      ((argv = ["compose", "exec", "-T", "-w", containerWorkdir, composeService, "python3", inContainerDriver]),
        (command = "docker"),
        (cwd = workspace))
    else if (composeService && args.useComposeRun)
      ((argv = [
        "compose",
        "run",
        "--rm",
        "-T",
        "-w",
        containerWorkdir,
        ...(defaults.runArgs ? String(defaults.runArgs).split(/\s+/).filter(Boolean) : []),
        composeService,
        "python3",
        inContainerDriver,
      ]),
        (command = "docker"),
        (cwd = workspace))
    else if (args.image)
      ((argv = [
        "run",
        "--rm",
        "-v",
        `${workspace.replace(/\\/g, "/")}:${containerMountRoot}`,
        "-w",
        containerWorkdir,
        args.image,
        "python3",
        inContainerDriver,
      ]),
        (command = "docker"),
        (cwd = workspace))
    try {
      const { stdout, stderr } = await safeExecWithStreams(command, argv, {
        cwd,
        timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
      })
      const output = `${stdout}${stderr ? `\n${stderr}` : ""}`
      const flagCandidates = collectFlagCandidates(output, args.flagPattern)
      const flags = flagCandidates.map((candidate) => candidate.value)
      const payload = {
        schema_version: "pwn_post_shell_runner.v2",
        runtime_profile_id: args.runtimeProfileId || "",
        commands_sent: cmds,
        candidate_detected: flagCandidates.length > 0,
        flag_detected_is_candidate_only: true,
        oracle_verified: false,
        flag_candidates: flagCandidates,
        flags_found: flags,
        output: compact(output),
      }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return [
        "pwn_post_shell_runner:",
        `runtime_profile_id: ${payload.runtime_profile_id}`,
        `candidate_detected: ${payload.candidate_detected}`,
        `flag_detected_is_candidate_only: true`,
        `oracle_verified: ${payload.oracle_verified}`,
        `flag_candidates: ${flags.length ? flags.join(" | ") : "none"}`,
        "output_compact:",
        payload.output,
      ].join("\n")
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  },
})
