import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import crypto from "node:crypto"
import path from "node:path"

const execFile = promisify(execFileCb)

function resolveInsideWorkspace(contextDir: string, input?: string) {
  if (!input) return ""
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

async function fileMeta(contextDir: string, label: string, input?: string) {
  if (!input) return { label, path: "", exists: false }
  const abs = resolveInsideWorkspace(contextDir, input)
  try {
    const buf = await readFile(abs)
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex")
    let buildId = ""
    try {
      const { stdout } = await execFile("readelf", ["-n", abs], { cwd: path.dirname(abs), timeout: 4000, maxBuffer: 512 * 1024 })
      buildId = stdout.match(/Build ID:\s*([0-9a-f]+)/i)?.[1] || ""
    } catch {}
    return { label, path: path.relative(contextDir, abs).replace(/\\/g, "/"), abs_path: abs, exists: true, size: buf.length, sha256, build_id: buildId }
  } catch {
    return { label, path: input, exists: false }
  }
}

export default tool({
  description: "CTF PWN runtime lock: create a hard identity card for binary/loader/libc/patched/docker/remote runtime and save it as a reusable profile.",
  args: {
    binary: tool.schema.string().describe("Workspace-relative binary actually executed."),
    loader: tool.schema.string().optional().describe("Workspace-relative bundled loader/ld path if used."),
    libc: tool.schema.string().optional().describe("Workspace-relative bundled libc path if used."),
    patchedBinary: tool.schema.string().optional().describe("Workspace-relative patched binary if different from original."),
    originalBinary: tool.schema.string().optional().describe("Workspace-relative original binary if binary is patched."),
    remoteHost: tool.schema.string().optional().describe("Remote host if validating against remote."),
    remotePort: tool.schema.string().optional().describe("Remote port if validating against remote."),
    composeService: tool.schema.string().optional().describe("Docker compose service used for this lock."),
    containerName: tool.schema.string().optional().describe("Explicit docker container used for this lock."),
    image: tool.schema.string().optional().describe("Docker image used for this lock."),
    containerMountRoot: tool.schema.string().optional().describe("Container mount root. Default /work."),
    containerWorkdir: tool.schema.string().optional().describe("Container working dir. Default /work."),
    runArgs: tool.schema.string().optional().describe("Docker run args required for this lock."),
    patched: tool.schema.boolean().optional().describe("Whether the executed binary is patched. Inferred from patchedBinary when omitted."),
    lockId: tool.schema.string().optional().describe("Optional stable lock id. Default derived from binary/libc/ld/docker identity."),
    outDir: tool.schema.string().optional().describe("Workspace-relative output dir. Default work/pwn-runtime-locks."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const binary = await fileMeta(context.directory, "binary", args.binary)
    const loader = await fileMeta(context.directory, "loader", args.loader)
    const libc = await fileMeta(context.directory, "libc", args.libc)
    const patchedBinary = await fileMeta(context.directory, "patched_binary", args.patchedBinary)
    const originalBinary = await fileMeta(context.directory, "original_binary", args.originalBinary)
    const docker = {
      enabled: Boolean(args.composeService || args.containerName || args.image),
      compose_service: args.composeService || "",
      container_name: args.containerName || "",
      image: args.image || "",
      container_mount_root: args.containerMountRoot || "/work",
      container_workdir: args.containerWorkdir || "/work",
      run_args: args.runArgs || "",
    }
    const remote = { enabled: Boolean(args.remoteHost || args.remotePort), host: args.remoteHost || "", port: args.remotePort || "" }
    const patched = args.patched ?? Boolean(args.patchedBinary)
    const idMaterial = JSON.stringify({ b: (binary as any).sha256, l: (loader as any).sha256, c: (libc as any).sha256, patched, docker, remote })
    const lockId = args.lockId || `rtlock-${crypto.createHash("sha256").update(idMaterial).digest("hex").slice(0, 12)}`
    const outDir = resolveInsideWorkspace(context.directory, args.outDir || "work/pwn-runtime-locks")
    await mkdir(outDir, { recursive: true })
    const profilePath = path.join(outDir, `${lockId}.json`)
    const runtimeProfileDir = resolveInsideWorkspace(context.directory, "work/pwn-runtime-profiles")
    await mkdir(runtimeProfileDir, { recursive: true })
    const runtimeProfilePath = path.join(runtimeProfileDir, `${lockId}.json`)
    const explicitLoaderArgv = args.loader ? [path.posix.join(docker.container_mount_root, String(args.loader).replace(/\\/g, "/")), "--library-path", path.posix.dirname(path.posix.join(docker.container_mount_root, String(args.libc || args.loader).replace(/\\/g, "/"))), path.posix.join(docker.container_mount_root, String(args.binary).replace(/\\/g, "/"))] : []
    const payload = {
      schema_version: "pwn_runtime_lock.v1",
      lock_id: lockId,
      runtime_profile_id: lockId,
      profile_path: path.relative(context.directory, profilePath).replace(/\\/g, "/"),
      runtime_profile_path: path.relative(context.directory, runtimeProfilePath).replace(/\\/g, "/"),
      patched,
      binary,
      loader,
      libc,
      patched_binary: patchedBinary,
      original_binary: originalBinary,
      docker,
      remote,
      explicit_loader_argv: explicitLoaderArgv,
      docker_runner_defaults: {
        composeService: docker.compose_service,
        containerMountRoot: docker.container_mount_root,
        containerWorkdir: docker.container_workdir,
        runArgs: docker.run_args,
      },
      warnings: [
        ...(!args.loader ? ["no bundled loader locked; gdb/runner may use system loader"] : []),
        ...(!args.libc ? ["no bundled libc locked; libc leak math may drift"] : []),
        ...(patched && !args.originalBinary ? ["patched runtime without originalBinary reference"] : []),
        ...(remote.enabled && !docker.enabled ? ["remote enabled but no local docker substrate locked"] : []),
      ],
    }
    await writeFile(profilePath, JSON.stringify(payload, null, 2), "utf8")
    await writeFile(runtimeProfilePath, JSON.stringify(payload, null, 2), "utf8")
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_RUNTIME_LOCK",
      `lock_id: ${lockId}`,
      `profile_path: ${payload.profile_path}`,
      `runtime_profile_path: ${payload.runtime_profile_path}`,
      `binary: ${(binary as any).path || ""} size=${(binary as any).size || 0} sha256=${(binary as any).sha256 || ""}`,
      `loader: ${(loader as any).path || "none"} sha256=${(loader as any).sha256 || ""}`,
      `libc: ${(libc as any).path || "none"} sha256=${(libc as any).sha256 || ""}`,
      `patched: ${patched}`,
      `docker: ${docker.enabled} service=${docker.compose_service || ""} image=${docker.image || ""}`,
      `remote: ${remote.enabled} ${remote.host}${remote.port ? `:${remote.port}` : ""}`,
      "warnings:",
      ...(payload.warnings.length ? payload.warnings.map((x) => `- ${x}`) : ["- none"]),
      "contract:",
      "- Pass runtimeProfileId/lock_id to gdb, docker, expect, runner, and stage tools.",
      "- Do not mix observations from a different binary/loader/libc/patched/remote identity without creating a new lock.",
    ].join("\n")
  },
})
