import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExec } from "./lib/exec-utils.ts"
import { caseDirectory } from "../src/case-state.ts"

export default tool({
  description: "Run a bounded PCAP extraction pipeline and save structured forensic artifacts.",
  args: {
    target: tool.schema.string(),
    caseId: tool.schema.string().optional(),
  },
  async execute(args, context) {
    const target = path.resolve(context.directory, args.target)
    const root = path.resolve(context.directory)
    const relative = path.relative(root, target)
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("target must stay inside workspace")
    const cwd = path.dirname(target)
    const commands: Record<string, string[]> = {
      file: [target],
      capinfos: [target],
      protocolHierarchy: ["-r", target, "-q", "-z", "io,phs"],
      httpRequests: ["-r", target, "-Y", "http.request", "-T", "fields", "-e", "http.host", "-e", "http.request.uri", "-c", "100"],
      dnsQueries: ["-r", target, "-Y", "dns.qry.name", "-T", "fields", "-e", "dns.qry.name", "-c", "150"],
      tcpStreams: ["-r", target, "-T", "fields", "-e", "tcp.stream", "-Y", "tcp", "-c", "300"],
    }
    const executables: Record<string, string> = {
      file: "file",
      capinfos: "capinfos",
      protocolHierarchy: "tshark",
      httpRequests: "tshark",
      dnsQueries: "tshark",
      tcpStreams: "tshark",
    }
    const results: Record<string, { ok: boolean; output: string }> = {}
    for (const [name, commandArgs] of Object.entries(commands)) {
      const result = await safeExec(executables[name], commandArgs, cwd, 15_000)
      results[name] = { ok: result.ok, output: (result.output ?? "").slice(0, 16_000) }
    }
    const artifact = {
      target,
      capturedAt: new Date().toISOString(),
      backend: "host",
      results,
      next: ["inspect HTTP objects and TCP streams", "review suspicious DNS for encoding/exfiltration", "verify flag candidates with the independent oracle"],
    }
    if (args.caseId) {
      const directory = path.join(caseDirectory(context.directory, args.caseId), "artifacts", "pcap")
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, `extract-${Date.now()}.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8")
    }
    return JSON.stringify(artifact, null, 2)
  },
})
