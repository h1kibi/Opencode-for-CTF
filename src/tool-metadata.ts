import { packForTool, type ToolPackId } from "./tool-packs.ts"

export type ToolTier = "light" | "default" | "advanced" | "compat" | "maintenance"
export type ToolEffect = "read" | "write" | "execute" | "network" | "state"

export type ToolMetadata = {
  name: string
  category: ToolPackId
  tier: ToolTier
  effects: ToolEffect[]
  requires: string[]
  aliasOf?: string
}

const COMPAT_ALIASES: Record<string, string> = {
  "archive-safe-extract": "ctf-safe-extract",
  "ctf-java-analyze-pack": "ctf-java-analyze",
  "ctf-pwn-remote-check": "ctf-pwn-remote-fingerprint",
  "ctf-web-recon-pack": "ctf-web-analyze",
}

const MAINTENANCE_TOOLS = new Set([
  "archive-safe-extract",
  "ctf-background-job",
  "ctf-python-parallel",
  "ctf-runtime-selftest",
  "ctf-skill-mcp-lifecycle",
])

const LIGHT_TOOLS = new Set([
  "ctf-route-plan",
  "ctf-tool-packs",
  "ctf-evidence-board",
  "ctf-file-triage",
  "ctf-one-shot-triage",
  "ctf-binary-probe",
  "ctf-flag-grep",
  "ctf-flag-verify",
  "ctf-safe-extract",
  "doc-read",
  "image-file-info",
  "ctf-web-fingerprint",
  "ctf-web-analyze",
  "ctf-web-blackbox-map",
  "ctf-web-probe",
  "ctf-web-source-map",
  "ctf-java-analyze",
  "ctf-pwn-analyze",
  "ctf-pwn-runner",
  "ctf-pwn-check-env",
  "ctf-pwn-fast-skeleton-hints",
  "ctf-pwn-offset",
  "ctf-pwn-probe",
  "ctf-pwn-libc-hint",
  "ctf-pwn-remote-fingerprint",
  "ctf-proto-probe",
  "ctf-rev-analyze",
  "ctf-rev-capability-check",
  "ctf-rev-closure-ladder",
  "ctf-rev-runtime-session",
  "ctf-rev-runtime-doctor",
  "ctf-crypto-analyze",
  "ctf-rsa-probe",
  "ctf-forensics-analyze",
  "ctf-misc-analyze",
  "ctf-multimodal-triage",
  "ctf-misc-env-check",
  "ctf-aisec-env-check",
  "ctf-aisec-model-inspect",
  "ctf-aisec-inference-probe",
  "ctf-encoding-chain",
  "ctf-pcap-probe",
  "ctf-stego-probe",
  "ctf-image-open",
  "ctf-python-inline",
  "ctf-ensure-dir",
  "ctf-dynamic-mcp-advisor",
  "ctf-env-check",
  "ctf-artifact-analyze",
  "ctf-memstr",
  "ctf-pe-unpack",
  "ctf-pe-hybrid-rebuild",
  "ctf-runtime-dump",
  "ctf-rev-pe-recovery",
  "ctf-windows-expect-runner",
  "ctf-windows-debug-helper",
])

const ADVANCED_PREFIXES = [
  "ctf-android-dynamic-",
  "ctf-godot-",
  "ctf-pwn-gdb-",
  "ctf-pwn-docker-",
  "ctf-pwn-expect-",
  "ctf-pwn-stage-",
  "ctf-pwn-post-shell-",
  "ctf-pwn-linux-session",
  "ctf-pwn-wsl-",
  "ctf-pwn-runbox",
  "ctf-pwn-persist-",
  "ctf-pcap-carve",
  "ctf-pcap-extract",
  "ctf-stego-triage",
  "ctf-waf-",
  "ctf-web-fuzz-",
]

