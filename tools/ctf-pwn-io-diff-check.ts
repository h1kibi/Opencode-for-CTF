import { tool } from "@opencode-ai/plugin"

function normalize(text: string) {
  return String(text || "").replace(/\r\n/g, "\n")
}

function countMatches(text: string, re: RegExp) {
  return [...text.matchAll(re)].length
}

function lineTail(text: string, count = 6) {
  const lines = normalize(text)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
  return lines.slice(Math.max(0, lines.length - count))
}

function hexByteLength(hex: string) {
  const clean = hex.replace(/0x/g, "").replace(/[^0-9a-fA-F]/g, "")
  return Math.floor(clean.length / 2)
}

function classifyFraming(local: string, remote: string, expectedReadSize: number, payloadBytes: number) {
  const localLower = local.toLowerCase()
  const remoteLower = remote.toLowerCase()
  const localMenuCount = countMatches(local, /choice|menu|index|select|option|your choice/gi)
  const remoteMenuCount = countMatches(remote, /choice|menu|index|select|option|your choice/gi)
  const localTimeout = /timeout|timed out/.test(localLower)
  const remoteTimeout = /timeout|timed out/.test(remoteLower)
  const localEof = /eof|end of file|connection closed|broken pipe/.test(localLower)
  const remoteEof = /eof|end of file|connection closed|broken pipe/.test(remoteLower)
  const localPromptTail = lineTail(local).join(" | ")
  const remotePromptTail = lineTail(remote).join(" | ")
  const payloadShortfall = expectedReadSize > 0 && payloadBytes > 0 ? Math.max(0, expectedReadSize - payloadBytes) : 0

  const signals: string[] = []
  if (expectedReadSize > 0 && payloadBytes > 0 && payloadBytes < expectedReadSize)
    signals.push("short_payload_against_fixed_read")
  if (remoteMenuCount > localMenuCount + 1) signals.push("remote_menu_reappears_more_often")
  if (remoteTimeout && !localTimeout) signals.push("remote_waits_for_more_input")
  if (remoteEof && !localEof) signals.push("remote_connection_closes_earlier")
  if (remotePromptTail && localPromptTail && remotePromptTail !== localPromptTail)
    signals.push("prompt_tail_divergence")

  let fixedLengthReadSuspected = false
  let menuDesyncRisk = "low"
  let shortPayloadRisk = "low"
  let framingMismatch = "low"

  if (signals.includes("short_payload_against_fixed_read")) {
    fixedLengthReadSuspected = true
    shortPayloadRisk = payloadShortfall >= 32 ? "high" : "medium"
  }
  if (signals.includes("remote_waits_for_more_input") || signals.includes("remote_menu_reappears_more_often"))
    menuDesyncRisk = "high"
  else if (signals.includes("prompt_tail_divergence")) menuDesyncRisk = "medium"
  if (signals.length >= 3) framingMismatch = "high"
  else if (signals.length >= 1) framingMismatch = "medium"

  return {
    localMenuCount,
    remoteMenuCount,
    localTimeout,
    remoteTimeout,
    localEof,
    remoteEof,
    localPromptTail,
    remotePromptTail,
    payloadShortfall,
    signals,
    fixedLengthReadSuspected,
    menuDesyncRisk,
    shortPayloadRisk,
    framingMismatch,
  }
}

