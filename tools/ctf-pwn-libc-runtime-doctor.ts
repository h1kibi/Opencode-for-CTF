import { tool } from "@opencode-ai/plugin"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pwnImage, revImage, DOCKER_IMAGES } from "./lib/docker-config.ts"
import { safeExec } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function inferVersion(text: string) {
  const m = text.match(/glibc\s*2\.(\d+)|glibc 2\.(\d+)|gnu c library.*stable release version\s*2\.(\d+)/i)
  if (!m) return "unknown"
  const minor = m[1] || m[2] || m[3]
  return `2.${minor}`
}

function imageForLibc(version: string) {
  if (/2\.27/.test(version))
    return {
      image: pwnImage("general-ubuntu18.04"),
      service: "pwn-general18",
      profile: "general18",
      reason: "glibc_2.27_maps_to_ubuntu18.04",
    }
  if (/2\.28|2\.29|2\.30|2\.31/.test(version))
    return {
      image: pwnImage("general-ubuntu20.04"),
      service: "pwn-general20",
      profile: "general20",
      reason: "glibc_2.28_to_2.31_maps_to_ubuntu20.04",
    }
  if (/2\.32|2\.33|2\.34|2\.35/.test(version))
    return {
      image: pwnImage("general-ubuntu22.04"),
      service: "pwn-general",
      profile: "general",
      reason: "glibc_2.32_to_2.35_maps_to_ubuntu22.04",
    }
  if (/2\.36|2\.37|2\.38|2\.39|2\.40/.test(version))
    return {
      image: pwnImage("general-ubuntu24.04"),
      service: "pwn-general24",
      profile: "general24",
      reason: "glibc_2.36_plus_maps_to_ubuntu24.04",
    }
  return {
    image: pwnImage("general-ubuntu22.04"),
    service: "pwn-general",
    profile: "general",
    reason: "unknown_glibc_default_general",
  }
}

function detectArch(fileOut: string) {
  const lower = fileOut.toLowerCase()
  if (/aarch64|arm64/.test(lower)) return "aarch64"
  if (/mipsel/.test(lower) || /mips.*little/.test(lower)) return "mipsel"
  if (/i386|32-bit|intel 80386|elf32/.test(lower)) return "i386"
  return "amd64"
}

