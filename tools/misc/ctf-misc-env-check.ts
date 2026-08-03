import { tool } from "@opencode-ai/plugin"
import { safeExec } from "../lib/exec-utils.ts"

type Probe = {
  id: string
  kind: "command" | "python-module"
  command: string
  args?: string[]
  required?: boolean
  hint: string
}

type Check = {
  id: string
  ok: boolean
  required: boolean
  detail: string
  hint: string
}

type Capability = {
  id: string
  label: string
  status: "ready" | "degraded" | "blocked"
  checks: Check[]
  /** Each group represents one viable backend path; one check must pass per group. */
  fallbackGroups?: string[][]
}

function statusFor(checks: Check[], fallbackGroups: string[][] = []): Capability["status"] {
  if (checks.some((check) => check.required && !check.ok)) return "blocked"
  const byId = new Map(checks.map((check) => [check.id, check.ok]))
  if (fallbackGroups.some((group) => !group.some((id) => byId.get(id) === true))) return "blocked"
  if (checks.some((check) => !check.required && !check.ok)) return "degraded"
  return "ready"
}

async function runProbe(probe: Probe): Promise<Check> {
  const args =
    probe.kind === "python-module"
      ? ["-c", `import ${probe.command}; print(getattr(${probe.command}, "__version__", "present"))`]
      : (probe.args ?? ["--version"])
  const result = await safeExec(probe.kind === "python-module" ? "python" : probe.command, args, {
    // Capability checks should fail fast; they are diagnostics, not long-running probes.
    timeoutMs: 2500,
    // Avoid shell startup/quoting delays on Windows. `safeExec` resolves known wrappers.
    shell: false,
    maxBuffer: 128 * 1024,
  })
  return {
    id: probe.id,
    ok: result.ok,
    required: probe.required === true,
    detail: result.ok ? result.output.slice(0, 200) : result.output.slice(0, 300),
    hint: result.ok ? "" : probe.hint,
  }
}

function command(id: string, name: string, hint: string, required = false, args?: string[]): Probe {
  return { id, kind: "command", command: name, args, required, hint }
}

function moduleProbe(id: string, name: string, hint: string, required = false): Probe {
  return { id, kind: "python-module", command: name, required, hint }
}