export default tool({
  description:
    "CTF pwn IO diff check: compare local pipe and remote socket behavior for fixed-length read, padding, prompt framing, and menu desync clues.",
  args: {
    localTranscript: tool.schema
      .string()
      .describe("Local transcript, runner output, or notes from pipe/process behavior."),
    remoteTranscript: tool.schema.string().describe("Remote transcript, runner output, or notes from socket behavior."),
    expectedReadSize: tool.schema
      .number()
      .optional()
      .describe("Expected fixed read size in bytes if known, e.g. 0x900."),
    payloadText: tool.schema
      .string()
      .optional()
      .describe("Exact payload text if known; used only for rough length comparison."),
    payloadHex: tool.schema
      .string()
      .optional()
      .describe("Exact payload hex if known; used only for rough byte-length comparison."),
    focus: tool.schema
      .string()
      .optional()
      .describe("Optional short focus hint such as read, sendafter, menu, padding, or parser."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const local = normalize(args.localTranscript)
    const remote = normalize(args.remoteTranscript)
    if (local.trim().length < 3 || remote.trim().length < 3)
      return "BLOCK: provide both localTranscript and remoteTranscript"

    const expectedReadSize = Math.max(0, Math.min(Number(args.expectedReadSize ?? 0), 1024 * 1024))
    const payloadBytes = args.payloadHex
      ? hexByteLength(String(args.payloadHex))
      : Buffer.byteLength(String(args.payloadText || ""), "utf8")
    const framing = classifyFraming(local, remote, expectedReadSize, payloadBytes)
    const focus = String(args.focus || "").toLowerCase()

    const recommendations: string[] = []
    if (framing.fixedLengthReadSuspected) {
      recommendations.push(
        `Pad or otherwise fill the full expected read length before returning to menu logic${framing.payloadShortfall > 0 ? ` (current shortfall ~${framing.payloadShortfall} bytes)` : ""}.`,
      )
    }
    if (framing.menuDesyncRisk !== "low") {
      recommendations.push("Prefer explicit recvuntil/sendafter boundaries and isolate one menu action per round-trip.")
    }
    if (framing.remoteTimeout && !framing.localTimeout) {
      recommendations.push("Treat remote timeout as 'waiting for more bytes' before treating it as exploit failure.")
    }
    if (framing.remoteEof && !framing.localEof) {
      recommendations.push(
        "Check whether the remote parser rejects malformed framing earlier than the local pipe path.",
      )
    }
    if (focus.includes("padding") || focus.includes("read") || focus.includes("sendafter")) {
      recommendations.push(
        "Run one one-variable probe: same payload semantics, only change total sent length to the full fixed-read size.",
      )
    }
    if (!recommendations.length) {
      recommendations.push(
        "Capture one cleaner local and one cleaner remote transcript around the same menu step, then compare byte-count and prompt boundaries.",
      )
    }

    const summary = {
      schema_version: "pwn_io_diff_check.v1",
      expected_read_size: expectedReadSize,
      payload_bytes: payloadBytes,
      payload_shortfall: framing.payloadShortfall,
      fixed_length_read_suspected: framing.fixedLengthReadSuspected,
      short_payload_risk: framing.shortPayloadRisk,
      menu_desync_risk: framing.menuDesyncRisk,
      framing_mismatch: framing.framingMismatch,
      local_menu_count: framing.localMenuCount,
      remote_menu_count: framing.remoteMenuCount,
      local_timeout: framing.localTimeout,
      remote_timeout: framing.remoteTimeout,
      local_eof: framing.localEof,
      remote_eof: framing.remoteEof,
      local_tail: lineTail(local),
      remote_tail: lineTail(remote),
      signals: framing.signals,
      best_next_probe: recommendations[0],
    }

    if (args.jsonOnly) return JSON.stringify({ pwn_io_diff_check: summary, recommendations }, null, 2)

    return [
      "pwn_io_diff_check:",
      "- schema_version: pwn_io_diff_check.v1",
      `- expected_read_size: ${expectedReadSize}`,
      `- payload_bytes: ${payloadBytes}`,
      `- payload_shortfall: ${framing.payloadShortfall}`,
      `- fixed_length_read_suspected: ${framing.fixedLengthReadSuspected}`,
      `- short_payload_risk: ${framing.shortPayloadRisk}`,
      `- menu_desync_risk: ${framing.menuDesyncRisk}`,
      `- framing_mismatch: ${framing.framingMismatch}`,
      `- local_menu_count: ${framing.localMenuCount}`,
      `- remote_menu_count: ${framing.remoteMenuCount}`,
      `- local_timeout: ${framing.localTimeout}`,
      `- remote_timeout: ${framing.remoteTimeout}`,
      `- local_eof: ${framing.localEof}`,
      `- remote_eof: ${framing.remoteEof}`,
      "signals:",
      ...(framing.signals.length ? framing.signals.map((x) => `- ${x}`) : ["- no strong framing signal detected"]),
      "local_tail:",
      ...(summary.local_tail.length ? summary.local_tail.map((x) => `- ${x}`) : ["- none"]),
      "remote_tail:",
      ...(summary.remote_tail.length ? summary.remote_tail.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...recommendations.map((x) => `- ${x}`),
      "stop_rule:",
      "- Do not rotate gadgets or libc assumptions until one framing-only probe is run when fixed-length read or menu desync risk is medium/high.",
    ].join("\n")
  },
})
