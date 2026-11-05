import { describe, expect, it } from "vitest"
import ioDiff from "../tools/pwn/ctf-pwn-io-diff-check.ts"
import gotLeak from "../tools/pwn/ctf-pwn-got-leak-router.ts"

type Execute = (args: Record<string, unknown>, context: Record<string, never>) => Promise<string>

const executeIoDiff = ioDiff.execute as unknown as Execute
const executeGotLeak = gotLeak.execute as unknown as Execute

type IoPayload = {
  pwn_io_diff_check: {
    expected_read_size: number
    payload_bytes: number
    payload_shortfall: number
    fixed_length_read_suspected: boolean
    short_payload_risk: string
    menu_desync_risk: string
    framing_mismatch: string
    signals: string[]
  }
  recommendations: string[]
}

type GotPayload = {
  signals: string[]
  routes: string[]
  primitive_probe: {
    name: string
    frame_arg_offset: string
    candidate_targets: Array<{ target: string; rbp: string }>
  } | null
  recommended_next: string
}

describe("pwn IO framing diff", () => {
  it("blocks when either transcript is too short", async () => {
    expect(await executeIoDiff({ localTranscript: "x", remoteTranscript: "valid text" }, {})).toContain("BLOCK")
    expect(await executeIoDiff({ localTranscript: "valid text", remoteTranscript: "y" }, {})).toContain("BLOCK")
  })

  it("flags a large shortfall against a fixed read and reports the probe", async () => {
    const text = await executeIoDiff(
      {
        localTranscript: "menu\nchoice: A",
        remoteTranscript: "menu\nchoice: B",
        expectedReadSize: 64,
        payloadHex: "0x41,0x42,0x43,0x44",
        focus: "padding",
        jsonOnly: true,
      },
      {},
    )
    const payload = JSON.parse(text) as IoPayload
    const report = payload.pwn_io_diff_check

    expect(report.payload_bytes).toBe(4)
    expect(report.payload_shortfall).toBe(60)
    expect(report.fixed_length_read_suspected).toBe(true)
    expect(report.short_payload_risk).toBe("high")
    expect(report.menu_desync_risk).toBe("medium")
    expect(report.framing_mismatch).toBe("medium")
    expect(payload.recommendations.join(" ")).toContain("shortfall ~60 bytes")
    expect(payload.recommendations.join(" ")).toContain("one-variable probe")
  })

  it("distinguishes a medium shortfall and focuses on the read boundary", async () => {
    const text = await executeIoDiff(
      {
        localTranscript: "choice: A",
        remoteTranscript: "choice: A",
        expectedReadSize: 80,
        payloadText: "A".repeat(60),
        focus: "read",
        jsonOnly: true,
      },
      {},
    )
    const payload = JSON.parse(text) as IoPayload
    const report = payload.pwn_io_diff_check

    expect(report.payload_bytes).toBe(60)
    expect(report.payload_shortfall).toBe(20)
    expect(report.short_payload_risk).toBe("medium")
    expect(report.menu_desync_risk).toBe("low")
    expect(report.framing_mismatch).toBe("medium")
    expect(payload.recommendations.join(" ")).toContain("shortfall ~20 bytes")
  })

  it("treats remote menu replay, timeout, and early EOF as a high-risk mismatch", async () => {
    const text = await executeIoDiff(
      {
        localTranscript: "menu choice",
        remoteTranscript: "menu choice menu choice menu choice\ntimeout: waiting\nEOF: connection closed",
        jsonOnly: true,
      },
      {},
    )
    const payload = JSON.parse(text) as IoPayload
    const report = payload.pwn_io_diff_check

    expect(report.signals).toEqual(
      expect.arrayContaining([
        "remote_menu_reappears_more_often",
        "remote_waits_for_more_input",
        "remote_connection_closes_earlier",
        "prompt_tail_divergence",
      ]),
    )
    expect(report.menu_desync_risk).toBe("high")
    expect(report.framing_mismatch).toBe("high")
    expect(payload.recommendations.join(" ")).toContain("recvuntil/sendafter")
    expect(payload.recommendations.join(" ")).toContain("remote timeout")
    expect(payload.recommendations.join(" ")).toContain("parser rejects malformed framing")
  })

  it("marks prompt-tail divergence alone as medium desync risk", async () => {
    const text = await executeIoDiff(
      { localTranscript: "choice: A", remoteTranscript: "choice: B", jsonOnly: true },
      {},
    )
    const report = (JSON.parse(text) as IoPayload).pwn_io_diff_check

    expect(report.signals).toEqual(["prompt_tail_divergence"])
    expect(report.menu_desync_risk).toBe("medium")
    expect(report.framing_mismatch).toBe("medium")
    expect(report.fixed_length_read_suspected).toBe(false)
  })

  it("falls back to a cleaner transcript when no signal is present", async () => {
    const text = await executeIoDiff({ localTranscript: "menu A", remoteTranscript: "menu A" }, {})

    expect(text).toContain("no strong framing signal detected")
    expect(text).toContain("Capture one cleaner local and one cleaner remote transcript")
  })

  it("clamps oversized expected read sizes and accepts empty payloads", async () => {
    const oversized = await executeIoDiff(
      { localTranscript: "menu A", remoteTranscript: "menu A", expectedReadSize: 2_000_000, jsonOnly: true },
      {},
    )
    const report = (JSON.parse(oversized) as IoPayload).pwn_io_diff_check
    expect(report.expected_read_size).toBe(1_048_576)
    expect(report.payload_bytes).toBe(0)
    expect(report.payload_shortfall).toBe(0)

    const negative = await executeIoDiff(
      { localTranscript: "menu A", remoteTranscript: "menu A", expectedReadSize: -5, jsonOnly: true },
      {},
    )
    expect((JSON.parse(negative) as IoPayload).pwn_io_diff_check.expected_read_size).toBe(0)
  })
})

