import { tool } from "@opencode-ai/plugin"

function lineHints(lines: string[]) {
  const contracts: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const readLen = line.match(/read\s*\([^,]+,[^,]+,\s*([^)]+)\)/)
    if (readLen) contracts.push(`read_exact:${readLen[1].trim()}`)
    if (/fgets\s*\(/.test(line)) contracts.push("fgets_line_includes_newline_if_room")
    if (/gets\s*\(/.test(line)) contracts.push("gets_line_mode")
    if (/scanf\s*\(\s*"%d/.test(line)) contracts.push("scanf_int_whitespace_consumption")
    if (/scanf\s*\(\s*"%s/.test(line)) contracts.push("scanf_string_stops_at_space_newline")
    if (/cin\s*>>/.test(line)) contracts.push("cpp_operator_shr_token_read")
    if (/getline\s*\(/.test(line)) contracts.push("getline_line_read_after_token_risk")
    if (/strtol\s*\(|atoi\s*\(|atol\s*\(/.test(line)) contracts.push("numeric_parse_expect_text_line")
    if (/recv\s*\(|readn\s*\(/.test(line)) contracts.push("recv_exact_or_socket_read")
    if (/puts\s*\(|printf\s*\(|write\s*\(/.test(line) && /choice|menu|name|size|index|length/i.test(line)) contracts.push("menu_prompt_output")
  }
  return Array.from(new Set(contracts))
}

function recommendActions(contracts: string[]) {
  const out: string[] = []
  if (contracts.some((x) => x.startsWith("read_exact:"))) {
    const exact = contracts.find((x) => x.startsWith("read_exact:"))?.split(":", 2)[1] || "SIZE"
    out.push(`Prefer send()/sendafter() with exact byte count ${exact}; avoid implicit newline unless the parser explicitly strips it.`)
    out.push("After an exact-length read, immediately model whether a newline remains in the menu buffer before the next prompt-driven step.")
  }
  if (contracts.includes("fgets_line_includes_newline_if_room") || contracts.includes("gets_line_mode")) {
    out.push("Prefer sendline()/sendlineafter() for line-based reads; account for newline retention or trimming in subsequent comparisons.")
  }
  if (contracts.includes("scanf_int_whitespace_consumption") || contracts.includes("numeric_parse_expect_text_line")) {
    out.push("Use text helpers for numeric menu selections and separate them from raw payload stages to avoid leftover bytes contaminating later reads.")
  }
  if (contracts.includes("cpp_operator_shr_token_read") && contracts.includes("getline_line_read_after_token_risk")) {
    out.push("Detected operator>> plus getline mix; expect leftover newline state. Prefer sendline() for numeric selections, then sendafter(content prompt, payload + '\\n') for getline-backed content stages.")
    out.push("For menu helpers, keep numeric choice/index/len on sendline(), but content reads on explicit sendafter()/sendlineafter() matched to the content prompt.")
  }
  if (contracts.includes("recv_exact_or_socket_read")) {
    out.push("Assume the program may wait for an exact count; verify short-send behavior before blaming the exploit route.")
  }
  if (!out.length) out.push("No strong read/write contract found; keep one helper per menu phase and log prompt/output boundaries before payload mutation.")
  return out
}

export default tool({
  description: "CTF pwn menu contract probe: inspect source snippets or notes for exact-length vs line-oriented reads and recommend send/sendline helper contracts before menu bytes pollute later probes.",
  args: {
    evidence: tool.schema.string().describe("Source snippet, decompilation lines, notes, or menu I/O observations."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const lines = String(args.evidence || "").split(/\r?\n/).slice(0, 400)
    const contracts = lineHints(lines)
    const recommendations = recommendActions(contracts)
    const payload = {
      schema_version: "pwn_menu_contract_probe.v1",
      detected_contracts: contracts,
      recommendations,
      helper_contract: contracts.some((x) => x.startsWith("read_exact:"))
        ? "define an exact-length send helper before further exploit probes"
        : contracts.includes("fgets_line_includes_newline_if_room") || contracts.includes("gets_line_mode")
          ? contracts.includes("cpp_operator_shr_token_read") && contracts.includes("getline_line_read_after_token_risk")
            ? "mixed token-read + getline contract: split menu numeric helpers from content helpers and account for residual newline"
            : "define a line-based helper and separate it from raw payload stages"
          : "define one helper per menu phase and preserve prompt boundaries",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_menu_contract_probe:",
      "detected_contracts:",
      ...(contracts.length ? contracts.map((x) => `- ${x}`) : ["- none"]),
      "recommendations:",
      ...recommendations.map((x) => `- ${x}`),
      `helper_contract: ${payload.helper_contract}`,
    ].join("\n")
  },
})
