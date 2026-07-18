import { tool } from "@opencode-ai/plugin"
import { safeExec } from "./lib/exec-utils.ts"
import { DOCKER_IMAGES } from "./lib/docker-config.ts"
import path from "node:path"

type EnvCheckResult = {
  name: string
  ok: boolean
  required: boolean
  category: string
  detail: string
  hint: string
}

async function check(cmd: string, args: string[], timeout = 10000): Promise<{ ok: boolean; output: string }> {
  const r = await safeExec(cmd, args, undefined, timeout)
  return { ok: r.ok, output: (r.output || "").trim().slice(0, 200) }
}

async function dockerImageExists(image: string): Promise<boolean> {
  const r = await safeExec("docker", ["images", "--format", "{{.Repository}}:{{.Tag}}", image], undefined, 10000)
  return r.ok && r.output.includes(image)
}

async function dockerDaemonRunning(): Promise<boolean> {
  const r = await safeExec("docker", ["info", "--format", "{{.ServerVersion}}"], undefined, 8000)
  return r.ok
}

async function adbDeviceConnected(): Promise<boolean> {
  const r = await safeExec("adb", ["devices"], undefined, 8000)
  if (!r.ok) return false
  return /\bdevice\b/.test(r.output)
}

async function androidStudioDetected(): Promise<boolean> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ""
  const paths = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(homeDir, "Android", "Sdk"),
    path.join(homeDir, "android", "sdk"),
    "C:\\Program Files\\Android\\Android Studio",
    "C:\\Program Files (x86)\\Android\\Android Studio",
  ].filter((p): p is string => Boolean(p))
  // Check if adb or emulator exist from SDK
  for (const base of paths) {
    const adbPath = path.join(base, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")
    const r = await safeExec("test", ["-e", adbPath], undefined, 3000)
    if (r.ok) return true
  }
  return false
}

