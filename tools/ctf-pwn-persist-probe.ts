import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"

const execFile = promisify(execFileCb)

const DEFAULT_SERVICES = ["pwn-general", "pwn-general20", "pwn-general24", "pwn-debian12", "pwn-alpine"]

async function run(args: string[], cwd: string, timeoutMs: number) {
  try {
    const { stdout, stderr } = await execFile("docker", args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 })
    return { ok: true, output: `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, output: `${e.stdout || ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`.trim() }
  }
}

export default tool({
  description: "CTF PWN persistent pwnlab probe: check/build/run status for long-lived pwnlab docker compose services without solving a challenge.",
  args: {
    services: tool.schema.string().optional().describe("Comma/newline-separated service names. Default pwn-general,pwn-general20,pwn-general24,pwn-debian12,pwn-alpine."),
    composeFile: tool.schema.string().optional().describe("Compose file path. Default docker-compose.revlab.yml in cwd."),
    allowUp: tool.schema.boolean().optional().describe("Actually run docker compose up -d for missing/stopped services. Default false."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per docker command. Default 20000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 20000, 120000))
    const composeFile = args.composeFile || "docker-compose.revlab.yml"
    const services = String(args.services || DEFAULT_SERVICES.join(","))
      .split(/[\r\n,]+/).map((x) => x.trim()).filter(Boolean)
    const images = await run(["images", "--format", "{{.Repository}}:{{.Tag}}"], context.directory, timeoutMs)
    const ps = await run(["compose", "-f", composeFile, "ps", "--format", "{{.Service}} {{.State}}"], context.directory, timeoutMs)
    const imageText = images.output
    const psText = ps.output
    const rows = services.map((svc) => {
      const line = psText.split(/\r?\n/).find((x) => x.startsWith(`${svc} `)) || ""
      const running = /running|up/i.test(line)
      return { service: svc, running, ps_line: line || "missing_or_stopped" }
    })
    const missingOrStopped = rows.filter((x) => !x.running).map((x) => x.service)
    let upOutput = ""
    if (args.allowUp && missingOrStopped.length) {
      const up = await run(["compose", "-f", composeFile, "up", "-d", ...missingOrStopped], context.directory, timeoutMs)
      upOutput = up.output
    }
    const payload = {
      schema_version: "pwn_persist_probe.v1",
      compose_file: composeFile,
      services_requested: services,
      services: rows,
      services_missing_or_stopped: missingOrStopped,
      images_probe_ok: images.ok,
      compose_ps_ok: ps.ok,
      allow_up: Boolean(args.allowUp),
      up_output: upOutput,
      fast_mode_ready: missingOrStopped.length === 0 || Boolean(args.allowUp),
      recommended_default_service: rows.find((x) => x.service === "pwn-general")?.running ? "pwn-general" : rows.find((x) => x.running)?.service || "pwn-general",
      images_output_compact: imageText.split(/\r?\n/).filter((x) => /pwnlab:/.test(x)).slice(0, 40),
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_PERSIST_PROBE",
      `compose_file: ${payload.compose_file}`,
      `services_requested: ${payload.services_requested.join(", ")}`,
      `services_missing_or_stopped: ${payload.services_missing_or_stopped.join(", ") || "none"}`,
      `recommended_default_service: ${payload.recommended_default_service}`,
      `fast_mode_ready: ${payload.fast_mode_ready}`,
      "services:",
      ...rows.map((x) => `- ${x.service}: ${x.running ? "running" : "missing_or_stopped"} ${x.ps_line}`),
      "pwnlab_images:",
      ...(payload.images_output_compact.length ? payload.images_output_compact.map((x) => `- ${x}`) : ["- none"]),
      "up_output:",
      upOutput || "none",
    ].join("\n")
  },
})
