import { tool } from "@opencode-ai/plugin"
import { safeExec } from "./lib/exec-utils.ts"

const DEFAULT_SERVICES = ["pwn-general", "pwn-general20", "pwn-general24", "pwn-debian12", "pwn-alpine"]

export default tool({
  description:
    "CTF PWN persistent pwnlab probe: check/build/run status for long-lived pwnlab docker compose services without solving a challenge.",
  args: {
    services: tool.schema
      .string()
      .optional()
      .describe(
        "Comma/newline-separated service names. Default pwn-general,pwn-general20,pwn-general24,pwn-debian12,pwn-alpine.",
      ),
    composeFile: tool.schema
      .string()
      .optional()
      .describe("Compose file path. Default docker/docker-compose.revlab.yml in cwd."),
    allowUp: tool.schema
      .boolean()
      .optional()
      .describe("Actually run docker compose up -d for missing/stopped services. Default false."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per docker command. Default 20000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 20000, 120000))
    const composeFile = args.composeFile || "docker/docker-compose.revlab.yml"
    const services = String(args.services || DEFAULT_SERVICES.join(","))
      .split(/[\r\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
    const images = await safeExec(
      "docker",
      ["images", "--format", "{{.Repository}}:{{.Tag}}"],
      context.directory,
      timeoutMs,
    )
    const ps = await safeExec(
      "docker",
      ["compose", "-f", composeFile, "ps", "--format", "{{.Service}} {{.State}}"],
      context.directory,
      timeoutMs,
    )
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
      const up = await safeExec(
        "docker",
        ["compose", "-f", composeFile, "up", "-d", ...missingOrStopped],
        context.directory,
        timeoutMs,
      )
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
      recommended_default_service: rows.find((x) => x.service === "pwn-general")?.running
        ? "pwn-general"
        : rows.find((x) => x.running)?.service || "pwn-general",
      images_output_compact: imageText
        .split(/\r?\n/)
        .filter((x) => /pwnlab:/.test(x))
        .slice(0, 40),
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
