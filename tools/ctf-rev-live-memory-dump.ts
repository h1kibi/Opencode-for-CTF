import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`target must stay inside the current workspace: ${input}`)
  return target
}

function normalizeRel(input: string) {
  return input.replace(/\\/g, "/")
}

function compact(text: string, max = 8000) {
  if (text.length <= max) return text
  return `${text.slice(0, Math.floor(max * 0.65))}\n...[truncated ${text.length - max} chars]...\n${text.slice(text.length - Math.floor(max * 0.35))}`
}

export default tool({
  description:
    "CTF rev live-memory dump helper: generate a conservative Linux dump plan and ready-to-run script skeleton for self-decrypt / post-unpack payload capture at a stable stdout marker.",
  args: {
    target: tool.schema.string().describe("Workspace-relative binary or launcher path."),
    marker: tool.schema
      .string()
      .optional()
      .describe("Stable stdout marker that indicates the dump point has been reached."),
    dumpStart: tool.schema.string().optional().describe("Hex/decimal virtual start address to dump, e.g. 0x400000."),
    dumpSize: tool.schema.string().optional().describe("Hex/decimal byte size to dump, e.g. 0x2000."),
    argv: tool.schema.string().optional().describe("Optional argv string to append when launching the target."),
    workdir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative working directory. Default current workspace root."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory for generated helper script. Default work/rev-live-dump."),
    substrateHint: tool.schema.string().optional().describe("Optional substrate hint: docker | wsl | local-linux."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workdir = resolveInsideWorkspace(context.directory, args.workdir || ".")
    const target = resolveInsideWorkspace(context.directory, args.target)
    const outDir = resolveInsideWorkspace(context.directory, args.outDir || "work/rev-live-dump")
    await mkdir(outDir, { recursive: true })

    const relTarget = normalizeRel(path.relative(workdir, target) || path.basename(target))
    const marker = args.marker?.trim() || ""
    const dumpStart = args.dumpStart?.trim() || "<DUMP_START>"
    const dumpSize = args.dumpSize?.trim() || "<DUMP_SIZE>"
    const argv = args.argv?.trim() || ""
    const substrateHint = (args.substrateHint?.trim() || "docker").toLowerCase()
    const dumpFile = normalizeRel(path.relative(context.directory, path.join(outDir, "payload.dump.bin")))
    const scriptPath = path.join(outDir, "rev_live_dump.sh")

    const script =
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `TARGET=${JSON.stringify(`./${relTarget}`)}`,
        `MARKER=${JSON.stringify(marker || "<STDOUT_MARKER>")}`,
        `DUMP_START=${JSON.stringify(dumpStart)}`,
        `DUMP_SIZE=${JSON.stringify(dumpSize)}`,
        `DUMP_OUT=${JSON.stringify(path.posix.join("/work", normalizeRel(path.relative(context.directory, path.join(outDir, "payload.dump.bin")))))}`,
        `ARGV=${JSON.stringify(argv)}`,
        "fifo=$(mktemp -u)",
        'mkfifo "$fifo"',
        'cleanup() { rm -f "$fifo"; }',
        "trap cleanup EXIT",
        'if [[ -n "$ARGV" ]]; then eval "$TARGET $ARGV" < "$fifo" | tee /tmp/rev_live_dump.stdout & else "$TARGET" < "$fifo" | tee /tmp/rev_live_dump.stdout & fi',
        "pid=$!",
        "while IFS= read -r line; do",
        '  if [[ -n "$MARKER" && "$line" == *"$MARKER"* ]]; then',
        '    python3 - <<\'PY\' "$pid" "$DUMP_START" "$DUMP_SIZE" "$DUMP_OUT"',
        "import sys",
        "pid, start_s, size_s, out = sys.argv[1:5]",
        "start = int(start_s, 0)",
        "size = int(size_s, 0)",
        "with open(f'/proc/{pid}/mem', 'rb', buffering=0) as mem:",
        "    mem.seek(start)",
        "    data = mem.read(size)",
        "with open(out, 'wb') as f:",
        "    f.write(data)",
        "print(f'WROTE {len(data)} bytes to {out}')",
        "PY",
        "    break",
        "  fi",
        "done < /tmp/rev_live_dump.stdout",
        "wait $pid || true",
      ].join("\n") + "\n"

    await writeFile(scriptPath, script, "utf8")

    const payload = {
      schema_version: "rev_live_memory_dump.v1",
      target,
      workdir,
      substrate_hint: substrateHint,
      marker: marker || "<STDOUT_MARKER>",
      dump_start: dumpStart,
      dump_size: dumpSize,
      dump_file: dumpFile,
      helper_script: normalizeRel(path.relative(context.directory, scriptPath)),
      intended_runner:
        substrateHint === "wsl"
          ? "ctf-pwn-wsl-runner"
          : substrateHint === "local-linux"
            ? "bash/local-linux"
            : "ctf-pwn-docker-runner",
      stop_rules: [
        "dump only after a stable marker or explicitly verified post-unpack point",
        "prefer controlled challenge containers over host execution for unknown binaries",
        "if dump bytes do not match inferred arch/mode, trust runtime payload over static wrapper guesses",
      ],
      next_actions: [
        "run the generated helper script in the locked Linux substrate",
        "feed the dumped payload into ctf-rev-unicorn-helper, then generate a replay file with ctf-rev-unicorn-replay-builder",
        "stop replay at compare/check PC or success/failure branch and print key registers",
      ],
      helper_script_preview: compact(script, 3000),
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "rev_live_memory_dump:",
      "- schema_version: rev_live_memory_dump.v1",
      `- target: ${target}`,
      `- workdir: ${workdir}`,
      `- substrate_hint: ${substrateHint}`,
      `- marker: ${marker || "<STDOUT_MARKER>"}`,
      `- dump_start: ${dumpStart}`,
      `- dump_size: ${dumpSize}`,
      `- dump_file: ${dumpFile}`,
      `- helper_script: ${normalizeRel(path.relative(context.directory, scriptPath))}`,
      `- intended_runner: ${payload.intended_runner}`,
      "stop_rules:",
      ...payload.stop_rules.map((x) => `- ${x}`),
      "next_actions:",
      ...payload.next_actions.map((x) => `- ${x}`),
      "helper_script_preview:",
      compact(script, 3000),
    ].join("\n")
  },
})
