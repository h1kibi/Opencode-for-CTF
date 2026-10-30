import { describe, expect, it } from "vitest"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

const context = { directory: process.cwd(), worktree: process.cwd() }

function lineValue(text: string, label: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^-\s+/, ""))
    .find((line) => line.startsWith(`${label}:`))
    ?.slice(label.length + 1)
    .trim()
}

function section(text: string, header: string): string[] {
  const lines = text.split("\n")
  const start = lines.findIndex((line) => line.trim() === `${header}:`)
  if (start < 0) return []
  const collected: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S[^\s]*:\s*$/.test(line.trim()) || /^[a-z_]+:$/.test(line.trim())) break
    collected.push(line)
  }
  return collected
}

describe("pwn advisory tools", () => {
  it("routes a hardened heap menu to the heap primitive playbook", async () => {
    const module = await import("../tools/pwn/ctf-pwn-playbook-router.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      {
        evidence:
          "checksec: Full RELRO, Canary found, NX enabled, PIE enabled. Menu heap with malloc/free/edit, glibc 2.31, tcache double free observed.",
      },
      context,
    )

    expect(text.startsWith("pwn_playbook_router:")).toBe(true)
    expect(lineValue(text, "schema_version")).toBe("pwn_playbook_router.v1")
    expect(lineValue(text, "closure_priority")).toBe("primitive_discovery")
    expect(Number(lineValue(text, "routes_returned"))).toBeGreaterThanOrEqual(1)
    expect(text).toContain("heap-menu-primitive")
  })

  it("returns the same routing decision as JSON when jsonOnly is set", async () => {
    const module = await import("../tools/pwn/ctf-pwn-playbook-router.ts")
    const execute = module.default.execute as Execute

    const payload = JSON.parse(
      await execute(
        { evidence: "checksec: NX enabled, PIE enabled. ROP with libc 2.35 leak", jsonOnly: true },
        context,
      ),
    )

    const decision = payload.pwn_playbook_router
    expect(decision.schema_version).toBe("pwn_playbook_router.v1")
    expect(Array.isArray(decision.top_routes)).toBe(true)
    expect(decision.top_routes.length).toBeGreaterThanOrEqual(1)
    expect(decision.top_routes[0]).toHaveProperty("id")
    expect(decision.top_routes[0]).toHaveProperty("score")
  })

  it("classifies leaked addresses by page base and reports confidence", async () => {
    const module = await import("../tools/pwn/ctf-pwn-heap-leak-classifier.ts")
    const execute = module.default.execute as Execute

    const text = await execute({ leaks: "0x5555557592a0\n0x7ffff7dca3e0\n0x7fffffffe1a8", glibc: "2.31" }, context)

    expect(text.startsWith("pwn_heap_leak_classifier:")).toBe(true)
    expect(lineValue(text, "glibc_hint")).toBe("2.31")
    const classified = section(text, "classified").filter((line) => line.trim().startsWith("- 0x"))
    expect(classified).toHaveLength(3)
    for (const line of classified) {
      expect(line).toMatch(/class=(pie|stack|heap|libc|unknown)/)
      expect(line).toMatch(/confidence=(low|medium|high)/)
      expect(line).toMatch(/page_base=0x[0-9a-f]+000\b/)
    }
    expect(classified[0]).toContain("page_base=0x555555759000")
  })

  it("separates framing divergence from gadget hypotheses in an IO diff", async () => {
    const module = await import("../tools/pwn/ctf-pwn-io-diff-check.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      {
        localTranscript: "menu> hello\necho: hello\n",
        remoteTranscript: "menu> hello\n",
        expectedReadSize: "0x20",
      },
      context,
    )

    expect(text.startsWith("pwn_io_diff_check:")).toBe(true)
    expect(text).toContain("schema_version: pwn_io_diff_check.v1")
    expect(lineValue(text, "expected_read_size")).toBe("32")
    expect(text).toContain("prompt_tail_divergence")
    expect(text).toContain("recommended_next:")
    expect(text).toContain("stop_rule:")
  })

  it("keeps closure priority on primitive proof when no closure owner is proven", async () => {
    const module = await import("../tools/pwn/ctf-pwn-closure-router.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { evidence: "arbitrary write via tcache poison, libc base known, target __free_hook, no shell yet" },
      context,
    )

    expect(text.startsWith("pwn_closure_router:")).toBe(true)
    expect(text).toContain("closure_routes:")
    expect(text).toContain("no clear closure owner is proven yet")
    const queue = text.split("priority_queue:")[1] ?? ""
    expect(queue).toMatch(/\d\.\s+\w+/)
  })

  it("asks for adjacency evidence instead of ranking routes on a thin description", async () => {
    const module = await import("../tools/pwn/ctf-pwn-adjacency-audit.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { evidence: "ret2csu available, pop rdi; ret at 0x4012a3, got write@plt, libc 2.31 puts leak" },
      context,
    )

    expect(text.startsWith("pwn_adjacency_audit:")).toBe(true)
    expect(lineValue(text, "recommended_decision")).toBe("insufficient_adjacency_evidence")
    expect(text).toContain("top_candidates:")
    expect(text).toContain("#1 target=unknown writable object")
    expect(text).toContain("nearby_evidence_lines:")
  })

  it("ledgers every leaked pointer with a class and base candidacy", async () => {
    const module = await import("../tools/pwn/ctf-pwn-leak-ledger.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { evidence: "puts leak 0x7ffff7a809c0 -> libc 0x7ffff7a00000; heap 0x5555557592a0; canary 0x00" },
      context,
    )

    expect(text.startsWith("pwn_leak_ledger:")).toBe(true)
    expect(lineValue(text, "pointers_detected")).toBe("3")
    const counts = section(text, "class_counts").filter((line) => line.trim().startsWith("- "))
    expect(counts).toHaveLength(8)
    const ledger = section(text, "ledger").filter((line) => line.trim().startsWith("- 0x"))
    expect(ledger).toHaveLength(3)
    for (const line of ledger) {
      expect(line).toMatch(/class=\w+/)
      expect(line).toMatch(/base_candidate=(true|false)/)
    }
  })

  it("compresses documented primitives into one locked probe", async () => {
    const module = await import("../tools/pwn/ctf-pwn-primitive-compressor.ts")
    const execute = module.default.execute as Execute

    const payload = JSON.parse(
      await execute(
        {
          evidence: "format string write to printf@got with positional offsets, padding 0x30, canary leaked",
          controlOffset: "0x30",
          target: "printf@got",
          jsonOnly: true,
        },
        context,
      ),
    )

    expect(payload.schema_version).toBe("pwn_primitive_compressor.v1")
    expect(payload.primitive_candidates.length).toBeGreaterThanOrEqual(1)
    expect(payload.primitive_candidates[0]).toHaveProperty("priority")
    expect(payload.primitive_candidates[0]).toHaveProperty("falsify")
    expect(typeof payload.do_first).toBe("string")
    expect(payload.primitive_lock_card).toHaveProperty("primitive_candidate")
  })

  it("reports a GOT surface without inventing routes when nothing is leaked yet", async () => {
    const module = await import("../tools/pwn/ctf-pwn-got-leak-router.ts")
    const execute = module.default.execute as Execute

    const payload = JSON.parse(
      await execute(
        { evidence: "partial RELRO, GOT writable, puts@got leak available, no full RELRO", jsonOnly: true },
        context,
      ),
    )

    expect(payload.schema_version).toBe("pwn_got_leak_router.v1")
    expect(payload.signals).toContain("got-surface-present")
    expect(Array.isArray(payload.routes)).toBe(true)
    expect(typeof payload.recommended_next).toBe("string")
  })
})
