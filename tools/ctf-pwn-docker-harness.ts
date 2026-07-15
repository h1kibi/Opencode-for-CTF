import { tool } from "@opencode-ai/plugin"
import { lstat, readdir, readFile } from "node:fs/promises"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"

const execFile = promisify(execFileCb)

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

async function listFilesSafe(dir: string) {
  const out: string[] = []
  for (const name of await readdir(dir)) out.push(name)
  return out
}

async function safeExec(cmd: string, args: string[], cwd: string, ms = 5000) {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { cwd, timeout: ms, maxBuffer: 512 * 1024 })
    return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`.trim()
  }
}

type RuntimeGuess = {
  image: string
  service: string
  profile: string
  reason: string
}

function imageForUbuntu(version: string) {
  if (version === "18.04") return { image: "pwnlab:general-ubuntu18.04", service: "pwn-general18", profile: "general18" }
  if (version === "20.04") return { image: "pwnlab:general-ubuntu20.04", service: "pwn-general20", profile: "general20" }
  if (version === "22.04") return { image: "pwnlab:general-ubuntu22.04", service: "pwn-general", profile: "general" }
  if (version === "24.04") return { image: "pwnlab:general-ubuntu24.04", service: "pwn-general24", profile: "general24" }
  return undefined
}

function imageForDebian(suite: string) {
  const normalized = suite.toLowerCase()
  if (normalized === "buster" || normalized === "10") return { image: "pwnlab:general-debian11", service: "pwn-debian11", profile: "debian11", reason: "debian_buster_approx_use_debian11_toolbox_or_challenge_runtime_recheck_glibc_2.28" }
  if (normalized === "bullseye" || normalized === "11") return { image: "pwnlab:general-debian11", service: "pwn-debian11", profile: "debian11", reason: "debian_bullseye_runtime_glibc_2.31" }
  if (normalized === "bookworm" || normalized === "12") return { image: "pwnlab:general-debian12", service: "pwn-debian12", profile: "debian12", reason: "debian_bookworm_runtime_glibc_2.36" }
  if (normalized === "trixie" || normalized === "13") return { ...imageForUbuntu("24.04")!, reason: "debian_trixie_approx_runtime_use_ubuntu24.04_recheck_libc" }
  return undefined
}

function isAlpineBase(base: string) {
  return /(?:^|\/)alpine:/i.test(base)
}

function imageForLibc(version: string) {
  if (/2\.27/.test(version)) return { ...imageForUbuntu("18.04")!, reason: "glibc_2.27_maps_to_ubuntu18.04" }
  if (/2\.28|2\.29|2\.30|2\.31/.test(version)) return { ...imageForUbuntu("20.04")!, reason: "glibc_2.28_to_2.31_maps_to_ubuntu20.04" }
  if (/2\.32|2\.33|2\.34|2\.35/.test(version)) return { ...imageForUbuntu("22.04")!, reason: "glibc_2.32_to_2.35_maps_to_ubuntu22.04" }
  if (/2\.36|2\.37|2\.38|2\.39|2\.40/.test(version)) return { ...imageForUbuntu("24.04")!, reason: "glibc_2.36_plus_maps_to_ubuntu24.04" }
  return undefined
}

function parseDockerfileBase(text: string) {
  const bases: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim()
    const m = line.match(/^FROM\s+(?:--platform=\S+\s+)?([^\s]+)(?:\s+AS\s+\S+)?$/i)
    if (m) bases.push(m[1])
  }
  const ubuntuVersions = bases
    .map((base) => base.match(/(?:^|\/)ubuntu:(18\.04|20\.04|22\.04|24\.04)(?:$|[^0-9.])/i)?.[1])
    .filter((x): x is string => Boolean(x))
  const debianSuites = bases
    .map((base) => base.match(/(?:^|\/)debian:(buster|bullseye|bookworm|trixie|10|11|12|13)(?:$|[^a-z0-9])/i)?.[1])
    .filter((x): x is string => Boolean(x))
  const alpineBases = bases.filter(isAlpineBase)
  return {
    bases,
    primaryBase: bases[0] || "unknown",
    ubuntuVersion: ubuntuVersions[0] || "unknown",
    allUbuntuVersions: [...new Set(ubuntuVersions)],
    debianSuite: debianSuites[0] || "unknown",
    allDebianSuites: [...new Set(debianSuites)],
    alpineBase: alpineBases[0] || "unknown",
  }
}

function guessRuntime(version: string, arch: string, dockerUbuntuVersion: string, dockerDebianSuite: string, hasAlpineBase: boolean): RuntimeGuess {
  const archHint = arch.toLowerCase()
  if (/i386|32-bit|intel 80386|elf32/.test(archHint)) return { image: "pwnlab:i386-ubuntu20.04", service: "pwn-i386", profile: "i386", reason: "binary_arch_i386_overrides_amd64_runtime" }
  if (/aarch64|arm64/.test(archHint)) return { image: "pwnlab:aarch64", service: "pwn-aarch64", profile: "aarch64", reason: "binary_arch_arm64_requires_multiarch_runtime" }
  if (/mipsel/.test(archHint) || /mips.*little/.test(archHint)) return { image: "pwnlab:mipsel", service: "pwn-mipsel", profile: "mipsel", reason: "binary_arch_mipsel_requires_multiarch_runtime" }
  if (/mips/.test(archHint)) return { image: "pwnlab:mipsel", service: "pwn-mipsel", profile: "mipsel", reason: "binary_arch_mips_detected_default_to_mipsel_recheck_endian" }
  const dockerImage = imageForUbuntu(dockerUbuntuVersion)
  if (dockerImage) return { ...dockerImage, reason: `challenge_dockerfile_base_ubuntu_${dockerUbuntuVersion}` }
  const debianImage = imageForDebian(dockerDebianSuite)
  if (debianImage) return debianImage
  if (hasAlpineBase) return { image: "pwnlab:general-alpine", service: "pwn-alpine", profile: "alpine", reason: "alpine_musl_base_detected_use_musl_toolbox_do_not_reuse_glibc_offsets" }
  const libcImage = imageForLibc(version)
  if (libcImage) return libcImage
  return { image: "pwnlab:general-ubuntu22.04", service: "pwn-general", profile: "general", reason: "default_runtime_no_dockerfile_or_libc_version_match_use_comprehensive_general_toolbox" }
}

function inferVersion(text: string) {
  const m = text.match(/glibc\s*2\.(\d+)|glibc 2\.(\d+)|gnu c library.*stable release version\s*2\.(\d+)/i)
  if (!m) return "unknown"
  const minor = m[1] || m[2] || m[3]
  return `2.${minor}`
}

function parseComposeHints(text: string) {
  const services: string[] = []
  const images: string[] = []
  const dockerfiles: string[] = []
  const contexts: string[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const image = line.match(/^\s*image:\s*["']?([^"'\s#]+)["']?/i)?.[1]
    if (image) images.push(image)
    const dockerfile = line.match(/^\s*dockerfile:\s*["']?([^"'\s#]+)["']?/i)?.[1]
    if (dockerfile) dockerfiles.push(dockerfile)
    const context = line.match(/^\s*context:\s*["']?([^"'\s#]+)["']?/i)?.[1]
    if (context) contexts.push(context)
    const service = line.match(/^\s{2}([A-Za-z0-9_.-]+):\s*$/)?.[1]
    if (service && !["build", "environment", "volumes", "ports", "profiles", "command"].includes(service)) services.push(service)
  }
  return {
    services: [...new Set(services)],
    images: [...new Set(images)],
    dockerfiles: [...new Set(dockerfiles)],
    contexts: [...new Set(contexts)],
    alpineImages: [...new Set(images.filter((x) => /(?:^|\/)alpine:/i.test(x)))],
  }
}

function muslRuntimeNotes(hasAlpineBase: boolean) {
  if (!hasAlpineBase) return ["- none"]
  return [
    "- Alpine/musl detected: prefer the challenge-provided Dockerfile/compose image for runtime reproduction.",
    "- Do not reuse glibc symbol offsets, one_gadget offsets, or pwnlab glibc assumptions against musl without proof.",
    "- Use pwnlab only as a debugger/tooling fallback; validate behavior again in the musl challenge container.",
    "- If libc is musl, prioritize static/syscall/logic analysis over glibc hook or one_gadget routes.",
  ]
}

function profileCapabilities(profile: string) {
  if (profile === "general" || profile === "general20" || profile === "general24" || profile === "debian11" || profile === "debian12") {
    return "pwntools,gdb,checksec,readelf,objdump,nm,strings,patchelf,ROPgadget,one_gadget,seccomp-tools,strace,ltrace"
  }
  if (profile === "alpine") return "musl-oriented toolbox,prefer challenge runtime for truth,pwntools/gdb/basic ELF tools"
  if (profile === "aarch64" || profile === "mipsel" || profile === "i386") return "multiarch toolbox,verify runtime-specific gadget/libc behavior"
  if (profile === "heavy" || profile === "heavy24") return "general toolbox plus symbolic/emulation/reversing extras"
  return "unknown"
}

function composeSnippet(service: string, profile: string, image: string, binary: string) {
  return [
    "services:",
    `  ${service}:`,
    `    image: ${image}`,
    "    working_dir: /work",
    "    volumes:",
    "      - ./:/work",
    "    cap_add:",
    "      - SYS_PTRACE",
    "    security_opt:",
    "      - seccomp=unconfined",
    "    stdin_open: true",
    "    tty: true",
    `    profiles: [\"${profile}\"]`,
    `    command: [\"bash\", \"-lc\", \"file ${binary.replace(/\\/g, "/")} && bash\"]`,
  ].join("\n")
}

