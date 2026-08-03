import { tool } from "@opencode-ai/plugin"
import { lstat, open } from "node:fs/promises"
import path from "node:path"
import { safeExec } from "../lib/exec-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import { listToolNames } from "../../src/ctf-tools.ts"
import { packForTool, resolveEnabledPacks, type ToolPackId } from "../../src/tool-packs.ts"

type RevFamily =
  | "elf"
  | "pe"
  | "mach-o"
  | "dex"
  | "apk"
  | "java"
  | "wasm"
  | "python-bytecode"
  | "unicorn"
  | "android"
  | "runtime"
  | "unknown"

type ProbeSpec = {
  name: string
  commands: Array<{ command: string; args: string[] }>
  hint: string
}

type ToolProbe = {
  name: string
  available: boolean
  path: string | null
  version: string | null
  detail: string
  hint: string
}

type PythonModuleProbe = {
  name: string
  available: boolean
  version: string | null
  detail: string
  hint: string
}

const FAMILIES = new Set<RevFamily>([
  "elf",
  "pe",
  "mach-o",
  "dex",
  "apk",
  "java",
  "wasm",
  "python-bytecode",
  "unicorn",
  "android",
  "runtime",
  "unknown",
])

const FAMILY_PACKS: Record<RevFamily, ToolPackId | null> = {
  elf: "rev",
  pe: "rev",
  "mach-o": "rev",
  dex: "android",
  apk: "android",
  java: "core",
  wasm: "rev",
  "python-bytecode": "rev",
  unicorn: "rev",
  android: "android",
  runtime: "rev",
  unknown: "rev",
}

const FAMILY_INTERNAL_TOOLS: Record<RevFamily, string[]> = {
  elf: ["ctf-rev-analyze", "ctf-binary-probe", "ctf-elf-slice"],
  pe: ["ctf-rev-analyze", "ctf-rev-pe-slice", "ctf-binary-probe"],
  "mach-o": ["ctf-rev-analyze"],
  dex: ["ctf-dex-patch-map", "ctf-android-native-triage"],
  apk: ["ctf-apk-triage", "ctf-android-analyze"],
  java: ["ctf-java-analyze"],
  wasm: ["ctf-rev-analyze"],
  "python-bytecode": ["ctf-rev-analyze"],
  unicorn: ["ctf-rev-unicorn-helper", "ctf-rev-unicorn-replay-builder"],
  android: ["ctf-android-analyze", "ctf-dex-patch-map", "ctf-android-native-triage"],
  runtime: ["ctf-rev-live-memory-dump", "ctf-runtime-dump", "ctf-rev-analyze"],
  unknown: ["ctf-rev-analyze", "ctf-binary-probe"],
}

const FAMILY_NEXT_TOOL: Record<RevFamily, { tool: string; nextAction: string }> = {
  elf: {
    tool: "ctf-elf-slice",
    nextAction: "Run ctf-rev-analyze first, then use ctf-elf-slice around checker/transform strings.",
  },
  pe: {
    tool: "ctf-rev-pe-slice",
    nextAction:
      "Run ctf-rev-analyze and ctf-rev-pe-slice; use Windows runtime helpers only after static evidence identifies a boundary.",
  },
  "mach-o": {
    tool: "otool / llvm-objdump / Ghidra fallback",
    nextAction:
      "Record Mach-O architecture/load commands with an available disassembler before emulation or decompilation.",
  },
  dex: {
    tool: "ctf-dex-patch-map / ctf-android-native-triage",
    nextAction:
      "Enable the android pack and restart OpenCode if the internal DEX tools are not registered; keep JNI/native evidence linked.",
  },
  apk: {
    tool: "ctf-apk-triage / ctf-android-analyze",
    nextAction:
      "Enable the android pack and start with manifest/resources/native-library triage before broad JADX output.",
  },
  java: {
    tool: "ctf-java-analyze",
    nextAction: "Use the JVM facade for archive/class/source routing before choosing javap or a decompiler.",
  },
  wasm: {
    tool: "wasm-tools / wasm2wat / wasmtime",
    nextAction: "Inspect exports, imports, custom sections, and linear memory before broad decompilation.",
  },
  "python-bytecode": {
    tool: "python dis / pycdc / uncompyle6",
    nextAction:
      "Inspect bytecode version, entrypoint, constants, and marshal boundaries before executing extracted code.",
  },
  unicorn: {
    tool: "ctf-rev-unicorn-helper / ctf-rev-unicorn-replay-builder",
    nextAction: "Confirm Unicorn architecture/mode and module availability before generating a replay skeleton.",
  },
  android: {
    tool: "ctf-android-analyze / ctf-dex-patch-map",
    nextAction: "Use the Android pack for DEX/APK/JNI routing; use adb only for a controlled runtime stage.",
  },
  runtime: {
    tool: "ctf-rev-live-memory-dump / ctf-runtime-dump",
    nextAction:
      "Use a controlled runtime substrate and record the dump marker, address range, and oracle before closure promotion.",
  },
  unknown: {
    tool: "ctf-rev-analyze / ctf-binary-probe",
    nextAction: "Identify the artifact family first; do not execute an unknown target as a capability probe.",
  },
}

