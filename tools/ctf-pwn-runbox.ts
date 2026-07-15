import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"

const execFile = promisify(execFileCb)

const PROFILES: Record<string, string> = {
  general: "pwnlab:general-ubuntu22.04",
  default: "pwnlab:general-ubuntu22.04",
  general20: "pwnlab:general-ubuntu20.04",
  general24: "pwnlab:general-ubuntu24.04",
  debian11: "pwnlab:general-debian11",
  debian12: "pwnlab:general-debian12",
  alpine: "pwnlab:general-alpine",
  aarch64: "pwnlab:aarch64",
  arm64: "pwnlab:aarch64",
  mipsel: "pwnlab:mipsel",
  i386: "pwnlab:i386-ubuntu20.04",
  heavy: "pwnlab:heavy-ubuntu22.04",
  heavy24: "pwnlab:heavy-ubuntu24.04",
}

function compact(s: string, max = 12000) {
  const clean = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (clean.length <= max) return clean
  return `${clean.slice(0, Math.floor(max * 0.6))}\n...[truncated ${clean.length - max} chars]...\n${clean.slice(clean.length - Math.floor(max * 0.4))}`
}

function psCommand(argv: string[]) {
  return `docker ${argv.map((arg) => arg.includes(" ") || arg.includes(":") || arg.includes(";") ? JSON.stringify(arg) : arg).join(" ")}`
}

async function imageExists(image: string) {
  try {
    await execFile("docker", ["image", "inspect", image], { timeout: 8000, maxBuffer: 512 * 1024 })
    return true
  } catch {
    return false
  }
}

export default tool({
  description: "CTF PWN runbox: generate or run a prebuilt pwnlab docker run command without copying compose templates.",
  args: {
    profile: tool.schema.string().optional().describe("general | general20 | general24 | debian11 | debian12 | alpine | aarch64 | mipsel | i386 | heavy | heavy24. Default general."),
    image: tool.schema.string().optional().describe("Override Docker image."),
    command: tool.schema.string().optional().describe("Command to run inside container. Default bash."),
    interactive: tool.schema.boolean().optional().describe("Use -it for interactive shell. Default false for generated one-shot commands."),
    allowRun: tool.schema.boolean().optional().describe("Actually run the docker command. Default false; otherwise only generate plan."),
    timeoutMs: tool.schema.number().optional().describe("Execution timeout when allowRun=true. Default 20000, max 120000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const profile = (args.profile || "general").toLowerCase()
    const image = args.image || PROFILES[profile]
    if (!image) return `BLOCK: unknown profile '${args.profile}'. Known: ${Object.keys(PROFILES).join(", ")}`

    const exists = await imageExists(image)
    const containerWorkdir = "/work"
    const hostMount = `${context.directory.replace(/\\/g, "/")}:${containerWorkdir}`
    const inner = args.command || "bash"
    const interactive = Boolean(args.interactive || inner === "bash")
    const runArgs = [
      "run",
      "--rm",
      ...(interactive ? ["-it"] : []),
      "--cap-add=SYS_PTRACE",
      "--security-opt",
      "seccomp=unconfined",
      "-v",
      hostMount,
      "-w",
      containerWorkdir,
      image,
      "bash",
      "-lc",
      inner,
    ]

    const payload = {
      operation: "ctf-pwn-runbox",
      profile,
      image,
      image_present: exists,
      mode: args.allowRun ? "run" : "plan",
      interactive,
      command: psCommand(runArgs),
      next_inside_container_check: "file ./chall && checksec --file=./chall && python3 exploit.py",
      build_or_pull_needed: !exists,
    }

    if (!args.allowRun) {
      return args.jsonOnly ? JSON.stringify(payload, null, 2) : [
        "PWN_RUNBOX",
        `profile: ${payload.profile}`,
        `image: ${payload.image}`,
        `image_present: ${payload.image_present}`,
        `mode: ${payload.mode}`,
        `interactive: ${payload.interactive}`,
        `command: ${payload.command}`,
        `build_or_pull_needed: ${payload.build_or_pull_needed}`,
        `next_inside_container_check: ${payload.next_inside_container_check}`,
      ].join("\n")
    }

    if (!exists) return `BLOCK: image missing: ${image}. Build/pull it first or run /ctf-pwn-prewarm.`

    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 20000, 120000))
    let stdout = ""
    let stderr = ""
    let exitCode: number | string = 0
    try {
      const res = await execFile("docker", runArgs, { cwd: context.directory, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 })
      stdout = res.stdout
      stderr = res.stderr
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number | string; signal?: string; message?: string }
      stdout = e.stdout ?? ""
      stderr = e.stderr ?? e.message ?? ""
      exitCode = e.code ?? e.signal ?? "error"
    }

    const result = { ...payload, exit_code: exitCode, output: compact(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`) }
    if (args.jsonOnly) return JSON.stringify(result, null, 2)
    return [
      "PWN_RUNBOX_RESULT",
      `profile: ${profile}`,
      `image: ${image}`,
      `exit_code: ${exitCode}`,
      "output_compact:",
      result.output,
    ].join("\n")
  },
})
