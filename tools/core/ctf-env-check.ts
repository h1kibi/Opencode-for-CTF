import { tool } from "@opencode-ai/plugin"
import { safeExec } from "../lib/exec-utils.ts"
import { DOCKER_IMAGES } from "../lib/docker-config.ts"
import path from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { PLUGIN_ROOT } from "../../src/asset-paths.ts"
import {
  evaluateAllFamilyReadiness,
  formatStartupEnvironmentSummary,
  type EnvironmentProbeResult,
} from "../../src/family-readiness.ts"
import { resolveEnabledPacks } from "../../src/tool-packs.ts"
import { loadCtfTools } from "../../src/ctf-tools.ts"
import { loadPluginConfigWithPath } from "../../src/plugin-config.ts"

type EnvCheckResult = {
  name: string
  ok: boolean
  required: boolean
  category: string
  detail: string
  hint: string
}

type EnvCheckJson = {
  category: string
  ready: boolean
  missing_critical: string[]
  missing_optional: string[]
  pwn_build_commands: string[]
  rev_build_commands: string[]
  results: EnvCheckResult[]
  environment_probes: Record<string, EnvironmentProbeResult>
  readiness: ReturnType<typeof evaluateAllFamilyReadiness>
}

type ExecProbe = {
  command: string
  args: string[]
  label?: string
  shell?: boolean
  pathOnly?: boolean
}

async function check(cmd: string, args: string[], timeout = 10000): Promise<{ ok: boolean; output: string }> {
  const r = await safeExec(cmd, args, undefined, timeout)
  return { ok: r.ok, output: (r.output || "").trim().slice(0, 200) }
}

function winTool(...segments: string[]): string | undefined {
  if (process.platform !== "win32") return undefined
  return path.join("C:\\Tools", ...segments)
}

function probe(command: string | undefined, args: string[], options: Omit<ExecProbe, "command" | "args"> = {}) {
  if (!command) return undefined
  return { command, args, ...options }
}

function probePathOnly(command: string | undefined, label?: string) {
  if (!command) return undefined
  return { command, args: [], label, pathOnly: true }
}

function probePythonScript(script: string | undefined, args: string[]) {
  if (!script || !existsSync(script)) return undefined
  return { command: "python", args: [script, ...args], label: script }
}

function probePythonModule(moduleName: string, code?: string, label?: string): ExecProbe {
  return {
    command: "python",
    args: ["-c", code || `import ${moduleName}; print(getattr(${moduleName}, '__version__', 'present'))`],
    label: label || `python:${moduleName}`,
  }
}

async function checkAny(
  probes: Array<ExecProbe | undefined>,
  timeout = 10000,
): Promise<{ ok: boolean; output: string }> {
  const candidates = probes.filter((p): p is ExecProbe => Boolean(p))
  let lastOutput = "no candidate probes configured"
  for (const candidate of candidates) {
    const label = candidate.label || candidate.command
    if (candidate.pathOnly) {
      if (existsSync(candidate.command)) return { ok: true, output: `${label} exists` }
      lastOutput = `${label}: not found`
      continue
    }
    if (path.isAbsolute(candidate.command) && !existsSync(candidate.command)) {
      lastOutput = `${label}: not found`
      continue
    }
    const r = await safeExec(candidate.command, candidate.args, {
      timeoutMs: timeout,
      shell: candidate.shell ?? false,
    })
    const output = (r.output || "").trim().slice(0, 200)
    if (r.ok) return { ok: true, output: `${label}: ${output}` }
    lastOutput = `${label}: ${output}`
  }
  return { ok: false, output: lastOutput }
}

async function dockerImageExists(image: string): Promise<boolean> {
  const r = await safeExec("docker", ["images", "--format", "{{.Repository}}:{{.Tag}}", image], undefined, 10000)
  return r.ok && r.output.includes(image)
}

async function dockerDaemonRunning(): Promise<{ ok: boolean; version?: string }> {
  const r = await safeExec("docker", ["info", "--format", "{{.ServerVersion}}"], undefined, 8000)
  return { ok: r.ok, version: r.ok ? (r.output || "").trim() : undefined }
}

async function adbDeviceConnected(): Promise<boolean> {
  const r = await safeExec("adb", ["devices"], undefined, 8000)
  if (!r.ok) return false
  return r.output
    .split(/\r?\n/)
    .slice(1)
    .some((line) => /^\S+\s+device\s*$/.test(line.trim()))
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
    if (existsSync(adbPath)) return true
  }
  return false
}

async function detectShellName(): Promise<string> {
  if (process.platform === "win32") {
    if (process.env.PSModulePath || process.env.PSExecutionPolicyPreference) return "powershell"
    const ps = await safeExec("powershell", ["-NoProfile", "-Command", "$PSVersionTable.PSEdition"], undefined, 4000)
    if (ps.ok) return "powershell"
    return process.env.ComSpec?.toLowerCase().includes("cmd.exe") ? "cmd" : "unknown"
  }
  const shell = (process.env.SHELL || "").toLowerCase()
  if (shell.includes("zsh")) return "zsh"
  if (shell.includes("bash")) return "bash"
  if (shell.endsWith("/sh") || shell === "sh") return "sh"
  return shell ? shell.split("/").pop() || "unknown" : "unknown"
}