export default tool({
  description: "CTF pwn Docker harness planner: inspect challenge files and suggest a Docker/libc debugging plan without mutating the workspace.",
  args: {
    targetDir: tool.schema.string().optional().describe("Workspace-relative challenge directory. Default current workspace."),
    binary: tool.schema.string().optional().describe("Workspace-relative binary path if already known."),
    libc: tool.schema.string().optional().describe("Workspace-relative libc path if already known."),
    ld: tool.schema.string().optional().describe("Workspace-relative loader path if already known."),
    timeoutMs: tool.schema.number().optional().describe("Timeout for helper commands. Default 5000ms."),
  },
  async execute(args, context) {
    const relDir = args.targetDir || "."
    const dir = resolveInsideWorkspace(context.directory, relDir)
    const stat = await lstat(dir)
    if (!stat.isDirectory()) throw new Error("targetDir must be a directory")

    const names = await listFilesSafe(dir)
    const relToWorkspace = (value: string) => path.relative(context.directory, value).replace(/\\/g, "/")
    const resolveArgOrAuto = (value: string | undefined, autoName: string) => {
      if (value) return resolveInsideWorkspace(context.directory, value)
      return autoName ? resolveInsideWorkspace(context.directory, path.join(relDir, autoName)) : ""
    }
    const dockerfiles = names.filter((x) => /^dockerfile/i.test(x))
    const composeFiles = names.filter((x) => /^docker-compose.*\.(yml|yaml)$/i.test(x) || /^compose\.(yml|yaml)$/i.test(x))
    const binaryAuto = names.find((x) => /(^chall$|^pwn$|^vuln$|\.out$|\.bin$|^main$)/i.test(x)) || ""
    const libcAuto = names.find((x) => /^libc[._-]?.*\.so/i.test(x) || /^libc\.so\.6$/i.test(x)) || ""
    const ldAuto = names.find((x) => /^ld(-linux.*)?\.so/i.test(x)) || ""
    const binaryPath = resolveArgOrAuto(args.binary, binaryAuto)
    const libcPath = resolveArgOrAuto(args.libc, libcAuto)
    const ldPath = resolveArgOrAuto(args.ld, ldAuto)
    const binaryName = binaryPath ? relToWorkspace(binaryPath) : ""
    const libcName = libcPath ? relToWorkspace(libcPath) : ""
    const ldName = ldPath ? relToWorkspace(ldPath) : ""
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 5000, 30000))

    let libcVersion = "unknown"
    if (libcPath) {
      const raw = await readFile(libcPath)
      libcVersion = inferVersion(raw.toString("latin1"))
    }

    let arch = "unknown"
    if (binaryPath) {
      const fileOut = await safeExec("file", [binaryPath], path.dirname(binaryPath), timeoutMs)
      arch = fileOut || "unknown"
    }

    const composeInfos = []
    for (const composeFile of composeFiles) {
      const composePath = resolveInsideWorkspace(context.directory, path.join(relDir, composeFile))
      composeInfos.push({ name: composeFile, ...parseComposeHints(await readFile(composePath, "utf8")) })
    }
    const dockerfileCandidates = new Set(dockerfiles)
    for (const composeInfo of composeInfos) {
      for (const dockerfile of composeInfo.dockerfiles) dockerfileCandidates.add(dockerfile.replace(/^\.\//, ""))
    }
    const dockerfileInfos = []
    for (const dockerfile of dockerfileCandidates) {
      try {
        const dockerfilePath = resolveInsideWorkspace(context.directory, path.join(relDir, dockerfile))
        const info = parseDockerfileBase(await readFile(dockerfilePath, "utf8"))
        dockerfileInfos.push({ name: dockerfile, ...info })
      } catch {
        dockerfileInfos.push({ name: dockerfile, bases: [], primaryBase: "unreadable_or_missing", ubuntuVersion: "unknown", allUbuntuVersions: [], debianSuite: "unknown", allDebianSuites: [], alpineBase: "unknown" })
      }
    }
    const dockerUbuntuVersion = dockerfileInfos.find((x) => x.ubuntuVersion !== "unknown")?.ubuntuVersion || "unknown"
    const dockerDebianSuite = dockerfileInfos.find((x) => x.debianSuite !== "unknown")?.debianSuite || "unknown"
    const hasAlpineBase = dockerfileInfos.some((x) => x.alpineBase !== "unknown") || composeInfos.some((x) => x.alpineImages.length > 0)
    const runtime = guessRuntime(libcVersion, arch, dockerUbuntuVersion, dockerDebianSuite, hasAlpineBase)
    const { image, service, profile } = runtime
    const hasDockerfile = dockerfileInfos.length > 0
    const hasCompose = composeFiles.length > 0
    const needsPwninit = Boolean(libcName && ldName)
    const riskSignals = [
      !binaryName ? "binary_missing_or_not_auto_detected" : "",
      libcName && !ldName ? "libc_without_loader" : "",
      !hasDockerfile && !libcName ? "no_challenge_dockerfile_or_libc_bundle" : "",
      libcVersion === "unknown" && libcName ? "libc_version_unparsed" : "",
      dockerfileInfos.length > 0 && dockerUbuntuVersion === "unknown" && dockerDebianSuite === "unknown" && !hasAlpineBase ? "dockerfile_base_not_mapped_to_supported_linux_runtime" : "",
      dockerDebianSuite !== "unknown" ? "debian_base_uses_approximate_pwnlab_mapping_recheck_glibc" : "",
      hasAlpineBase ? "alpine_musl_runtime_detected_glibc_pwnlab_may_not_match" : "",
      dockerUbuntuVersion !== "unknown" && libcVersion !== "unknown" && imageForLibc(libcVersion)?.image !== imageForUbuntu(dockerUbuntuVersion)?.image ? "dockerfile_libc_version_tension_recheck_runtime" : "",
      /aarch64|arm64|mips|i386|32-bit|elf32/i.test(arch) ? "non_default_arch_runtime" : "",
    ].filter(Boolean)

    const binaryRel = binaryName ? `./${binaryName.replace(/\\/g, "/")}` : "./chall"
    const libcDir = libcName ? path.posix.dirname(libcName.replace(/\\/g, "/")) : "."
    const explicitLoaderCommand = ldName
      ? `${ldName.replace(/\\/g, "/")} --library-path ${libcDir} ${binaryRel}`
      : libcName
        ? `LD_PRELOAD=${libcName.replace(/\\/g, "/")} ${binaryRel}`
        : "none"
    const substrateGate = libcName || ldName
      ? "bundled_libc_present_do_not_validate_heap_or_overlap_on_mismatched_base"
      : "none"
    const suggestedRun = `docker run --rm -it --cap-add=SYS_PTRACE --security-opt seccomp=unconfined -v ./:/work -w /work ${image} bash`
    const suggestedCompose = composeSnippet(service, profile, image, binaryRel)

    return [
      "pwn_docker_harness:",
      `target_dir: ${dir}`,
      `binary_detected: ${binaryName || "unknown"}`,
      `libc_detected: ${libcName || "unknown"}`,
      `ld_detected: ${ldName || "unknown"}`,
      `dockerfile_detected: ${hasDockerfile}`,
      `compose_detected: ${hasCompose}`,
      "dockerfile_runtime_hints:",
      ...(dockerfileInfos.length
        ? dockerfileInfos.flatMap((x) => [
          `- file: ${x.name}`,
          `  primary_base: ${x.primaryBase}`,
          `  ubuntu_version: ${x.ubuntuVersion}`,
          `  debian_suite: ${x.debianSuite}`,
          `  alpine_base: ${x.alpineBase}`,
          `  all_bases: ${x.bases.length ? x.bases.join(", ") : "none"}`,
        ])
        : ["- none"]),
      "compose_runtime_hints:",
      ...(composeInfos.length
        ? composeInfos.flatMap((x) => [
          `- file: ${x.name}`,
          `  services: ${x.services.length ? x.services.join(", ") : "unknown"}`,
          `  images: ${x.images.length ? x.images.join(", ") : "none"}`,
          `  contexts: ${x.contexts.length ? x.contexts.join(", ") : "none"}`,
          `  dockerfiles: ${x.dockerfiles.length ? x.dockerfiles.join(", ") : "none"}`,
          `  alpine_images: ${x.alpineImages.length ? x.alpineImages.join(", ") : "none"}`,
        ])
        : ["- none"]),
      `binary_arch_hint: ${arch}`,
      `libc_version: ${libcVersion}`,
      `recommended_image: ${image}`,
      `recommended_service: ${service}`,
      `recommended_profile: ${profile}`,
      `profile_capabilities: ${profileCapabilities(profile)}`,
      `recommendation_reason: ${runtime.reason}`,
      `analysis_substrate_lock: ${hasDockerfile || hasCompose ? "challenge-docker-first_then_pwnlab-tooling" : profile === "general" ? "pwn-general-docker" : profile === "general24" ? "pwn-general24-docker" : "pwnlab-docker"}`,
      `substrate_gate: ${substrateGate}`,
      `mount_path: ./:/work`,
      `container_workdir: /work`,
      "tool_health_contract: file/readelf/objdump/nm/strings/gdb/python3/pwntools/checksec",
      "unlock_condition: docker_unavailable_or_runtime_mismatch_or_missing_required_capability_not_quoting_failure",
      `needs_ptrace: yes`,
      `needs_seccomp_unconfined: yes`,
      `needs_pwninit: ${needsPwninit ? "yes" : "maybe"}`,
      `remote_drift_risk: ${libcName || ldName || hasDockerfile ? "lower" : "higher"}`,
      "recommended_flow:",
      hasDockerfile ? "- Prefer the challenge-provided Dockerfile or compose first." : `- No challenge Dockerfile detected; start from ${image}.`,
      libcName ? `- Bundle-aware route: use ${libcName}${ldName ? ` + ${ldName}` : ""} for local reproduction.` : "- No bundled libc detected; be careful about local/remote mismatch.",
      explicitLoaderCommand !== "none" ? `- Explicit loader command: ${explicitLoaderCommand}` : "- No explicit loader command available.",
      needsPwninit ? "- Run pwninit or equivalent patching before long debugger sessions when the binary expects the bundled libc/ld." : "- Patch libc/ld only if the binary clearly depends on a provided runtime.",
      "musl_runtime_notes:",
      ...muslRuntimeNotes(hasAlpineBase),
      "risk_signals:",
      ...(riskSignals.length ? riskSignals.map((x) => `- ${x}`) : ["- none"]),
      substrateGate !== "none" ? `- HARD GATE: ${substrateGate}` : "- HARD GATE: none",
      "suggested_docker_run:",
      suggestedRun,
      "suggested_compose_snippet:",
      suggestedCompose,
    ].join("\n")
  },
})