export default tool({
  description:
    "CTF pwn libc runtime doctor: inspect binary/libc/ld, recommend the correct pwnlab substrate and explicit loader command, and warn when continued validation on a mismatched glibc base is unsafe.",
  args: {
    binary: tool.schema.string().describe("Workspace-relative binary path."),
    libc: tool.schema.string().describe("Workspace-relative bundled libc path."),
    ld: tool.schema.string().optional().describe("Workspace-relative loader path if present."),
    currentImage: tool.schema
      .string()
      .optional()
      .describe("Current Docker image or substrate label being used, for mismatch warning."),
    timeoutMs: tool.schema.number().optional().describe("Timeout for helper commands. Default 5000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const binary = resolveInsideWorkspace(context.directory, args.binary)
    const libc = resolveInsideWorkspace(context.directory, args.libc)
    const ld = args.ld ? resolveInsideWorkspace(context.directory, args.ld) : ""
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 5000, 30000))
    const [binarySt, libcSt] = await Promise.all([lstat(binary), lstat(libc)])
    if (!binarySt.isFile() || !libcSt.isFile()) throw new Error("binary and libc must both be files")

    const libcRaw = await readFile(libc)
    const libcVersion = inferVersion(libcRaw.toString("latin1"))
    const binaryFile = (await safeExec("file", [binary], path.dirname(binary), timeoutMs)).output
    const ldFile = ld ? (await safeExec("file", [ld], path.dirname(ld), timeoutMs)).output : ""
    const arch = detectArch(binaryFile)
    const runtime = imageForLibc(libcVersion)
    const libcDir = path.posix.dirname(args.libc.replace(/\\/g, "/"))
    const binaryPosix = args.binary.replace(/\\/g, "/")
    const ldPosix = args.ld ? args.ld.replace(/\\/g, "/") : ""
    const loaderCmd = ldPosix
      ? `${ldPosix} --library-path ${libcDir} ${binaryPosix}`
      : `LD_PRELOAD=${args.libc.replace(/\\/g, "/")} ${binaryPosix}`
    const dockerRun = `docker run --rm -it --cap-add=SYS_PTRACE --security-opt seccomp=unconfined -v ./:/work -w /work ${runtime.image} bash`
    const mismatch =
      args.currentImage &&
      !args.currentImage.includes(runtime.image.split(":")[1].replace("general-", "")) &&
      !args.currentImage.includes(runtime.image)
    const warnings = [
      "bundled_libc_present_force_runtime_lock",
      ld
        ? "bundled_loader_present_prefer_explicit_ld_linux_loading"
        : "no_bundled_loader_found_check_whether_binary_still_binds_to_system_ld",
      mismatch ? `current_image_mismatch:${args.currentImage}->${runtime.image}` : "",
      libcVersion === "unknown" ? "glibc_version_unparsed_recheck_with_strings_or libc-fingerprint" : "",
      arch !== "amd64" ? `non_default_arch:${arch}` : "",
    ].filter(Boolean)

    const payload = {
      schema_version: "pwn_runtime_profile.v1",
      profile_id: `${path.basename(args.binary).replace(/[^A-Za-z0-9_.-]+/g, "-")}-${libcVersion.replace(/[^A-Za-z0-9_.-]+/g, "glibc-unknown")}`,
      binary: args.binary,
      libc: args.libc,
      ld: args.ld || "",
      binary_file: binaryFile,
      ld_file: ldFile,
      libc_version: libcVersion,
      arch,
      recommended_image: runtime.image,
      recommended_service: runtime.service,
      recommended_profile: runtime.profile,
      recommendation_reason: runtime.reason,
      force_substrate_lock: true,
      explicit_loader_command: loaderCmd,
      explicit_loader_argv: ldPosix ? [ldPosix, "--library-path", libcDir, binaryPosix] : [binaryPosix],
      env: ldPosix ? {} : { LD_PRELOAD: args.libc.replace(/\\/g, "/") },
      docker_runner_defaults: {
        composeService: runtime.service,
        containerMountRoot: "/work",
        containerWorkdir:
          path.posix.dirname(binaryPosix) === "." ? "/work" : path.posix.join("/work", path.posix.dirname(binaryPosix)),
        runArgs: "--cap-add=SYS_PTRACE --security-opt seccomp=unconfined",
      },
      docker_run: dockerRun,
      warnings,
      stop_condition:
        "Do not continue heap/overlap/tcache validation on a mismatched glibc base once bundled libc is present.",
    }
    const profileDir = resolveInsideWorkspace(context.directory, "work/pwn-runtime-profiles")
    await mkdir(profileDir, { recursive: true })
    const profilePath = path.join(profileDir, `${payload.profile_id}.json`)
    await writeFile(profilePath, JSON.stringify(payload, null, 2), "utf8")

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_libc_runtime_doctor:",
      `binary: ${args.binary}`,
      `libc: ${args.libc}`,
      `ld: ${args.ld || "none"}`,
      `binary_file: ${binaryFile}`,
      `ld_file: ${ldFile || "none"}`,
      `libc_version: ${libcVersion}`,
      `arch: ${arch}`,
      `recommended_image: ${runtime.image}`,
      `recommended_service: ${runtime.service}`,
      `recommended_profile: ${runtime.profile}`,
      `recommendation_reason: ${runtime.reason}`,
      `runtime_profile_id: ${payload.profile_id}`,
      `runtime_profile_path: ${path.relative(context.directory, profilePath).replace(/\\/g, "/")}`,
      "warnings:",
      ...(warnings.length ? warnings.map((x) => `- ${x}`) : ["- none"]),
      `explicit_loader_command: ${loaderCmd}`,
      `docker_runner_defaults: composeService=${runtime.service} containerWorkdir=${payload.docker_runner_defaults.containerWorkdir} runArgs=${payload.docker_runner_defaults.runArgs}`,
      `docker_run: ${dockerRun}`,
      `stop_condition: ${payload.stop_condition}`,
    ].join("\n")
  },
})
