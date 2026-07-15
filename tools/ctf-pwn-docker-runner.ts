import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import crypto from "node:crypto"

const pposix = path.posix

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

function validateContainerPosixPath(input: string, field: string, options?: { allowRoot?: boolean }) {
  if (!input.startsWith("/")) {
    throw new Error(`${field} must be an absolute POSIX path inside the container`)
  }
  const normalized = pposix.normalize(input)
  if (!(options?.allowRoot) && normalized === "/") {
    throw new Error(`${field} must not be '/'; use a workspace mount path such as /work or a subdirectory under it`)
  }
  return normalized
}

function isInsideContainerTree(child: string, root: string) {
  return child === root || child.startsWith(`${root}/`)
}

function compact(s: string, max = 12000) {
  const clean = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (clean.length <= max) return clean
  const head = clean.slice(0, Math.floor(max * 0.6))
  const tail = clean.slice(clean.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${clean.length - max} chars]...\n${tail}`
}

function foldRepeatedLines(s: string, threshold = 3) {
  const lines = s.split(/\r?\n/)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    let j = i + 1
    while (j < lines.length && lines[j] === line) j++
    const count = j - i
    if (line && count >= threshold) out.push(`${line} [repeated x${count}]`)
    else for (let k = 0; k < count; k++) out.push(line)
    i = j
  }
  return out.join("\n")
}

function tailLines(s: string, count: number) {
  const lines = s.split(/\r?\n/)
  return lines.slice(Math.max(0, lines.length - count)).join("\n")
}

function lastNonEmptyLines(s: string, count = 40) {
  const lines = s.split(/\r?\n/).map((x) => x.trimEnd()).filter((x) => x.trim())
  return lines.slice(Math.max(0, lines.length - count))
}

function detectPromptHint(s: string) {
  const lines = lastNonEmptyLines(s, 20)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (/(choice|menu|index|size|len|length|content|name|desc|description|prompt|select|option)\s*[:>]+\s*$/i.test(line)) return line
    if (/[$#>]\s*$/.test(line)) return line
  }
  return ""
}

function detectShellSignal(s: string) {
  return /\buid=\d+\(|\bgid=\d+\(|\$\s*$|#\s*$|\b\/bin\/sh\b|\b\/bin\/bash\b|SHELL_OK/i.test(s)
}

async function runStreamed(command: string, argv: string[], options: { cwd: string; timeoutMs: number; maxOutputBytes: number; stopOnRegex?: RegExp }) {
  return await new Promise<{ stdout: string; stderr: string; exitCode: number | string; timedOut: boolean; stoppedOnRegex: boolean; outputTruncated: boolean }>((resolve) => {
    const child = spawn(command, argv, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    const outChunks: Buffer[] = []
    const errChunks: Buffer[] = []
    let outBytes = 0
    let errBytes = 0
    let timedOut = false
    let stoppedOnRegex = false
    let outputTruncated = false
    let settled = false

    const finish = (exitCode: number | string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        stdout: Buffer.concat(outChunks, outBytes).toString("utf8"),
        stderr: Buffer.concat(errChunks, errBytes).toString("utf8"),
        exitCode,
        timedOut,
        stoppedOnRegex,
        outputTruncated,
      })
    }

    const maybeStop = () => {
      if (!options.stopOnRegex || stoppedOnRegex) return
      const joined = `${Buffer.concat(outChunks, outBytes).toString("utf8")}\n${Buffer.concat(errChunks, errBytes).toString("utf8")}`
      if (options.stopOnRegex.test(joined)) {
        stoppedOnRegex = true
        try { child.kill() } catch { /* ignore */ }
      }
    }

    const pushChunk = (store: Buffer[], currentBytes: number, chunk: Buffer) => {
      if (currentBytes >= options.maxOutputBytes) {
        outputTruncated = true
        return currentBytes
      }
      const remaining = options.maxOutputBytes - currentBytes
      const clipped = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
      if (chunk.length > remaining) outputTruncated = true
      store.push(clipped)
      return currentBytes + clipped.length
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      outBytes = pushChunk(outChunks, outBytes, Buffer.from(chunk))
      maybeStop()
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      errBytes = pushChunk(errChunks, errBytes, Buffer.from(chunk))
      maybeStop()
    })
    child.on("error", (err) => finish(err.message || "error"))
    child.on("close", (code, signal) => finish(code ?? signal ?? "error"))

    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill() } catch { /* ignore */ }
    }, options.timeoutMs)
  })
}

function splitArgs(value: string | undefined) {
  return (value || "").split(/\s+/).filter(Boolean).slice(0, 40)
}

async function loadRuntimeProfile(contextDir: string, profileId?: string) {
  if (!profileId) return null as any
  const profilePath = resolveInsideWorkspace(contextDir, `work/pwn-runtime-profiles/${profileId}.json`)
  return JSON.parse(await readFile(profilePath, "utf8"))
}

async function artifactMeta(contextDir: string, file: string, containerMountRoot: string) {
  const abs = resolveInsideWorkspace(contextDir, file)
  const buf = await readFile(abs)
  const rel = path.relative(contextDir, abs).replace(/\\/g, "/")
  return { host_path: abs, container_path: pposix.join(containerMountRoot, rel), rel_path: rel, size: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") }
}

function isComposeMissing(output: string) {
  return /no configuration file provided|cannot find a suitable configuration file|compose\.ya?ml.*not found/i.test(output)
}

export default tool({
  description: "CTF pwn Docker runner: write or run a workspace-local script inside a Docker container/profile to avoid PowerShell/docker quoting interference.",
  args: {
    script: tool.schema.string().optional().describe("Bash script content to execute inside Docker."),
    pythonInline: tool.schema.string().optional().describe("Inline Python code to run via python3 without manually writing a shell wrapper."),
    gdbInline: tool.schema.string().optional().describe("Inline gdb command script content for light one-shot debugger experiments."),
    gdbTarget: tool.schema.string().optional().describe("Workspace-relative binary path used with gdbInline."),
    workdir: tool.schema.string().optional().describe("Workspace-relative working directory on the host. Default current workspace root."),
    timeoutMs: tool.schema.number().optional().describe("Execution timeout in milliseconds. Default 15000, hard cap 120000."),
    envJson: tool.schema.string().optional().describe("Optional JSON object of environment variables for the in-container process."),
    scriptPath: tool.schema.string().optional().describe("Workspace-relative path to write the script. Default work/docker_probe.sh."),
    composeService: tool.schema.string().optional().describe("docker compose service name. Used for exec mode or compose run mode."),
    runtimeProfileId: tool.schema.string().optional().describe("Runtime profile id emitted by ctf-pwn-libc-runtime-doctor. Supplies composeService/containerWorkdir/runArgs/env defaults when omitted."),
    containerName: tool.schema.string().optional().describe("Explicit container name for docker exec mode."),
    profile: tool.schema.string().optional().describe("Optional compose profile hint for reporting only."),
    image: tool.schema.string().optional().describe("Docker image for docker run mode when no existing container/service should be used."),
    useComposeRun: tool.schema.boolean().optional().describe("Use 'docker compose run --rm <service>' instead of exec. Default false."),
    containerWorkdir: tool.schema.string().optional().describe("In-container working directory. Default is the mounted workspace mirror under /work."),
    containerMountRoot: tool.schema.string().optional().describe("Container path where the host workspace is mounted for docker run mode and script path resolution. Default /work."),
    runArgs: tool.schema.string().optional().describe("Optional extra arguments for docker run or docker compose run, e.g. '--cap-add=SYS_PTRACE --security-opt seccomp=unconfined'."),
    maxOutputBytes: tool.schema.number().optional().describe("Maximum combined stdout/stderr bytes to retain. Default 262144."),
    stopOnRegex: tool.schema.string().optional().describe("Optional regex; stop collection early once stdout/stderr matches it."),
    tailOnly: tool.schema.boolean().optional().describe("Return only the last useful response lines after folding repeated menu noise. Default false."),
    saveOutput: tool.schema.boolean().optional().describe("Save raw stdout/stderr to a workspace log file. Default false, but truncation auto-saves."),
    outputPath: tool.schema.string().optional().describe("Workspace-relative log path for raw output. Default work/docker_runner_logs/<timestamp>.log."),
    payloadText: tool.schema.string().optional().describe("Optional payload text to save as a workspace artifact and expose via OPENCODE_STAGE_PAYLOAD_FILE."),
    payloadHex: tool.schema.string().optional().describe("Optional hex payload to save as a workspace artifact and expose via OPENCODE_STAGE_PAYLOAD_FILE."),
    payloadFile: tool.schema.string().optional().describe("Workspace-relative payload file to expose via OPENCODE_STAGE_PAYLOAD_FILE without rewriting it."),
    payloadLabel: tool.schema.string().optional().describe("Optional label used in saved payload artifact names."),
    artifactFiles: tool.schema.string().optional().describe("Comma/newline-separated workspace files to hash and map host/container before execution."),
    showArtifactManifest: tool.schema.boolean().optional().describe("Print artifact manifest for script/payload/binary/libc/ld before execution. Default false unless artifactFiles/runtimeProfileId/payloadFile is present."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON summary only. Default false."),
  },
  async execute(args, context) {
    const runtimeProfile = await loadRuntimeProfile(context.directory, args.runtimeProfileId)
    const profileDefaults = runtimeProfile?.docker_runner_defaults || {}
    const workdirRel = args.workdir || "."
    const workdir = resolveInsideWorkspace(context.directory, workdirRel)
    const stat = await lstat(workdir)
    if (!stat.isDirectory()) throw new Error("workdir must be a directory")

    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 15000, 120000))
    const scriptRel = args.scriptPath || "work/docker_probe.sh"
    const scriptPath = resolveInsideWorkspace(context.directory, scriptRel)
    await mkdir(path.dirname(scriptPath), { recursive: true })

    let synthesizedScript = String(args.script || "")
    if (!synthesizedScript && args.pythonInline) {
      synthesizedScript = `python3 - <<'PY'\n${args.pythonInline}\nPY`
    }
    if (!synthesizedScript && args.gdbInline) {
      if (!args.gdbTarget) throw new Error("gdbInline requires gdbTarget")
      const gdbTarget = resolveInsideWorkspace(context.directory, args.gdbTarget)
      const relTarget = path.relative(context.directory, gdbTarget).replace(/\\/g, "/")
      const gdbScriptRel = `work/docker_gdb_inline_${Date.now()}.gdb`
      const gdbScriptAbs = resolveInsideWorkspace(context.directory, gdbScriptRel)
      await mkdir(path.dirname(gdbScriptAbs), { recursive: true })
      await writeFile(gdbScriptAbs, `${args.gdbInline}\n`, "utf8")
      synthesizedScript = `gdb -q -batch -x /work/${gdbScriptRel.replace(/\\/g, "/")} /work/${relTarget}`
    }
    if (!synthesizedScript) throw new Error("one of script, pythonInline, or gdbInline is required")

    const content = synthesizedScript.startsWith("#!") ? synthesizedScript : `#!/usr/bin/env bash\nset -euo pipefail\n${synthesizedScript}\n`
    await writeFile(scriptPath, content, "utf8")

    const extraEnv: Record<string, string> = {}
    if (args.envJson) {
      const parsed = JSON.parse(args.envJson) as Record<string, unknown>
      for (const [k, v] of Object.entries(parsed)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`invalid env var name: ${k}`)
        extraEnv[k] = String(v)
      }
    }
    if (!extraEnv.TERM) extraEnv.TERM = "xterm-256color"
    if (!extraEnv.TERMCAP) extraEnv.TERMCAP = ""
    if (!extraEnv.PYTHONUNBUFFERED) extraEnv.PYTHONUNBUFFERED = "1"
    if (runtimeProfile) {
      extraEnv.OPENCODE_PWN_RUNTIME_PROFILE = String(args.runtimeProfileId || runtimeProfile.profile_id || "")
      extraEnv.OPENCODE_PWN_LOADER_CMD = String(runtimeProfile.explicit_loader_command || "")
      extraEnv.OPENCODE_PWN_BINARY = String(runtimeProfile.binary || "")
      extraEnv.OPENCODE_PWN_LIBC = String(runtimeProfile.libc || "")
      extraEnv.OPENCODE_PWN_LD = String(runtimeProfile.ld || "")
    }

    let payloadPath = ""
    if (args.payloadFile) {
      payloadPath = resolveInsideWorkspace(context.directory, args.payloadFile)
    } else if (args.payloadText || args.payloadHex) {
      const payloadRel = `work/docker_runner_payloads/${Date.now()}-${(args.payloadLabel || "stage").replace(/[^A-Za-z0-9_.-]+/g, "-")}${args.payloadHex ? ".bin" : ".txt"}`
      payloadPath = resolveInsideWorkspace(context.directory, payloadRel)
      await mkdir(path.dirname(payloadPath), { recursive: true })
      if (args.payloadHex) {
        await writeFile(payloadPath, Buffer.from(args.payloadHex.replace(/[^0-9a-fA-F]/g, ""), "hex"))
      } else {
        await writeFile(payloadPath, String(args.payloadText || ""), "utf8")
      }
    }
    if (payloadPath) extraEnv.OPENCODE_STAGE_PAYLOAD_FILE = payloadPath.replace(/\\/g, "/")

    const effectiveComposeService = args.composeService || profileDefaults.composeService || ""
    const effectiveContainerMountRoot = args.containerMountRoot || profileDefaults.containerMountRoot || "/work"
    const effectiveRunArgs = args.runArgs || profileDefaults.runArgs || ""
    const containerMountRoot = validateContainerPosixPath(effectiveContainerMountRoot, "containerMountRoot")
    const relFromWorkspace = path.relative(context.directory, scriptPath).replace(/\\/g, "/")
    const relWorkdirFromWorkspace = path.relative(context.directory, workdir).replace(/\\/g, "/")
    const defaultContainerWorkdir = !relWorkdirFromWorkspace || relWorkdirFromWorkspace === "."
      ? containerMountRoot
      : pposix.join(containerMountRoot, relWorkdirFromWorkspace)
    const containerWorkdir = args.containerWorkdir || profileDefaults.containerWorkdir
      ? validateContainerPosixPath(args.containerWorkdir || profileDefaults.containerWorkdir, "containerWorkdir")
      : defaultContainerWorkdir
    const inContainerScript = pposix.join(containerMountRoot, relFromWorkspace)
    const artifactInputs = new Set<string>()
    artifactInputs.add(path.relative(context.directory, scriptPath).replace(/\\/g, "/"))
    if (payloadPath) artifactInputs.add(path.relative(context.directory, payloadPath).replace(/\\/g, "/"))
    if (runtimeProfile?.binary) artifactInputs.add(String(runtimeProfile.binary))
    if (runtimeProfile?.libc) artifactInputs.add(String(runtimeProfile.libc))
    if (runtimeProfile?.ld) artifactInputs.add(String(runtimeProfile.ld))
    for (const item of String(args.artifactFiles || "").split(/[\r\n,]+/).map((x) => x.trim()).filter(Boolean)) artifactInputs.add(item)
    const artifactManifest = [] as any[]
    if (args.showArtifactManifest || args.artifactFiles || args.runtimeProfileId || payloadPath) {
      for (const item of artifactInputs) {
        try { artifactManifest.push(await artifactMeta(context.directory, item, containerMountRoot)) }
        catch (err) { artifactManifest.push({ rel_path: item, error: String((err as Error).message || err) }) }
      }
    }
    const envExports = Object.entries(extraEnv).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`).join("; ")
    const shellCmd = `${envExports ? `${envExports}; ` : ""}chmod +x ${JSON.stringify(inContainerScript)} && bash ${JSON.stringify(inContainerScript)}`

    const hasExecTarget = Boolean(args.containerName) || (Boolean(effectiveComposeService) && !args.useComposeRun)
    const hasRunTarget = Boolean(args.image) || (Boolean(effectiveComposeService) && Boolean(args.useComposeRun))
    if (!hasExecTarget && !hasRunTarget) {
      throw new Error("one of containerName, composeService (exec), image, or composeService+useComposeRun (run mode) is required")
    }
    if (hasRunTarget && !isInsideContainerTree(containerWorkdir, containerMountRoot)) {
      throw new Error(`containerWorkdir must stay under containerMountRoot for docker run/compose run mode: ${containerWorkdir} is outside ${containerMountRoot}`)
    }

    const runArgs = splitArgs(effectiveRunArgs)
    const maxOutputBytes = Math.max(16 * 1024, Math.min(args.maxOutputBytes ?? 256 * 1024, 2 * 1024 * 1024))
    const stopOnRegex = args.stopOnRegex ? new RegExp(args.stopOnRegex, "m") : undefined
    const tailOnly = Boolean(args.tailOnly)
    let mode = "unknown"
    let invoked: string[] = []
    let stdout = ""
    let stderr = ""
    let exitCode: number | string = 0
    let timedOut = false
    let stoppedOnRegex = false
    let outputTruncated = false
    let successByRegex = false

    try {
      if (args.containerName) {
        mode = "docker_exec"
        invoked = ["exec", args.containerName, "bash", "-lc", shellCmd]
        const res = await runStreamed("docker", invoked, {
          cwd: context.directory,
          timeoutMs,
          maxOutputBytes,
          stopOnRegex,
        })
        stdout = res.stdout
        stderr = res.stderr
        exitCode = res.exitCode
        timedOut = res.timedOut
        stoppedOnRegex = res.stoppedOnRegex
        outputTruncated = res.outputTruncated
        successByRegex = res.stoppedOnRegex && !res.timedOut
      } else if (effectiveComposeService && !args.useComposeRun) {
        mode = "compose_exec"
        invoked = ["compose", "exec", "-T", effectiveComposeService, "bash", "-lc", shellCmd]
        const res = await runStreamed("docker", invoked, {
          cwd: context.directory,
          timeoutMs,
          maxOutputBytes,
          stopOnRegex,
        })
        stdout = res.stdout
        stderr = res.stderr
        exitCode = res.exitCode
        timedOut = res.timedOut
        stoppedOnRegex = res.stoppedOnRegex
        outputTruncated = res.outputTruncated
        successByRegex = res.stoppedOnRegex && !res.timedOut
        if (isComposeMissing(`${stdout}\n${stderr}`) && (args.image || runtimeProfile?.recommended_image || profileDefaults.composeService)) {
          mode = "docker_run_fallback"
          const fallbackImage = args.image || (runtimeProfile as any)?.recommended_image || "pwnlab:general-ubuntu22.04"
          const envArgs = Object.entries(extraEnv).flatMap(([k, v]) => ["-e", `${k}=${v}`])
          invoked = [
            "run", "--rm", "-v", `${context.directory.replace(/\\/g, "/")}:${containerMountRoot}`, "-w", containerWorkdir,
            ...envArgs, ...runArgs, fallbackImage, "bash", "-lc", shellCmd,
          ]
          const fallbackRes = await runStreamed("docker", invoked, { cwd: context.directory, timeoutMs, maxOutputBytes, stopOnRegex })
          stdout = fallbackRes.stdout
          stderr = fallbackRes.stderr
          exitCode = fallbackRes.exitCode
          timedOut = fallbackRes.timedOut
          stoppedOnRegex = fallbackRes.stoppedOnRegex
          outputTruncated = fallbackRes.outputTruncated
          successByRegex = fallbackRes.stoppedOnRegex && !fallbackRes.timedOut
        }
      } else if (effectiveComposeService && args.useComposeRun) {
        mode = "compose_run"
        const envArgs = Object.entries(extraEnv).flatMap(([k, v]) => ["-e", `${k}=${v}`])
        invoked = ["compose", "run", "--rm", "-T", ...envArgs, ...runArgs, effectiveComposeService, "bash", "-lc", shellCmd]
        const res = await runStreamed("docker", invoked, {
          cwd: context.directory,
          timeoutMs,
          maxOutputBytes,
          stopOnRegex,
        })
        stdout = res.stdout
        stderr = res.stderr
        exitCode = res.exitCode
        timedOut = res.timedOut
        stoppedOnRegex = res.stoppedOnRegex
        outputTruncated = res.outputTruncated
        successByRegex = res.stoppedOnRegex && !res.timedOut
        if (isComposeMissing(`${stdout}\n${stderr}`) && (args.image || (runtimeProfile as any)?.recommended_image)) {
          mode = "docker_run_fallback"
          const fallbackImage = args.image || (runtimeProfile as any)?.recommended_image || "pwnlab:general-ubuntu22.04"
          const envArgs = Object.entries(extraEnv).flatMap(([k, v]) => ["-e", `${k}=${v}`])
          invoked = [
            "run", "--rm", "-v", `${context.directory.replace(/\\/g, "/")}:${containerMountRoot}`, "-w", containerWorkdir,
            ...envArgs, ...runArgs, fallbackImage, "bash", "-lc", shellCmd,
          ]
          const fallbackRes = await runStreamed("docker", invoked, { cwd: context.directory, timeoutMs, maxOutputBytes, stopOnRegex })
          stdout = fallbackRes.stdout
          stderr = fallbackRes.stderr
          exitCode = fallbackRes.exitCode
          timedOut = fallbackRes.timedOut
          stoppedOnRegex = fallbackRes.stoppedOnRegex
          outputTruncated = fallbackRes.outputTruncated
          successByRegex = fallbackRes.stoppedOnRegex && !fallbackRes.timedOut
        }
      } else if (args.image) {
        mode = "docker_run"
        const envArgs = Object.entries(extraEnv).flatMap(([k, v]) => ["-e", `${k}=${v}`])
        invoked = [
          "run",
          "--rm",
          "-v",
          `${context.directory.replace(/\\/g, "/")}:${containerMountRoot}`,
          "-w",
          containerWorkdir,
          ...envArgs,
          ...runArgs,
          args.image,
          "bash",
          "-lc",
          shellCmd,
        ]
        const res = await runStreamed("docker", invoked, {
          cwd: context.directory,
          timeoutMs,
          maxOutputBytes,
          stopOnRegex,
        })
        stdout = res.stdout
        stderr = res.stderr
        exitCode = res.exitCode
        timedOut = res.timedOut
        stoppedOnRegex = res.stoppedOnRegex
        outputTruncated = res.outputTruncated
        successByRegex = res.stoppedOnRegex && !res.timedOut
      }
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number | string; signal?: string; killed?: boolean; message?: string }
      stdout = e.stdout ?? ""
      stderr = e.stderr ?? e.message ?? ""
      exitCode = e.code ?? e.signal ?? "error"
      timedOut = Boolean(e.killed) || /timed out|timeout/i.test(String(e.message ?? ""))
    }

    const savedScript = await readFile(scriptPath, "utf8")
    const rawOutput = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`
    let outputSaved = false
    let outputPath = ""
    if (args.saveOutput || outputTruncated) {
      const outputRel = args.outputPath || `work/docker_runner_logs/${new Date().toISOString().replace(/[:.]/g, "-")}.log`
      const outputAbs = resolveInsideWorkspace(context.directory, outputRel)
      await mkdir(path.dirname(outputAbs), { recursive: true })
      await writeFile(outputAbs, rawOutput, "utf8")
      outputSaved = true
      outputPath = outputAbs
    }
    const foldedStdout = foldRepeatedLines(stdout)
    const foldedStderr = foldRepeatedLines(stderr)
    const mergedOutput = `${foldedStdout}${foldedStderr ? `\n[stderr]\n${foldedStderr}` : ""}`
    const output = tailOnly ? tailLines(mergedOutput, 80) : mergedOutput
    const outputTailLines = lastNonEmptyLines(rawOutput, 60)
    const promptHint = detectPromptHint(rawOutput)
    const shellSignal = detectShellSignal(rawOutput)
    const terminationClass = successByRegex
      ? (String(exitCode).toUpperCase().includes("SIGTERM") || String(exitCode) === "15" ? "forced_stop_after_success" : "regex_success")
      : timedOut
        ? "timeout_without_signal"
        : shellSignal && !timedOut
          ? "transport_eof_after_success"
          : /segmentation fault|sigsegv|core dumped|illegal instruction|sigill|sigabrt|abort|bus error|sigbus/i.test(rawOutput.toLowerCase())
            ? "process_crash"
            : "clean_exit_or_unknown"
    const containerPathTable = [
      `host workspace root => ${context.directory}`,
      `host workdir => ${workdir}`,
      `container mount root => ${containerMountRoot}`,
      `container workdir => ${containerWorkdir}`,
      `host script => ${scriptPath}`,
      `container script => ${inContainerScript}`,
    ]
    const summary = {
      schema_version: "pwn_docker_runner.v4",
      mode,
      root_cause_category: timedOut ? "challenge_timeout_or_wait" : String(exitCode) === "error" ? "tool_failure_or_container_invocation" : "process_completed",
      script_path: scriptPath,
      in_container_script: inContainerScript,
      workdir,
      container_mount_root: containerMountRoot,
      container_workdir: containerWorkdir,
      runtime_profile_id: args.runtimeProfileId || "",
      compose_service: effectiveComposeService || "",
      container_name: args.containerName || "",
      image: args.image || "",
      profile: args.profile || "",
      timeout: timedOut,
      stopped_on_regex: stoppedOnRegex,
      success_by_regex: successByRegex,
      shell_signal_detected: shellSignal,
      termination_class: terminationClass,
      prompt_hint: promptHint,
      exit_code: exitCode,
      max_output_bytes: maxOutputBytes,
      output_truncated: outputTruncated,
      output_saved: outputSaved,
      output_path: outputPath,
      payload_path: payloadPath,
      tail_only: tailOnly,
      invoked,
      script_bytes: Buffer.byteLength(savedScript, "utf8"),
      env_defaults_applied: ["TERM", "TERMCAP", "PYTHONUNBUFFERED"].filter((k) => Object.prototype.hasOwnProperty.call(extraEnv, k)),
      artifact_manifest: artifactManifest,
    }

    if (args.jsonOnly) return JSON.stringify({ pwn_docker_runner: summary, output: compact(output) }, null, 2)

    return [
      "pwn_docker_runner:",
      "- schema_version: pwn_docker_runner.v4",
      `- mode: ${mode}`,
      `- script_path: ${scriptPath}`,
      `- in_container_script: ${inContainerScript}`,
      `- workdir: ${workdir}`,
      `- container_mount_root: ${containerMountRoot}`,
      `- container_workdir: ${containerWorkdir}`,
      `- runtime_profile_id: ${args.runtimeProfileId || ""}`,
      `- compose_service: ${effectiveComposeService || ""}`,
      `- container_name: ${args.containerName || ""}`,
      `- image: ${args.image || ""}`,
      `- profile: ${args.profile || ""}`,
      `- timeout: ${timedOut}`,
      `- root_cause_category: ${summary.root_cause_category}`,
      `- stopped_on_regex: ${stoppedOnRegex}`,
      `- success_by_regex: ${successByRegex}`,
      `- shell_signal_detected: ${shellSignal}`,
      `- termination_class: ${terminationClass}`,
      `- prompt_hint: ${promptHint || "none"}`,
      `- exit_code: ${exitCode}`,
      `- max_output_bytes: ${maxOutputBytes}`,
      `- output_truncated: ${outputTruncated}`,
      `- output_saved: ${outputSaved}`,
      `- output_path: ${outputPath}`,
      `- payload_path: ${payloadPath}`,
      `- tail_only: ${tailOnly}`,
      `- invoked: ${invoked.join(" ")}`,
      `- script_bytes: ${Buffer.byteLength(savedScript, "utf8")}`,
      `- env_defaults_applied: ${summary.env_defaults_applied.join(" | ")}`,
      "path_equivalence:",
      ...containerPathTable.map((x) => `- ${x}`),
      "artifact_manifest:",
      ...(artifactManifest.length ? artifactManifest.map((a) => a.error ? `- ${a.rel_path}: ERROR ${a.error}` : `- ${a.rel_path}: host=${a.host_path} container=${a.container_path} size=${a.size} sha256=${a.sha256}`) : ["- none"]),
      "contract:",
      "- exec modes require an existing compose service or container.",
      "- run modes can start a temporary container via image or composeService+useComposeRun.",
      "- Use this wrapper when Docker is the active substrate and complex docker/bash quoting through PowerShell would cause drift.",
      "- In docker run mode, the host workspace is always mounted at containerMountRoot; containerWorkdir is validated separately to prevent path confusion.",
      "- containerWorkdir must not be '/' and run-mode workdirs must stay under the mount root so relative challenge paths keep working.",
      "- stopOnRegex can terminate collection once the wanted response appears.",
      "- success_by_regex=true means the wanted regex appeared before the process was terminated; treat it as a positive stop condition, not a generic SIGTERM failure.",
      "- Raw stdout/stderr can be saved to a workspace log file; truncation auto-saves by default.",
      "output_compact:",
      compact(output),
      "tail_summary:",
      ...(outputTailLines.length ? outputTailLines.map((x) => `- ${x}`) : ["- none"]),
    ].join("\n")
  },
})