function truncate(value: string, max = 180): string {
  const oneLine = value.replace(/\s+/g, " ").trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

async function commandPath(command: string): Promise<string | null> {
  if (path.isAbsolute(command)) return command
  const locator = process.platform === "win32" ? "where.exe" : "which"
  const result = await safeExec(locator, [command], { timeoutMs: 1500, maxBuffer: 16 * 1024 })
  if (!result.ok) return null
  const line = result.output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith("[stderr]"))
  return line ? line : null
}

async function runCommandProbe(spec: ProbeSpec): Promise<ToolProbe> {
  let lastDetail = "not found"
  for (const candidate of spec.commands) {
    const result = await safeExec(candidate.command, candidate.args, { timeoutMs: 2500, maxBuffer: 64 * 1024 })
    if (result.ok) {
      const resolved = await commandPath(candidate.command)
      return {
        name: spec.name,
        available: true,
        path: resolved || candidate.command,
        version: truncate(result.output),
        detail: "version/help probe succeeded",
        hint: spec.hint,
      }
    }
    lastDetail = truncate(result.output, 140)
  }
  return {
    name: spec.name,
    available: false,
    path: null,
    version: null,
    detail: lastDetail,
    hint: spec.hint,
  }
}

async function runPythonModuleProbe(name: string, moduleName: string, hint: string): Promise<PythonModuleProbe> {
  const code = `import ${moduleName}; print(getattr(${moduleName}, "__version__", "present"))`
  let detail = "python interpreter not found"
  for (const interpreter of ["python", "python3"]) {
    const result = await safeExec(interpreter, ["-c", code], { timeoutMs: 2500, maxBuffer: 16 * 1024 })
    if (result.ok) {
      return {
        name,
        available: true,
        version: truncate(result.output),
        detail: `${interpreter} import probe succeeded`,
        hint,
      }
    }
    detail = truncate(result.output, 140)
  }
  return {
    name,
    available: false,
    version: null,
    detail,
    hint,
  }
}

function nativeProbes(): ProbeSpec[] {
  return [
    {
      name: "file",
      commands: [{ command: "file", args: ["--version"] }],
      hint: "Install file/libmagic or use the revlab fallback.",
    },
    {
      name: "readelf",
      commands: [{ command: "readelf", args: ["--version"] }],
      hint: "Install binutils or use llvm-readobj/Ghidra.",
    },
    {
      name: "objdump",
      commands: [{ command: "objdump", args: ["--version"] }],
      hint: "Install binutils or LLVM objdump.",
    },
    {
      name: "nm",
      commands: [{ command: "nm", args: ["--version"] }],
      hint: "Install binutils or LLVM nm for symbol triage.",
    },
    {
      name: "strings",
      commands: [{ command: "strings", args: ["--version"] }],
      hint: "Install binutils strings or use ctf-binary-probe fallback.",
    },
    {
      name: "rizin",
      commands: [
        { command: "rizin", args: ["-v"] },
        { command: "radare2", args: ["-v"] },
      ],
      hint: "Install Rizin/radare2 for interactive disassembly fallback.",
    },
    {
      name: "ghidra",
      commands: [
        { command: "analyzeHeadless", args: ["-help"] },
        { command: "ghidraRun", args: ["-help"] },
      ],
      hint: "Configure GhidraHeadless or use the local rev Docker image.",
    },
  ]
}

