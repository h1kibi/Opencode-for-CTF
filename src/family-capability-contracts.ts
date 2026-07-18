import type { CtfFamily } from "./types.ts"
import type { ToolPackId } from "./tool-packs.ts"

export const CTF_FAMILIES: CtfFamily[] = ["web", "pwn", "rev", "crypto", "forensics", "misc"]

export type FamilyCapabilityStatus = "ready" | "degraded" | "blocked"

export type FamilyCapabilityCheck = {
  id: string
  ok: boolean
  required: boolean
  detail: string
  remediation?: string
}

export type FamilyFallbackMode = {
  id: string
  label: string
  detail: string
}

export type FamilyContractBenchmarkStatus = "covered" | "partial" | "planned"

export type FamilyCapabilityContract = {
  family: CtfFamily
  expectedToolPacks: ToolPackId[]
  requiredTools: string[]
  supportTools: string[]
  softDependencies: string[]
  defaultMcps: string[]
  requestableHeavyMcps: string[]
  fallbackModes: FamilyFallbackMode[]
  handoffContract: {
    owner: string
    summary: string
    escalationTriggers: string[]
  }
  benchmarkCoverage: {
    status: FamilyContractBenchmarkStatus
    benchmarkIds: string[]
  }
  readinessChecks: Array<{
    id: string
    required: boolean
    detail: string
    remediation?: string
  }>
}

