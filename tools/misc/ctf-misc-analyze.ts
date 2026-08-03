import { tool } from "@opencode-ai/plugin"
import oneShotTriage from "../core/ctf-one-shot-triage.ts"

type ParsedTriage = {
  verdict: string
  confidence: string
  nextTool: string
  nextTarget: string
  reason: string
}

type MiscShape =
  | "layered_encoding"
  | "python_jail"
  | "custom_protocol"
  | "programming_ppc"
  | "game_state_machine"
  | "osint"
  | "dns"
  | "qr_barcode"
  | "rf_sdr"
  | "ai_ml"
  | "multimodal_media"
  | "unknown"

type Endpoint = { host: string; port: number }

type MiscShapeRoute = {
  shape: MiscShape
  reference: string
  firstProbe: string
  nextTool?: string
  nextArgsHint?: string
  inputSource?: { kind: "file_content" | "description" | "service"; value: string }
  endpoint?: Endpoint
}

const FACADE_BY_NEXT_TOOL: Record<string, { tool: string; owner: string; note: string }> = {
  "ctf-rsa-probe": {
    tool: "ctf-crypto-analyze",
    owner: "ctf-crypto",
    note: "RSA-like evidence should enter crypto through the crypto facade.",
  },
  "ctf-crypto-analyze": {
    tool: "ctf-crypto-analyze",
    owner: "ctf-crypto",
    note: "Crypto/math evidence should enter crypto through the crypto facade.",
  },
  "ctf-binary-probe": {
    tool: "ctf-rev-analyze",
    owner: "ctf-rev",
    note: "Native checker/binary evidence should enter reverse through the REV facade.",
  },
  "ctf-rev-analyze": {
    tool: "ctf-rev-analyze",
    owner: "ctf-rev",
    note: "Native checker/binary evidence should enter reverse through the REV facade.",
  },
  "ctf-pcap-probe": {
    tool: "ctf-forensics-analyze",
    owner: "ctf-forensics",
    note: "Capture evidence should enter forensics through the artifact facade.",
  },
  "ctf-forensics-analyze": {
    tool: "ctf-forensics-analyze",
    owner: "ctf-forensics",
    note: "Forensics evidence should enter forensics through the artifact facade.",
  },
  "ctf-stego-probe": {
    tool: "ctf-forensics-analyze",
    owner: "ctf-forensics",
    note: "Media/stego evidence should enter forensics through the artifact facade.",
  },
  "ctf-web-source-map": {
    tool: "ctf-web-source-map",
    owner: "ctf-web",
    note: "Source-map evidence is already a focused web source helper.",
  },
  "ctf-api-map": {
    tool: "ctf-api-map",
    owner: "ctf-web",
    note: "API-map evidence is a web/source route; hand off once route confidence is high.",
  },
  "ctf-java-map": {
    tool: "ctf-java-analyze",
    owner: "ctf-web",
    note: "Java/JVM evidence should enter through the Java facade before full decompilation.",
  },
  "ctf-safe-extract": {
    tool: "ctf-safe-extract",
    owner: "ctf-misc",
    note: "Archive extraction is still a safe misc/core step; rerun ctf-misc-analyze after extraction.",
  },
}

function parseTriage(text: string): ParsedTriage {
  const get = (key: string) => text.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? ""
  return {
    verdict: get("verdict") || "unknown",
    confidence: get("confidence") || "low",
    nextTool: get("next_tool") || "none",
    nextTarget: get("next_target") || ".",
    reason: get("reason") || "no reason parsed",
  }
}

function extractEndpoint(text: string): Endpoint | undefined {
  const nc = text.match(/\b(?:nc|netcat|telnet)\s+([^\s:/]+|\d{1,3}(?:\.\d{1,3}){3})\s+(\d{2,5})\b/i)
  if (nc) return { host: nc[1], port: Number(nc[2]) }

  const hostPort = text.match(/\b((?:localhost|127\.0\.0\.1|[a-z0-9][a-z0-9.-]*)):(\d{2,5})\b/i)
  if (hostPort) return { host: hostPort[1], port: Number(hostPort[2]) }

  return undefined
}

function fileContentSource(nextTarget: string) {
  const candidate = nextTarget.trim()
  if (!candidate || candidate === ".") return undefined
  return { kind: "file_content" as const, value: candidate }
}