function probesForFamily(family: RevFamily): ProbeSpec[] {
  const native = nativeProbes()
  switch (family) {
    case "elf":
    case "pe":
    case "unknown":
      return native
    case "mach-o":
      return [
        {
          name: "otool",
          commands: [{ command: "otool", args: ["-h"] }],
          hint: "Install Xcode command-line tools on macOS or use llvm-objdump/Ghidra.",
        },
        {
          name: "llvm-objdump",
          commands: [{ command: "llvm-objdump", args: ["--version"] }],
          hint: "Install LLVM for cross-platform Mach-O disassembly.",
        },
        ...native.filter((probe) => ["objdump", "rizin", "ghidra"].includes(probe.name)),
      ]
    case "dex":
    case "apk":
    case "android":
      return [
        {
          name: "jadx",
          commands: [{ command: "jadx", args: ["--version"] }],
          hint: "Install JADX for a Java/decompiled view.",
        },
        {
          name: "baksmali",
          commands: [{ command: "baksmali", args: ["--version"] }],
          hint: "Install baksmali for deterministic DEX disassembly.",
        },
        {
          name: "smali",
          commands: [{ command: "smali", args: ["--version"] }],
          hint: "Install smali when patch/rebuild is required.",
        },
        {
          name: "aapt",
          commands: [{ command: "aapt", args: ["version"] }],
          hint: "Install Android build-tools for manifest/resource checks.",
        },
        {
          name: "apkanalyzer",
          commands: [{ command: "apkanalyzer", args: ["version"] }],
          hint: "Install Android SDK command-line tools.",
        },
        {
          name: "apktool",
          commands: [{ command: "apktool", args: ["--version"] }],
          hint: "Install apktool for resource and smali round-trips.",
        },
        {
          name: "adb",
          commands: [{ command: "adb", args: ["version"] }],
          hint: "Install platform-tools; a connected device is checked only for runtime family.",
        },
      ]
    case "java":
      return [
        {
          name: "java",
          commands: [{ command: "java", args: ["-version"] }],
          hint: "Install a JDK/JRE matching the class major version.",
        },
        {
          name: "javap",
          commands: [{ command: "javap", args: ["-version"] }],
          hint: "Use javap for low-noise bytecode inspection.",
        },
        {
          name: "jar",
          commands: [{ command: "jar", args: ["--version"] }],
          hint: "Install the JDK for archive inspection.",
        },
        {
          name: "jadx",
          commands: [{ command: "jadx", args: ["--version"] }],
          hint: "Use JADX only when Java decompilation is needed.",
        },
      ]
    case "wasm":
      return [
        {
          name: "wasm-tools",
          commands: [{ command: "wasm-tools", args: ["--version"] }],
          hint: "Install wasm-tools for validated module/component inspection.",
        },
        {
          name: "wasm2wat",
          commands: [{ command: "wasm2wat", args: ["--version"] }],
          hint: "Install WABT for readable WAT output.",
        },
        {
          name: "wasm-decompile",
          commands: [{ command: "wasm-decompile", args: ["--help"] }],
          hint: "Install WABT for a C-like decompile fallback.",
        },
        {
          name: "wasmtime",
          commands: [{ command: "wasmtime", args: ["--version"] }],
          hint: "Use wasmtime only with an explicit runtime oracle.",
        },
        {
          name: "node",
          commands: [{ command: "node", args: ["--version"] }],
          hint: "Node can provide a controlled WebAssembly runtime fallback.",
        },
      ]
    case "python-bytecode":
      return [
        {
          name: "python",
          commands: [
            { command: "python", args: ["--version"] },
            { command: "python3", args: ["--version"] },
          ],
          hint: "Use the interpreter matching the bytecode magic/version.",
        },
        {
          name: "pycdc",
          commands: [{ command: "pycdc", args: ["--version"] }],
          hint: "Install pycdc for a native decompilation fallback.",
        },
        {
          name: "uncompyle6",
          commands: [{ command: "uncompyle6", args: ["--version"] }],
          hint: "Install uncompyle6 only after verifying bytecode compatibility.",
        },
      ]
    case "unicorn":
      return [
        {
          name: "python",
          commands: [
            { command: "python", args: ["--version"] },
            { command: "python3", args: ["--version"] },
          ],
          hint: "Use the Python interpreter that owns the required modules.",
        },
      ]
    case "runtime":
      return [
        {
          name: "gdb",
          commands: [{ command: "gdb", args: ["--version"] }],
          hint: "Install GDB or use the revlab image for controlled runtime tracing.",
        },
        {
          name: "lldb",
          commands: [{ command: "lldb", args: ["--version"] }],
          hint: "Use LLDB for macOS/Apple targets when available.",
        },
        {
          name: "cdb",
          commands: [
            { command: "cdb", args: ["-?"] },
            { command: "windbg", args: ["-?"] },
          ],
          hint: "Install Microsoft debugging tools for Windows runtime stages.",
        },
        {
          name: "docker",
          commands: [{ command: "docker", args: ["--version"] }],
          hint: "Start Docker and use the revlab image for reproducible execution.",
        },
        {
          name: "adb",
          commands: [{ command: "adb", args: ["version"] }],
          hint: "Use adb only for an explicitly controlled Android runtime stage.",
        },
      ]
  }
}