export const FAMILY_CAPABILITY_CONTRACTS: Record<CtfFamily, FamilyCapabilityContract> = {
  web: {
    family: "web",
    expectedToolPacks: ["core", "web"],
    requiredTools: ["ctf-web-fingerprint", "ctf-web-blackbox-map"],
    supportTools: ["ctf-web-source-map", "ctf-web-runtime-map", "ctf-web-authz-matrix"],
    softDependencies: ["browser"],
    defaultMcps: ["filesystem", "context7", "github", "markitdown", "browser"],
    requestableHeavyMcps: ["anysearch", "cvekb"],
    fallbackModes: [
      {
        id: "web:blackbox-first",
        label: "Blackbox-first fallback",
        detail: "Use fingerprint + blackbox mapping when browser/runtime or source-first paths are unavailable.",
      },
      {
        id: "web:source-first",
        label: "Source-first fallback",
        detail: "Route to source-map / whitebox helpers when challenge artifacts include application source.",
      },
    ],
    handoffContract: {
      owner: "ctf-web",
      summary: "Return the locked primitive, affected owner/state boundary, and the next one-variable probe.",
      escalationTriggers: ["browser-only flow blocked", "needs deeper source/runtime chain", "cross-domain exploit path"],
    },
    benchmarkCoverage: {
      status: "covered",
      benchmarkIds: ["web/recon-before-exploit", "web/attack-queue-ranking", "web/upload-vs-file-write-routing"],
    },
    readinessChecks: [
      {
        id: "pack:web",
        required: true,
        detail: 'web family requires the "web" tool pack and core routing helpers.',
        remediation: 'Enable tool_packs including "web" and restart OpenCode.',
      },
      {
        id: "mcp:browser",
        required: false,
        detail: "browser MCP unlocks runtime/admin-bot flows but blackbox/source-first fallback remains valid.",
        remediation: "Activate browser MCP or use the blackbox/source fallback lanes.",
      },
    ],
  },
  pwn: {
    family: "pwn",
    expectedToolPacks: ["core", "pwn"],
    requiredTools: ["ctf-binary-probe", "ctf-pwn-runner"],
    supportTools: ["ctf-pwn-libc-runtime-doctor", "ctf-pwn-remote-drift-check", "ctf-pwn-stage-harness"],
    softDependencies: ["docker", "gdb", "ghidra", "ida"],
    defaultMcps: ["filesystem", "context7", "github", "markitdown"],
    requestableHeavyMcps: ["ida-pro"],
    fallbackModes: [
      {
        id: "pwn:local-substrate-lock",
        label: "Local substrate lock",
        detail: "Prefer binary probe plus local runner/runtime doctor before remote gambling.",
      },
      {
        id: "pwn:remote-drift",
        label: "Remote drift fallback",
        detail: "Use drift/transcript checks and libc/runtime doctor before changing exploit family.",
      },
    ],
    handoffContract: {
      owner: "ctf-pwn",
      summary: "Return substrate state, exploit artifact path, current primitive family, and the next shortest validation step.",
      escalationTriggers: ["remote/local divergence persists", "heap family unresolved", "needs expert multi-route closure"],
    },
    benchmarkCoverage: {
      status: "covered",
      benchmarkIds: ["pwn/ret2win-basic", "pwn/control-confirmed-calibration", "pwn/remote-drift"],
    },
    readinessChecks: [
      {
        id: "pack:pwn",
        required: true,
        detail: 'pwn family requires the "pwn" tool pack and core binary triage helpers.',
        remediation: 'Enable tool_packs including "pwn" and restart OpenCode.',
      },
      {
        id: "runtime:docker",
        required: false,
        detail: "Docker/runtime tooling improves parity for libc and remote drift analysis.",
        remediation: "Install Docker/host runtime helpers or stay on local-static triage and lightweight runners.",
      },
    ],
  },
  rev: {
    family: "rev",
    expectedToolPacks: ["core", "rev"],
    requiredTools: ["ctf-binary-probe", "ctf-rev-closure-ladder"],
    supportTools: ["ctf-rev-pe-slice", "ctf-go-pclntool", "ctf-rev-unicorn-helper"],
    softDependencies: ["ReVa", "ghidra", "ida", "jadx", "frida", "apktool"],
    defaultMcps: ["filesystem", "context7", "github", "markitdown", "ReVa"],
    requestableHeavyMcps: ["ida-pro", "flutter-aot"],
    fallbackModes: [
      {
        id: "rev:static-first",
        label: "Static-first fallback",
        detail: "Use binary/APK triage and slice helpers before escalating to heavy GUI or dynamic tooling.",
      },
      {
        id: "rev:artifact-family-pivot",
        label: "Artifact-family pivot",
        detail: "Pivot by artifact family (native, APK/JNI, Flutter, VM) when the initial route stalls.",
      },
    ],
    handoffContract: {
      owner: "ctf-rev",
      summary: "Return artifact family, confirmed transform/checker boundary, extracted constants, and next solver/instrumentation step.",
      escalationTriggers: ["needs heavy GUI tooling", "dynamic instrumentation required", "cross-domain closure path found"],
    },
    benchmarkCoverage: {
      status: "partial",
      benchmarkIds: ["rev/static-before-dynamic"],
    },
    readinessChecks: [
      {
        id: "pack:rev",
        required: true,
        detail: 'rev family requires the "rev" tool pack and core binary triage helpers.',
        remediation: 'Enable tool_packs including "rev" and restart OpenCode.',
      },
      {
        id: "mcp:ReVa",
        required: false,
        detail: "ReVa improves decompilation and xref flows, but static fallback paths should remain available.",
        remediation: "Configure ReVa/Ghidra env vars or stay on slice/static helpers.",
      },
    ],
  },
  crypto: {
    family: "crypto",
    expectedToolPacks: ["core", "crypto"],
    requiredTools: ["ctf-rsa-probe"],
    supportTools: ["ctf-python-inline", "ctf-pattern-to-hypothesis"],
    softDependencies: ["sage", "python"],
    defaultMcps: ["filesystem", "context7", "github", "markitdown"],
    requestableHeavyMcps: ["anysearch", "cvekb"],
    fallbackModes: [
      {
        id: "crypto:parameter-inventory",
        label: "Parameter inventory fallback",
        detail: "Normalize parameters, modulus/order sizes, transforms, and oracle behavior before solver escalation.",
      },
      {
        id: "crypto:reversible-first",
        label: "Reversible-first fallback",
        detail: "Exhaust reversible encodings/transforms before brute force or advanced math routes.",
      },
    ],
    handoffContract: {
      owner: "ctf-crypto",
      summary: "Return family classification, parameter inventory, current assumption, and the next bounded solver/oracle probe.",
      escalationTriggers: ["needs heavier math tooling", "oracle behavior unstable", "route crosses into misc/rev"],
    },
    benchmarkCoverage: {
      status: "partial",
      benchmarkIds: ["crypto/rsa-probe-before-manual"],
    },
    readinessChecks: [
      {
        id: "pack:crypto",
        required: true,
        detail: 'crypto family requires the "crypto" tool pack and parameter-inventory workflow.',
        remediation: 'Enable tool_packs including "crypto" and restart OpenCode.',
      },
      {
        id: "solver:sage",
        required: false,
        detail: "Advanced algebra/lattice routes degrade without Sage, but reversible/parameter-led routes should remain available.",
        remediation: "Install Sage or keep crypto flows on reversible, oracle, and lightweight Python paths.",
      },
    ],
  },
  forensics: {
    family: "forensics",
    expectedToolPacks: ["core", "forensics"],
    requiredTools: ["ctf-pcap-probe", "ctf-stego-probe"],
    supportTools: ["ctf-pcap-carve", "ctf-image-open", "ctf-artifact-page"],
    softDependencies: ["wireshark-mcp", "volatility", "binwalk"],
    defaultMcps: ["filesystem", "context7", "github", "markitdown", "wireshark-mcp"],
    requestableHeavyMcps: ["packettracer-gui-mcp"],
    fallbackModes: [
      {
        id: "forensics:probe-first",
        label: "Dedicated-probe-first fallback",
        detail: "Start with pcap/stego/document probes before dropping to raw shell tools.",
      },
      {
        id: "forensics:manual-raw-tools",
        label: "Manual raw-tool fallback",
        detail: "If dedicated probes stall, pivot to file/strings/binwalk/tshark while preserving evidence paths.",
      },
    ],
    handoffContract: {
      owner: "ctf-forensics",
      summary: "Return artifact inventory, extracted evidence paths, preservation notes, and the next narrow extraction or pivot.",
      escalationTriggers: ["needs deeper memory/disk tooling", "GUI/network simulation required", "artifact route crosses into rev/crypto"],
    },
    benchmarkCoverage: {
      status: "partial",
      benchmarkIds: ["forensics/preserve-original"],
    },
    readinessChecks: [
      {
        id: "pack:forensics",
        required: true,
        detail: 'forensics family requires the "forensics" tool pack and dedicated probe helpers.',
        remediation: 'Enable tool_packs including "forensics" and restart OpenCode.',
      },
      {
        id: "mcp:wireshark",
        required: false,
        detail: "wireshark-mcp improves packet workflows but raw pcap probe/carve fallback should remain viable.",
        remediation: "Configure wireshark-mcp or stay on pcap probe/carve plus shell-level protocol extraction.",
      },
    ],
  },
  misc: {
    family: "misc",
    expectedToolPacks: ["core", "misc"],
    requiredTools: ["ctf-one-shot-triage", "ctf-quick-triage"],
    supportTools: ["ctf-file-triage", "ctf-flag-grep", "ctf-pattern-to-hypothesis"],
    softDependencies: ["browser", "wireshark-mcp", "flutter-aot"],
    defaultMcps: ["filesystem", "context7", "github", "markitdown"],
    requestableHeavyMcps: ["flutter-aot", "packettracer-gui-mcp", "anysearch"],
    fallbackModes: [
      {
        id: "misc:classify-first",
        label: "Classify-first fallback",
        detail: "Treat misc as a routing family: classify container, encoding, or artifact type before solving directly.",
      },
      {
        id: "misc:specialist-handoff",
        label: "Specialist handoff fallback",
        detail: "Handoff quickly when evidence shows the challenge is really crypto/rev/web/forensics-shaped.",
      },
    ],
    handoffContract: {
      owner: "ctf-misc",
      summary: "Return classification evidence, eliminated families, and the exact reason to keep or transfer ownership.",
      escalationTriggers: ["specialist family signal appears", "mixed artifact route stalls", "needs expert decomposition"],
    },
    benchmarkCoverage: {
      status: "planned",
      benchmarkIds: ["misc/classify-before-heavy-tools"],
    },
    readinessChecks: [
      {
        id: "pack:misc",
        required: true,
        detail: 'misc family requires the "misc" tool pack plus core triage/classification helpers.',
        remediation: 'Enable tool_packs including "misc" and restart OpenCode.',
      },
      {
        id: "handoff:misc",
        required: true,
        detail: "misc must preserve a fast handoff path to specialist families rather than solving by undirected trial.",
        remediation: "Keep misc routed through quick triage and explicit specialist handoff triggers.",
      },
    ],
  },
}

export function getFamilyCapabilityContract(family: CtfFamily): FamilyCapabilityContract {
  return FAMILY_CAPABILITY_CONTRACTS[family]
}