export default tool({
  description:
    "CTF environment check: verify Docker daemon, pwnlab/revlab images, Android Studio/ADB/AVD, and core CLI tools for pwn/rev. Run before starting a challenge.",
  args: {
    category: tool.schema
      .string()
      .optional()
      .describe("pwn | rev | all. Default: all. Checks tools and Docker images relevant to the category."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const category = (args.category || "all").toLowerCase()
    const results: EnvCheckResult[] = []

    // -- Docker daemon (always check if any docker test is needed) --
    if (category === "pwn" || category === "rev" || category === "all") {
      const dockerOk = await dockerDaemonRunning()
      results.push({
        name: "docker-daemon",
        ok: dockerOk,
        required: category !== "all",
        category: "runtime",
        detail: dockerOk ? "Docker daemon is running" : "Docker daemon not reachable",
        hint: dockerOk
          ? ""
          : "Install Docker Desktop (Windows/Mac) or docker.io (Linux). On Windows, Docker Desktop must be running.",
      })
    }

    // -- PWN images --
    if (category === "pwn" || category === "all") {
      if (results.find((r) => r.name === "docker-daemon")?.ok ?? false) {
        const pwnImages = [
          { name: "pwnlab:general-ubuntu22.04", key: "pwn-general-ubuntu22.04" },
          { name: "pwnlab:general-ubuntu20.04", key: "pwn-general-ubuntu20.04" },
          { name: "pwnlab:general-ubuntu18.04", key: "pwn-general-ubuntu18.04" },
          { name: "pwnlab:general-ubuntu24.04", key: "pwn-general-ubuntu24.04" },
          { name: "pwnlab:i386-ubuntu20.04", key: "pwn-i386-ubuntu20.04" },
          { name: "pwnlab:general-debian11", key: "pwn-debian11" },
          { name: "pwnlab:general-debian12", key: "pwn-debian12" },
          { name: "pwnlab:aarch64", key: "pwn-aarch64" },
          { name: "pwnlab:mipsel", key: "pwn-mipsel" },
          { name: "pwnlab:heavy-ubuntu22.04", key: "pwn-heavy-ubuntu22.04" },
        ]
        for (const img of pwnImages) {
          const exists = await dockerImageExists(img.name)
          results.push({
            name: `docker-image:${img.key}`,
            ok: exists,
            required: false,
            category: "pwn-docker",
            detail: exists ? `${img.name} image exists` : `${img.name} image not built`,
            hint: exists
              ? ""
              : `Build with: cd docker && docker compose -f docker-compose.pwnlab.yml build ${img.name.split(":")[1]?.replace(/^pwnlab:/, "")?.replace(/^general-/, "pwn-general")}`,
          })
        }
      }

      // -- PWN CLI tools --
      const pwnCLI: Array<{ name: string; cmd: string; args: string[]; hint: string }> = [
        { name: "python3", cmd: "python3", args: ["--version"], hint: "Install Python 3." },
        { name: "pwntools", cmd: "python", args: ["-c", "import pwn; print(pwn.__version__)"], hint: "pip install pwntools" },
        { name: "gdb", cmd: "gdb", args: ["--version"], hint: "Install gdb; for pwn prefer WSL2/Linux." },
        { name: "checksec", cmd: "checksec", args: ["--version"], hint: "pip install pwntools (checksec bundled)." },
        { name: "ROPgadget", cmd: "ROPgadget", args: ["--version"], hint: "pip install ROPgadget" },
        { name: "readelf", cmd: "readelf", args: ["--version"], hint: "Install binutils." },
        { name: "objdump", cmd: "objdump", args: ["--version"], hint: "Install binutils." },
        { name: "one_gadget", cmd: "one_gadget", args: ["--version"], hint: "gem install one_gadget" },
        { name: "seccomp-tools", cmd: "seccomp-tools", args: ["--version"], hint: "gem install seccomp-tools" },
      ]
      for (const cli of pwnCLI) {
        const r = await check(cli.cmd, cli.args)
        results.push({
          name: `cli:${cli.name}`,
          ok: r.ok,
          required: cli.name === "python3" || cli.name === "pwntools",
          category: "pwn-cli",
          detail: r.ok ? `${cli.name}: ${r.output}` : `${cli.name}: not found`,
          hint: r.ok ? "" : cli.hint,
        })
      }
    }

    // -- REV images --
    if (category === "rev" || category === "all") {
      if (results.find((r) => r.name === "docker-daemon")?.ok ?? false) {
        const revImages = [
          { name: "revlab:ubuntu22.04", key: "revlab-ubuntu22.04" },
        ]
        for (const img of revImages) {
          const exists = await dockerImageExists(img.name)
          results.push({
            name: `docker-image:${img.key}`,
            ok: exists,
            required: false,
            category: "rev-docker",
            detail: exists ? `${img.name} image exists` : `${img.name} image not built`,
            hint: exists
              ? ""
              : `Build with: cd docker && docker compose -f docker-compose.revlab.yml build`,
          })
        }
      }

      // -- Android / ADB --
      const adbOk = await adbDeviceConnected()
      results.push({
        name: "adb-device",
        ok: adbOk,
        required: false,
        category: "rev-android",
        detail: adbOk ? "ADB device connected" : "No ADB device connected",
        hint: adbOk ? "" : "Connect an Android device or start an emulator. Use 'adb devices' to check.",
      })

      const androidStudioOk = await androidStudioDetected()
      results.push({
        name: "android-studio",
        ok: androidStudioOk,
        required: false,
        category: "rev-android",
        detail: androidStudioOk ? "Android Studio / SDK detected" : "Android Studio / SDK not detected",
        hint: androidStudioOk ? "" : "Install Android Studio and set ANDROID_HOME or ANDROID_SDK_ROOT.",
      })

      // ADB CLI
      const adbCLI = await check("adb", ["--version"])
      results.push({
        name: "cli:adb",
        ok: adbCLI.ok,
        required: false,
        category: "rev-android",
        detail: adbCLI.ok ? `adb: ${adbCLI.output}` : "adb: not found",
        hint: adbCLI.ok ? "" : "Install Android SDK platform-tools or Android Studio.",
      })

      // -- REV CLI tools --
      const revCLI: Array<{ name: string; cmd: string; args: string[]; hint: string }> = [
        { name: "file", cmd: "file", args: ["--version"], hint: "Install file utility." },
        { name: "strings", cmd: "strings", args: ["--version"], hint: "Install binutils." },
        { name: "objdump", cmd: "objdump", args: ["--version"], hint: "Install binutils." },
        { name: "readelf", cmd: "readelf", args: ["--version"], hint: "Install binutils." },
        { name: "xxd", cmd: "xxd", args: ["--version"], hint: "Install xxd (vim-common)." },
      ]
      for (const cli of revCLI) {
        const r = await check(cli.cmd, cli.args)
        results.push({
          name: `cli:${cli.name}`,
          ok: r.ok,
          required: cli.name === "file" || cli.name === "strings",
          category: "rev-cli",
          detail: r.ok ? `${cli.name}: ${r.output}` : `${cli.name}: not found`,
          hint: r.ok ? "" : cli.hint,
        })
      }
    }

    // -- Summarize --
    const hardRequired = ["python3", "pwntools", "file", "strings"]
    const missingCritical = results.filter((r) => r.required && !r.ok)
    const missingOptional = results.filter((r) => !r.required && !r.ok)
    const ready = missingCritical.length === 0

    // Build hints for docker image building
    const pwnBuildHints = results
      .filter((r) => r.category === "pwn-docker" && !r.ok)
      .map((r) => r.hint)
      .filter(Boolean)
    const revBuildHints = results
      .filter((r) => r.category === "rev-docker" && !r.ok)
      .map((r) => r.hint)
      .filter(Boolean)

    if (args.jsonOnly) {
      return JSON.stringify(
        {
          category,
          ready,
          missing_critical: missingCritical.map((r) => r.name),
          missing_optional: missingOptional.map((r) => r.name),
          pwn_build_commands: pwnBuildHints,
          rev_build_commands: revBuildHints,
          results,
        },
        null,
        2,
      )
    }

    const lines: string[] = [
      "=== CTF Environment Check ===",
      `category: ${category}`,
      `ready: ${ready ? "YES" : "NO"}`,
      "",
    ]

    for (const r of results) {
      const icon = r.ok ? "✓" : r.required ? "✗" : "?"
      lines.push(`  ${icon} [${r.category}] ${r.name}: ${r.detail}`)
    }

    if (missingCritical.length) {
      lines.push("", "--- MISSING CRITICAL ---")
      for (const r of missingCritical) lines.push(`  ✗ ${r.name}: ${r.hint}`)
    }

    if (pwnBuildHints.length) {
      lines.push("", "--- PWN DOCKER BUILD HINTS ---")
      lines.push("  Some pwnlab images are not built. Build them:")
      lines.push("  cd docker")
      lines.push("  # Build all pwnlab images:")
      lines.push("  docker compose -f docker-compose.pwnlab.yml build")
      lines.push("  # Or build individual images using the hints above.")
    }

    if (revBuildHints.length) {
      lines.push("", "--- REVLAB DOCKER BUILD HINTS ---")
      lines.push("  revlab image is not built. Build it:")
      lines.push("  cd docker")
      lines.push("  docker compose -f docker-compose.revlab.yml build")
    }

    const adbResult = results.find((r) => r.name === "adb-device")
    if (adbResult && !adbResult.ok && category !== "pwn") {
      lines.push("", "--- ANDROID HINTS ---")
      lines.push("  No ADB device detected. For APK/Android reversing:")
      lines.push("  - Ensure Android Studio is installed")
      lines.push("  - Start an AVD emulator from AVD Manager")
      lines.push("  - Or connect a physical device with USB debugging enabled")
    }

    lines.push(
      "",
      "--- RECOMMENDATION ---",
      ready
        ? "Core environment is ready. Use category=pwn or category=rev for focused checks."
        : "Install missing critical tools first. Use the hints above.",
    )

    return lines.join("\n")
  },
})