async function inferFamily(target: string): Promise<RevFamily> {
  const base = path.basename(target)
  const fh = await open(target, "r")
  try {
    const head = Buffer.alloc(16)
    const { bytesRead } = await fh.read(head, 0, head.length, 0)
    const magic = head.subarray(0, bytesRead).toString("hex")
    if (magic.startsWith("7f454c46")) return "elf"
    if (head.subarray(0, 2).toString("latin1") === "MZ") return "pe"
    if (["feedface", "cefaedfe", "feedfacf", "cffaedfe"].includes(magic.slice(0, 8))) return "mach-o"
    if (head.subarray(0, 8).toString("latin1") === "dex\n035\x00" || /^classes(?:[2-9]|[1-9][0-9]+)\.dex$/i.test(base))
      return "dex"
    if (/\.apk$/i.test(base)) return "apk"
    if (magic.startsWith("cafebabe") || /\.(jar|war|class)$/i.test(base)) return "java"
    if (magic.startsWith("0061736d") || /\.wasm$/i.test(base)) return "wasm"
    if (/\.(pyc|pyo)$/i.test(base)) return "python-bytecode"
    return "unknown"
  } finally {
    await fh.close()
  }
}

async function packSnapshot(family: RevFamily) {
  const enabled = resolveEnabledPacks()
  const toolNames = await listToolNames()
  const requiredPack = FAMILY_PACKS[family]
  const packIds: ToolPackId[] = ["core", "rev", "android"]
  const packStates = Object.fromEntries(
    packIds.map((packId) => {
      const registered = toolNames.some((name) => packForTool(name) === packId)
      return [
        packId,
        {
          enabled: enabled.has(packId),
          registered,
          requiredPack: packId,
          restartRequired: !enabled.has(packId) && registered,
        },
      ]
    }),
  ) as Record<string, { enabled: boolean; registered: boolean; requiredPack: ToolPackId; restartRequired: boolean }>
  const relevant = requiredPack ? toolNames.filter((name) => packForTool(name) === requiredPack) : []
  const internal = FAMILY_INTERNAL_TOOLS[family].map((name) => ({
    name,
    registered: toolNames.includes(name),
    enabled: enabled.has(packForTool(name)),
    pack: packForTool(name),
  }))
  return {
    enabled: requiredPack ? enabled.has(requiredPack) : true,
    registered: relevant.length > 0,
    requiredPack,
    restartRequired: Boolean(requiredPack && !enabled.has(requiredPack) && relevant.length > 0),
    internalTools: internal,
  }
}