const TOOL_REQUIRES: Record<string, string[]> = {
  "archive-safe-extract": ["unzip|7z|jar|tar|powershell"],
  "ctf-safe-extract": ["unzip|7z|jar|tar|powershell"],
  "ctf-binary-probe": ["file", "readelf", "nm", "checksec", "docker?"],
  "ctf-elf-slice": ["file", "readelf", "objdump", "nm", "docker?"],
  "ctf-pwn-analyze": ["python?", "pwntools?", "file?", "readelf?", "nm?", "checksec?", "docker?"],
  "ctf-pwn-runner": ["python", "pwntools?"],
  "ctf-pwn-remote-fingerprint": ["python", "pwntools?"],
  "ctf-pwn-remote-check": ["python", "pwntools?"],
  "ctf-pwn-docker-runner": ["docker"],
  "ctf-pwn-docker-harness": ["docker?", "file"],
  "ctf-pwn-gdb-snapshot": ["gdb", "docker?"],
  "ctf-pwn-expect-runner": ["python", "pwntools?"],
  "ctf-pwn-runbox": ["docker"],
  "ctf-pwn-wsl-runner": ["wsl"],
  "ctf-pwn-libc-hint": ["readelf", "nm", "one_gadget?"],
  "ctf-pwn-libc-resolver": ["readelf", "nm", "one_gadget?"],
  "ctf-pwn-libc-fingerprint": ["file", "readelf", "nm"],
  "ctf-rev-analyze": ["file?", "readelf?", "objdump?", "nm?", "checksec?", "docker?"],
  "ctf-rev-capability-check": ["node", "python?", "docker?", "adb?"],
  "ctf-rev-runtime-session": ["node"],
  "ctf-rev-runtime-doctor": [
    "node",
    "python?",
    "file?",
    "objdump?",
    "readelf?",
    "gdb?",
    "docker?",
    "adb?",
    "qemu-x86_64?",
    "qemu-aarch64?",
  ],
  "ctf-file-triage": ["node", "file?"],
  "ctf-file-read-via-parser": ["node"],
  "ctf-one-shot-triage": ["node", "file?"],
  "ctf-env-check": ["node", "docker?", "adb?", "powershell?"],
  "ctf-aisec-env-check": ["node", "python?", "docker?"],
  "ctf-aisec-model-inspect": ["node"],
  "ctf-aisec-inference-probe": ["node", "python?"],
  "ctf-whitebox-env-check": ["node"],
  "ctf-crypto-analyze": ["node"],
  "ctf-misc-analyze": ["node", "file?"],
  "ctf-multimodal-triage": ["node", "ffmpeg?", "ffprobe?", "python?", "tesseract?"],
  "ctf-misc-env-check": ["node", "python?", "docker?"],
  "ctf-dns-probe": ["node", "python?", "dnspython?", "dig?"],
  "ctf-qr-probe": ["node", "python?", "opencv?", "zbarimg?"],
  "ctf-rsa-probe": ["node"],
  "ctf-forensics-analyze": ["file?", "exiftool?", "binwalk?", "zsteg?", "tshark?", "python?", "tesseract?", "docker?"],
  "ctf-proto-probe": ["python", "pwntools"],
  "ctf-pcap-probe": ["file", "capinfos?", "tshark?", "docker?"],
  "ctf-pcap-extract": ["tshark|tcpdump"],
  "ctf-pcap-carve": ["tshark?", "python?"],
  "ctf-stego-probe": ["file", "exiftool?", "binwalk?", "zsteg?"],
  "ctf-stego-triage": ["file", "exiftool?", "strings?", "binwalk?", "zsteg?"],
  "ctf-image-open": ["node", "python?", "tesseract?"],
  "ctf-media-open": ["node", "python?", "tesseract?"],
  "ctf-artifact-page": ["node", "python?"],
  "ctf-local-harness-verifier": ["node"],
  "doc-read": ["python"],
  "image-file-info": ["file?", "exiftool?"],
  "ctf-android-dynamic-macro": ["adb", "aapt?", "frida-ps?"],
  "ctf-android-analyze": ["aapt?", "apkanalyzer?", "apkid?", "readelf?", "nm?", "apktool?", "adb?"],
  "ctf-android-runtime-check": ["adb", "frida-ps?"],
  "ctf-android-runtime-doctor": ["adb"],
  "ctf-android-native-triage": ["unzip", "readelf", "nm"],
  "ctf-apk-resource-read": ["aapt?", "apkanalyzer?"],
  "ctf-apk-triage": ["aapt?", "apkanalyzer?", "apkid?"],
  "ctf-dex-patch-map": ["node"],
  "ctf-go-pclntool": ["go?", "docker?"],
  "ctf-rev-pe-slice": ["objdump"],
  "ctf-rev-pe-recovery": ["node", "objdump?"],
  "ctf-runtime-dump": ["powershell"],
  "ctf-pe-unpack": ["node", "powershell?"],
  "ctf-pe-hybrid-rebuild": ["node"],
  "ctf-memstr": ["node"],
  "ctf-windows-expect-runner": ["powershell"],
  "ctf-windows-debug-helper": ["powershell", "cdb?"],
  "ctf-windows-gui-inspect": ["powershell"],
  "ctf-java-archive-map": ["jar|unzip"],
  "ctf-java-bytecode-hints": ["javap"],
  "ctf-java-decompile-targets": ["cfr|fernflower|javap"],
  "ctf-java-jdk-env": ["java"],
  "ctf-godot-decompile": ["gdre_tools"],
  "ctf-godot-gdc-scan": ["node"],
  "ctf-godot-pack-inspect": ["node"],
  "ctf-godot-resource-read": ["node"],
  "ctf-source-first-pack": ["node"],
  "ctf-source-map-read": ["node"],
  "ctf-whitebox-handoff": ["node"],
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

export function toolTier(toolName: string): ToolTier {
  if (COMPAT_ALIASES[toolName]) return "compat"
  if (MAINTENANCE_TOOLS.has(toolName)) return "maintenance"
  if (LIGHT_TOOLS.has(toolName)) return "light"
  if (ADVANCED_PREFIXES.some((prefix) => toolName === prefix || toolName.startsWith(prefix))) return "advanced"
  const pack = packForTool(toolName)
  if (
    pack === "android" ||
    pack === "godot" ||
    pack === "java" ||
    pack === "pwn-heavy" ||
    pack === "web-heavy" ||
    pack === "rev-heavy" ||
    pack === "android-dynamic" ||
    pack === "forensics-heavy"
  ) {
    return "advanced"
  }
  return "default"
}

export function toolEffects(toolName: string): ToolEffect[] {
  const effects: ToolEffect[] = ["read"]
  if (
    /runner|runbox|snapshot|probe|extract|open|triage|doctor|check|env|pclntool|decompile|apk|pcap|stego|image|media|java-jdk|dump|unpack|debug|disasm|recovery|rebuild/.test(
      toolName,
    )
  ) {
    effects.push("execute")
  }
  if (toolName === "ctf-forensics-analyze") effects.push("execute")
  if (toolName === "ctf-pwn-analyze" || toolName === "ctf-rev-analyze") effects.push("execute")
  if (/remote|proto|web-|api-|waf/.test(toolName)) effects.push("network")
  if (/evidence|decision|ledger|state|write|extract|artifact|handoff|background|template|feedback/.test(toolName)) {
    effects.push("write")
  }
  if (/evidence|decision|ledger|state|handoff|continuation|team|mcp/.test(toolName)) effects.push("state")
  return unique(effects)
}

export function toolRequires(toolName: string): string[] {
  if (TOOL_REQUIRES[toolName]) return TOOL_REQUIRES[toolName]
  if (toolName.startsWith("ctf-pwn-")) return ["python?", "pwntools?"]
  if (toolName.startsWith("ctf-web-") || toolName === "ctf-api-map" || toolName.startsWith("ctf-waf-")) return ["fetch"]
  if (toolName.startsWith("ctf-crypto-")) return ["node"]
  if (toolName.startsWith("ctf-misc-")) return ["node"]
  if (toolName.startsWith("ctf-java-")) return ["node"]
  if (toolName.startsWith("ctf-android-") || toolName.startsWith("ctf-apk-") || toolName.startsWith("ctf-dex-"))
    return ["adb?", "aapt?"]
  if (toolName.startsWith("ctf-godot-")) return ["gdre_tools?"]
  if (toolName.startsWith("ctf-rev-")) return ["node"]
  return []
}

export function toolMetadata(toolName: string): ToolMetadata {
  return {
    name: toolName,
    category: packForTool(toolName),
    tier: toolTier(toolName),
    effects: toolEffects(toolName),
    requires: toolRequires(toolName),
    aliasOf: COMPAT_ALIASES[toolName],
  }
}

export function summarizeToolMetadata(toolNames: string[]): Record<ToolTier, string[]> {
  const out: Record<ToolTier, string[]> = {
    light: [],
    default: [],
    advanced: [],
    compat: [],
    maintenance: [],
  }
  for (const name of toolNames) out[toolTier(name)].push(name)
  for (const tier of Object.keys(out) as ToolTier[]) out[tier].sort()
  return out
}

export function isCompatToolAlias(toolName: string): boolean {
  return Boolean(COMPAT_ALIASES[toolName])
}

export function compatAliasTarget(toolName: string): string | undefined {
  return COMPAT_ALIASES[toolName]
}
