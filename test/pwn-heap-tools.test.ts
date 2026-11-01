import { describe, expect, it } from "vitest"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

const context = { directory: process.cwd(), worktree: process.cwd() }

function field(text: string, label: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^-\s+/, ""))
    .find((line) => line.startsWith(`${label}:`))
    ?.slice(label.length + 1)
    .trim()
}

describe("pwn heap and remote tools", () => {
  it("records heap lifecycle steps without naming a technique yet", async () => {
    const module = await import("../tools/pwn/ctf-pwn-heap-transaction-recorder.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { evidence: "alloc 0x20 A; free A; alloc 0x20 B returns A (tcache LIFO); edit A overwrites B next" },
      context,
    )

    expect(text.startsWith("pwn_heap_transaction_recorder:")).toBe(true)
    expect(field(text, "steps_seen")).toBe("1")
    expect(field(text, "alloc_like")).toBe("1")
    expect(text).toContain("transaction_table:")
    expect(text).toContain("next_reduction_probes:")
    expect(text).toContain("Confirm one likely size class")
  })

  it("gives a ret2libc skeleton that starts from a stable leak", async () => {
    const module = await import("../tools/pwn/ctf-pwn-fast-skeleton-hints.ts")
    const execute = module.default.execute as Execute

    const text = await execute({ route: "ret2libc", evidence: "NX enabled, PIE, libc 2.31 puts leak" }, context)

    expect(text.startsWith("PWN_FAST_SKELETON_HINTS")).toBe(true)
    expect(field(text, "route_family")).toBe("ret2libc")
    expect(field(text, "template_mode")).toBe("leak_then_reenter_then_close")
    expect(text).toContain("stop_if:")
    expect(text).toContain("ctf-pwn-template-init route=ret2libc")
    expect(text).toContain("next_patch_points:")
  })

  it("ranks remote drift rechecks from differential evidence", async () => {
    const module = await import("../tools/pwn/ctf-pwn-remote-drift-check.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { evidence: "local leak 0x7ffff7a809c0, remote leak 0x7f1122a809c0, offsets differ by 0x2000" },
      context,
    )

    expect(text.startsWith("pwn_remote_drift_check:")).toBe(true)
    expect(field(text, "timeout_signal")).toBe("false")
    expect(field(text, "alignment_signal")).toBe("false")
    expect(text).toContain("ranked_rechecks:")
  })

  it("refuses a drift check that carries only transcripts", async () => {
    const module = await import("../tools/pwn/ctf-pwn-remote-drift-check.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { localTranscript: "leak: 0x00007ffff7a809c0\noutput: hello", remoteTranscript: "leak: 0x00007f1122a809c0" },
      context,
    )

    expect(text).toBe("BLOCK: provide local/remote drift evidence or runner output")
  })

  it("holds technique naming until the heap lifecycle is reduced", async () => {
    const module = await import("../tools/pwn/ctf-pwn-heap-reduction-check.ts")
    const execute = module.default.execute as Execute

    const text = await execute({ evidence: "heap: tcache double free -> poison -> __free_hook, stable 30/30" }, context)

    expect(text.startsWith("pwn_heap_reduction_check:")).toBe(true)
    expect(text).toContain("- uaf_or_double_free: true")
    expect(text).toContain("missing_prerequisites:")
    expect(text).toContain("- menu lifecycle reduction")
    expect(field(text, "next_reduction_step")).toContain("reduce alloc/free/edit/show rules")
    expect(text).toContain("Do not promote a named heap technique until")
  })
})