async function dockerState() {
  const version = await safeExec("docker", ["--version"], { timeoutMs: 1800, maxBuffer: 16 * 1024 })
  const daemon = await safeExec("docker", ["info", "--format", "{{.ServerVersion}}"], {
    timeoutMs: 2200,
    maxBuffer: 16 * 1024,
  })
  return { installed: version.ok, daemon: daemon.ok, version: version.ok ? truncate(version.output) : null }
}

async function wslState() {
  if (process.platform !== "win32") return false
  const result = await safeExec("wsl.exe", ["--status"], { timeoutMs: 1800, maxBuffer: 32 * 1024 })
  return result.ok
}

async function adbDeviceState(): Promise<boolean> {
  const result = await safeExec("adb", ["devices"], { timeoutMs: 1800, maxBuffer: 32 * 1024 })
  return (
    result.ok &&
    result.output
      .split(/\r?\n/)
      .slice(1)
      .some((line) => /^\S+\s+device\s*$/.test(line.trim()))
  )
}

function internalAvailability(snapshot: Awaited<ReturnType<typeof packSnapshot>>) {
  const enabledInternal = snapshot.internalTools.filter((tool) => tool.registered && tool.enabled)
  const registeredInternal = snapshot.internalTools.filter((tool) => tool.registered)
  return { enabledInternal, registeredInternal }
}

