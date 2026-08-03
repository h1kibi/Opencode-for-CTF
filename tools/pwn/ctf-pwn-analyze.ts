import { tool } from "@opencode-ai/plugin"
import pwnCheckEnv from "./ctf-pwn-check-env.ts"
import pwnProbe from "./ctf-pwn-probe.ts"
import remoteFingerprint from "./ctf-pwn-remote-fingerprint.ts"

export default tool({
  description:
    "CTF PWN analysis facade: stable lightweight first-pass entrypoint for local binary or remote service routing. Delegates to ctf-pwn-probe, with optional environment check and one low-noise remote fingerprint; never invokes docker/gdb/heap/stage heavy tools.",
  args: {
    targetDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative challenge directory. Default current directory."),
    binary: tool.schema.string().optional().describe("Workspace-relative binary override."),
    host: tool.schema.string().optional().describe("Optional remote host."),
    port: tool.schema.number().optional().describe("Optional remote port."),
    checkEnv: tool.schema.boolean().optional().describe("Also run ctf-pwn-check-env profile=basic. Default false."),
    remoteFingerprint: tool.schema
      .boolean()
      .optional()
      .describe("Run formal baseline-vs-mutant ctf-pwn-remote-fingerprint when host+port are supplied. Default false."),
    baselinePayloadText: tool.schema
      .string()
      .optional()
      .describe("Optional baseline payload text for remote fingerprint."),
    mutantPayloadText: tool.schema.string().optional().describe("Optional mutant payload text for remote fingerprint."),
    timeoutMs: tool.schema
      .number()
      .optional()
      .describe("Remote fingerprint timeout in ms. Default delegated tool default."),
    maxFiles: tool.schema
      .number()
      .optional()
      .describe("Maximum files for ctf-pwn-probe. Default delegated tool default."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const toolContext = {
      directory: context?.directory ?? context?.worktree ?? process.cwd(),
      worktree: context?.worktree ?? context?.directory ?? process.cwd(),
    } as never
    const probe = await pwnProbe.execute(
      {
        targetDir: args.targetDir,
        binary: args.binary,
        host: args.host,
        port: args.port,
        maxFiles: args.maxFiles,
        jsonOnly: args.jsonOnly === true,
      },
      toolContext,
    )

    const env = args.checkEnv
      ? await pwnCheckEnv.execute(
          {
            profile: "basic",
            jsonOnly: args.jsonOnly === true,
          },
          toolContext,
        )
      : null

    const remote =
      args.remoteFingerprint && args.host && args.port
        ? await remoteFingerprint.execute(
            {
              host: args.host,
              port: args.port,
              baselinePayloadText: args.baselinePayloadText,
              mutantPayloadText: args.mutantPayloadText,
              timeoutMs: args.timeoutMs,
              jsonOnly: args.jsonOnly === true,
            },
            toolContext,
          )
        : null

    const payload = {
      targetDir: args.targetDir || ".",
      binary: args.binary || "",
      remote: args.host && args.port ? `${args.host}:${args.port}` : "",
      probe,
      env,
      remoteFingerprint: remote,
      skipped: [
        ...(args.checkEnv ? [] : ["env_check_skipped: set checkEnv=true when tool health/substrate is uncertain"]),
        ...(args.remoteFingerprint
          ? args.host && args.port
            ? []
            : ["remote_fingerprint_skipped: host+port required"]
          : [
              "remote_fingerprint_skipped: set remoteFingerprint=true after selecting one harmless baseline/mutant pair",
            ]),
      ],
      next_tool_hint:
        "Use ctf-pwn-runner/ctf-pwn-offset for the selected fast path; request pwn-heavy only for docker/gdb/heap/stage workflows after evidence justifies it.",
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_PWN_ANALYZE:",
      `- target_dir: ${payload.targetDir}`,
      `- binary: ${payload.binary || "auto"}`,
      `- remote: ${payload.remote || "none"}`,
      `- next_tool_hint: ${payload.next_tool_hint}`,
      "- probe:",
      String(probe)
        .split(/\r?\n/)
        .map((line) => `  ${line}`)
        .join("\n"),
      "- env:",
      env
        ? String(env)
            .split(/\r?\n/)
            .map((line) => `  ${line}`)
            .join("\n")
        : "  skipped",
      "- remote_fingerprint:",
      remote
        ? String(remote)
            .split(/\r?\n/)
            .map((line) => `  ${line}`)
            .join("\n")
        : "  skipped",
      "- skipped:",
      ...payload.skipped.map((line) => `  ${line}`),
    ].join("\n")
  },
})