function classifyMiscShape(parsed: ParsedTriage, contextText: string, service?: string): MiscShapeRoute {
  const text = `${service ?? ""}\n${contextText}`
  const lower = text.toLowerCase()

  const qrClue = /\b(qr(?: code)?|barcode|datamatrix|aztec code)\b/i.test(text)
  if (qrClue) {
    return {
      shape: "qr_barcode",
      reference: "skills/ctf-misc/references/misc-fallback-matrix.md",
      firstProbe:
        "Identify the image/container and run one bounded QR/barcode/media extraction before escalating to broad stego tooling.",
      nextTool: "ctf-qr-probe",
      nextArgsHint:
        "Treat decoded text as untrusted evidence; only then pass a recovered text payload to ctf-encoding-chain if it is independently identified as encoded.",
    }
  }

  const mediaClue =
    /\.(?:png|jpe?g|gif|bmp|webp|tiff?|mp4|m4v|mov|webm|mkv|avi|wav|mp3|flac|ogg|oga|m4a|aac|opus)\b/i.test(text) ||
    /\b(?:image|picture|photo|video|frame|movie|audio|sound|waveform|spectrogram|frequency-domain|spectrum|recording|visual clue)\b/i.test(
      text,
    )
  if (mediaClue) {
    return {
      shape: "multimodal_media",
      reference: "skills/ctf-misc/references/multimodal-media-triage.md",
      firstProbe:
        "Pass the bounded image/video/audio evidence to ctf-multimodal-triage so a vision-capable model can inspect pixels or signal plots before broad extraction.",
      nextTool: "ctf-multimodal-triage",
      nextArgsHint:
        "Use target=<media path>; keep video maxFrames bounded and inspect waveform/spectrogram attachments before decoding.",
    }
  }

  const explicitEncodingClue =
    /\b(base64|base32|rot13|rot47|hex|binary|url[- ]?encode|ciphertext|decode chain|transform chain|encoding chain|layered encoding)\b/i.test(
      text,
    )
  if (parsed.verdict === "crypto_or_encoding" || explicitEncodingClue) {
    return {
      shape: "layered_encoding",
      reference: "skills/ctf-misc/references/encoding-transform-chain.md",
      firstProbe:
        "Read the candidate text source, run one bounded reversible chain, and verify every layer before accepting a flag.",
      nextTool: "ctf-encoding-chain",
      nextArgsHint:
        "Pass the text content, not only the file path, as input to ctf-encoding-chain; use expectedFlag or flagPattern when available.",
      inputSource: fileContentSource(parsed.nextTarget),
    }
  }

  if (
    /\b(pyjail|python jail|restricted python|sandbox escape|jail challenge|blocked builtins|__subclasses__|\beval\s*\(|\bexec\s*\(|builtins blacklist)\b/i.test(
      text,
    )
  ) {
    return {
      shape: "python_jail",
      reference: "skills/ctf-misc/references/python-jail.md",
      firstProbe:
        "Map syntax restrictions, blocked names, builtins/import behavior, object-graph access, and side channels with one benign probe per hypothesis.",
      nextTool: "ctf-python-inline",
      nextArgsHint:
        "Use ctf-python-inline only for a bounded probe script; preserve the original jail interaction and do not begin blind payload spraying.",
    }
  }

  const endpoint = extractEndpoint(text)
  if (
    /\b(proof[- ]?of[- ]work|programming challenge|\bppc\b|automate(?:d)? queries|solve \d+ (?:rounds?|queries)|interactive challenge)\b/i.test(
      text,
    )
  ) {
    return {
      shape: "programming_ppc",
      reference: "skills/ctf-misc/references/protocol-client.md",
      firstProbe:
        "Capture the input/output grammar, identify the per-round invariant, and implement the smallest deterministic client.",
      nextTool: endpoint ? "ctf-proto-probe" : "ctf-python-inline",
      nextArgsHint: endpoint
        ? `Probe ${endpoint.host}:${endpoint.port} once with a bounded payload, then write a minimal client.`
        : "Use ctf-python-inline to build a deterministic parser/client after recording one complete example.",
      endpoint,
    }
  }

  if (
    endpoint &&
    /\b(custom protocol|protocol|netcat|telnet|socket|banner|server says|send .*receive|prompt>)\b/i.test(text)
  ) {
    return {
      shape: "custom_protocol",
      reference: "skills/ctf-misc/references/protocol-client.md",
      firstProbe:
        "Read the banner and send one minimal probe; record request/response grammar and state transitions before automating.",
      nextTool: "ctf-proto-probe",
      nextArgsHint: `Use host=${endpoint.host}, port=${endpoint.port}; keep payload, receive size, and timeout bounded.`,
      endpoint,
    }
  }

  if (/\b(dns|dns record|txt record|mx record|nameserver|zone transfer|\bdig\b|dns clue)\b/i.test(text)) {
    return {
      shape: "dns",
      reference: "skills-external/ctf-skills/ctf-misc/dns.md",
      firstProbe:
        "Normalize the domain and query only the record types implied by the clue; preserve exact answers and TTL/source context.",
      nextTool: "ctf-dns-probe",
      nextArgsHint:
        "Pass the normalized domain and only the record types implied by the clue; preserve exact answers, TTL, and resolver backend.",
    }
  }

  if (
    /\b(osint|geoloc(?:ation)?|reverse image|wayback|web archive|public source|username enumeration|certificate transparency|timeline reconstruction)\b/i.test(
      text,
    )
  ) {
    return {
      shape: "osint",
      reference: "skills/ctf-misc-osint/SKILL.md",
      firstProbe:
        "Normalize clues into a candidate table and verify one low-cost public source or metadata clue before broad search.",
      nextTool: "ctf-file-triage",
      nextArgsHint:
        "Record source, retrieval date, exact observation, and confidence; stop if the path requires private access or unsafe interaction.",
    }
  }

  if (/\b(rf|sdr|hackrf|gnu radio|gnuradio|iq samples?|frequency|modulation|spectrum)\b/i.test(text)) {
    return {
      shape: "rf_sdr",
      reference: "skills-external/ctf-skills/ctf-misc/rf-sdr.md",
      firstProbe:
        "Fingerprint the sample format and sampling parameters, then inspect the narrowest plausible signal band before decoding.",
      nextTool: "ctf-file-triage",
      nextArgsHint:
        "Keep transformations reversible and record sample rate, center frequency, and decoder assumptions.",
    }
  }

  if (
    /\b(ai|ml|machine learning|model\.pkl|onnx|tensorflow|pytorch|tokenizer|llm|prompt injection|adversarial example|model extraction)\b/i.test(
      text,
    )
  ) {
    return {
      shape: "ai_ml",
      reference: "skills/ctf-misc-ai-ml/SKILL.md",
      firstProbe:
        "Fingerprint the model, wrapper, tokenizer, framework, and one benign baseline output before selecting an attack family.",
      nextTool: "ctf-artifact-analyze",
      nextArgsHint:
        "Separate model behavior, application/agent behavior, data leakage, and runtime/serialization evidence before handoff.",
    }
  }

  if (/\b(game|pygame|godot|state machine|board|level|moves?|esolang|virtual machine)\b/i.test(text)) {
    return {
      shape: "game_state_machine",
      reference: "skills-external/ctf-skills/ctf-misc/games-and-vms.md",
      firstProbe:
        "Model states, legal transitions, win condition, and reset behavior; automate only after one manual transition is understood.",
      nextTool: "ctf-python-inline",
      nextArgsHint:
        "Build a compact state model or simulator; preserve the interaction transcript and avoid random move loops.",
    }
  }

  return {
    shape: "unknown",
    reference: "skills/ctf-misc/references/misc-fallback-matrix.md",
    firstProbe:
      "Inspect only the highest-priority artifact or interaction clue, then choose one bounded probe before widening.",
  }
}

function route(parsed: ParsedTriage, shapeRoute: MiscShapeRoute) {
  if (parsed.verdict === "flag_candidate" || parsed.verdict === "direct_flag") {
    return {
      owner: "ctf-misc",
      nextTool: "ctf-evidence-board",
      handoff: "maybe",
      action:
        "Treat this as candidate evidence; verify with an independent exact/file/hash oracle before writing agent_flag.txt.",
      shape: "unknown" as MiscShape,
    }
  }

  const facade = FACADE_BY_NEXT_TOOL[parsed.nextTool]
  if (facade && parsed.verdict !== "crypto_or_encoding") {
    return {
      owner: facade.owner,
      nextTool: facade.tool,
      handoff: facade.owner === "ctf-misc" ? "no" : "yes",
      action: facade.note,
      shape: "unknown" as MiscShape,
    }
  }

  if (shapeRoute.nextTool) {
    return {
      owner: "ctf-misc",
      nextTool: shapeRoute.nextTool,
      handoff: "no",
      action: shapeRoute.firstProbe,
      shape: shapeRoute.shape,
    }
  }

  return {
    owner: "ctf-misc",
    nextTool: parsed.nextTool === "none" ? "ctf-file-triage" : parsed.nextTool,
    handoff: "maybe",
    action: shapeRoute.firstProbe,
    shape: shapeRoute.shape,
  }
}

export default tool({
  description:
    "CTF Misc analysis facade: classify ambiguous misc challenges with one-shot triage, identify bounded Misc sub-shapes, normalize specialist handoffs, and emit a typed first-probe contract.",
  args: {
    target: tool.schema.string().default(".").describe("Workspace-relative file or directory path to classify."),
    maxFiles: tool.schema
      .number()
      .optional()
      .describe("Maximum files for ctf-one-shot-triage. Default delegated tool default."),
    flagPattern: tool.schema.string().optional().describe("Optional JavaScript regex source for known flag format."),
    description: tool.schema
      .string()
      .optional()
      .describe("Challenge description or prompt text used for Misc sub-shape classification."),
    service: tool.schema.string().optional().describe("Optional service clue such as nc host port or host:port."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const triage = await oneShotTriage.execute(
      {
        target: args.target,
        maxFiles: args.maxFiles,
        flagPattern: args.flagPattern,
      },
      {
        directory: context?.directory ?? context?.worktree ?? process.cwd(),
        worktree: context?.worktree ?? context?.directory ?? process.cwd(),
      } as never,
    )
    const rawTriage = String(triage)
    const parsed = parseTriage(rawTriage)
    const contextText = [rawTriage, args.target, args.description ?? "", args.service ?? ""].filter(Boolean).join("\n")
    const shapeRoute = classifyMiscShape(parsed, contextText, args.service)
    const normalized = route(parsed, shapeRoute)
    const payload = {
      schemaVersion: "misc_analyze.v2",
      target: args.target || ".",
      triage: parsed,
      shape: shapeRoute.shape,
      owner: normalized.owner,
      handoff: normalized.handoff,
      nextTool: normalized.nextTool,
      nextTarget: parsed.nextTarget,
      nextArgsHint: shapeRoute.nextArgsHint,
      endpoint: shapeRoute.endpoint,
      inputSource: shapeRoute.inputSource,
      reference: shapeRoute.reference,
      firstProbe: shapeRoute.firstProbe,
      action: normalized.action,
      stopIf:
        "Do not keep ownership in misc when web/pwn/rev/crypto/forensics evidence is high-confidence; hand off with the parsed reason.",
      rawTriage,
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_MISC_ANALYZE:",
      `- target: ${payload.target}`,
      `- verdict: ${parsed.verdict}`,
      `- confidence: ${parsed.confidence}`,
      `- shape: ${payload.shape}`,
      `- reason: ${parsed.reason}`,
      `- owner: ${payload.owner}`,
      `- handoff: ${payload.handoff}`,
      `- next_tool: ${payload.nextTool}`,
      `- next_target: ${payload.nextTarget}`,
      `- reference: ${payload.reference}`,
      `- first_probe: ${payload.firstProbe}`,
      ...(payload.nextArgsHint ? [`- next_args_hint: ${payload.nextArgsHint}`] : []),
      ...(payload.endpoint ? [`- endpoint: ${payload.endpoint.host}:${payload.endpoint.port}`] : []),
      ...(payload.inputSource ? [`- input_source: ${payload.inputSource.kind}=${payload.inputSource.value}`] : []),
      `- action: ${payload.action}`,
      `- stop_if: ${payload.stopIf}`,
      "- delegated_triage:",
      rawTriage
        .split(/\r?\n/)
        .map((line) => `  ${line}`)
        .join("\n"),
    ].join("\n")
  },
})
