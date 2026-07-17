import { tool } from "@opencode-ai/plugin"
import { open, lstat, access } from "node:fs/promises"
import path from "node:path"
import { safeExec, safeExecDocker, isFailureOutput, shellQuote } from "./lib/exec-utils.ts"
import { pwnImage, revImage } from "./lib/docker-config.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

const FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g

async function dockerImageExists(image: string): Promise<boolean> {
  const { ok, output } = await safeExec(
    "docker",
    ["image", "inspect", image, "--format", "{{.Id}}"],
    process.cwd(),
    5000,
  )
  return ok && /sha256:/.test(output)
}

async function readHeadSample(target: string, maxBytes: number) {
  const fh = await open(target, "r")
  try {
    const out = Buffer.allocUnsafe(maxBytes)
    const { bytesRead } = await fh.read(out, 0, maxBytes, 0)
    return out.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

function printableStrings(buf: Buffer) {
  return Array.from(buf.toString("latin1").matchAll(/[ -~]{4,}/g), (m) => m[0])
}

function unique(lines: string[], limit: number) {
  return Array.from(new Set(lines.filter(Boolean))).slice(0, limit)
}

export default tool({
  description:
    "CTF pcap probe: fast tshark/capinfos overview with HTTP/DNS/TCP stream and flag/string fallback for packet forensics. Auto-fallback to revlab:ubuntu22.04 docker container when host tshark/capinfos/file are missing.",
  args: {
    target: tool.schema.string().describe("pcap/pcapng file path to probe"),
    backend: tool.schema
      .string()
      .optional()
      .describe("auto | host | docker. Default auto (host first; docker fallback when tools missing)."),
    image: tool.schema.string().optional().describe("Docker image override. Default tries revlab then pwn-general."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const cwd = path.dirname(target)
    const stat = await lstat(target)

    const backendArg = (args.backend ?? "auto").toLowerCase()

    // Probe host tools
    const hostFile = await safeExec("file", [target], cwd, 5000)
    const hostCap = await safeExec("capinfos", [target], cwd, 5000)
    const hostTshark = await safeExec("tshark", ["-v"], cwd, 5000)

    const hostFailures = {
      file: isFailureOutput(hostFile.output) || !hostFile.ok,
      capinfos: isFailureOutput(hostCap.output) || !hostCap.ok,
      tshark: isFailureOutput(hostTshark.output) || !hostTshark.ok,
    }
    const missingHostTools = Object.entries(hostFailures)
      .filter(([, v]) => v)
      .map(([k]) => k)

    let chosenBackend: "host" | "docker" | "degraded" = "host"
    let chosenImage: string | null = null
    let backendReason = "host_tools_available"

    if (backendArg === "docker" || (backendArg === "auto" && missingHostTools.length > 0)) {
      const candidates = args.image ? [args.image] : [revImage("ubuntu22.04"), pwnImage("general-ubuntu22.04")]
      let picked: string | null = null
      const probes: string[] = []
      for (const img of candidates) {
        const ok = await dockerImageExists(img)
        probes.push(`${img}=${ok ? "present" : "missing"}`)
        if (ok) {
          picked = img
          break
        }
      }
      if (picked) {
        chosenBackend = "docker"
        chosenImage = picked
        backendReason = `host_tools_missing[${missingHostTools.join(",")}]_using_${picked}`
      } else {
        chosenBackend = "degraded"
        backendReason = `host_missing[${missingHostTools.join(",")}]_docker_image_unavailable[${probes.join(",")}]_run:docker_compose_-f_docker/docker-compose.revlab.yml_--profile_revlab_build_revlab`
      }
    } else if (backendArg === "host") {
      chosenBackend = missingHostTools.length ? "degraded" : "host"
      if (missingHostTools.length) backendReason = `host_forced_but_missing[${missingHostTools.join(",")}]`
    }

    // 瀹為檯璺戝懡浠?
    const runCmd = async (cmdHost: string, argsHost: string[], shellInDocker: string, ms = 12000): Promise<string> => {
      if (chosenBackend === "host") {
        const r = await safeExec(cmdHost, argsHost, cwd, ms)
        return r.output
      }
      if (chosenBackend === "docker" && chosenImage) {
        const r = await safeExecDocker(context.directory, target, chosenImage, shellInDocker, Math.max(ms, 20000))
        return r.output
      }
      return `<degraded: ${cmdHost} unavailable on host and docker fallback failed>`
    }

    const fileOut =
      chosenBackend === "host" ? hostFile.output : await runCmd("file", [target], `file ${shellQuote("__TARGET__")}`)
    const capinfos =
      chosenBackend === "host"
        ? hostCap.output
        : await runCmd("capinfos", [target], `capinfos ${shellQuote("__TARGET__")}`)
    const protocolHierarchy = await runCmd(
      "tshark",
      ["-r", target, "-q", "-z", "io,phs"],
      `tshark -r ${shellQuote("__TARGET__")} -q -z io,phs`,
    )
    const http = await runCmd(
      "tshark",
      [
        "-r",
        target,
        "-Y",
        "http.request",
        "-T",
        "fields",
        "-e",
        "frame.number",
        "-e",
        "http.host",
        "-e",
        "http.request.method",
        "-e",
        "http.request.uri",
        "-c",
        "80",
      ],
      `tshark -r ${shellQuote("__TARGET__")} -Y http.request -T fields -e frame.number -e http.host -e http.request.method -e http.request.uri -c 80`,
    )
    const dns = await runCmd(
      "tshark",
      ["-r", target, "-Y", "dns.qry.name", "-T", "fields", "-e", "dns.qry.name", "-c", "120"],
      `tshark -r ${shellQuote("__TARGET__")} -Y dns.qry.name -T fields -e dns.qry.name -c 120`,
    )
    const streams = await runCmd(
      "tshark",
      ["-r", target, "-T", "fields", "-e", "tcp.stream", "-Y", "tcp", "-c", "300"],
      `tshark -r ${shellQuote("__TARGET__")} -T fields -e tcp.stream -Y tcp -c 300`,
    )

    const sample = await readHeadSample(target, Math.min(stat.size, 4 * 1024 * 1024))
    const strings = printableStrings(sample)
    const flagHits = unique(
      strings.flatMap((s) => s.match(FLAG_RE) ?? []),
      50,
    )
    const credentialHints = unique(
      strings.filter((s) => /password|passwd|token|secret|authorization|bearer|cookie|session|flag/i.test(s)),
      80,
    )
    const streamIds = unique(streams.split(/\r?\n/), 80)

    const recommended: string[] = []
    if (flagHits.length) recommended.push("verify flag-like hits immediately before deeper packet analysis")
    if (!isFailureOutput(http) && http.trim())
      recommended.push("follow HTTP objects/streams first; inspect listed host+path pairs")
    if (!isFailureOutput(dns) && dns.trim()) recommended.push("check suspicious DNS queries for exfil/base encoding")
    if (streamIds.length)
      recommended.push(`inspect top TCP streams with: tshark -r <pcap> -q -z follow,tcp,ascii,${streamIds[0]}`)
    if (chosenBackend === "degraded")
      recommended.push(
        "revlab docker image not built; run: docker compose -f docker/docker-compose.revlab.yml --profile revlab build revlab",
      )
    if (chosenBackend === "host" && /failed|unavailable/i.test(protocolHierarchy))
      recommended.push("tshark on host returned errors; rerun with backend=docker after building revlab image")
    recommended.push("for custom binary protocols, follow up with ctf-pcap-carve magic=<MAGIC> lengthSize=<N>")

    return [
      `target: ${target}`,
      `size: ${stat.size}`,
      `probe_backend: ${chosenBackend}`,
      `backend_reason: ${backendReason}`,
      `docker_image: ${chosenImage || "n/a"}`,
      `host_tool_gap: ${missingHostTools.length ? "yes" : "no"}`,
      `missing_host_tools: ${missingHostTools.length ? missingHostTools.join(", ") : "none"}`,
      `verdict: ${flagHits.length ? "direct_flag" : "pcap"}`,
      `confidence: ${flagHits.length || http.trim() || dns.trim() ? "high" : "medium"}`,
      `next_tool: ${flagHits.length ? "none" : "ctf-pcap-carve"}`,
      `next_target: ${path.basename(target)}`,
      `spawn_subagent: ${flagHits.length ? "no" : "maybe"}`,
      `direct_solve: ${flagHits.length ? "yes" : "no"}`,
      "file:",
      fileOut,
      "capinfos:",
      capinfos.split(/\r?\n/).slice(0, 80).join("\n"),
      "protocol_hierarchy:",
      protocolHierarchy.split(/\r?\n/).slice(0, 120).join("\n"),
      "http_requests:",
      ...(http && !isFailureOutput(http)
        ? http
            .split(/\r?\n/)
            .slice(0, 80)
            .map((x) => `- ${x}`)
        : ["- none_or_tshark_unavailable"]),
      "dns_queries:",
      ...(dns && !isFailureOutput(dns)
        ? unique(dns.split(/\r?\n/), 80).map((x) => `- ${x}`)
        : ["- none_or_tshark_unavailable"]),
      "tcp_stream_ids_sample:",
      ...(streamIds.length ? streamIds.map((x) => `- ${x}`) : ["- none_or_tshark_unavailable"]),
      "flag_hits:",
      ...(flagHits.length ? flagHits.map((x) => `- ${x}`) : ["- none"]),
      "credential_or_secret_strings:",
      ...(credentialHints.length ? credentialHints.slice(0, 80).map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...(recommended.length
        ? recommended.slice(0, 8).map((x) => `- ${x}`)
        : ["- inspect protocol hierarchy, HTTP/DNS first, then TCP streams"]),
    ].join("\n")
  },
})