export default tool({
  description:
    "CTF REV capability probe: safely checks host tools, Python modules, Docker/WSL, and enabled tool packs without executing the target artifact.",
  args: {
    family: tool.schema
      .string()
      .optional()
      .describe(
        "elf | pe | mach-o | dex | apk | java | wasm | python-bytecode | unicorn | android | runtime | unknown.",
      ),
    target: tool.schema
      .string()
      .optional()
      .describe("Optional workspace-relative artifact used only for family inference; never executed."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    let target: string | null = null
    let family: RevFamily
    if (args.target) {
      target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
      const stat = await lstat(target)
      if (!stat.isFile()) throw new Error("target must be a regular file")
    }
    const requested = (args.family || "").trim().toLowerCase()
    if (requested && requested !== "auto" && !FAMILIES.has(requested as RevFamily)) {
      throw new Error(`unsupported REV family: ${args.family}`)
    }
    family =
      requested && requested !== "auto" ? (requested as RevFamily) : target ? await inferFamily(target) : "unknown"

    const pack = await packSnapshot(family)
    const specs = probesForFamily(family)
    const tools = await Promise.all(specs.map(runCommandProbe))
    const pythonModules =
      family === "unicorn"
        ? await Promise.all([
            runPythonModuleProbe(
              "unicorn",
              "unicorn",
              "Install the unicorn Python package matching the replay architecture.",
            ),
            runPythonModuleProbe(
              "capstone",
              "capstone",
              "Install Capstone for instruction decoding and boundary checks.",
            ),
            runPythonModuleProbe(
              "qiling",
              "qiling",
              "Install Qiling only when syscall/filesystem emulation is actually needed.",
            ),
          ])
        : []
    const docker =
      family === "runtime" || family === "unicorn"
        ? await dockerState()
        : { installed: false, daemon: false, version: null }
    const wsl = family === "runtime" || family === "unicorn" ? await wslState() : false
    const adbDevice =
      family === "android" || family === "apk" || family === "dex" || family === "runtime"
        ? await adbDeviceState()
        : false
    const internal = internalAvailability(pack)
    const externalCount = tools.filter((probe) => probe.available).length
    const internalCount = internal.enabledInternal.length
    const requiredPackDisabled = Boolean(pack.requiredPack && !pack.enabled)
    const status: "ok" | "partial" | "blocked" | "pack-disabled" =
      requiredPackDisabled && internalCount === 0
        ? "pack-disabled"
        : externalCount > 0 || internalCount > 0 || pythonModules.some((probe) => probe.available)
          ? externalCount > 0 && (family !== "unicorn" || pythonModules.some((probe) => probe.available))
            ? "ok"
            : "partial"
          : "blocked"
    const blocking: string[] = []
    const fallbacks: string[] = []
    if (requiredPackDisabled && internalCount === 0)
      blocking.push(`${pack.requiredPack} pack is disabled; restart OpenCode after enabling it.`)
    if (!externalCount && !internalCount && !pythonModules.some((probe) => probe.available))
      blocking.push(`No usable host or local capability was detected for ${family}.`)
    for (const probe of tools.filter((item) => item.available))
      fallbacks.push(`${probe.name}: ${probe.path || "available"}`)
    for (const probe of pythonModules.filter((item) => item.available))
      fallbacks.push(`python:${probe.name}: ${probe.version || "available"}`)
    if (family === "runtime" && !docker.daemon && !tools.some((probe) => probe.name === "gdb" && probe.available)) {
      blocking.push("No Docker daemon or local debugger is available for a controlled runtime stage.")
    }
    if ((family === "android" || family === "apk" || family === "dex") && !adbDevice) {
      fallbacks.push("adb: no connected device; static Android analysis remains valid")
    }
    const recommended = FAMILY_NEXT_TOOL[family]
    const recommendedStatus =
      status === "pack-disabled" ? "enable-pack" : status === "blocked" ? "install-or-container" : status
    const payload = {
      schema_version: "rev_capability.v1",
      target,
      family,
      status,
      host: {
        os: process.platform,
        arch: process.arch,
        wsl,
        docker,
      },
      packs: {
        [pack.requiredPack || "rev"]: pack,
      },
      tools,
      python_modules: pythonModules,
      runtime: {
        adb_device: adbDevice,
      },
      recommended_path: {
        tool: recommended.tool,
        status: recommendedStatus,
        next_action:
          requiredPackDisabled && pack.requiredPack
            ? `Enable the ${pack.requiredPack} pack and restart OpenCode; then ${recommended.nextAction}`
            : recommended.nextAction,
      },
      blocking,
      fallbacks,
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "rev_capability:",
      `- schema_version: ${payload.schema_version}`,
      `- family: ${family}`,
      `- status: ${status}`,
      `- host: ${process.platform}/${process.arch} wsl=${wsl} docker=${docker.daemon ? "ready" : docker.installed ? "installed" : "missing"}`,
      `- pack: ${pack.requiredPack || "none"} enabled=${pack.enabled} registered=${pack.registered}`,
      "tools:",
      ...tools.map(
        (probe) =>
          `- ${probe.name}: ${probe.available ? `available (${probe.path || "path unknown"})` : `missing (${probe.detail})`}`,
      ),
      ...(pythonModules.length
        ? [
            "python_modules:",
            ...pythonModules.map(
              (probe) =>
                `- ${probe.name}: ${probe.available ? `available (${probe.version || "present"})` : `missing (${probe.detail})`}`,
            ),
          ]
        : []),
      "recommended_path:",
      `- tool: ${recommended.tool}`,
      `- status: ${recommendedStatus}`,
      `- next_action: ${payload.recommended_path.next_action}`,
      ...(blocking.length ? ["blocking:", ...blocking.map((item) => `- ${item}`)] : []),
      ...(fallbacks.length ? ["fallbacks:", ...fallbacks.map((item) => `- ${item}`)] : []),
    ].join("\n")
  },
})
