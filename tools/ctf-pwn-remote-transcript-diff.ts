import { tool } from "@opencode-ai/plugin"

function normalizeLines(text: string) {
  return text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
}

function commonPrefixLen(a: string, b: string) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

export default tool({
  description: "CTF pwn remote transcript diff: compare local and remote transcripts to isolate prompt, EOF, timeout, leak-shape, and pacing differences.",
  args: {
    localTranscript: tool.schema.string().describe("Local transcript or runner output."),
    remoteTranscript: tool.schema.string().describe("Remote transcript or runner output."),
  },
  async execute(args) {
    const local = String(args.localTranscript || "")
    const remote = String(args.remoteTranscript || "")
    if (local.trim().length < 3 || remote.trim().length < 3) return "BLOCK: provide both localTranscript and remoteTranscript"

    const ll = normalizeLines(local)
    const rl = normalizeLines(remote)
    const joinedLocal = ll.join("\n")
    const joinedRemote = rl.join("\n")
    const prefix = commonPrefixLen(joinedLocal, joinedRemote)
    const localEOF = /eof|end of file|connection closed/i.test(local)
    const remoteEOF = /eof|end of file|connection closed/i.test(remote)
    const localTimeout = /timeout|timed out/i.test(local)
    const remoteTimeout = /timeout|timed out/i.test(remote)
    const localPtrs = [...local.matchAll(/0x[0-9a-fA-F]{4,16}/g)].map((m) => m[0]).slice(0, 12)
    const remotePtrs = [...remote.matchAll(/0x[0-9a-fA-F]{4,16}/g)].map((m) => m[0]).slice(0, 12)
    const localPromptish = ll.slice(-4).join(" | ")
    const remotePromptish = rl.slice(-4).join(" | ")
    const leakShapeSame = localPtrs.length && remotePtrs.length ? localPtrs[0].length === remotePtrs[0].length : false
    const ranked = [
      localPromptish !== remotePromptish ? "prompt_or_pacing_mismatch" : "",
      remoteEOF && !localEOF ? "remote_eof_without_local_eof" : "",
      remoteTimeout && !localTimeout ? "remote_timeout_without_local_timeout" : "",
      localPtrs.length !== remotePtrs.length || !leakShapeSame ? "leak_shape_difference" : "",
      prefix < Math.min(joinedLocal.length, joinedRemote.length) * 0.35 ? "early_transcript_divergence" : "",
    ].filter(Boolean)

    return [
      "pwn_remote_transcript_diff:",
      `local_lines: ${ll.length}`,
      `remote_lines: ${rl.length}`,
      `common_prefix_chars: ${prefix}`,
      `local_eof: ${localEOF}`,
      `remote_eof: ${remoteEOF}`,
      `local_timeout: ${localTimeout}`,
      `remote_timeout: ${remoteTimeout}`,
      `local_pointer_count: ${localPtrs.length}`,
      `remote_pointer_count: ${remotePtrs.length}`,
      `leak_shape_same: ${leakShapeSame}`,
      "local_tail:",
      `- ${localPromptish || "none"}`,
      "remote_tail:",
      `- ${remotePromptish || "none"}`,
      "ranked_differences:",
      ...(ranked.length ? ranked.map((x) => `- ${x}`) : ["- transcripts are broadly similar; test one environment or payload assumption next"]),
      "recommended_next:",
      "- Isolate the last-known-good stage before changing gadgets or offsets.",
      "- If prompt_or_pacing_mismatch appears, re-test recvuntil/sendafter boundaries first.",
      "- If leak_shape_difference appears, stabilize the leak parser before payload mutation.",
    ].join("\n")
  },
})