function detectKaliHost(): boolean {
  if (process.platform !== "linux") return false
  try {
    const osRelease = readFileSync("/etc/os-release", "utf8").toLowerCase()
    return osRelease.includes("id=kali") || osRelease.includes("id_like=kali") || osRelease.includes("kali rolling")
  } catch {
    return false
  }
}

function detectWslHost(): boolean {
  if (process.platform !== "linux") return false
  const envHint = process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP
  if (envHint) return true
  try {
    const procVersion = readFileSync("/proc/version", "utf8").toLowerCase()
    return procVersion.includes("microsoft") || procVersion.includes("wsl")
  } catch {
    return false
  }
}

export default tool({
  description:
    "CTF environment check: verify Docker daemon, pwnlab/revlab images, Android Studio/ADB/AVD, MCP backends, C:\\Tools local CLIs, and core tools by CTF category. Run before starting a challenge.",
  args: {
    category: tool.schema
      .string()
      .optional()
      .describe(
        "web | pwn | rev | crypto | forensics | misc | all. Default: all. Checks tools and Docker images relevant to the category.",
      ),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const category = (args.category || "all").toLowerCase()
    const rawResults: EnvCheckResult[] = []
    const results = rawResults
    const environmentProbes: Record<string, EnvironmentProbeResult> = {}

    // Kick off independent slow probes up front so they overlap with the CLI loops.
    const wantCyberchef = category === "crypto" || category === "forensics" || category === "misc" || category === "all"
    const wantDocker = category === "pwn" || category === "rev" || category === "all"
    const wantRev = category === "rev" || category === "all"
    const shellNameP = detectShellName()
    const cyberchefP = wantCyberchef ? check("cyberchef-mcp", ["--help"], 8000) : undefined
    const dockerInfoP = wantDocker ? dockerDaemonRunning() : undefined
    const adbDeviceP = wantRev ? adbDeviceConnected() : undefined
    const adbCliP = wantRev ? check("adb", ["--version"]) : undefined
    const androidStudioP = wantRev ? androidStudioDetected() : undefined

    const shellName = await shellNameP
    const kaliHost = detectKaliHost()
    const wslHost = detectWslHost()
    const osLabel =
      process.platform === "win32"
        ? "windows"
        : process.platform === "linux"
          ? "linux"
          : process.platform === "darwin"
            ? "macos"
            : process.platform || "unknown"

    environmentProbes["env:os"] = {
      ok: true,
      executed: true,
      detail: `host os=${osLabel}`,
      behaviorOk: true,
    }
    environmentProbes["env:shell"] = {
      ok: shellName !== "unknown",
      executed: true,
      detail: shellName === "unknown" ? "shell could not be inferred" : `active shell=${shellName}`,
      behaviorOk: true,
    }
    environmentProbes["env:kali"] = {
      ok: kaliHost,
      executed: true,
      detail: kaliHost ? "kali linux detected" : "kali linux not detected",
      behaviorOk: kaliHost,
    }
    environmentProbes["env:wsl"] = {
      ok: wslHost,
      executed: true,
      detail: wslHost ? "wsl detected" : "wsl not detected",
      behaviorOk: wslHost,
    }

    // -- Local / PATH Web CLIs --
    const webBranch = async () => {
      const results: EnvCheckResult[] = []
      const probes: Record<string, EnvironmentProbeResult> = {}
      if (category === "web" || category === "all") {
        const webCLI: Array<{
          name: string
          probes: Array<ExecProbe | undefined>
          hint: string
        }> = [
          {
            name: "nuclei",
            probes: [
              probe("nuclei", ["-version"]),
              probePathOnly(winTool("nuclei", "nuclei.exe"), "C:\\Tools\\nuclei\\nuclei.exe"),
            ],
            hint: "Install nuclei on PATH or keep C:\\Tools\\nuclei\\nuclei.exe. Use only with explicit target/template scope and approval.",
          },
          {
            name: "ffuf",
            probes: [probe("ffuf", ["-V"]), probe(winTool("ffuf", "ffuf.exe"), ["-V"])],
            hint: "Install ffuf on PATH or keep C:\\Tools\\ffuf\\ffuf.exe.",
          },
          {
            name: "feroxbuster",
            probes: [
              probe("feroxbuster", ["--version"]),
              probe(winTool("feroxbuster", "feroxbuster.exe"), ["--version"]),
            ],
            hint: "Install feroxbuster on PATH or keep C:\\Tools\\feroxbuster\\feroxbuster.exe.",
          },
          {
            name: "dirsearch",
            probes: [
              probe("dirsearch", ["--version"], { shell: process.platform === "win32" }),
              probePythonScript(winTool("dirsearch", "dirsearch.py"), ["--version"]),
            ],
            hint: "Install dirsearch on PATH or run python C:\\Tools\\dirsearch\\dirsearch.py.",
          },
          {
            name: "sqlmap",
            // --non-interactive is required: sqlmap pauses on "Press Enter to
            // continue..." after --version unless it is present (Windows
            // double-click protection in lib/parse/cmdline.py).
            probes: [
              probe("sqlmap", ["--version", "--non-interactive"], { shell: process.platform === "win32" }),
              probePythonScript(winTool("sqlmap", "sqlmap.py"), ["--version", "--non-interactive"]),
            ],
            hint: "Install sqlmap on PATH or run python C:\\Tools\\sqlmap\\sqlmap.py.",
          },
          {
            name: "nmap",
            probes: [probe("nmap", ["--version"]), probe(winTool("nmap", "nmap.exe"), ["--version"])],
            hint: "Install nmap on PATH or keep C:\\Tools\\nmap\\nmap.exe.",
          },
          {
            name: "whatweb",
            probes: [
              probe("whatweb", ["--version"], { shell: process.platform === "win32" }),
              probePathOnly(winTool("whatweb", "whatweb"), "C:\\Tools\\whatweb\\whatweb"),
            ],
            hint: "Install whatweb with Ruby on PATH or keep the source tree at C:\\Tools\\whatweb.",
          },
          {
            name: "xsstrike",
            probes: [probePathOnly(winTool("XSStrike", "xsstrike.py"), "C:\\Tools\\XSStrike\\xsstrike.py")],
            hint: "Keep XSStrike at C:\\Tools\\XSStrike; use only for route-bound XSS confirmation.",
          },
          {
            name: "tplmap",
            probes: [probePathOnly(winTool("tplmap", "tplmap.py"), "C:\\Tools\\tplmap\\tplmap.py")],
            hint: "Keep tplmap at C:\\Tools\\tplmap; use only after SSTI evidence exists.",
          },
          {
            name: "fenjing",
            probes: [probePathOnly(winTool("Fenjing", "fenjing.bat"), "C:\\Tools\\Fenjing\\fenjing.bat")],
            hint: "Keep Fenjing at C:\\Tools\\Fenjing; use only after Jinja/SSTI evidence exists.",
          },
          {
            name: "phpggc",
            probes: [probePathOnly(winTool("phpggc", "phpggc"), "C:\\Tools\\phpggc\\phpggc")],
            hint: "Keep phpggc at C:\\Tools\\phpggc; use only after PHP deserialization evidence exists.",
          },
          {
            name: "ysoserial",
            probes: [probePathOnly(winTool("ysoserial", "ysoserial.jar"), "C:\\Tools\\ysoserial\\ysoserial.jar")],
            hint: "Keep ysoserial at C:\\Tools\\ysoserial; use only after Java deserialization evidence exists.",
          },
        ]
        // Probes are independent; run them concurrently but keep result order stable.
        const webResults = await Promise.all(webCLI.map((cli) => checkAny(cli.probes)))
        let foundWebLocal = 0
        webCLI.forEach((cli, i) => {
          const r = webResults[i]
          if (r.ok) foundWebLocal += 1
          results.push({
            name: `cli:${cli.name}`,
            ok: r.ok,
            required: false,
            category: "web-cli",
            detail: r.ok ? `${cli.name}: ${r.output}` : `${cli.name}: not found`,
            hint: r.ok ? "" : cli.hint,
          })
        })
        probes["env:web-local-tools"] = {
          ok: foundWebLocal > 0,
          executed: true,
          detail: `${foundWebLocal}/${webCLI.length} web CLI candidates available from PATH or C:\\Tools`,
          behaviorOk: foundWebLocal > 0,
        }
      }
      return { results, probes }
    }

    // -- MCP backend observability --
    const wiremcpBranch = async () => {
      const results: EnvCheckResult[] = []
      const probes: Record<string, EnvironmentProbeResult> = {}
      if (category === "forensics" || category === "misc" || category === "all") {
        // Registry uses the vendored WireMCP entrypoint; WIREMCP_LAUNCHER is legacy.
        const vendored = path.join(PLUGIN_ROOT, "mcp-server", "vendor", "WireMCP", "index.js")
        const vendoredExists = existsSync(vendored)
        results.push({
          name: "mcp:wiremcp-launcher",
          ok: vendoredExists,
          required: false,
          category: "mcp-forensics",
          detail: vendoredExists
            ? `vendored WireMCP entrypoint exists: ${vendored}`
            : `vendored WireMCP entrypoint missing: ${vendored}`,
          hint: vendoredExists
            ? ""
            : "Reinstall the plugin bundle (mcp-server/vendor/WireMCP), or use pcap probe/carve fallback.",
        })
        probes["env:wiremcp-launcher"] = {
          ok: vendoredExists,
          executed: true,
          detail: vendoredExists ? "vendored WireMCP entrypoint exists" : "vendored WireMCP entrypoint missing",
          behaviorOk: vendoredExists,
        }
      }
      return { results, probes }
    }

    const cyberchefBranch = async () => {
      const results: EnvCheckResult[] = []
      const probes: Record<string, EnvironmentProbeResult> = {}
      if (category === "crypto" || category === "forensics" || category === "misc" || category === "all") {
        const cyberchef = await cyberchefP!
        results.push({
          name: "mcp:cyberchef-mcp",
          ok: cyberchef.ok,
          required: false,
          category: "mcp-transform",
          detail: cyberchef.ok
            ? `cyberchef-mcp available: ${cyberchef.output}`
            : "cyberchef-mcp command not found on PATH",
          hint: cyberchef.ok
            ? ""
            : "Set CYBERCHEF_MCP_COMMAND to a working CyberChef MCP server, or use local Python transform scripts.",
        })
        probes["env:cyberchef-mcp"] = {
          ok: cyberchef.ok,
          executed: true,
          detail: cyberchef.ok ? "cyberchef-mcp command available" : "cyberchef-mcp command not found on PATH",
          behaviorOk: cyberchef.ok,
        }
      }
      return { results, probes }
    }

    const forensicsBranch = async () => {
      const results: EnvCheckResult[] = []
      const probes: Record<string, EnvironmentProbeResult> = {}
      if (category === "forensics" || category === "misc" || category === "all") {
        const forensicsCLI: Array<{ name: string; probes: Array<ExecProbe | undefined>; hint: string }> = [
          {
            name: "exiftool",
            probes: [probe("exiftool", ["-ver"]), probe(winTool("exiftool", "exiftool.exe"), ["-ver"])],
            hint: "Install exiftool on PATH or keep C:\\Tools\\exiftool\\exiftool.exe.",
          },
          {
            name: "wireshark-local",
            probes: [probePathOnly(winTool("Wireshark"), "C:\\Tools\\Wireshark")],
            hint: "Keep Wireshark at C:\\Tools\\Wireshark or configure WireMCP for packet workflows.",
          },
          {
            name: "cyberchef-local",
            probes: [probePathOnly(winTool("CyberChef_v10.19.4"), "C:\\Tools\\CyberChef_v10.19.4")],
            hint: "Keep the CyberChef bundle at C:\\Tools\\CyberChef_v10.19.4 or configure CYBERCHEF_MCP_COMMAND.",
          },
          {
            name: "binwalk",
            probes: [
              probe("binwalk", ["--version"], { shell: process.platform === "win32" }),
              probe(winTool("binwalk", "binwalk.exe"), ["--version"]),
            ],
            hint: "Install binwalk on PATH; it remains a common fallback for firmware and container-style artifacts.",
          },
          {
            name: "scapy",
            probes: [probePythonModule("scapy", "import scapy; print(getattr(scapy, '__version__', 'present'))")],
            hint: "python -m pip install scapy",
          },
          {
            name: "pyshark",
            probes: [probePythonModule("pyshark")],
            hint: "python -m pip install pyshark",
          },
        ]
        const forensicsResults = await Promise.all(forensicsCLI.map((cli) => checkAny(cli.probes)))
        let foundForensicsLocal = 0
        let binwalkOk = false
        let scapyOk = false
        let pysharkOk = false
        forensicsCLI.forEach((cli, i) => {
          const r = forensicsResults[i]
          if (r.ok) foundForensicsLocal += 1
          if (cli.name === "binwalk") binwalkOk = r.ok
          if (cli.name === "scapy") scapyOk = r.ok
          if (cli.name === "pyshark") pysharkOk = r.ok
          results.push({
            name: `cli:${cli.name}`,
            ok: r.ok,
            required: false,
            category: "forensics-cli",
            detail: r.ok ? `${cli.name}: ${r.output}` : `${cli.name}: not found`,
            hint: r.ok ? "" : cli.hint,
          })
        })
        probes["env:forensics-local-tools"] = {
          ok: foundForensicsLocal > 0,
          executed: true,
          detail: `${foundForensicsLocal}/${forensicsCLI.length} forensics CLI candidates available from PATH or C:\\Tools`,
          behaviorOk: foundForensicsLocal > 0,
        }
        probes["env:binwalk"] = {
          ok: binwalkOk,
          executed: true,
          detail: binwalkOk ? "binwalk available" : "binwalk not found",
          behaviorOk: binwalkOk,
        }
        probes["env:scapy"] = {
          ok: scapyOk,
          executed: true,
          detail: scapyOk ? "scapy Python module available" : "scapy Python module not found",
          behaviorOk: scapyOk,
        }
        probes["env:pyshark"] = {
          ok: pysharkOk,
          executed: true,
          detail: pysharkOk ? "pyshark Python module available" : "pyshark Python module not found",
          behaviorOk: pysharkOk,
        }
      }
      return { results, probes }
    }

    const cryptoBranch = async () => {
      const results: EnvCheckResult[] = []
      const probes: Record<string, EnvironmentProbeResult> = {}
      if (category === "crypto" || category === "all") {
        const cryptoCLI: Array<{ name: string; probes: Array<ExecProbe | undefined>; hint: string }> = [
          {
            name: "hashcat",
            probes: [probe("hashcat", ["--version"]), probe(winTool("hashcat-7.1.2", "hashcat.exe"), ["--version"])],
            hint: "Install hashcat on PATH or keep C:\\Tools\\hashcat-7.1.2\\hashcat.exe.",
          },
          {
            name: "cyberchef-local",
            probes: [probePathOnly(winTool("CyberChef_v10.19.4"), "C:\\Tools\\CyberChef_v10.19.4")],
            hint: "Keep the CyberChef bundle at C:\\Tools\\CyberChef_v10.19.4 or configure CYBERCHEF_MCP_COMMAND.",
          },
          {
            name: "c-jwt-cracker",
            probes: [probePathOnly(winTool("c-jwt-cracker"), "C:\\Tools\\c-jwt-cracker")],
            hint: "Keep c-jwt-cracker at C:\\Tools\\c-jwt-cracker for route-bound JWT cracking.",
          },
          {
            name: "gmpy2",
            probes: [probePythonModule("gmpy2")],
            hint: "python -m pip install gmpy2",
          },
          {
            name: "sage",
            probes: [probe("sage", ["--version"], { shell: process.platform === "win32" })],
            hint: "Install SageMath for lattice/algebra-heavy crypto routes.",
          },
        ]
        const cryptoResults = await Promise.all(cryptoCLI.map((cli) => checkAny(cli.probes)))
        let foundCryptoLocal = 0
        let hashcatOk = false
        let gmpy2Ok = false
        let sageOk = false
        cryptoCLI.forEach((cli, i) => {
          const r = cryptoResults[i]
          if (r.ok) foundCryptoLocal += 1
          if (cli.name === "hashcat") hashcatOk = r.ok
          if (cli.name === "gmpy2") gmpy2Ok = r.ok
          if (cli.name === "sage") sageOk = r.ok
          results.push({
            name: `cli:${cli.name}`,
            ok: r.ok,
            required: false,
            category: "crypto-cli",
            detail: r.ok ? `${cli.name}: ${r.output}` : `${cli.name}: not found`,
            hint: r.ok ? "" : cli.hint,
          })
        })
        probes["env:crypto-local-tools"] = {
          ok: foundCryptoLocal > 0,
          executed: true,
          detail: `${foundCryptoLocal}/${cryptoCLI.length} crypto CLI candidates available from PATH or C:\\Tools`,
          behaviorOk: foundCryptoLocal > 0,
        }
        probes["env:hashcat"] = {
          ok: hashcatOk,
          executed: true,
          detail: hashcatOk ? "hashcat available" : "hashcat not found",
          behaviorOk: hashcatOk,
        }
        probes["env:gmpy2"] = {
          ok: gmpy2Ok,
          executed: true,
          detail: gmpy2Ok ? "gmpy2 Python module available" : "gmpy2 Python module not found",
          behaviorOk: gmpy2Ok,
        }
        probes["env:sage"] = {
          ok: sageOk,
          executed: true,
          detail: sageOk ? "sage available" : "sage not found",
          behaviorOk: sageOk,
        }
      }
      return { results, probes }
    }

    // -- Docker daemon (always check if any docker test is needed) --
    const dockerBranch = async () => {
      const results: EnvCheckResult[] = []
      const probes: Record<string, EnvironmentProbeResult> = {}
      if (category === "pwn" || category === "rev" || category === "all") {
        const dockerInfo = await dockerInfoP!
        results.push({
          name: "docker-daemon",
          ok: dockerInfo.ok,
          required: category !== "all",
          category: "runtime",
          detail: dockerInfo.ok
            ? `Docker daemon is running${dockerInfo.version ? ` (${dockerInfo.version})` : ""}`
            : "Docker daemon not reachable",
          hint: dockerInfo.ok
            ? ""
            : "Install Docker Desktop (Windows/Mac) or docker.io (Linux). On Windows, Docker Desktop must be running.",
        })
        probes["env:docker"] = {
          ok: dockerInfo.ok,
          executed: true,
          version: dockerInfo.version,
          detail: dockerInfo.ok ? "docker daemon reachable" : "docker daemon not reachable",
          behaviorOk: dockerInfo.ok,
        }
      }
      return { results, probes }
    }

    // -- PWN images --
    const pwnBranch = async () => {
      const results: EnvCheckResult[] = []
      const probes: Record<string, EnvironmentProbeResult> = {}
      if (category === "pwn" || category === "all") {
        if ((await dockerInfoP!).ok) {
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
          let anyPwnImage = false
          const imageExists = await Promise.all(pwnImages.map((img) => dockerImageExists(img.name)))
          pwnImages.forEach((img, i) => {
            const exists = imageExists[i]
            if (exists) anyPwnImage = true
            results.push({
              name: `docker-image:${img.key}`,
              ok: exists,
              required: false,
              category: "pwn-docker",
              detail: exists ? `${img.name} image exists` : `${img.name} image not built`,
              hint: exists
                ? ""
                : `Build with: docker compose -f docker/docker-compose.revlab.yml --profile general build pwn-general`,
            })
          })
          probes["env:pwnlab-images"] = {
            ok: anyPwnImage,
            executed: true,
            detail: anyPwnImage ? "at least one pwnlab image is available" : "no pwnlab images are built",
            behaviorOk: anyPwnImage,
          }
        }

        // -- PWN CLI tools --
        const pwnCLI: Array<{ name: string; cmd: string; args: string[]; hint: string }> = [
          { name: "python3", cmd: "python3", args: ["--version"], hint: "Install Python 3." },
          {
            name: "pwntools",
            cmd: "python",
            args: ["-c", "import pwn; print(pwn.__version__)"],
            hint: "pip install pwntools",
          },
          { name: "gdb", cmd: "gdb", args: ["--version"], hint: "Install gdb; for pwn prefer WSL2/Linux." },
          { name: "checksec", cmd: "checksec", args: ["--version"], hint: "pip install pwntools (checksec bundled)." },
          { name: "ROPgadget", cmd: "ROPgadget", args: ["--version"], hint: "pip install ROPgadget" },
          { name: "readelf", cmd: "readelf", args: ["--version"], hint: "Install binutils." },
          { name: "objdump", cmd: "objdump", args: ["--version"], hint: "Install binutils." },
          { name: "one_gadget", cmd: "one_gadget", args: ["--version"], hint: "gem install one_gadget" },
          { name: "seccomp-tools", cmd: "seccomp-tools", args: ["--version"], hint: "gem install seccomp-tools" },
          { name: "patchelf", cmd: "patchelf", args: ["--version"], hint: "Install patchelf." },
        ]
        const pwnResults = await Promise.all(pwnCLI.map((cli) => check(cli.cmd, cli.args)))
        let pwntoolsOk = false
        let oneGadgetOk = false
        let seccompToolsOk = false
        let patchelfOk = false
        pwnCLI.forEach((cli, i) => {
          const r = pwnResults[i]
          if (cli.name === "pwntools") pwntoolsOk = r.ok
          if (cli.name === "one_gadget") oneGadgetOk = r.ok
          if (cli.name === "seccomp-tools") seccompToolsOk = r.ok
          if (cli.name === "patchelf") patchelfOk = r.ok
          results.push({
            name: `cli:${cli.name}`,
            ok: r.ok,
            required: cli.name === "python3" || cli.name === "pwntools",
            category: "pwn-cli",
            detail: r.ok ? `${cli.name}: ${r.output}` : `${cli.name}: not found`,
            hint: r.ok ? "" : cli.hint,
          })
        })
        probes["env:pwntools"] = {
          ok: pwntoolsOk,
          executed: true,
          detail: pwntoolsOk ? "pwntools Python module available" : "pwntools Python module not found",
          behaviorOk: pwntoolsOk,
        }
        probes["env:one_gadget"] = {
          ok: oneGadgetOk,
          executed: true,
          detail: oneGadgetOk ? "one_gadget available" : "one_gadget not found",
          behaviorOk: oneGadgetOk,
        }
        probes["env:seccomp-tools"] = {
          ok: seccompToolsOk,
          executed: true,
          detail: seccompToolsOk ? "seccomp-tools available" : "seccomp-tools not found",
          behaviorOk: seccompToolsOk,
        }
        probes["env:patchelf"] = {
          ok: patchelfOk,
          executed: true,
          detail: patchelfOk ? "patchelf available" : "patchelf not found",
          behaviorOk: patchelfOk,
        }
        const pwnLocalCLI: Array<{ name: string; probes: Array<ExecProbe | undefined>; hint: string }> = [
          {
            name: "radare2",
            probes: [
              probe("r2", ["-v"], { shell: process.platform === "win32" }),
              probe(winTool("radare2", "radare2-6.1.4-w64", "bin", "r2.bat"), ["-v"], {
                shell: process.platform === "win32",
              }),
              probe(winTool("radare2", "radare2-6.1.4-w64", "bin", "radare2.exe"), ["-v"]),
            ],
            hint: "Install r2/radare2 on PATH or keep C:\\Tools\\radare2\\radare2-6.1.4-w64.",
          },
        ]
        const pwnLocalResults = await Promise.all(pwnLocalCLI.map((cli) => checkAny(cli.probes)))
        pwnLocalCLI.forEach((cli, i) => {
          const r = pwnLocalResults[i]
          results.push({
            name: `cli:${cli.name}`,
            ok: r.ok,
            required: false,
            category: "pwn-cli",
            detail: r.ok ? `${cli.name}: ${r.output}` : `${cli.name}: not found`,
            hint: r.ok ? "" : cli.hint,
          })
        })
      }
      return { results, probes }
    }

    // -- REV images --
    const revBranch = async () => {
      const results: EnvCheckResult[] = []
      const probes: Record<string, EnvironmentProbeResult> = {}
      if (category === "rev" || category === "all") {
        if ((await dockerInfoP!).ok) {
          const revImages = [{ name: "revlab:ubuntu22.04", key: "revlab-ubuntu22.04" }]
          let anyRevImage = false
          for (const img of revImages) {
            const exists = await dockerImageExists(img.name)
            if (exists) anyRevImage = true
            results.push({
              name: `docker-image:${img.key}`,
              ok: exists,
              required: false,
              category: "rev-docker",
              detail: exists ? `${img.name} image exists` : `${img.name} image not built`,
              hint: exists
                ? ""
                : `Build with: docker compose -f docker/docker-compose.revlab.yml --profile revlab build revlab`,
            })
          }
          probes["env:revlab-image"] = {
            ok: anyRevImage,
            executed: true,
            detail: anyRevImage ? "revlab image available" : "revlab image not built",
            behaviorOk: anyRevImage,
          }
        } else {
          probes["env:revlab-image"] = {
            ok: false,
            executed: true,
            detail: "Docker daemon unavailable; revlab image not checked",
            behaviorOk: false,
          }
        }

        // -- Android / ADB --
        const adbOk = await adbDeviceP!
        results.push({
          name: "adb-device",
          ok: adbOk,
          required: false,
          category: "rev-android",
          detail: adbOk ? "ADB device connected" : "No ADB device connected",
          hint: adbOk ? "" : "Connect an Android device or start an emulator. Use 'adb devices' to check.",
        })

        const androidStudioOk = await androidStudioP!
        results.push({
          name: "android-studio",
          ok: androidStudioOk,
          required: false,
          category: "rev-android",
          detail: androidStudioOk ? "Android Studio / SDK detected" : "Android Studio / SDK not detected",
          hint: androidStudioOk ? "" : "Install Android Studio and set ANDROID_HOME or ANDROID_SDK_ROOT.",
        })
        probes["env:android-studio"] = {
          ok: androidStudioOk,
          executed: true,
          detail: androidStudioOk ? "Android Studio / SDK detected" : "Android Studio / SDK not detected",
          behaviorOk: androidStudioOk,
        }
        probes["env:adb"] = {
          ok: adbOk,
          executed: true,
          detail: adbOk ? "ADB device connected" : "No ADB device connected",
          behaviorOk: adbOk,
        }

        // ADB CLI
        const adbCLI = await adbCliP!
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
        const revResults = await Promise.all(revCLI.map((cli) => check(cli.cmd, cli.args)))
        revCLI.forEach((cli, i) => {
          const r = revResults[i]
          results.push({
            name: `cli:${cli.name}`,
            ok: r.ok,
            required: cli.name === "file" || cli.name === "strings",
            category: "rev-cli",
            detail: r.ok ? `${cli.name}: ${r.output}` : `${cli.name}: not found`,
            hint: r.ok ? "" : cli.hint,
          })
        })
        const revLocalCLI: Array<{ name: string; probes: Array<ExecProbe | undefined>; hint: string }> = [
          {
            name: "radare2",
            probes: [
              probe("r2", ["-v"], { shell: process.platform === "win32" }),
              probe(winTool("radare2", "radare2-6.1.4-w64", "bin", "r2.bat"), ["-v"], {
                shell: process.platform === "win32",
              }),
              probe(winTool("radare2", "radare2-6.1.4-w64", "bin", "radare2.exe"), ["-v"]),
            ],
            hint: "Install r2/radare2 on PATH or keep C:\\Tools\\radare2\\radare2-6.1.4-w64.",
          },
          {
            name: "x64dbg",
            probes: [
              probePathOnly(winTool("snapshot", "release", "x64", "x64dbg.exe")),
              probePathOnly("C:\\Tools\\x64dbg\\x64\\x64dbg.exe"),
            ],
            hint: "x64dbg is GUI-only; pair it with cdb/WinDbg for scriptable stdin+breakpoint automation.",
          },
          {
            name: "cdb",
            probes: [
              probe("cdb.exe", ["-version"]),
              probePathOnly("C:\\Program Files (x86)\\Windows Kits\\10\\Debuggers\\x64\\cdb.exe"),
              probePathOnly("C:\\Program Files\\Windows Kits\\10\\Debuggers\\x64\\cdb.exe"),
            ],
            hint: "Install Windows SDK Debuggers to enable scriptable cdb/WinDbg automation.",
          },
          {
            name: "dnspy",
            probes: [probePathOnly(winTool("dnSpy", "dnSpy.exe"), "C:\\Tools\\dnSpy\\dnSpy.exe")],
            hint: "Keep dnSpy at C:\\Tools\\dnSpy\\dnSpy.exe for .NET reversing.",
          },
        ]
        const revLocalResults = await Promise.all(revLocalCLI.map((cli) => checkAny(cli.probes)))
        let foundRevLocal = 0
        revLocalCLI.forEach((cli, i) => {
          const r = revLocalResults[i]
          if (r.ok) foundRevLocal += 1
          results.push({
            name: `cli:${cli.name}`,
            ok: r.ok,
            required: false,
            category: "rev-cli",
            detail: r.ok ? `${cli.name}: ${r.output}` : `${cli.name}: not found`,
            hint: r.ok ? "" : cli.hint,
          })
        })
        probes["env:rev-local-tools"] = {
          ok: foundRevLocal > 0,
          executed: true,
          detail: `${foundRevLocal}/${revLocalCLI.length} rev CLI candidates available from PATH or C:\\Tools`,
          behaviorOk: foundRevLocal > 0,
        }
      }
      return { results, probes }
    }

    // Run all category branches concurrently; merge in fixed order for deterministic output.
    const branchOutputs = await Promise.all([
      webBranch(),
      wiremcpBranch(),
      cyberchefBranch(),
      forensicsBranch(),
      cryptoBranch(),
      dockerBranch(),
      pwnBranch(),
      revBranch(),
    ])
    for (const branch of branchOutputs) {
      results.push(...branch.results)
      Object.assign(environmentProbes, branch.probes)
    }

    // -- Summarize --
    const hardRequired = ["python3", "pwntools", "file", "strings"]
    const missingCritical = results.filter((r) => r.required && !r.ok)
    const missingOptional = results.filter((r) => !r.required && !r.ok)
    const ready = missingCritical.length === 0
    const directory = context?.directory || process.cwd()
    const loadedConfig = await loadPluginConfigWithPath(directory)
    const requestedPacks = [...(loadedConfig.config.tool_packs ?? []), ...(loadedConfig.config.expert_tool_packs ?? [])]
    const enabledPacks = resolveEnabledPacks(requestedPacks.length ? requestedPacks : undefined)
    const registeredTools = Object.keys(await loadCtfTools({ packs: [...enabledPacks] }))
    const familyReadiness = evaluateAllFamilyReadiness({
      registeredTools,
      enabledToolPacks: [...enabledPacks],
      environmentProbes,
    })
    const startupEnvironmentSummary = formatStartupEnvironmentSummary(environmentProbes)
    const pwnBuildHints = results
      .filter((r) => r.category === "pwn-docker" && !r.ok)
      .map((r) => r.hint)
      .filter(Boolean)
    const revBuildHints = results
      .filter((r) => r.category === "rev-docker" && !r.ok)
      .map((r) => r.hint)
      .filter(Boolean)
    const mcpHints = results
      .filter((r) => r.category.startsWith("mcp-") && !r.ok)
      .map((r) => `${r.name}: ${r.hint}`)
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
          registered_tools: registeredTools.sort(),
          tool_registry_config: loadedConfig.path,
          environment_probes: environmentProbes,
          readiness: familyReadiness,
        },
        null,
        2,
      )
    }

    const lines: string[] = [
      "=== CTF Environment Check ===",
      `category: ${category}`,
      `ready: ${ready ? "YES" : "NO"}`,
      `tool registry: ${registeredTools.length} tools (${loadedConfig.path ?? "defaults"})`,
      "",
    ]

    if (startupEnvironmentSummary) {
      lines.push(startupEnvironmentSummary, "")
    }

    for (const r of results) {
      const icon = r.ok ? "OK" : r.required ? "MISS" : "WARN"
      lines.push(`  ${icon} [${r.category}] ${r.name}: ${r.detail}`)
    }

    if (missingCritical.length) {
      lines.push("", "--- MISSING CRITICAL ---")
      for (const r of missingCritical) lines.push(`  MISS ${r.name}: ${r.hint}`)
    }

    if (pwnBuildHints.length) {
      lines.push("", "--- PWN DOCKER BUILD HINTS ---")
      lines.push("  Some pwnlab images are not built. Build them:")
      lines.push("  # Run from the repository root:")
      lines.push("  # Build all pwnlab images:")
      lines.push("  docker compose -f docker/docker-compose.revlab.yml --profile general build pwn-general")
      lines.push("  # Or build individual images using the hints above.")
    }

    if (revBuildHints.length) {
      lines.push("", "--- REVLAB DOCKER BUILD HINTS ---")
      lines.push("  revlab image is not built. Build it:")
      lines.push("  # Run from the repository root:")
      lines.push("  docker compose -f docker/docker-compose.revlab.yml --profile revlab build revlab")
    }

    if (mcpHints.length) {
      lines.push("", "--- MCP OBSERVABILITY HINTS ---")
      lines.push("  Missing MCP backends degrade only the routes that need them; fallback tools remain valid.")
      for (const hint of mcpHints) lines.push(`  WARN ${hint}`)
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
