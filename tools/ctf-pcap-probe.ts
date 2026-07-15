import { tool } from "@opencode-ai/plugin"
import { open, lstat, access } from "node:fs/promises"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

const execFile = promisify(execFileCb)
const FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g
const REVLAB_IMAGE = "revlab:ubuntu22.04"
const PWN_GENERAL_IMAGE = "pwnlab:general-ubuntu22.04"

const WINDOWS_WRAPPERS: Record<string, string[]> = {
  file: ["file.cmd"],
  tshark: ["tshark.cmd"],
  capinfos: ["capinfos.cmd"],
}

async function resolveExec(cmd: string) {
  if (process.platform !== "win32") return cmd
  const userBin = path.join(process.env.USERPROFILE || "C:\\Users\\Administrator", "bin")
  for (const wrapper of WINDOWS_WRAPPERS[cmd] ?? []) {
    const candidate = path.join(userBin, wrapper)
    try {
      await access(candidate)
      return candidate
    } catch {}
  }
  return cmd
}

async function safeExec(cmd: string, args: string[], cwd: string, ms = 12000): Promise<{ output: string; ok: boolean }> {
  try {
    const resolved = await resolveExec(cmd)
    const { stdout, stderr } = await execFile(resolved, args, { cwd, timeout: ms, maxBuffer: 4 * 1024 * 1024 })
    const out = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`.trim()
    return { output: out || "<no output>", ok: true }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const out = `${e.stdout ?? ""}${e.stderr ? `\n[stderr]\n${e.stderr}` : ""}`.trim()
    return { output: out || `<failed: ${e.message ?? String(err)}>`, ok: false }
  }
}

function isFailure(out: string) {
  return /^<failed:/i.test(out.trim()) || /not found|not recognized|enoent/i.test(out)
}

function shellQuote(value: string) {
  return JSON.stringify(value)
}

async function dockerImageExists(image: string): Promise<boolean> {
  const { ok, output } = await safeExec("docker", ["image", "inspect", image, "--format", "{{.Id}}"], process.cwd(), 5000)
  return ok && /sha256:/.test(output)
}

async function safeExecDocker(workspaceRoot: string, workspaceFile: string, image: string, shellCommand: string, ms = 30000) {
  const containerWorkdir = "/work"
  const mountedRoot = workspaceRoot.replace(/\\/g, "/")
  const rel = path.relative(workspaceRoot, workspaceFile).replace(/\\/g, "/")
  const targetInContainer = `${containerWorkdir}/${rel}`
  const command = shellCommand.replaceAll("__TARGET__", targetInContainer)
  return await safeExec("docker", [
    "run", "--rm",
    "-v", `${mountedRoot}:${containerWorkdir}`,
    "-w", containerWorkdir,
    image,
    "bash", "-lc", command,
  ], workspaceRoot, ms)
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
  description: "CTF pcap probe: fast tshark/capinfos overview with HTTP/DNS/TCP stream and flag/string fallback for packet forensics. Auto-fallback to revlab:ubuntu22.04 docker container when host tshark/capinfos/file are missing.",
  args: {
    target: tool.schema.string().describe("pcap/pcapng file path to probe"),
    backend: tool.schema.string().optional().describe("auto | host | docker. Default auto (host first; docker fallback when tools missing)."),
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
      file: isFailure(hostFile.output) || !hostFile.ok,
      capinfos: isFailure(hostCap.output) || !hostCap.ok,
      tshark: isFailure(hostTshark.output) || !hostTshark.ok,
    }
    const missingHostTools = Object.entries(hostFailures).filter(([, v]) => v).map(([k]) => k)

    let chosenBackend: "host" | "docker" | "degraded" = "host"
    let chosenImage: string | null = null
    let backendReason = "host_tools_available"

    if (backendArg === "docker" || (backendArg === "auto" && missingHostTools.length > 0)) {
      const candidates = args.image ? [args.image] : [REVLAB_IMAGE, PWN_GENERAL_IMAGE]
      let picked: string | null = null
      const probes: string[] = []
      for (const img of candidates) {
        const ok = await dockerImageExists(img)
        probes.push(`${img}=${ok ? "present" : "missing"}`)
        if (ok) { picked = img; break }
      }
      if (picked) {
        chosenBackend = "docker"
        chosenImage = picked
        backendReason = `host_tools_missing[${missingHostTools.join(",")}]_using_${picked}`
      } else {
        chosenBackend = "degraded"
        backendReason = `host_missing[${missingHostTools.join(",")}]_docker_image_unavailable[${probes.join(",")}]_run:docker_compose_-f_templates/docker-compose.revlab.yml_--profile_revlab_build_revlab`
      }
    } else if (backendArg === "host") {
      chosenBackend = missingHostTools.length ? "degraded" : "host"
      if (missingHostTools.length) backendReason = `host_forced_but_missing[${missingHostTools.join(",")}]`
    }

    // 实际跑命令
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

    const fileOut = chosenBackend === "host" ? hostFile.output : await runCmd("file", [target], `file ${shellQuote("__TARGET__")}`)
    const capinfos = chosenBackend === "host" ? hostCap.output : await runCmd("capinfos", [target], `capinfos ${shellQuote("__TARGET__")}`)
    const protocolHierarchy = await runCmd("tshark", ["-r", target, "-q", "-z", "io,phs"], `tshark -r ${shellQuote("__TARGET__")} -q -z io,phs`)
    const http = await runCmd(
      "tshark",
      ["-r", target, "-Y", "http.request", "-T", "fields", "-e", "frame.number", "-e", "http.host", "-e", "http.request.method", "-e", "http.request.uri", "-c", "80"],
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
    const flagHits = unique(strings.flatMap((s) => s.match(FLAG_RE) ?? []), 50)
    const credentialHints = unique(strings.filter((s) => /password|passwd|token|secret|authorization|bearer|cookie|session|flag/i.test(s)), 80)
    const streamIds = unique(streams.split(/\r?\n/), 80)

    const recommended: string[] = []
    if (flagHits.length) recommended.push("verify flag-like hits immediately before deeper packet analysis")
    if (!isFailure(http) && http.trim()) recommended.push("follow HTTP objects/streams first; inspect listed host+path pairs")
    if (!isFailure(dns) && dns.trim()) recommended.push("check suspicious DNS queries for exfil/base encoding")
    if (streamIds.length) recommended.push(`inspect top TCP streams with: tshark -r <pcap> -q -z follow,tcp,ascii,${streamIds[0]}`)
    if (chosenBackend === "degraded") recommended.push("revlab docker image not built; run: docker compose -f templates/docker-compose.revlab.yml --profile revlab build revlab")
    if (chosenBackend === "host" && /failed|unavailable/i.test(protocolHierarchy)) recommended.push("tshark on host returned errors; rerun with backend=docker after building revlab image")
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
      ...(http && !isFailure(http) ? http.split(/\r?\n/).slice(0, 80).map((x) => `- ${x}`) : ["- none_or_tshark_unavailable"]),
      "dns_queries:",
      ...(dns && !isFailure(dns) ? unique(dns.split(/\r?\n/), 80).map((x) => `- ${x}`) : ["- none_or_tshark_unavailable"]),
      "tcp_stream_ids_sample:",
      ...(streamIds.length ? streamIds.map((x) => `- ${x}`) : ["- none_or_tshark_unavailable"]),
      "flag_hits:",
      ...(flagHits.length ? flagHits.map((x) => `- ${x}`) : ["- none"]),
      "credential_or_secret_strings:",
      ...(credentialHints.length ? credentialHints.slice(0, 80).map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...(recommended.length ? recommended.slice(0, 8).map((x) => `- ${x}`) : ["- inspect protocol hierarchy, HTTP/DNS first, then TCP streams"]),
    ].join("\n")
  },
})