describe("pwn GOT leak router", () => {
  it("blocks evidence that is too short", async () => {
    expect(await executeGotLeak({ evidence: "short" }, {})).toContain("BLOCK")
  })

  it("asks for more evidence when no pointer pattern is present", async () => {
    const payload = JSON.parse(
      await executeGotLeak({ evidence: "A binary is available for local analysis.", jsonOnly: true }, {}),
    ) as GotPayload

    expect(payload.signals).toEqual([])
    expect(payload.routes).toEqual([])
    expect(payload.primitive_probe).toBeNull()
    expect(payload.recommended_next).toContain("collect more evidence")

    const text = await executeGotLeak({ evidence: "A binary is available for local analysis." }, {})
    expect(text).toContain("- none")
    expect(text).toContain("recommended_next: collect more evidence")
  })

  it("builds a frame-indexed printf leak probe from GOT evidence", async () => {
    const evidence = ["lea rax, [rbp-0x20]", "mov rdi, rax", "call printf@plt", 'printf("%s", buf)', "@got"].join("\n")
    const payload = JSON.parse(await executeGotLeak({ evidence, jsonOnly: true }, {})) as GotPayload

    expect(payload.signals).toEqual(
      expect.arrayContaining([
        "rbp-relative-pointer-fed-into-print",
        "frame-indexed-first-argument-callsite",
        "got-surface-present",
        "FRAME_INDEXED_PRINTF_LEAK",
      ]),
    )
    expect(payload.routes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("control rbp so rbp-k lands on a GOT entry"),
        expect.stringContaining("classify whether the consumer dereferences"),
        expect.stringContaining("frame-indexed callsite reuse"),
      ]),
    )
    expect(payload.primitive_probe?.name).toBe("FRAME_INDEXED_CALLSITE_LEAK")
    expect(payload.primitive_probe?.frame_arg_offset).toBe("0x20")
    expect(payload.primitive_probe?.candidate_targets).toHaveLength(5)
    expect(payload.recommended_next).toContain("shortest existing print path")
  })

  it("routes leave/ret pseudostack risk without inventing a primitive probe", async () => {
    const evidence = "leave; ret\n[rbp-0x10]\ncall puts@plt\nputs(buf)"
    const text = await executeGotLeak({ evidence }, {})

    expect(text).toContain("- leave-ret-pseudostack-mid-function-risk")
    expect(text).toContain("ctf-pwn-stage-harness preset=leave_ret_pseudostack_midcall")
    expect(text).toContain("primitive_probe:\n- none")
    expect(text).toContain("recommended_next: test the shortest existing print path")
  })
})
