import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pwnImage } from "./lib/docker-config.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function detectArchFromBuffer(buf: Buffer) {
  if (buf.length >= 20 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    const machine = buf.readUInt16LE(18)
    if (machine === 0x3e) return "amd64"
    if (machine === 0x03) return "i386"
    if (machine === 0xb7) return "aarch64"
    if (machine === 0x08) return "mipsel"
  }
  return "unknown"
}

function detectArch(fileOut: string) {
  const lower = fileOut.toLowerCase()
  if (/aarch64|arm64/.test(lower)) return "aarch64"
  if (/mipsel/.test(lower) || /mips.*little/.test(lower)) return "mipsel"
  if (/i386|32-bit|intel 80386|elf32/.test(lower)) return "i386"
  return "amd64"
}

function defaultsForArch(arch: string) {
  if (arch === "aarch64")
    return { image: pwnImage("aarch64"), service: "pwn-aarch64", profile: "aarch64", reason: "arch_aarch64" }
  if (arch === "mipsel")
    return { image: pwnImage("mipsel"), service: "pwn-mipsel", profile: "mipsel", reason: "arch_mipsel" }
  if (arch === "i386")
    return { image: pwnImage("i386-ubuntu20.04"), service: "pwn-i386", profile: "i386", reason: "arch_i386" }
  return {
    image: pwnImage("general-ubuntu22.04"),
    service: "pwn-general",
    profile: "general",
    reason: "arch_default_amd64",
  }
}

function inferVersion(text: string) {
  const m = text.match(/glibc\s*2\.(\d+)|glibc 2\.(\d+)|gnu c library.*stable release version\s*2\.(\d+)/i)
  if (!m) return "unknown"
  const minor = m[1] || m[2] || m[3]
  return `2.${minor}`
}

function defaultsForLibcVersion(version: string) {
  if (/2\.27/.test(version))
    return {
      image: pwnImage("general-ubuntu18.04"),
      service: "pwn-general18",
      profile: "general18",
      reason: "glibc_2.27",
    }
  if (/2\.28|2\.29|2\.30|2\.31/.test(version))
    return {
      image: pwnImage("general-ubuntu20.04"),
      service: "pwn-general20",
      profile: "general20",
      reason: "glibc_2.28_to_2.31",
    }
  if (/2\.32|2\.33|2\.34|2\.35/.test(version))
    return {
      image: pwnImage("general-ubuntu22.04"),
      service: "pwn-general",
      profile: "general",
      reason: "glibc_2.32_to_2.35",
    }
  if (/2\.36|2\.37|2\.38|2\.39|2\.40/.test(version))
    return {
      image: pwnImage("general-ubuntu24.04"),
      service: "pwn-general24",
      profile: "general24",
      reason: "glibc_2.36_plus",
    }
  return null
}