export default tool({
  description:
    "CTF Misc environment matrix: check Python modules and external commands for encoding, protocol, QR, media, DNS, SMT, RF, and game/VM routes. Missing optional capabilities are reported as degraded instead of blocking the whole Misc family.",
  args: {
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const groups: Array<{ id: string; label: string; probes: Probe[]; fallbackGroups?: string[][] }> = [
      {
        id: "core",
        label: "Core triage and scripting",
        probes: [
          command("python", "python", "Install Python 3 and ensure it is on PATH.", true, ["--version"]),
          command("node", "node", "Install Node.js >= 22.", true, ["--version"]),
        ],
      },
      {
        id: "encoding",
        label: "Encoding and transform chains",
        probes: [
          moduleProbe("python:requests", "requests", "pip install -r requirements.txt"),
          moduleProbe("python:Pillow", "PIL", "pip install -r requirements-misc.txt"),
        ],
      },
      {
        id: "protocol",
        label: "PPC and custom socket protocols",
        fallbackGroups: [["python:pwntools", "nc"]],
        probes: [
          moduleProbe("python:pwntools", "pwn", "pip install pwntools; otherwise use the nc fallback."),
          command("nc", "nc", "Install netcat or use ctf-proto-probe with pwntools as the fallback.", false, ["-h"]),
        ],
      },
      {
        id: "smt",
        label: "SMT and constraint solving",
        fallbackGroups: [["python:z3", "python:sympy"]],
        probes: [
          moduleProbe("python:z3", "z3", "pip install z3-solver; SymPy is a slower fallback."),
          moduleProbe("python:sympy", "sympy", "pip install sympy"),
        ],
      },
      {
        id: "qr",
        label: "QR and barcode extraction",
        fallbackGroups: [["python:opencv", "python:pyzbar", "zbarimg"]],
        probes: [
          moduleProbe("python:Pillow", "PIL", "pip install Pillow for image normalization."),
          moduleProbe("python:opencv", "cv2", "pip install opencv-python-headless"),
          moduleProbe("python:pyzbar", "pyzbar", "pip install pyzbar and install the native zbar library"),
          command("zbarimg", "zbarimg", "Install zbar; Python/OpenCV fallback remains available.", false),
        ],
      },
      {
        id: "media",
        label: "Audio and video Misc",
        fallbackGroups: [["python:numpy", "ffmpeg"]],
        probes: [
          moduleProbe("python:numpy", "numpy", "pip install numpy for numeric/audio/signal analysis."),
          moduleProbe("python:scipy", "scipy", "pip install scipy"),
          command("ffmpeg", "ffmpeg", "Install ffmpeg for audio/video conversion and demuxing.", false),
        ],
      },
      {
        id: "dns",
        label: "DNS records and tunneling",
        fallbackGroups: [["python:dns", "dig", "nslookup"]],
        probes: [
          moduleProbe("python:dns", "dns", "pip install dnspython; dig or nslookup can provide a resolver fallback."),
          moduleProbe("python:dnslib", "dnslib", "pip install dnslib"),
          command("dig", "dig", "Install dnsutils/bind-tools or use the dnspython/nslookup fallback.", false),
          command("nslookup", "nslookup", "Use the Windows resolver fallback when dig is unavailable.", false),
        ],
      },
      {
        id: "rf",
        label: "RF and SDR analysis",
        fallbackGroups: [["python:numpy"]],
        probes: [
          moduleProbe("python:numpy", "numpy", "pip install numpy for numeric/audio/signal analysis."),
          moduleProbe("python:scipy", "scipy", "pip install scipy"),
          command("inspectrum", "inspectrum", "Install Inspectrum or GNU Radio for interactive IQ analysis.", false),
          command("rtl_433", "rtl_433", "Install rtl_433 for supported ISM-band protocol decoding.", false),
        ],
      },
      {
        id: "game_vm",
        label: "Games, VMs, and esolangs",
        fallbackGroups: [["python:capstone", "python:unicorn", "gcc"]],
        probes: [
          moduleProbe("python:capstone", "capstone", "pip install capstone"),
          moduleProbe("python:unicorn", "unicorn", "pip install unicorn"),
          command("gcc", "gcc", "Install GCC or use a Docker/WSL build environment for native helpers.", false),
        ],
      },
      {
        id: "stego_forensics",
        label: "Stego and artifact fallbacks",
        fallbackGroups: [["exiftool", "tshark", "zsteg", "binwalk"]],
        probes: [
          command("exiftool", "exiftool", "Install ExifTool for metadata inspection.", false, ["-ver"]),
          command("tshark", "tshark", "Install Wireshark/tshark for packet-shaped Misc artifacts.", false, [
            "--version",
          ]),
          command("zsteg", "zsteg", "Install zsteg for PNG/BMP bit-plane checks.", false),
          command("binwalk", "binwalk", "Repair or install binwalk; verify the Python package imports cleanly.", false),
        ],
      },
    ]

    const capabilities: Capability[] = []
    for (const group of groups) {
      const checks = await Promise.all(group.probes.map(runProbe))
      capabilities.push({
        id: group.id,
        label: group.label,
        status: statusFor(checks, group.fallbackGroups),
        checks,
        ...(group.fallbackGroups ? { fallbackGroups: group.fallbackGroups } : {}),
      })
    }

    const blocked = capabilities.filter((capability) => capability.status === "blocked")
    const degraded = capabilities.filter((capability) => capability.status === "degraded")
    const overallStatus: Capability["status"] = blocked.length ? "blocked" : degraded.length ? "degraded" : "ready"
    const payload = {
      schemaVersion: "misc_env.v1",
      platform: process.platform,
      overallStatus,
      summary: {
        ready: capabilities.filter((capability) => capability.status === "ready").map((capability) => capability.id),
        degraded: degraded.map((capability) => capability.id),
        blocked: blocked.map((capability) => capability.id),
      },
      capabilities,
      guidance: [
        "Use ctf-misc-analyze before selecting a specialist route.",
        "A degraded capability means a fallback exists; do not treat it as a solved route.",
        "Install missing dependencies only with explicit workspace/environment approval.",
      ],
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "MISC_ENV_CHECK:",
      `- schema: ${payload.schemaVersion}`,
      `- platform: ${payload.platform}`,
      `- overall: ${payload.overallStatus}`,
      "- capabilities:",
      ...capabilities.map((capability) => `  - ${capability.id}: ${capability.status} (${capability.label})`),
      "- missing hints:",
      ...capabilities.flatMap((capability) =>
        capability.checks.filter((check) => !check.ok).map((check) => `  - ${check.id}: ${check.hint}`),
      ),
    ].join("\n")
  },
})