export default tool({
  description:
    "CTF PWN Linux session: one-click lock a Linux ELF challenge onto one containerized runtime profile and emit defaults for docker runner, gdb snapshot, expect runner, and exploit iteration.",
  args: {
    binary: tool.schema.string().describe("Workspace-relative ELF binary path."),
    libc: tool.schema.string().optional().describe("Workspace-relative bundled libc path when present."),
    ld: tool.schema.string().optional().describe("Workspace-relative bundled loader path when present."),
    remoteHost: tool.schema.string().optional().describe("Remote host if this session should remember remote context."),
    remotePort: tool.schema.string().optional().describe("Remote port if this session should remember remote context."),
    outDir: tool.schema.string().optional().describe("Workspace-relative output dir. Default work/pwn-linux-sessions."),
    sessionId: tool.schema
      .string()
      .optional()
      .describe("Optional stable session id. Default derived from binary name."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const binaryAbs = resolveInsideWorkspace(context.directory, args.binary)
    const binarySt = await lstat(binaryAbs)
    if (!binarySt.isFile()) throw new Error("binary must be a file")
    const raw = await readFile(binaryAbs)
    const fileOut = raw.subarray(0, 0x1000).toString("latin1")
    const arch = detectArchFromBuffer(raw) !== "unknown" ? detectArchFromBuffer(raw) : detectArch(fileOut)
    const libcVersion = args.libc
      ? inferVersion((await readFile(resolveInsideWorkspace(context.directory, args.libc))).toString("latin1"))
      : ""
    const baseDefaults = defaultsForLibcVersion(libcVersion) || defaultsForArch(arch)

    const runtimeProfileId = args.libc
      ? `${path.basename(args.binary).replace(/[^A-Za-z0-9_.-]+/g, "-")}-session`
      : `${path.basename(args.binary).replace(/[^A-Za-z0-9_.-]+/g, "-")}-${baseDefaults.profile}-session`

    const binaryPosix = args.binary.replace(/\\/g, "/")
    const binaryDirPosix =
      path.posix.dirname(binaryPosix) === "." ? "/work" : path.posix.join("/work", path.posix.dirname(binaryPosix))
    const payload = {
      schema_version: "pwn_linux_session.v1",
      session_id: args.sessionId || runtimeProfileId,
      runtime_profile_id: args.sessionId || runtimeProfileId,
      binary: args.binary,
      libc: args.libc || "",
      ld: args.ld || "",
      arch,
      libc_version: libcVersion || "unknown",
      remote: {
        host: args.remoteHost || "",
        port: args.remotePort || "",
      },
      recommended_image: baseDefaults.image,
      recommended_service: baseDefaults.service,
      recommended_profile: baseDefaults.profile,
      recommendation_reason: baseDefaults.reason,
      docker_runner_defaults: {
        composeService: baseDefaults.service,
        containerMountRoot: "/work",
        containerWorkdir: binaryDirPosix,
        runArgs: "--cap-add=SYS_PTRACE --security-opt seccomp=unconfined",
      },
      explicit_loader_command:
        args.ld && args.libc
          ? `${args.ld.replace(/\\/g, "/")} --library-path ${path.posix.dirname(args.libc.replace(/\\/g, "/"))} ${binaryPosix}`
          : "",
      next_defaults: {
        docker_runner: `ctf-pwn-docker-runner runtimeProfileId=${args.sessionId || runtimeProfileId}`,
        gdb_snapshot: `ctf-pwn-gdb-snapshot runtimeProfileId=${args.sessionId || runtimeProfileId} binary=${args.binary}`,
        expect_runner: `ctf-pwn-expect-runner mode=docker runtimeProfileId=${args.sessionId || runtimeProfileId} binary=${args.binary}`,
      },
      lock_contract: [
        "Keep exploit.py, docker runner, gdb snapshot, expect runner, and payloads on this runtimeProfileId until falsified.",
        "Do not bounce between host, WSL, and Docker once this Linux ELF session is locked.",
      ],
    }

    const outDir = resolveInsideWorkspace(context.directory, args.outDir || "work/pwn-linux-sessions")
    await mkdir(outDir, { recursive: true })
    const outFile = path.join(outDir, `${payload.session_id}.json`)
    await writeFile(outFile, JSON.stringify(payload, null, 2), "utf8")
    const profileDir = resolveInsideWorkspace(context.directory, "work/pwn-runtime-profiles")
    await mkdir(profileDir, { recursive: true })
    await writeFile(
      path.join(profileDir, `${payload.runtime_profile_id}.json`),
      JSON.stringify(payload, null, 2),
      "utf8",
    )

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_LINUX_SESSION",
      `session_id: ${payload.session_id}`,
      `runtime_profile_id: ${payload.runtime_profile_id}`,
      `session_path: ${path.relative(context.directory, outFile).replace(/\\/g, "/")}`,
      `binary: ${args.binary}`,
      `libc: ${args.libc || "none"}`,
      `ld: ${args.ld || "none"}`,
      `arch: ${arch}`,
      `libc_version: ${payload.libc_version}`,
      `recommended_image: ${payload.recommended_image}`,
      `recommended_service: ${payload.recommended_service}`,
      `recommended_profile: ${payload.recommended_profile}`,
      `recommendation_reason: ${payload.recommendation_reason}`,
      `docker_runner_defaults: composeService=${payload.docker_runner_defaults.composeService} containerWorkdir=${payload.docker_runner_defaults.containerWorkdir} runArgs=${payload.docker_runner_defaults.runArgs}`,
      `explicit_loader_command: ${payload.explicit_loader_command || "none"}`,
      "next_defaults:",
      `- ${payload.next_defaults.docker_runner}`,
      `- ${payload.next_defaults.gdb_snapshot}`,
      `- ${payload.next_defaults.expect_runner}`,
      "lock_contract:",
      ...payload.lock_contract.map((x) => `- ${x}`),
    ].join("\n")
  },
})
